'use strict';
// One pet's side of a multi-pet performance. The director in the main process picks the cast,
// the timing and the lines; this window walks, turns, plays its own clips, speaks, hands props
// over and plays its layer of a paired take. Any user input or urgent real state ends the part.
(()=>{
  const I=globalThis.DeskpetInteraction,bridge=window.petBridge;
  if(!I||!bridge||typeof bridge.stageReport!=='function'||typeof PetSprite!=='function')return;
  const proto=PetSprite.prototype;
  const report=msg=>{try{bridge.stageReport(msg);}catch{/* window closing */}};
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const appOf=s=>I.appearanceOf(s.pet.appearance);
  const front=s=>(s.front===0?s.videoA:s.videoB);
  const boxOf=s=>({x:s.pos.x,y:s.pos.y,size:s.size,bottomPad:s.bottomPad});
  const partnerBox=(s,id)=>{const o=s.others&&s.others[id];return o&&o.size?{x:o.x,y:o.y,size:o.size,bottomPad:o.bottomPad}:null;};
  const mirrorOf=f=>(f==='right'?'scaleX(-1)':'scaleX(1)');
  const paramsOf=(s,clip)=>s.animations.moves.actions.find(a=>a.name===clip)?.params??{};
  const TURN_RATE=0.75; // the walk's turn out / turn back, played a little slower around a paired take so the turn reads
  const WORK_KINDS=/^(collab\.|social\.(cheer|comfort|nudge)$)/;

  const style=document.createElement('style');
  style.textContent=[
    '.deskpet-line{position:absolute;left:0;top:0;z-index:4;pointer-events:none;box-sizing:border-box;width:max-content;min-width:calc(var(--pet-size,400px)*.12);max-width:calc(var(--pet-size,400px)*.5);',
    'padding:calc(var(--pet-size,400px)*.016) calc(var(--pet-size,400px)*.028);border-radius:calc(var(--pet-size,400px)*.032);background:rgba(255,255,255,.96);color:#2b2b2b;',
    "font-family:'MaokenAssortedSans','YouYuan','幼圆','Microsoft YaHei',sans-serif;font-size:calc(var(--pet-size,400px)*.036);line-height:1.5;white-space:normal;overflow-wrap:anywhere;word-break:keep-all;text-wrap:balance;",
    'box-shadow:0 calc(var(--pet-size,400px)*.009) calc(var(--pet-size,400px)*.035) rgba(0,0,0,.15),0 1px 3px rgba(0,0,0,.08);border-bottom:2px solid var(--accent,#bbb);',
    'opacity:0;transform:translateY(5px) scale(.9);transform-origin:var(--tail,50%) 100%;transition:opacity .2s ease,transform .3s cubic-bezier(.34,1.56,.64,1)}',
    '.deskpet-line.is-on{opacity:1;transform:none}',
    '.deskpet-line::after{content:"";position:absolute;left:var(--tail,50%);bottom:calc(var(--pet-size,400px)*-.016);transform:translateX(-50%);border:calc(var(--pet-size,400px)*.016) solid transparent;border-top-color:rgba(255,255,255,.96);border-bottom:none}',
    '.deskpet-line .deskpet-demo{display:inline-block;margin-right:.4em;padding:0 .35em;border-radius:.4em;background:#eef0f2;color:#6a737b;font-size:.78em;vertical-align:.08em}',
    '.deskpet-line.is-work{background:rgba(24,33,52,.95);color:#f3f6fb;font-family:"Microsoft YaHei UI","PingFang SC","Microsoft YaHei",sans-serif;font-weight:600;letter-spacing:.02em;line-height:1.45;',
    'border-bottom:none;border-left:calc(var(--pet-size,400px)*.009) solid var(--accent,#6aa8ff);box-shadow:0 calc(var(--pet-size,400px)*.009) calc(var(--pet-size,400px)*.035) rgba(0,0,0,.28),0 0 0 1px rgba(255,255,255,.24)}',
    '.deskpet-line.is-work::after{border-top-color:rgba(24,33,52,.95)}',
    '.deskpet-line.is-work .deskpet-demo{background:rgba(255,255,255,.16);color:#c8d2e2}',
    '.pet-sprite.has-line .pet-bubble,.pet-sprite.in-show .pet-bubble{opacity:0!important}',
    '.pet-bubble{transition:opacity .25s ease,transform .32s ease}',
    '.deskpet-prop{position:absolute;left:0;top:0;z-index:5;pointer-events:none;will-change:transform,opacity;filter:drop-shadow(0 2px 2px rgba(0,0,0,.18))}',
    '.deskpet-spark{position:absolute;left:0;top:0;z-index:5;pointer-events:none;width:6px;height:6px;margin:-3px;border-radius:50%;background:var(--accent,#ffd36b);box-shadow:0 0 6px var(--accent,#ffd36b)}',
    // Clip changes: the incoming clip fades in on top while the outgoing one stays opaque underneath (deskpet-hold, until
    // the incoming one has really drawn), then the outgoing one fades. The upstream fades both at once, which leaves the
    // pet half transparent for a moment at every change.
    '@media (prefers-reduced-motion: no-preference){video.pet-video{z-index:0;transition:opacity .12s ease}video.pet-video.is-front{z-index:1;transition:opacity .16s ease 0s}}',
    'video.pet-video.deskpet-hold{opacity:1;transition:none}',
    'video.pet-video.deskpet-cut{transition:none!important}', // a cut: no dissolve between two poses (patches.mjs)
    // A paired take cuts in over the pet's own clip and out over it again, on the same pose: a dissolve would show the
    // pet's drawing and the take's slightly different redrawing at once (doubled lines). The pet's video is hidden
    // only while the take is on and drawn (is-duet-solid), so there is never a moment with neither on screen.
    '.deskpet-duet{position:absolute;left:0;top:0;z-index:2;pointer-events:none;opacity:0;transition:none;transform-origin:50% 50%}',
    '.pet-sprite.is-duet .deskpet-duet{opacity:1}',
    '.pet-sprite.is-duet-solid video.pet-video{opacity:0!important}',
    '.pet-sprite.is-duet video.pet-video{transition:none!important}', // under the take the pet's clip appears at once
    '@media (prefers-reduced-motion: reduce){.deskpet-line{transition:opacity .2s ease;transform:none}.deskpet-duet{transition:none}}'
  ].join('');
  document.head.appendChild(style);

  // ---------- props ----------
  function propSvg(kind,accent) {
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 40 32');
    svg.innerHTML=kind==='folder'
      ?'<path d="M3 7h12l3 3h19v18H3z" fill="#d9a55b" stroke="#8a6230" stroke-width="1.4" stroke-linejoin="round"/><path d="M3 12h34v16H3z" fill="#f0c27a" stroke="#8a6230" stroke-width="1.4" stroke-linejoin="round"/><rect x="8" y="15" width="17" height="2.2" rx="1" fill="#fff6e3"/><rect x="8" y="19.5" width="12" height="2.2" rx="1" fill="#fff6e3"/><circle cx="30" cy="22" r="5" fill="#3f9d6a"/><path d="M27.6 22l1.7 1.8 3.2-3.6" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
      :'<rect x="7" y="5" width="26" height="22" rx="2" fill="#fbf3dc" stroke="#9b8456" stroke-width="1.4"/><rect x="3" y="3" width="8" height="26" rx="4" fill="#efe0b8" stroke="#9b8456" stroke-width="1.4"/><rect x="29" y="3" width="8" height="26" rx="4" fill="#efe0b8" stroke="#9b8456" stroke-width="1.4"/><rect x="13" y="10" width="13" height="1.8" rx=".9" fill="#b9a576"/><rect x="13" y="14" width="10" height="1.8" rx=".9" fill="#b9a576"/><rect x="18.5" y="3" width="3" height="26" fill="'+accent+'"/><circle cx="20" cy="21" r="3.4" fill="'+accent+'" stroke="#fff" stroke-width="1"/>';
    return svg;
  }
  function spark(s,at,accent) {
    if(reduced())return;
    for(let i=0;i<7;i++) {
      const d=document.createElement('div');d.className='deskpet-spark';d.style.setProperty('--accent',accent);s.el.appendChild(d);
      const a=(i/7)*Math.PI*2+Math.random()*.4,r=s.size*(.05+Math.random()*.035);
      d.animate([{transform:`translate(${at.x}px,${at.y}px) scale(1)`,opacity:1},{transform:`translate(${at.x+Math.cos(a)*r}px,${at.y+Math.sin(a)*r-6}px) scale(.3)`,opacity:0}],{duration:520,easing:'cubic-bezier(.2,.7,.3,1)'}).onfinish=()=>d.remove();
    }
  }
  /** Flight of one shared prop. Both windows run the same path; each shows only its segment. */
  function runProp(s,st,item,t0) {
    const P=st.cue.timing.prop,partner=partnerBox(s,st.cue.partner.id);if(!partner)return;
    const mine={box:boxOf(s),app:appOf(s)},theirs={box:partner,app:I.appearanceOf(st.cue.partner.appearance)};
    const [giver,receiver]=item.from==='self'?[mine,theirs]:[theirs,mine];
    const gb=I.body(giver.box,giver.app),rb=I.body(receiver.box,receiver.app),dir=Math.sign(rb.cx-gb.cx)||1;
    const from={x:gb.cx+dir*gb.half*0.55,y:gb.chest},to={x:rb.cx-dir*rb.half*0.45,y:rb.chest};
    const accent=I.BODY[giver.app].accent,w=s.size*0.09,h=w*0.8;
    const el=document.createElement('div');el.className='deskpet-prop';el.style.width=w+'px';el.style.height=h+'px';el.style.opacity='0';
    el.appendChild(propSvg(item.kind,accent));s.el.appendChild(el);st.nodes.add(el);
    const handoff=P.hold+P.fly/2,caught=P.hold+P.fly,end=caught+P.absorb;
    const ox=s.pos.x,oy=s.pos.y;
    const frame=()=>{
      if(!st.active||!el.isConnected)return;
      const u=(Date.now()-t0)/1000;
      let p=from,scale=1,rot=0,alpha=1;
      if(u<P.pop){const k=Math.max(0,u/P.pop);scale=1+2.70158*Math.pow(k-1,3)+1.70158*Math.pow(k-1,2);p={x:from.x,y:from.y-6*k};}
      else if(u<P.hold){p={x:from.x,y:from.y-6+Math.sin((u-P.pop)*9)*1.5};}
      else if(u<caught){const f=I.propPath({x:from.x,y:from.y-6},to,(u-P.hold)/P.fly);p=f;rot=f.spin;}
      else {const k=Math.min(1,(u-caught)/P.absorb);p=to;scale=1-0.75*k;alpha=1-k;if(!st.sparked&&item.segment==='receive'){st.sparked=true;spark(s,{x:to.x-ox,y:to.y-oy},I.BODY[receiver.app].accent);}}
      const mineNow=item.segment==='send'?u<handoff:u>=handoff;
      el.style.opacity=mineNow?String(alpha):'0';
      el.style.transform=`translate(${p.x-ox-w/2}px,${p.y-oy-h/2}px) rotate(${rot}deg) scale(${Math.max(0,scale)})`;
      if(u<end)requestAnimationFrame(frame);else{el.remove();st.nodes.delete(el);}
    };
    requestAnimationFrame(frame);
  }

  // ---------- speech ----------
  function say(s,st,item) {
    const line=document.createElement('div');line.className='deskpet-line';
    // Hand-overs and reactions to a partner's real session read as work (the status bubbles' look); idle chat stays light.
    if(WORK_KINDS.test(st.cue.kind))line.classList.add('is-work');
    line.style.setProperty('--accent',I.BODY[appOf(s)].accent);
    if(st.cue.demo){const tag=document.createElement('span');tag.className='deskpet-demo';tag.textContent='演示';line.appendChild(tag);}
    line.appendChild(document.createTextNode(I.softBreaks(item.text)));
    s.el.appendChild(line);st.nodes.add(line);
    // Above the head, pushed away from the partner so two bubbles never stack on each other.
    const me=I.body(boxOf(s),appOf(s)),partner=partnerBox(s,st.cue.partner.id);
    const away=partner?(I.body(partner,st.cue.partner.appearance).cx<me.cx?1:-1):0;
    const w=line.offsetWidth,h=line.offsetHeight,cx=me.cx-s.pos.x+away*s.size*0.07;
    let left=cx-w/2,top=me.top-s.pos.y-h-s.size*0.03;
    const clamp=s.visibleClampRect();
    if(clamp){const x0=clamp.x-s.margin.l,y0=clamp.y-s.margin.t;left=Math.min(Math.max(left,x0+4),x0+clamp.w-w-4);if(top<y0+4)top=y0+4;}
    const tail=Math.min(Math.max(me.cx-s.pos.x-left,w*0.18),w*0.82);
    line.style.setProperty('--tail',tail+'px');line.style.left=left+'px';line.style.top=top+'px';
    s.el.classList.add('has-line');
    requestAnimationFrame(()=>line.classList.add('is-on'));
    const off=()=>{line.classList.remove('is-on');setTimeout(()=>{line.remove();st.nodes.delete(line);if(!s.el.querySelector('.deskpet-line'))s.el.classList.remove('has-line');},260);};
    st.timers.push(setTimeout(off,Math.max(800,(item.until-item.at)*1000)));
  }

  // ---------- body ----------
  function faceToward(s,x) {
    const me=I.body(boxOf(s),appOf(s));faceTo(s,x>me.cx+2?'right':x<me.cx-2?'left':s.facing);
  }
  // quiet: a clip switch follows and takes the new facing on its own, so the clip on screen is left as it is.
  function faceTo(s,want,quiet=false) {
    if(want===s.facing)return;
    if(quiet){s.facing=want;return;}
    if(want==='right'&&S.isNoMirrorAnimation(s.animations.categories,s.anim))return;
    const el=front(s),from=mirrorOf(s.facing),to=mirrorOf(want);
    s.facing=want;
    if(reduced()){el.style.transform=to;return;}
    el.animate([{transform:from},{transform:'scaleX(.06) scaleY(1.04)',offset:.5},{transform:to}],{duration:240,easing:'ease-in-out'});
    el.style.transform=to;
  }
  // A paired take starts and ends on each pet's resting idle, drawn the way the take draws it (mirrored takes mirror both).
  // Returns whether it switched clips.
  function holdRest(s,mirrored) {
    const name=s.animations.idle[0],swap=!!name&&!(s.anim===name&&!s.once);
    faceTo(s,mirrored?'right':'left',swap);
    if(swap){s.anim=name;s.once=false;s.deskpetCut=name;s.switchTo(name,false);}
    return swap;
  }
  // Runs fn once the video has drawn a frame again: one hidden for a while needs a frame or two before it shows.
  function whenPainted(v,fn) {
    let done=false;const go=()=>{if(!done){done=true;fn();}};
    const live=v&&!v.paused&&typeof v.requestVideoFrameCallback==='function';
    if(live)v.requestVideoFrameCallback(()=>requestAnimationFrame(go));
    setTimeout(go,live?400:120);
  }
  function hold(s,role='listen') {
    const name=I.clip(role,appOf(s));
    if(!name||s.anim===name&&!s.once)return;
    s.anim=name;s.once=false;s.deskpetCut=name;s.switchTo(name,false);
  }
  function lean(s,deg) {
    s.stage.style.transformOrigin='50% 88%';
    s.stage.style.transform='translateY('+s.bottomPad+'px)'+(deg?' rotate('+deg.toFixed(2)+'deg)':'');
  }
  function roomFor(s,target) {
    const b=I.body({...boxOf(s),x:target.x,y:target.y},appOf(s));
    return !!S.rectAtPoint(AREAS,b.cx-b.half-4,b.feet-4)&&!!S.rectAtPoint(AREAS,b.cx+b.half+4,b.feet-4)&&!!S.rectAtPoint(AREAS,b.cx,b.top+4);
  }
  /** Walk the window to a pet box: accelerate, cruise, settle; lean into the move; small landing squash. A remade walk
   *  (leadSec / tailSec in its move params) turns sideways in place first, loops only its stepping part on a long walk,
   *  and turns back to the front on arrival before the performance goes on.
   *  side: stop side-on instead, paused on the walk's sideFrame and facing `face`, for a paired take that starts from
   *  that frame. The walk is timed to end on a frame of its stepping loop that looks like it (stopNear) and steps in
   *  place for a moment if it misses (or has nowhere to go). Resolves true when it stopped side-on. eta(ms) is told
   *  how long until it stands still, as soon as that is known and whenever it changes. */
  function walk(s,target,shouldRun=()=>true,{side=false,face=null,eta=null}={}) {
    return new Promise((resolve,reject)=>{
      const from={...s.pos},dx=target.x-from.x,dy=target.y-from.y,dist=Math.hypot(dx,dy);
      const clip=Math.abs(dy)>s.size*0.12?I.clip('float',appOf(s)):I.clip(!side&&dist>s.size*0.7?'run':'walk',appOf(s));
      const turn=paramsOf(s,clip),lead=turn.leadSec??0,tail=turn.tailSec??0;
      const stopAt=side&&turn.sideFrame?turn.sideFrame/24:null;
      if(dist<3&&stopAt===null){resolve(false);return;}
      // Too short to walk: turn side-on and slide over during the turn, rather than stepping in place.
      if(stopAt!==null&&face&&Math.abs(dy)<=s.size*0.12&&dist<s.size*0.3){s.stopMove();turnSide(s,face,shouldRun,target,{eta}).then(resolve);return;}
      let duration=dist<3?0:I.walkSeconds(dist,s.size),planned=stopAt===null||duration===0,landed=false;
      const tell=sec=>{if(eta&&stopAt!==null)eta(Math.max(0,sec*1000));};
      tell(lead+duration+0.1);
      const want=Math.abs(dx)>2?(dx>0?'right':'left'):face;
      // A remade walk turns sideways itself, so it takes the new facing with the clip instead of flipping the idle first.
      if(want)faceTo(s,want,!!(clip&&lead));
      if(clip){s.anim=clip;s.once=false;s.switchTo(clip,false);}
      s.stopMove();
      const token=s.moveToken,start=performance.now()+lead*1000;let last=0,lastAt=start;
      const interrupted=()=>s.moveToken!==token||!shouldRun();
      const stop=()=>{s.moveRef=null;lean(s,0);reject(new Error('interrupted'));};
      const arrive=()=>{s.startSquash(front(s),0.93);resolve(false);};
      const ours=()=>s.pending||s.anim!==clip?null:front(s); // the walk clip, once it is on screen
      const loopEnd=v=>v.duration-tail-0.05;
      const step=()=>{
        if(interrupted()){stop();return;}
        const now=performance.now(),t=Math.max(0,(now-start)/1000),v=ours();
        if(!planned&&v&&v.duration&&t>0) {
          // The clip is playing: stretch or shorten the walk a little so it ends on a stopNear frame.
          planned=true;const c=v.currentTime,L=loopEnd(v)-lead,lo=Math.max(0.9,duration*0.8),hi=duration*1.4;let best=null;
          for(const k of turn.stopNear??[])for(let n=0;n<6;n++){const d=t+k/24-c+n*L;if(d>=lo&&d<=hi&&(best===null||Math.abs(d-duration)<Math.abs(best-duration)))best=d;}
          if(best!==null)duration=best;
          tell(duration-t);
        }
        const f=I.gait(t,duration),speed=(f-last)*dist/Math.max(0.001,(now-lastAt)/1000);last=f;lastAt=Math.max(now,start);
        s.sendBounds(from.x+dx*f,from.y+dy*f);
        if(!reduced())lean(s,t<duration?Math.max(-3,Math.min(3,Math.sign(dx)*speed/(s.size*0.5)*2.5)):0);
        // This walk loops its stepping part itself, so the clip's own loop is switched off once it is on screen; a seek
        // made right after switching it off can still wrap round.
        if(tail&&v&&v.loop)v.loop=false;
        if(t<duration){
          if(tail&&v&&v.duration&&v.currentTime>=loopEnd(v))v.currentTime=lead; // keep stepping, not turning back
          s.moveRef=requestAnimationFrame(step);return;
        }
        const landing=!landed;
        if(landing){landed=true;lean(s,0);s.customPos={rx:(s.pos.x+s.halfW)/VIEW.w,ry:(s.pos.y+s.halfH)/VIEW.h};}
        if(stopAt!==null) {
          const late=t>duration+1.8,ready=v&&v.duration&&v.currentTime>=lead-0.02;
          const near=ready&&(turn.stopNear??[]).some(k=>Math.abs(k/24-v.currentTime)<0.07);
          // Missed the planned frame: tell how long the last steps in place take.
          if(landing&&!near&&ready){const c=v.currentTime,L=loopEnd(v)-lead,wait=Math.min(...(turn.stopNear??[]).map(k=>k/24-c).map(d=>d>=0?d:d+L));tell(Number.isFinite(wait)?wait:0.5);}
          if(!near&&!late){if(ready&&v.currentTime>=loopEnd(v))v.currentTime=lead;s.moveRef=requestAnimationFrame(step);return;}
          s.moveRef=null;
          if(!v){arrive();return;}
          v.pause();v.currentTime=stopAt;
          if(face&&s.facing!==face)faceTo(s,face);
          resolve(true);return;
        }
        s.moveRef=null;
        if(!tail||!v||!v.duration){arrive();return;}
        v.loop=false;if(v.currentTime<v.duration-tail)v.currentTime=v.duration-tail;
        setTimeout(()=>{if(interrupted()){reject(new Error('interrupted'));return;}arrive();},tail*1000);
      };
      s.moveRef=requestAnimationFrame(step);
    });
  }
  /** Seconds the walk's turn out takes at the paired-take pace, clip loading included. */
  function turnSeconds(s) {
    const turn=paramsOf(s,I.clip('walk',appOf(s)));return turn.turnEnd?turn.turnEnd/24/TURN_RATE+0.1:0;
  }
  /** Turn side-on in place toward `face` with the walk's own turn out, then hold the walk's side-on frame (the pose a
   *  paired take starts from); `to` slides the window there during the turn (a step too short to walk). until() is the
   *  wall-clock time the turn should end on: its pace follows it (within reason), so a partner turning to meet a
   *  walker finishes as the walker stops instead of standing frozen. eta(ms) is told when it will stand still.
   *  Resolves true when it got there. */
  function turnSide(s,face,shouldRun,to=null,{until=null,eta=null}={}) {
    return new Promise(resolve=>{
      const clip=I.clip('walk',appOf(s)),turn=paramsOf(s,clip),since=performance.now(),from={...s.pos};
      if(!clip||!turn.sideFrame||!turn.turnEnd){resolve(false);return;}
      faceTo(s,face,true);s.anim=clip;s.once=false;s.switchTo(clip,false);
      if(eta)eta(turnSeconds(s)*1000);
      const end=turn.turnEnd/24;let told=false;
      const slide=u=>{if(!to)return;const e=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;s.sendBounds(from.x+(to.x-from.x)*e,from.y+(to.y-from.y)*e);};
      const step=()=>{
        if(!shouldRun()){resolve(false);return;}
        const v=s.pending||s.anim!==clip?null:front(s);
        if(v)slide(Math.min(1,v.currentTime/end));
        if(v&&v.currentTime>=end){
          v.pause();v.playbackRate=1;v.currentTime=turn.sideFrame/24;slide(1);
          if(to)s.customPos={rx:(s.pos.x+s.halfW)/VIEW.w,ry:(s.pos.y+s.halfH)/VIEW.h};
          resolve(true);return;
        }
        if(v) {
          const left=until?(until()-Date.now())/1000:0;
          v.playbackRate=left>0.05?Math.max(0.5,Math.min(1,(end-v.currentTime)/left)):until?1:TURN_RATE;
          if(eta&&!told){told=true;eta((end-v.currentTime)/v.playbackRate*1000);}
        }
        if(performance.now()-since>4000){if(v)v.playbackRate=1;slide(1);resolve(false);return;}
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }
  /** Turn back from the side-on frame to the front with the walk's own turn back, then go on with the resting idle
   *  drawn the same way round. */
  function turnBack(s,done) {
    const v=front(s),clip=s.anim,since=performance.now();
    const finish=()=>{v.playbackRate=1;const idle=s.animations.idle[0];if(idle&&s.anim===clip){s.anim=idle;s.once=false;s.switchTo(idle,false);}done();};
    if(!v||!v.duration){finish();return;}
    v.loop=false;v.onended=null;v.playbackRate=TURN_RATE;v.play().catch(()=>{});
    const step=()=>{
      if(s.anim!==clip){v.playbackRate=1;done();return;} // something else took over (a drag, a new show)
      if(v.ended||v.currentTime>=v.duration-0.03||performance.now()-since>2500){finish();return;}
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  /** Resolves when it is time to turn to meet the partner walking over: its turn (lead ms) should end as the walker
   *  stops. The walker tells its arrival (st.eta, via the director); without one, when it is about to arrive. */
  function partnerArriving(s,st,duet,mirrored,lead) {
    return new Promise(resolve=>{
      const id=st.cue.partner.id,since=performance.now();
      const at=partnerBox(s,id),target=at&&I.duetGiverBox(duet,I.duetFrame(duet,boxOf(s),appOf(s),mirrored),at,st.cue.partner.appearance);
      const check=()=>{
        if(s.__stage!==st||!st.active){resolve(false);return;}
        const p=partnerBox(s,id),waited=performance.now()-since;
        const due=st.eta?Date.now()>=st.eta-lead:waited>1500&&(!p||!target||Math.hypot(p.x-target.x,p.y-target.y)<s.size*0.3);
        if(due||waited>8000){resolve(true);return;}
        st.timers.push(setTimeout(check,20));
      };
      check();
    });
  }

  // ---------- paired take ----------
  function loadDuet(s,st,item) {
    const duet=I.DUETS.find(d=>d.id===item.id);if(!duet)return Promise.reject(new Error('missing-take'));
    const v=document.createElement('video');v.className='deskpet-duet';v.muted=true;v.playsInline=true;v.preload='auto';v.loop=false;
    v.src=BASE+'/thumb/'+encodeURIComponent(duet.assetRoot)+'/'+encodeURIComponent(duet.files[item.role]);
    s.el.insertBefore(v,s.el.firstChild);st.nodes.add(v);st.duet={el:v,duet,item};
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('take-timeout')),8000);
      v.addEventListener('loadeddata',()=>{clearTimeout(timer);v.pause();v.currentTime=0;resolve();},{once:true});
      v.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('take-error'));},{once:true});
      v.load();
    });
  }
  function playDuet(s,st,item,t0) {
    const d=st.duet;if(!d)return;
    const {duet}=d,receiver=item.role==='receiver'?boxOf(s):partnerBox(s,st.cue.partner.id);if(!receiver)return;
    const frame=I.duetFrame(duet,receiver,duet.receiver,item.mirrored);
    Object.assign(d.el.style,{left:(frame.x-s.pos.x)+'px',top:(frame.y-s.pos.y)+'px',width:frame.w+'px',height:frame.h+'px',transform:item.mirrored?'scaleX(-1)':''});
    s.el.classList.add('is-duet');
    st.timers.push(setTimeout(()=>whenPainted(d.el,()=>{if(st.duet===d)s.el.classList.add('is-duet-solid');}),140));
    d.el.currentTime=Math.max(0,(Date.now()-t0)/1000);d.el.play().catch(()=>{});
    // Both layers follow the shared wall clock so hands and the envelope stay joined.
    d.sync=setInterval(()=>{const want=(Date.now()-t0)/1000;if(want<duet.duration-0.1&&Math.abs(d.el.currentTime-want)>0.06)d.el.currentTime=want;},400);
    st.timers.push(d.sync);
  }
  function endDuet(s,st,item) {
    const d=st.duet;if(!d)return;
    clearInterval(d.sync);st.duet=null;st.nodes.delete(d.el);st.ending=true;
    const mine=()=>!s.__stage||s.__stage===st,since=performance.now();
    if(st.sideOn) {
      // The take ends on the side-on pose this pet still holds underneath (paused on its walk's side-on frame): show
      // it, let the take fade off it, then turn back to the front with the walk's own turn back. The take removes
      // itself and owns the duet classes until then, and the show waits for the turn (finish), so nothing cuts in.
      st.turningBack=true;
      setTimeout(()=>{
        if(mine())s.el.classList.remove('is-duet-solid');
        whenPainted(front(s),()=>{
          d.el.style.opacity='0';st.ending=false;if(mine())s.el.classList.remove('is-duet');setTimeout(()=>d.el.remove(),320);
          setTimeout(()=>turnBack(s,()=>{st.turningBack=false;const next=st.afterTurn;st.afterTurn=null;if(next)next();}),140);
        });
      },140);
      return;
    }
    // A pet that could not get side-on: put the resting idle underneath, wait until it is really drawn (it was hidden
    // for the whole take), then let the take fade off it.
    const switched=holdRest(s,d.item.mirrored);
    // Still hidden, so the resting idle can restart from its first frame: the pose the take ends on.
    const rest=front(s);if(!switched&&rest&&s.anim===s.animations.idle[0])rest.currentTime=0;
    const reveal=()=>{
      if(s.pending&&performance.now()-since<900){requestAnimationFrame(reveal);return;}
      // The clip it switched from is held opaque until the new one draws; under the take it can go at once.
      for(const v of [s.videoA,s.videoB])if(v&&v!==front(s))v.classList.remove('deskpet-hold');
      if(mine())s.el.classList.remove('is-duet-solid');
      whenPainted(front(s),()=>{d.el.style.opacity='0';st.ending=false;if(mine())s.el.classList.remove('is-duet');setTimeout(()=>d.el.remove(),320);});
    };
    setTimeout(reveal,140);
  }

  // ---------- lifecycle ----------
  function release(s,{resume=true,settle=false}={}) {
    const st=s.__stage;if(!st)return;
    st.active=false;s.__stage=null;
    for(const t of st.timers){clearTimeout(t);clearInterval(t);}
    for(const n of st.nodes)n.remove();
    s.el.classList.remove('has-line','in-show');
    if(!st.ending)s.el.classList.remove('is-duet','is-duet-solid'); // a take still fading off removes them itself
    if(s.moveRef!==null){s.stopMove();s.customPos={rx:(s.pos.x+s.halfW)/VIEW.w,ry:(s.pos.y+s.halfH)/VIEW.h};}
    lean(s,0);
    if(resume&&!s.dragState.active)resumeOwn(s,{settle});
  }
  // settle: straight after a show the resting idle is usually on screen; let its loop run out instead of cutting away.
  function resumeOwn(s,{settle=false}={}) {
    if(s.resumeWorkStatusAnim())return;
    const v=front(s);
    if(settle&&v&&v.loop&&!s.pending&&s.anim===s.animations.idle[0]){s.once=true;v.loop=false;v.onended=()=>s.handleEnded();return;}
    if(s.animations.idle.length)s.playOnce((globalThis.DeskpetAppearances?.pickIdle??S.pick)(s.animations.idle,s.anim));
  }
  function abort(s,reason) {
    const st=s.__stage;if(!st)return;
    report({type:'abort',showId:st.showId,reason});release(s);
  }
  function busy(s){return s.dragState.active||s.menuOpen||s.chatOpen||s.throwRef!==null||s.quietUntil>Date.now();}
  function partnerX(s,st) {
    const p=partnerBox(s,st.cue.partner.id);return p?I.body(p,st.cue.partner.appearance).cx:null;
  }
  function prepare(s,cue) {
    if(s.__stage)release(s,{resume:false});
    if(busy(s)){report({type:'abort',showId:cue.showId,reason:'busy'});return;}
    if(s.__return){s.__return.cancelled=true;s.__return=null;}
    const st={showId:cue.showId,cue:{...cue,timing:cue.timing||{prop:{pop:.22,hold:.5,fly:.85,absorb:.4}}},active:true,timers:[],nodes:new Set()};
    // The pair performs with its own lines; the regular status bubbles return afterwards.
    s.__stage=st;s.stopThrow();s.stopMove();s.el.classList.add('in-show');
    st.home=cue.returnHome?{x:s.pos.x,y:s.pos.y}:null;
    const tasks=[];
    const duetItem=cue.script.find(x=>x.op==='duet');
    // 暂停走动 from the menu holds the pet in place; the director then stages the show where both stand.
    if(cue.walk&&s.pet.fixedEnabled){abort(s,'no-room');return;}
    if(cue.walk) {
      const partner=partnerBox(s,cue.walk.to);
      if(!partner){abort(s,'no-partner');return;}
      let target,how={};
      if(cue.walk.duet) {
        const duet=I.DUETS.find(d=>d.id===cue.walk.duet.id);
        target=I.duetGiverBox(duet,I.duetFrame(duet,partner,duet.receiver,cue.walk.duet.mirrored),boxOf(s),appOf(s));
        if(!roomFor(s,target)){abort(s,'no-room');return;}
        // The take starts with the walker side-on toward the receiver, so the walk stops that way instead of turning back.
        how={side:true,face:duet.giverLeft!==!!cue.walk.duet.mirrored?'right':'left',eta:ms=>report({type:'eta',showId:st.showId,at:Date.now()+ms})};
      } else {
        const options=[cue.walk.side,-cue.walk.side].map(side=>I.meetPoint(boxOf(s),appOf(s),partner,cue.partner.appearance,side));
        target=options.find(t=>roomFor(s,t));
        if(!target){abort(s,'no-room');return;}
      }
      tasks.push(walk(s,target,()=>s.__stage===st&&st.active,how).then(r=>{st.sideOn=r;}));
    } else if(duetItem) {
      // The receiver rests facing out, and turns to the walker with its walk's own turn, timed to end as the walker stops.
      holdRest(s,duetItem.mirrored);
      const duet=I.DUETS.find(d=>d.id===duetItem.id),face=duet&&duet.giverLeft!==!!duetItem.mirrored?'left':'right';
      const turning={until:()=>(st.eta||Date.now())+60};
      if(duet)tasks.push(partnerArriving(s,st,duet,duetItem.mirrored,turnSeconds(s)*1000).then(go=>go&&turnSide(s,face,()=>s.__stage===st&&st.active,null,turning)).then(r=>{st.sideOn=!!r;}));
    } else {
      const x=partnerX(s,st);if(x!==null)faceToward(s,x);
      hold(s);
    }
    if(duetItem)tasks.push(loadDuet(s,st,duetItem));
    Promise.all(tasks).then(()=>{
      if(s.__stage!==st||!st.active)return;
      if(duetItem){if(!st.sideOn)holdRest(s,duetItem.mirrored);}
      else{const x=partnerX(s,st);if(x!==null)faceToward(s,x);hold(s);}
      report({type:'ready',showId:st.showId});
    },error=>{if(s.__stage===st&&st.active)abort(s,String(error&&error.message||'prepare-failed'));});
  }
  function start(s,cue) {
    const st=s.__stage;if(!st||st.showId!==cue.showId)return;
    const t0=Number(cue.startAt)||Date.now();
    const run=item=>{
      if(!st.active)return;
      if(item.op==='face'){const x=partnerX(s,st);if(x!==null)faceToward(s,x);}
      else if(item.op==='clip'&&item.name){if(item.loop){s.anim=item.name;s.once=false;s.switchTo(item.name,false);}else s.playOnce(item.name);}
      else if(item.op==='say')say(s,st,item);
      else if(item.op==='squash')s.startSquash(front(s),item.depth||S.SQ_SQUASH);
      else if(item.op==='prop')runProp(s,st,item,t0+item.at*1000);
      else if(item.op==='duet')playDuet(s,st,item,t0+item.at*1000);
      else if(item.op==='duetEnd')endDuet(s,st,item);
    };
    for(const item of st.cue.script)st.timers.push(setTimeout(()=>run(item),Math.max(0,t0+item.at*1000-Date.now())));
    st.timers.push(setTimeout(()=>finish(s,st),Math.max(0,t0+st.cue.duration*1000-Date.now())));
  }
  function finish(s,st) {
    if(s.__stage!==st||!st.active)return;
    if(st.turningBack){st.afterTurn=()=>finish(s,st);return;} // the show ends once the pet has turned back
    report({type:'done',showId:st.showId});
    const home=st.home;
    // Lines may still be fading; keep them while the pet settles.
    const lingering=[...st.nodes].filter(n=>n.classList&&n.classList.contains('deskpet-line'));
    for(const n of lingering)st.nodes.delete(n);
    // A pet walking home keeps its resting idle until the walk starts, rather than switching clips twice in a second.
    const goHome=!!home&&!busy(s);
    release(s,{resume:!goHome,settle:true});
    if(lingering.length) {
      s.el.classList.add('has-line');
      setTimeout(()=>{for(const n of lingering)n.classList.remove('is-on');},900);
      setTimeout(()=>{for(const n of lingering)n.remove();if(!s.el.querySelector('.deskpet-line'))s.el.classList.remove('has-line');},1200);
    }
    if(goHome) {
      const trip={cancelled:false};s.__return=trip;
      setTimeout(()=>{
        if(trip.cancelled||s.__stage)return;
        if(busy(s)){s.__return=null;if(!s.dragState.active)resumeOwn(s,{settle:true});return;}
        walk(s,home,()=>!trip.cancelled&&!s.__stage).then(()=>{if(s.__return===trip){s.__return=null;resumeOwn(s);}},()=>{if(s.__return===trip)s.__return=null;});
      },700);
    }
  }
  function cue(s,c) {
    if(!c||typeof c!=='object')return;
    if(c.type==='prepare')prepare(s,c);
    else if(c.type==='start')start(s,c);
    else if(c.type==='cancel'&&s.__stage&&s.__stage.showId===c.showId)release(s);
    else if(c.type==='eta'&&s.__stage&&s.__stage.showId===c.showId&&Number.isFinite(c.at))s.__stage.eta=c.at; // the walker's arrival
  }

  // ---------- hooks into the original pet ----------
  const wrap=(name,fn)=>{const original=proto[name];proto[name]=function(...args){return fn.call(this,original,...args);};};
  wrap('handleEnded',function(original,...args){
    if(this.__stage){hold(this);return;}
    return original.apply(this,args);
  });
  wrap('playIdle',function(original,...args){if(this.__stage)return;return original.apply(this,args);});
  wrap('tryMove',function(original,...args){if(this.__stage||this.__return&&this.moveRef!==null)return true;return original.apply(this,args);});
  wrap('onWorkTick',function(original,snapshot,tick){
    const state=snapshot&&snapshot.state?snapshot.state:null,st=this.__stage;
    if(st&&(state==='waiting'||state==='error')&&this.pet.workStatusEnabled)abort(this,'urgent-state');
    let result;
    if(this.__stage) {
      // Keep the performance on screen; the real state is recorded and resumes afterwards.
      this.playOnce=this.switchTo=this.stopMove=()=>{};
      try{result=original.call(this,snapshot,tick);}finally{delete this.playOnce;delete this.switchTo;delete this.stopMove;}
    } else result=original.call(this,snapshot,tick);
    const key=(state||'idle')+'|'+(snapshot&&snapshot.source||'');
    if(this.pet.workStatusEnabled&&key!==this.__reported){this.__reported=key;report({type:'state',state:state||'idle',source:snapshot&&snapshot.source||null});}
    return result;
  });
  wrap('onPointerDown',function(original,e){if(e&&e.button===0){if(this.__stage)abort(this,'user');if(this.__return){this.__return.cancelled=true;this.__return=null;}}return original.call(this,e);});
  wrap('onContextMenu',function(original,e){if(this.__stage)abort(this,'menu');return original.call(this,e);});
  wrap('showChatFromMenu',function(original,...args){if(this.__stage)abort(this,'chat');return original.apply(this,args);});
  wrap('goHome',function(original,...args){if(this.__stage)abort(this,'home');return original.apply(this,args);});
  wrap('dispose',function(original,...args){release(this,{resume:false});return original.apply(this,args);});

  // ---------- neighbours ----------
  /**
   * Status bubbles of pets standing close together would cover each other. Push this pet's bubble
   * away from each neighbour; when two pets nearly overlap, the right-hand one lifts its bubble.
   * Every window applies the same rule to the same positions, so the pair always splits apart.
   */
  function spreadBubbles(s) {
    const myCx=s.pos.x+s.size/2,myBottom=s.pos.y+s.size*0.108,h=Math.max(s.bubble.offsetHeight,s.size*0.12);
    let dx=0,dy=0;
    for(const [id,o] of Object.entries(s.others||{})) {
      if(!o||!o.size)continue;
      if(Math.abs(o.y+o.size*0.108-myBottom)>Math.max(h,o.size*0.2)+6)continue;
      const reach=0.25*(s.size+o.size)+6,gap=myCx-(o.x+o.size/2);
      if(Math.abs(gap)>=reach)continue;
      const side=gap>0?1:gap<0?-1:(s.pet.id>id?1:-1);
      dx+=side*Math.min(s.size*0.16,(reach-Math.abs(gap))/2);
      if(Math.abs(gap)<s.size*0.18&&side>0)dy=Math.min(dy,-(h+6));
    }
    const t=dx||dy?`translate(calc(-50% + ${dx.toFixed(1)}px), ${dy.toFixed(1)}px)`:'';
    if(s.bubble.style.transform!==t)s.bubble.style.transform=t;
  }

  // ---------- reporting ----------
  let known=null,lastBusy=null;
  bridge.onStageCue(c=>{const s=sprites[0];if(s)cue(s,c);});
  setInterval(()=>{
    const s=sprites[0];if(!s)return;
    if(s!==known) {
      known=s;lastBusy=null;s.__reported=null;
      report({type:'hello',profile:{appearance:appOf(s),name:s.pet.name,reactionSources:s.pet.reactionSources||[],interaction:I.normalizeInteraction(s.pet.interaction),fixed:s.pet.fixedEnabled===true}});
    }
    const now=busy(s);
    if(now!==lastBusy){lastBusy=now;report({type:'busy',busy:now});}
    if(now&&s.__stage)abort(s,'user');
    spreadBubbles(s);
    window.__dshPetDebug.stage=s.__stage?{showId:s.__stage.showId,kind:s.__stage.cue.kind,role:s.__stage.cue.role,duet:!!s.__stage.duet}:null;
  },250);
})();
