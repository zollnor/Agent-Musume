'use strict';
// Keep the original animation and bubble implementation. Only dispatch is per pet.
(()=>{
  let busy=false,tick=0,rev=0;
  const previous=new Map();
  // A question left unanswered: pet id -> {since,count}. Sharper reminders at 30 s, 2.5 min and 5.5 min.
  const waiting=new Map(),REMIND_AT=[30000,150000,330000];
  // Words about real agent work stand apart from chatter and murmurs: a dark ink bubble, a plain bold UI face instead of
  // the rounded candy face, a stripe in the pet's colour and, over a persona's own line, the session it is about.
  const SHORT={'claude-code':'Claude Code','codex-cli':'Codex','chatgpt-desktop':'ChatGPT','dsh-desktop':'DSH',demo:'演示'};
  if(globalThis.document)document.head.appendChild(Object.assign(document.createElement('style'),{textContent:[
    '.pet-bubble.is-work{background:rgba(24,33,52,.95);color:#f3f6fb;font-family:"Microsoft YaHei UI","PingFang SC","Microsoft YaHei",sans-serif;font-weight:600;letter-spacing:.02em;line-height:1.45;text-wrap:balance;word-break:keep-all;overflow-wrap:anywhere;',
    'border-left:calc(var(--pet-size,462px)*.009) solid var(--work-accent,#6aa8ff);box-shadow:0 calc(var(--pet-size,462px)*.009) calc(var(--pet-size,462px)*.035) rgba(0,0,0,.28),0 0 0 1px rgba(255,255,255,.24)}',
    '.pet-bubble.is-work::after{border-top-color:rgba(24,33,52,.95)}',
    '.pet-bub-source{font-size:calc(var(--pet-size,462px)*.026);font-weight:700;letter-spacing:.06em;color:var(--work-accent,#6aa8ff);line-height:1.3;margin-bottom:calc(var(--pet-size,462px)*.004)}'
  ].join('')}));
  // Pushed revisions arrive first; a poll answered before the newest push must not wind the pet back.
  function apply(snapshot,via){
    if(Number(snapshot?.rev)<rev)return;rev=Number(snapshot?.rev)||rev;
    for(const s of sprites){
      const helpers=globalThis.DeskpetInteraction?.normalizeInteraction(s.pet.interaction).helperSources??[];
      const hit=!s.pet.workStatusEnabled?{state:'idle',source:null,task:null}:snapshot?.demo?{state:snapshot.demo.state,source:'demo',task:'演示：'+snapshot.demo.label}:window.DeskpetSources.selectReaction(s.pet.reactionSources,snapshot?.sources??{},helpers,snapshot?.helpers??{});
      // A persona speaks its own status lines (pet-appearances.cjs) instead of the source label; a helper's state keeps
      // its label, which says the work belongs to a sub-agent.
      const persona=s.pet.personaStatus===true&&!String(hit.source??'').startsWith('helper:')&&globalThis.DeskpetInteraction?.normalizeInteraction(s.pet.interaction).lines!==false;
      const shown=persona&&hit.task?{...hit,task:null}:hit;
      const key=JSON.stringify(shown);
      if(previous.get(s.pet.id)===key)continue;
      previous.set(s.pet.id,key);
      if(hit.state!=='waiting')waiting.delete(s.pet.id);else if(!waiting.has(s.pet.id))waiting.set(s.pet.id,{since:Date.now(),count:0});
      // A source label already names its session; a persona's own line gets the session above it.
      s.deskpetWorkLabel=persona?SHORT[hit.source]??null:null;
      const I=globalThis.DeskpetInteraction;if(I&&s.bubble)s.bubble.style.setProperty('--work-accent',I.BODY[I.appearanceOf(s.pet.appearance)].accent);
      s.onWorkTick({...shown,state:hit.state==='idle'?null:hit.state},++tick);
      window.__dshPetDebug.reaction={petId:s.pet.id,state:hit.state,source:hit.source??null,via};
    }
  }
  async function poll(){
    if(busy||!window.petBridge?.reactionSnapshot)return;busy=true;
    try{
      apply(await window.petBridge.reactionSnapshot(),'poll');
    }catch{
      // Losing the local host is not success. Release any persistent work bubble.
      for(const s of sprites)if(previous.get(s.pet.id)!=='unavailable'){previous.set(s.pet.id,'unavailable');s.onWorkTick({state:null,task:null},++tick);}
    }finally{busy=false;}
  }
  window.petBridge?.onReactionPush?.(snapshot=>{try{apply(snapshot,'push');}catch{/* the next poll retries */}});
  function remind(){
    for(const s of sprites){
      const w=waiting.get(s.pet.id);if(!w||w.count>=REMIND_AT.length||Date.now()-w.since<REMIND_AT[w.count])continue;
      const lines=s.pet.waitingReminders??['还在等你确认。'];
      s.workText=lines[w.count%lines.length];w.count++;s.renderBubble();
      // Quiet mode, a drag, an open menu or a duet keep the words but skip the clip.
      if(s.pet.reminderClip&&!s.__stage&&!s.dragState?.active&&!s.menuOpen&&!(s.quietUntil>Date.now()))s.playOnce(s.pet.reminderClip);
    }
  }
  void poll();setInterval(()=>void poll(),750);setInterval(remind,1000);
})();
