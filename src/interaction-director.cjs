'use strict';
// Interaction director: decides which pets perform together, when, and with which part.
// Pet windows only execute parts; this module owns reservation, the readiness barrier,
// the shared start time, cancellation and cooldowns. One performance at a time.
const I=require('./interaction-catalog.cjs');

const URGENT=new Set(['waiting','error']);
const GAP_MS=2500,PREPARE_MS=12000,EVENT_TTL_MS=30000,SOCIAL_COOLDOWN_MS=60000,TEAM_WINDOW_MS=10*60*1000,IDLE_BEFORE_CHAT_MS=90000;
const PRIORITY={'collab.assign':3,'collab.deliver':3,'collab.failed':3,'collab.complete':3,'social.nudge':2,'social.comfort':2,'social.cheer':1,'social.chat':0};
// Prop timeline relative to its start: pop, hold, flight, catch, absorb.
const PROP={pop:0.22,hold:0.5,fly:0.85,absorb:0.4};
const PROP_CATCH=PROP.hold+PROP.fly,PROP_HANDOFF=PROP.hold+PROP.fly/2;

const centre=b=>({x:b.x+b.size/2,y:b.y+b.size*9/32});
const contact=(a,b)=>((I.BODY[a.app].half/640)*a.size+(I.BODY[b.app].half/640)*b.size)+0.04*(a.size+b.size)/2;

class Director {
  constructor({send,now=Date.now,random=Math.random,boxes=()=>({}),visible=()=>true,display=()=>0,log=()=>{}}={}) {
    this.send=send;this.now=now;this.random=random;this.boxes=boxes;this.visible=visible;this.display=display;this.log=log;
    this.profiles=new Map();this.live=new Map();this.show=null;this.queue=[];this.cool=new Map();this.serial=0;
    this.lastEnd=0;this.collabSeq=null;this.delivered=new Map();this.nextChat=now()+120000+random()*120000;
  }
  // ---------- inputs ----------
  hello(id,profile) {
    this.profiles.set(id,{id,appearance:I.appearanceOf(profile?.appearance),name:String(profile?.name??id).slice(0,80),
      reactionSources:Array.isArray(profile?.reactionSources)?profile.reactionSources.filter(s=>I.SOURCES.includes(s)):[],
      interaction:I.normalizeInteraction(profile?.interaction),fixed:profile?.fixed===true});
    if(!this.live.has(id))this.live.set(id,{state:'idle',source:null,since:this.now(),busy:false});
  }
  forget(id) {
    this.profiles.delete(id);this.live.delete(id);
    if(this.show?.members.includes(id))this.cancel('pet-gone');
    this.queue=this.queue.filter(c=>!c.members.includes(id));
  }
  report(id,msg) {
    if(!msg||typeof msg!=='object')return;
    if(msg.type==='hello'){this.hello(id,msg.profile);return;}
    if(!this.profiles.has(id))return;
    const live=this.live.get(id);
    if(msg.type==='state') {
      const state=typeof msg.state==='string'?msg.state:'idle';
      if(state===live.state&&msg.source===live.source)return;
      const previous=live.state;Object.assign(live,{state,source:typeof msg.source==='string'?msg.source:null,since:this.now()});
      if(state!==previous)this.onState(id,state,live.source);
    } else if(msg.type==='busy') live.busy=msg.busy===true;
    else if(this.show&&msg.showId===this.show.id) {
      if(msg.type==='ready'&&this.show.phase==='prepare'){this.show.ready.add(id);if(this.show.ready.size===this.show.members.length)this.go();}
      else if(msg.type==='done'){this.show.done.add(id);if(this.show.done.size===this.show.members.length)this.finish('done');}
      // A walker's expected arrival goes to its partner, which times its turn to meet it (interaction-stage.js).
      else if(msg.type==='eta'&&this.show.phase==='prepare'&&Number.isFinite(Number(msg.at))){for(const m of this.show.members)if(m!==id)this.send(m,{type:'eta',showId:this.show.id,at:Number(msg.at)});}
      else if(msg.type==='abort'){const c=this.show.candidate;this.cancel(String(msg.reason??'abort'),id);if(['no-room','too-far'].includes(msg.reason)&&!c.remote&&c.kind.startsWith('collab.'))this.enqueue({...c,remote:true});}
    }
    this.pump();
  }
  collab(snapshot) {
    const events=Array.isArray(snapshot?.events)?snapshot.events:[];
    const top=events.reduce((m,e)=>Math.max(m,Number(e.seq)||0),0);
    if(this.collabSeq===null){this.collabSeq=top;return;} // First sight is a baseline, never a replay.
    for(const e of [...events].sort((a,b)=>a.seq-b.seq)) {
      if(!(e.seq>this.collabSeq))continue;
      this.collabSeq=e.seq;
      if(this.now()-(Number(e.at)||0)>EVENT_TTL_MS)continue;
      const kind={'task.assigned':'collab.assign','result.delivered':'collab.deliver','task.failed':'collab.failed'}[e.kind];
      const pair=kind&&this.pairFor(e.source);if(!pair)continue;
      if(kind==='collab.deliver')this.delivered.set(e.source,this.now());
      this.enqueue({kind,members:kind==='collab.deliver'?[pair.helper,pair.main]:[pair.main,pair.helper],source:e.source});
    }
    this.pump();
  }
  tick() {
    if(this.show&&this.now()>this.show.deadline)this.cancel('timeout');
    if(this.now()>=this.nextChat&&!this.show&&!this.queue.length) {
      this.nextChat=this.now()+60000;
      const quiet=[...this.profiles.values()].filter(p=>p.interaction.idle&&this.free(p.id)&&this.live.get(p.id).state==='idle'&&this.now()-this.live.get(p.id).since>=IDLE_BEFORE_CHAT_MS);
      const pairs=[];for(const a of quiet)for(const b of quiet)if(a.id<b.id&&this.display(a.id)===this.display(b.id))pairs.push([a.id,b.id]);
      if(pairs.length){
        const pair=pairs[Math.floor(this.random()*pairs.length)];if(this.random()<.5)pair.reverse();
        this.enqueue({kind:'social.chat',members:pair});this.nextChat=this.now()+240000+this.random()*240000;
      }
    }
    this.pump();
  }
  demo(kind,swap=false,from=null) {
    let ids=[...this.profiles.keys()].filter(id=>this.visible(id));
    if(ids.length<2)return {ok:false,error:'请先让至少两只宠物显示在桌面上。'};
    const order=(x,y)=>kind==='collab.deliver'?[y,x]:[x,y];
    const cast=(x,y)=>{const [p,q]=order(x,y);return I.duetCast(kind,this.profiles.get(p).appearance,this.profiles.get(q).appearance);};
    // Running the same demo again swaps who leads, so both directions can be seen; swap (QA) flips that once more.
    const runs=this.demoRuns??={};const key=from?kind+'@'+from:kind;runs[key]=(runs[key]||0)+1;
    // Asked from a pet's own menu, that pet takes part, with a partner it has a paired take with when there is one;
    // the partners take turns, each for both directions.
    if(from&&ids.includes(from)) {
      const others=ids.filter(id=>id!==from),paired=others.filter(id=>cast(from,id)||cast(id,from)),pool=paired.length?paired:others;
      ids=[from,pool[Math.floor((runs[key]-1)/2)%pool.length]];
    }
    let [a,b]=ids;if((runs[key]%2===0)!==swap)[a,b]=[b,a];
    // Preview the paired take when the two pets only have one in the other direction.
    if(kind.startsWith('collab.')&&!cast(a,b)&&cast(b,a))[a,b]=[b,a];
    const members=kind==='collab.deliver'?[b,a]:['social.cheer','social.comfort','social.nudge'].includes(kind)?[b]:[a,b];
    if(!PRIORITY.hasOwnProperty(kind))return {ok:false,error:'请选择有效的互动预览。'};
    if(this.show)this.cancel('demo');
    this.queue=[];this.lastEnd=0;
    this.enqueue({kind,members,target:kind.startsWith('social.')&&kind!=='social.chat'?a:null,demo:true});
    this.pump();return {ok:true};
  }
  // ---------- triggers ----------
  onState(id,state,source) {
    if(!source||source==='demo'||source.startsWith('helper:'))return;
    if(state==='success') {
      const helper=this.helperFor(source,id),since=this.delivered.get(source);
      if(helper&&since&&this.now()-since<TEAM_WINDOW_MS){this.delivered.delete(source);this.enqueue({kind:'collab.complete',members:[id,helper],source});return;}
    }
    const kind={success:'social.cheer',error:'social.comfort',waiting:'social.nudge'}[state];
    if(!kind)return;
    // The newest state of a pet replaces any reaction to its older state.
    this.queue=this.queue.filter(c=>!(c.kind.startsWith('social.')&&c.target===id));
    // A pet following the same session lived through the same event; it does not react to it.
    const reactor=this.nearest(id,p=>p.interaction.social&&!URGENT.has(this.live.get(p.id).state)&&this.live.get(p.id).source!==source&&!(this.cool.get(`${kind}:${id}:${p.id}`)>this.now()));
    if(reactor)this.enqueue({kind,members:[reactor],target:id});
  }
  pairFor(source) {
    const mains=[...this.profiles.values()].filter(p=>p.interaction.collab&&p.reactionSources.includes(source)&&this.visible(p.id));
    const helpers=[...this.profiles.values()].filter(p=>p.interaction.collab&&p.interaction.helperSources.includes(source)&&this.visible(p.id));
    let best=null;
    for(const m of mains)for(const h of helpers)if(m.id!==h.id){const d=this.distance(m.id,h.id);if(!best||d<best.d)best={main:m.id,helper:h.id,d};}
    return best;
  }
  helperFor(source,main) {return this.pairFor(source)?.main===main?this.pairFor(source).helper:null;}
  nearest(id,accept) {
    return [...this.profiles.values()].filter(p=>p.id!==id&&this.free(p.id)&&this.display(p.id)===this.display(id)&&accept(p)).sort((a,b)=>this.distance(id,a.id)-this.distance(id,b.id))[0]?.id??null;
  }
  free(id) {return this.profiles.has(id)&&this.visible(id)&&!this.live.get(id).busy&&!this.show?.members.includes(id);}
  distance(a,b) {const boxes=this.boxes(),A=boxes[a],B=boxes[b];if(!A||!B)return Infinity;return Math.abs(centre(A).x-centre(B).x)+Math.abs(centre(A).y-centre(B).y)*0.5;}
  // ---------- queue ----------
  enqueue(c) {
    c={...c,createdAt:this.now(),priority:PRIORITY[c.kind]??0,count:c.count??1};
    if(c.kind==='collab.deliver')this.queue=this.queue.filter(q=>!(q.kind==='collab.assign'&&q.source===c.source));
    const same=this.queue.find(q=>q.kind===c.kind&&q.source===c.source&&c.kind.startsWith('collab.')&&q.members.join()===c.members.join());
    if(same){same.count++;return;}
    this.queue.push(c);
  }
  pump() {
    if(this.show)return;
    const now=this.now();
    this.queue=this.queue.filter(c=>now-c.createdAt<EVENT_TTL_MS&&c.members.every(id=>this.profiles.has(id)));
    if(!this.queue.length)return;
    this.queue.sort((a,b)=>b.priority-a.priority||a.createdAt-b.createdAt);
    const gap=this.queue[0].priority>=3?1500:GAP_MS;
    if(now-this.lastEnd<gap){clearTimeout(this.wake);this.wake=setTimeout(()=>this.pump(),gap-(now-this.lastEnd)+20);this.wake.unref?.();return;}
    const index=this.queue.findIndex(c=>c.members.every(id=>this.free(id))&&(!c.target||this.profiles.has(c.target)));
    if(index<0)return;
    const [c]=this.queue.splice(index,1);
    const plan=this.plan(c);
    if(!plan){this.pump();return;}
    this.show={id:++this.serial,candidate:c,kind:c.kind,members:Object.keys(plan.parts),parts:plan.parts,duration:plan.duration,phase:'prepare',ready:new Set(),done:new Set(),deadline:now+PREPARE_MS};
    this.log(`show ${this.show.id} ${c.kind}${c.demo?' demo':''}${c.remote?' remote':''} -> ${this.show.members.join(',')}`);
    for(const id of this.show.members)this.send(id,{type:'prepare',showId:this.show.id,kind:c.kind,demo:c.demo===true,timing:{prop:PROP},...plan.parts[id]});
  }
  go() {
    const s=this.show;s.phase='running';s.startAt=this.now()+120;s.deadline=s.startAt+s.duration*1000+5000;
    for(const id of s.members)this.send(id,{type:'start',showId:s.id,startAt:s.startAt});
  }
  cancel(reason,from=null) {
    const s=this.show;if(!s)return;
    for(const id of s.members)if(id!==from)this.send(id,{type:'cancel',showId:s.id,reason});
    this.log(`show ${s.id} cancelled: ${reason}`);this.show=null;this.lastEnd=this.now();
  }
  finish() {
    const s=this.show;this.show=null;this.lastEnd=this.now();
    const c=s.candidate;if(c.target)this.cool.set(`${c.kind}:${c.target}:${c.members[0]}`,this.now()+SOCIAL_COOLDOWN_MS);
    if(this.cool.size>256)for(const [k,until] of this.cool)if(until<this.now())this.cool.delete(k);
    this.pump();
  }
  // ---------- choreography ----------
  plan(c) {
    const P=id=>this.profiles.get(id),app=id=>P(id).appearance;
    const linesOn=[...c.members,c.target].filter(Boolean).every(id=>!this.profiles.has(id)||P(id).interaction.lines);
    const say=(at,text)=>linesOn&&text?[{at,op:'say',text,until:at+I.readSeconds(text)}]:[];
    const end=items=>Math.max(...items.map(x=>x.until??x.at+0.6));
    const part=(id,partner,script,extra={})=>({role:extra.role??'actor',partner:{id:partner,appearance:app(partner),name:P(partner)?.name??''},script,walk:null,returnHome:false,...extra});
    if(c.members.length===1) {
      // Social reaction: one pet turns toward the other and responds. The other keeps its real state.
      const [r]=c.members,t=c.target;if(!this.profiles.has(t))return null;
      const role={'social.cheer':'cheer','social.comfort':'comfort','social.nudge':'nudge'}[c.kind];
      const text=I.line(role,app(r),app(t),this.random);
      const script=[{at:0,op:'face'},{at:0,op:'clip',name:I.clip(role,app(r),this.random)},...say(0.15,text)];
      const duration=Math.max(2.6,end(script)+0.4);
      return {duration,parts:{[r]:part(r,t,script,{role:'reactor',duration})}};
    }
    const [a,b]=c.members;
    // Two lines, the second pet answering the first; used for acknowledgements and the team celebration.
    const exchange=(first,second,k1,k2,c1,c2)=>{
      const l1=I.line(k1,app(first),app(second),this.random),l2=I.line(k2,app(second),app(first),this.random);
      const t2=Math.max(1.1,0.1+I.readSeconds(l1)-0.4);
      const s1=[{at:0,op:'face'},{at:0,op:'clip',name:I.clip(c1,app(first),this.random)},...say(0.1,l1)];
      const s2=[{at:0,op:'face'},{at:0,op:'clip',name:I.clip('listen',app(second),this.random),loop:true},{at:t2-0.2,op:'clip',name:I.clip(c2,app(second),this.random)},...say(t2,l2)];
      return [s1,s2,Math.max(end(s1),end(s2))+0.5];
    };
    // Failure in place: acknowledged where both stand, nothing is handed over.
    const inPlace=()=>{const [s1,s2,duration]=exchange(b,a,'failed','reassure','sorry','comfort');return {duration,parts:{[b]:part(b,a,s1,{duration}),[a]:part(a,b,s2,{duration})}};};
    // Every hand-over kind has a paired take when the two have one; the take decides who plays the giver.
    const cast=c.kind.startsWith('collab.')&&!c.remote?I.duetCast(c.kind,app(a),app(b)):null;
    if(c.kind==='collab.failed'&&!cast)return inPlace();
    // Hand-over, team celebration or chat: the pair should stand together first.
    const boxes=this.boxes(),A=boxes[a],B=boxes[b];if(!A||!B)return null;
    const ga={...A,app:app(a)},gb={...B,app:app(b)},dist=Math.abs(centre(A).x-centre(B).x),near=contact(ga,gb);
    const movable=id=>P(id).interaction.approach&&!P(id).fixed;
    const duet=cast?.duet??null,g=cast?.swap?b:a,r=g===a?b:a;
    let walker=null;
    if(duet&&movable(g)&&Math.abs(boxes[g].size/boxes[r].size-1)<=0.15)walker=g;
    else if(dist<near*0.75||dist>near*1.6)walker=movable(a)?a:movable(b)?b:null;
    const far=dist>near*1.6&&(!walker||dist-near>2.8*boxes[walker].size);
    const remote=c.remote||(far&&c.kind!=='social.chat');
    if(far&&c.kind==='social.chat')return null;
    if(remote)walker=null;
    const useDuet=!!duet&&walker===g;
    if(c.kind==='collab.failed'&&!useDuet)return inPlace();
    const mirrored=useDuet?I.duetMirrored(duet,centre(boxes[g]).x<centre(boxes[r]).x):false;
    const walkFor=id=>walker===id?{to:id===a?b:a,side:Math.sign(centre(boxes[id]).x-centre(boxes[id===a?b:a]).x)||1,duet:useDuet?{id:duet.id,mirrored}:null}:null;
    let sa,sb,duration;
    if(useDuet) {
      // The paired take: one shared clip split into two transparent layers, started together.
      const take=(role,id)=>{const l=duet.lines[role];return [{at:0,op:'duet',id:duet.id,role,mirrored},...(l?say(l.at,l.text).map(x=>({...x,until:l.until+0.5})):[]),{at:duet.duration,op:'duetEnd',name:I.clip('listen',app(id),this.random)}];};
      [sa,sb]=g===a?[take('giver',a),take('receiver',b)]:[take('receiver',a),take('giver',b)];
      duration=duet.duration+(duet.after??0.45); // both turn back to the front after the take
    } else if(c.kind==='social.chat') {
      const lines=I.chat(app(a),app(b),this.random),t2=Math.max(1.2,0.1+I.readSeconds(lines.open)-0.3);
      sa=[{at:0,op:'face'},{at:0,op:'clip',name:I.clip('chat',app(a),this.random)},...say(0.1,lines.open)];
      sb=[{at:0,op:'face'},{at:0,op:'clip',name:I.clip('listen',app(b),this.random),loop:true},{at:t2-0.1,op:'clip',name:I.clip('chat',app(b),this.random)},...say(t2,lines.reply)];
      duration=Math.max(end(sa),end(sb))+0.6;
    } else if(c.kind==='collab.complete') {
      [sa,sb,duration]=exchange(a,b,'teamDone','teamThanks','cheer','cheer');
    } else {
      const deliver=c.kind==='collab.deliver';
      const giveLine=I.line(deliver?'deliver':c.count>1?'assignMany':'assign',app(a),app(b),this.random),takeLine=I.line(deliver?'accept':'take',app(b),app(a),this.random);
      const prop=remote?null:I.PROPS[c.kind],p0=0.55,caught=p0+PROP_CATCH;
      const t2=Math.max(remote?1.5:caught+0.15,0.15+I.readSeconds(giveLine)-0.5);
      sa=[{at:0,op:'face'},{at:0,op:'clip',name:I.clip('give',app(a),this.random)},...say(0.15,giveLine),...(prop?[{at:p0,op:'prop',kind:prop,from:'self',segment:'send'}]:[])];
      sb=[{at:0,op:'face'},{at:0,op:'clip',name:I.clip('listen',app(b),this.random),loop:true},...(prop?[{at:p0,op:'prop',kind:prop,from:'partner',segment:'receive'}]:[]),{at:prop?caught:1.3,op:'clip',name:I.clip('receive',app(b),this.random)},{at:prop?caught:1.3,op:'squash',depth:0.86},...say(t2,takeLine)];
      duration=Math.max(end(sa),end(sb))+0.5;
    }
    const parts={[a]:part(a,b,sa,{role:'first',walk:walkFor(a),returnHome:walker===a,duration}),[b]:part(b,a,sb,{role:'second',walk:walkFor(b),returnHome:walker===b,duration})};
    return {duration,parts};
  }
}

/** Electron glue: IPC with pet windows, live positions from the collision broker, host polling. */
function attachDirector({app,ipcMain,windows,petStates,data}) {
  const {readFileSync}=require('node:fs');const {join}=require('node:path');
  const idOf=sender=>{for(const [id,win] of windows)if(!win.isDestroyed()&&win.webContents===sender)return id;return null;};
  const director=new Director({
    send:(id,cue)=>{const win=windows.get(id);if(win&&!win.isDestroyed())win.webContents.send('deskpet:stage-cue',cue);},
    boxes:()=>Object.fromEntries([...petStates].filter(([,s])=>s.size>0).map(([id,s])=>[id,{x:s.x,y:s.y,size:s.size,bottomPad:s.bottomPad}])),
    visible:id=>{const win=windows.get(id);return !!win&&!win.isDestroyed()&&win.isVisible();},
    log:text=>{if(process.env.AGENT_MUSUME_STAGE_LOG==='1')try{require('node:fs').appendFileSync(join(data,'qa','director.log'),new Date().toISOString()+' '+text+'\n');}catch{}}
  });
  ipcMain.on('deskpet:stage-report',(event,msg)=>{
    if(event.senderFrame!==event.sender.mainFrame)return;
    const id=idOf(event.sender);if(id)director.report(id,msg);
  });
  let busy=false;
  const poll=setInterval(async()=>{
    director.tick();
    if(busy)return;busy=true;
    try{
      const runtime=JSON.parse(readFileSync(join(data,'runtime.json'),'utf8'));
      const res=await fetch(`http://127.0.0.1:${runtime.port}/control/reactions`,{signal:AbortSignal.timeout(2500)});
      if(res.ok)director.collab((await res.json()).collab);
    }catch{/* Host restarting; the next poll retries. */}finally{busy=false;}
  },700);
  app.on('before-quit',()=>clearInterval(poll));
  app.on('browser-window-created',(_e,win)=>win.once('closed',()=>{for(const id of [...director.profiles.keys()])if(!windows.has(id))director.forget(id);}));
  return director;
}

module.exports={Director,attachDirector,PROP,PROP_CATCH,PROP_HANDOFF};
