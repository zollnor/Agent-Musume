import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {patchStandalone} from '../src/patches.mjs';
const require=createRequire(import.meta.url);
const I=require('../src/interaction-catalog.cjs');
const {Director,PROP_CATCH,PROP_HANDOFF}=require('../src/interaction-director.cjs');
const {selectReaction}=require('../src/reaction-sources.cjs');
const appearances=require('../src/pet-appearances.cjs');
const sources=require('../src/reaction-sources.cjs');

const root=new URL('../',import.meta.url);
// The fish's own clips sit with the vendor's; her side walk is ours (the host route falls back to pets/blue-fish/webm).
const clipDir={'claude-lady':['pets/claude-lady/webm/'],'dragon-girl-D':['pets/dragon-girl-D/webm/'],'blue-fish':['vendor/dsh-pet/assets/webm/','pets/blue-fish/webm/']};

test('every interaction clip is an existing animation of that appearance, and the paired take is present',()=>{
  for(const [app,roles] of Object.entries(I.CLIPS))for(const [role,names] of Object.entries(roles))for(const name of names)
    assert(clipDir[app].some(dir=>existsSync(new URL(dir+name+'.webm',root))),`${app} ${role} ${name}`);
  for(const duet of I.DUETS)for(const file of Object.values(duet.files))assert(existsSync(new URL('pets/duets/'+file,root)),file);
  const claude=appearances.appearanceFields({appearance:'claude-lady'}).animations;
  for(const names of Object.values(I.CLIPS['claude-lady']))for(const name of names)assert(!claude.categories.some(c=>c.noMirror&&c.actions.includes(name)),`${name} must be mirror-safe`);
});

test('lines are local templates with partner nicknames and no unresolved placeholders',()=>{
  for(const kind of Object.keys(I.LINES))for(const app of Object.keys(I.BODY))for(const partner of Object.keys(I.BODY)) {
    const text=I.line(kind,app,partner,()=>0.99);
    assert(text&&!text.includes('{'),`${kind} ${app}`);
  }
  assert.equal(I.line('nudge','claude-lady','dragon-girl-D',()=>0),'龙娘在等你确认。');
  // Relationship lines replace the general line for that partner only.
  for(const [app,partners] of Object.entries(I.PAIR_LINES))for(const [partner,kinds] of Object.entries(partners))for(const kind of Object.keys(kinds)) {
    assert(Object.hasOwn(I.LINES,kind)&&Object.hasOwn(I.BODY,partner),`${app}>${partner} ${kind}`);
    assert.equal(I.line(kind,app,partner,()=>0),kinds[kind][0].replaceAll('{name}',I.BODY[partner].nick));
  }
  assert.equal(I.line('cheer','dragon-girl-D','blue-fish',()=>0),'不错嘛肥鱼，有长进。');
  assert.equal(I.line('cheer','dragon-girl-D','claude-lady',()=>0),'干得漂亮，大小姐。');
  for(const c of I.CHATS)for(const app of Object.keys(I.BODY))assert(c.open[app]&&c.reply[app],'every chat has a line for every appearance');
  assert(I.readSeconds('收到！')>=1.8&&I.readSeconds('这一部分，就拜托你了，好吗好吗好吗')>I.readSeconds('收到！'));
});

test('the fish calls the dragon G姐 and the lady 克洛德, and lives on white rice',()=>{
  assert.equal(I.line('nudge','blue-fish','dragon-girl-D',()=>0),'G姐在等你啦，快去嘛～');
  assert.equal(I.line('nudge','blue-fish','claude-lady',()=>0),'克洛德在等你啦，快去嘛～');
  assert.equal(I.line('nudge','dragon-girl-D','blue-fish',()=>0),'肥鱼等你回话呢，再拖她就睡着了。','others keep their own names for her');
  const fish=appearances.applyAppearance({appearance:'blue-fish'});
  const said=[...fish.workStatusTexts.flat(),...fish.waitingReminders,...Object.values(I.LINES).flatMap(t=>t['blue-fish']),
    ...Object.values(I.PAIR_LINES['blue-fish']).flatMap(k=>Object.values(k).flat()),...I.CHATS.flatMap(c=>[c.open['blue-fish'],c.reply['blue-fish']])];
  for(const text of said)assert(!/鱼干|零食|蛋糕|茶点|吃糖|吃鱼/.test(text)&&!/大小姐|龙娘|(?<!G)姐/.test(text),text);
  assert(said.some(t=>t.includes('白饭')));
});

test('walk gait accelerates, cruises and settles monotonically to the target',()=>{
  let prev=0;
  for(let t=0;t<=2.5;t+=0.05){const f=I.gait(t,2.4);assert(f>=prev-1e-9);prev=f;}
  assert.equal(I.gait(2.4,2.4),1);assert.equal(I.gait(0,2.4),0);
  const mid=I.gait(1.2,2.4);assert(Math.abs(mid-0.5)<1e-9,'symmetric profile');
  assert(I.gait(0.1,2.4)<0.1/2.4,'starts slower than a linear slide');
  assert(I.walkSeconds(40,400)>=0.9&&I.walkSeconds(4000,400)<=5);
});

test('meeting point keeps both silhouettes apart on a shared ground line',()=>{
  const walker={x:900,y:500,size:400,bottomPad:18.75},partner={x:200,y:520,size:400,bottomPad:18.75};
  const spot=I.meetPoint(walker,'dragon-girl-D',partner,'claude-lady',1);
  const a=I.body({...walker,...spot},'dragon-girl-D'),b=I.body(partner,'claude-lady');
  assert(Math.abs(a.feet-b.feet)<1e-6,'same ground line');
  const gap=(a.cx-a.half)-(b.cx+b.half);
  assert(gap>=12&&gap<=40,`gap ${gap}`);
});

test('paired take frame lines the giver up with its own idle body and keeps the receiver still',()=>{
  const duet=I.DUETS[0],receiver={x:300,y:500,size:400,bottomPad:18.75},giver={x:900,y:500,size:400,bottomPad:18.75};
  for(const mirrored of [false,true]) {
    const frame=I.duetFrame(duet,receiver,'claude-lady',mirrored),r=I.body(receiver,'claude-lady');
    const rx=frame.x+(mirrored?duet.frame.w-duet.anchors.receiver.x:duet.anchors.receiver.x)*frame.scale;
    assert(Math.abs(rx-r.cx)<1e-6&&Math.abs(frame.y+duet.anchors.receiver.feet*frame.scale-r.feet)<1e-6);
    const box=I.duetGiverBox(duet,frame,giver,'dragon-girl-D'),g=I.body({...giver,...box},'dragon-girl-D');
    const gx=frame.x+(mirrored?duet.frame.w-duet.anchors.giver.x:duet.anchors.giver.x)*frame.scale;
    assert(Math.abs(g.cx-gx)<1e-6,'giver centre on its take anchor');
    assert(Math.abs(g.feet-r.feet)<1e-6,'shared ground line');
    assert(mirrored?g.cx<r.cx:g.cx>r.cx,'giver on the requested side');
    assert(frame.scale>0.3&&frame.scale<0.45,'take shown at pet scale');
  }
});

test('helper pets follow sub-agents of the sources they assist; main sources still win when waiting',()=>{
  const states={'codex-cli':{state:'idle',activeSessions:0},'chatgpt-desktop':{state:'waiting',activeSessions:1,lastEventAt:1}};
  const helpers={'codex-cli':{state:'working',activeSessions:2,lastEventAt:9}};
  const hit=selectReaction([],states,['codex-cli'],helpers);
  assert.equal(hit.state,'working');assert.equal(hit.source,'helper:codex-cli');assert.match(hit.task,/子代理/);
  assert.equal(selectReaction(['chatgpt-desktop'],states,['codex-cli'],helpers).state,'waiting');
  assert.equal(selectReaction([],states,[],helpers).state,'idle');
});

// ---------- director ----------
function rig({profiles,boxes,now=100000}) {
  const sent=[];const clock={t:now};
  const d=new Director({send:(id,cue)=>sent.push({id,...cue}),now:()=>clock.t,random:()=>0.3,boxes:()=>boxes});
  for(const [id,p] of Object.entries(profiles))d.report(id,{type:'hello',profile:p});
  return {d,sent,clock};
}
const box=(x,size=400)=>({x,y:500,size,bottomPad:size*9/16*30/360});
const both={main:{appearance:'dragon-girl-D',reactionSources:['codex-cli']},help:{appearance:'claude-lady',reactionSources:[],interaction:{helperSources:['codex-cli']}}};

test('a confirmed delegation stages the paired take: giver walks, both get ready, then start together',()=>{
  const {d,sent,clock}=rig({profiles:both,boxes:{main:box(1200),help:box(300)}});
  d.collab({events:[]});
  d.collab({events:[{seq:5,kind:'task.assigned',source:'codex-cli',at:clock.t}]});
  const prep=sent.filter(c=>c.type==='prepare');
  assert.deepEqual(prep.map(c=>c.id).sort(),['help','main']);
  const giver=prep.find(c=>c.id==='main'),receiver=prep.find(c=>c.id==='help');
  assert(giver.walk&&giver.walk.duet&&giver.walk.duet.mirrored===false,'dragon walks to the take position on the right');
  assert.equal(receiver.walk,null,'receiver stays');
  assert(giver.script.some(x=>x.op==='duet'&&x.role==='giver')&&receiver.script.some(x=>x.op==='duet'&&x.role==='receiver'));
  assert(giver.returnHome);
  d.report('main',{type:'eta',showId:giver.showId,at:clock.t+900});
  assert.deepEqual(sent.filter(c=>c.type==='eta').map(c=>[c.id,c.at]),[['help',clock.t+900]],'the walker\'s arrival goes to the partner only');
  d.report('help',{type:'ready',showId:giver.showId});
  assert(!sent.some(c=>c.type==='start'),'no half performance before both are ready');
  d.report('main',{type:'ready',showId:giver.showId});
  const starts=sent.filter(c=>c.type==='start');
  assert.equal(starts.length,2);assert.equal(starts[0].startAt,starts[1].startAt);
  d.report('main',{type:'done',showId:giver.showId});d.report('help',{type:'done',showId:giver.showId});
  assert.equal(d.show,null);
});

test('every pair of the three has a paired take for every hand-over kind in both directions',()=>{
  // Who stands left in a pair's source takes: the lady in hers, the dragon with the fish.
  for(const [pets,left] of [[['claude-lady','dragon-girl-D'],'claude-lady'],[['claude-lady','blue-fish'],'claude-lady'],[['dragon-girl-D','blue-fish'],'dragon-girl-D']])
  for(const kind of ['collab.assign','collab.deliver','collab.complete','collab.failed']){
    for(const [x,y] of [pets,[...pets].reverse()]) {
      const cast=I.duetCast(kind,x,y);assert(cast,`${kind} ${x}>${y}`);
      const d=cast.duet;assert.deepEqual(cast.swap?[d.receiver,d.giver]:[d.giver,d.receiver],[x,y]);
      assert.equal(d.giverLeft,d.giver===left,`${d.id}: ${left} stands left`);
      for(const role of ['giver','receiver'])assert(d.files[role].includes({'claude-lady':'claude','dragon-girl-D':'dragon','blue-fish':'fish'}[d[role]]),`${d.id} ${role}`);
    }
  }
  // A celebration with the fish is hers to walk over for, whichever pet starts the show.
  assert.equal(I.duetCast('collab.complete','claude-lady','blue-fish').duet.id,'complete-lf');
  assert.equal(I.duetCast('collab.complete','claude-lady','blue-fish').swap,true);
  // The dragon hands back to the fish in a take of their own (found missing 2026-11-02).
  assert.equal(I.duetCast('collab.deliver','dragon-girl-D','blue-fish').duet.id,'deliver-df');
  // In the dragon and fish takes the dragon is drawn where the lady stands in hers.
  assert(Math.abs(I.duetFor('collab.assign','dragon-girl-D','blue-fish').anchors.giver.x-I.duetFor('collab.assign','claude-lady','blue-fish').anchors.giver.x)<10);
  assert.equal(I.duetMirrored(I.duetFor('collab.assign','claude-lady','dragon-girl-D'),true),false);
  assert.equal(I.duetMirrored(I.duetFor('collab.assign','claude-lady','dragon-girl-D'),false),true);
});

test('each hand-over plays its own paired take, with the right pet as giver',()=>{
  const lady={main:{appearance:'claude-lady',reactionSources:['claude-code']},help:{appearance:'dragon-girl-D',reactionSources:[],interaction:{helperSources:['claude-code']}}};
  const run=(events,boxes={main:box(1200),help:box(300)})=>{const {d,sent,clock}=rig({profiles:lady,boxes});d.collab({events:[]});d.collab({events:events.map((e,i)=>({seq:i+1,source:'claude-code',at:clock.t,...e}))});return sent.filter(c=>c.type==='prepare');};
  const take=(prep,id)=>prep.find(c=>c.id===id).script.find(x=>x.op==='duet');
  let prep=run([{kind:'task.assigned'}]);
  assert.equal(take(prep,'main').id,'assign-ld');assert.equal(take(prep,'main').role,'giver');assert.equal(take(prep,'help').role,'receiver');
  assert(prep.find(c=>c.id==='main').walk,'the assigning lady walks over');
  assert.equal(take(prep,'main').mirrored,true,'the lady stands right of the dragon here, the source has her left');
  prep=run([{kind:'result.delivered'}]);
  assert.equal(take(prep,'help').id,'deliver-dl');assert.equal(take(prep,'help').role,'giver','the helper carries the result');
  prep=run([{kind:'task.failed'}]);
  assert.equal(take(prep,'main').id,'failed-l');assert.equal(take(prep,'main').role,'giver','the main pet reassures its helper');
  assert(prep.find(c=>c.id==='help').script.some(x=>x.op==='say'&&x.text==='啧，没成。我换个办法。'));
  // Out of reach a failure is still acknowledged in place.
  prep=run([{kind:'task.failed'}],{main:box(3200),help:box(300)});
  assert(prep.every(c=>!c.walk&&!c.script.some(x=>x.op==='duet')));
});

test('the first poll is a baseline, stale or unpaired events never perform',()=>{
  const {d,sent,clock}=rig({profiles:both,boxes:{main:box(1200),help:box(300)}});
  d.collab({events:[{seq:3,kind:'task.assigned',source:'codex-cli',at:clock.t}]});
  assert.equal(sent.length,0,'startup history is not replayed');
  d.collab({events:[{seq:4,kind:'task.assigned',source:'codex-cli',at:clock.t-60000}]});
  d.collab({events:[{seq:5,kind:'task.assigned',source:'claude-code',at:clock.t}]});
  assert.equal(sent.length,0);
});

test('a delivery supersedes a pending assignment; the helper carries the result folder back',()=>{
  // Two pets with the same look have no paired take (every pair of different looks has, since 2026-11-02).
  const {d,sent,clock}=rig({profiles:{...both,help:{...both.help,appearance:'dragon-girl-D'}},boxes:{main:box(1200),help:box(300)}});
  d.report('main',{type:'busy',busy:true});
  d.collab({events:[]});
  d.collab({events:[{seq:1,kind:'task.assigned',source:'codex-cli',at:clock.t},{seq:2,kind:'task.assigned',source:'codex-cli',at:clock.t}]});
  assert.equal(d.queue.length,1);assert.equal(d.queue[0].count,2,'parallel spawns coalesce');
  d.collab({events:[{seq:3,kind:'result.delivered',source:'codex-cli',at:clock.t}]});
  assert.deepEqual(d.queue.map(c=>c.kind),['collab.deliver']);
  d.report('main',{type:'busy',busy:false});
  const prep=sent.filter(c=>c.type==='prepare');
  const carrier=prep.find(c=>c.id==='help'),receiver=prep.find(c=>c.id==='main');
  assert(carrier.walk&&!carrier.walk.duet,'no paired take for this pair: procedural hand-over');
  const send=carrier.script.find(x=>x.op==='prop'),receive=receiver.script.find(x=>x.op==='prop');
  assert.equal(send.kind,'folder');assert.equal(send.segment,'send');assert.equal(receive.segment,'receive');assert.equal(send.at,receive.at);
  const caught=receiver.script.find(x=>x.op==='squash');assert(Math.abs(caught.at-(send.at+PROP_CATCH))<1e-9);
  assert(PROP_HANDOFF<PROP_CATCH);
});

test('the main session finishing after a delivery is celebrated together, not as a generic cheer',()=>{
  const {d,sent,clock}=rig({profiles:both,boxes:{main:box(1200),help:box(300)}});
  d.collab({events:[]});d.collab({events:[{seq:1,kind:'result.delivered',source:'codex-cli',at:clock.t}]});
  const first=sent.find(c=>c.type==='prepare');d.cancel('test');d.queue=[];sent.length=0;
  void first;clock.t+=10000;
  d.report('main',{type:'state',state:'success',source:'codex-cli'});
  const prep=sent.filter(c=>c.type==='prepare');
  assert.equal(prep[0].kind,'collab.complete');assert.deepEqual(prep.map(c=>c.id).sort(),['help','main']);
  const main=prep.find(c=>c.id==='main'),help=prep.find(c=>c.id==='help');
  assert.equal(main.walk?.to,'help','the main pet walks over to celebrate side by side');
  assert(main.returnHome&&!help.walk);
  assert(main.script.some(x=>x.op==='say')&&help.script.some(x=>x.op==='say'));
  assert(!main.script.some(x=>x.op==='prop'),'nothing is handed over');
  // Out of walking range they still celebrate together, each where it stands.
  const far=rig({profiles:both,boxes:{main:box(3000),help:box(300)}});
  far.d.collab({events:[]});far.d.collab({events:[{seq:1,kind:'result.delivered',source:'codex-cli',at:far.clock.t}]});
  far.d.cancel('test');far.d.queue=[];far.sent.length=0;far.clock.t+=10000;
  far.d.report('main',{type:'state',state:'success',source:'codex-cli'});
  const farPrep=far.sent.filter(c=>c.type==='prepare');
  assert.equal(farPrep[0]?.kind,'collab.complete');assert(farPrep.every(c=>!c.walk),'too far: acknowledged in place');
});

test('social reactions: the nearest free pet responds to a partner state; urgent and busy pets do not',()=>{
  const profiles={a:{appearance:'claude-lady',reactionSources:['codex-cli']},b:{appearance:'dragon-girl-D'},c:{appearance:'blue-fish'}};
  const {d,sent,clock}=rig({profiles,boxes:{a:box(100),b:box(700),c:box(1500)}});
  d.report('b',{type:'state',state:'waiting',source:'chatgpt-desktop'});
  let prep=sent.filter(c=>c.type==='prepare');
  assert.equal(prep.length,1);assert.equal(prep[0].kind,'social.nudge');
  assert.equal(prep[0].partner.id,'b');assert.notEqual(prep[0].id,'b');
  assert.equal(prep[0].script.find(x=>x.op==='say').text,prep[0].id==='a'?'龙娘在等你确认。':'龙娘在等你啦～');
  d.report(prep[0].id,{type:'ready',showId:prep[0].showId});d.report(prep[0].id,{type:'done',showId:prep[0].showId});
  sent.length=0;clock.t+=20000;
  d.report('a',{type:'busy',busy:true});
  d.report('b',{type:'state',state:'error',source:'chatgpt-desktop'});
  prep=sent.filter(c=>c.type==='prepare');
  assert.equal(prep[0].id,'c','busy pet skipped');
  sent.length=0;clock.t+=20000;d.cancel('x');
  d.report('a',{type:'busy',busy:false});d.report('c',{type:'state',state:'waiting',source:'claude-code'});
  sent.length=0;
  d.report('b',{type:'state',state:'success',source:'chatgpt-desktop'});
  assert(sent.filter(c=>c.type==='prepare').every(c=>c.id!=='c'),'a pet waiting for the user does not cheer');
  sent.length=0;
  d.report('b',{type:'state',state:'thinking',source:'demo'});d.report('b',{type:'state',state:'error',source:'demo'});
  clock.t+=60000;d.pump();
  assert(!sent.some(c=>c.type==='prepare'&&c.kind==='social.comfort'),'demo states never trigger reactions');
});

test('two pets following the same session do not congratulate each other for it',()=>{
  const profiles={a:{appearance:'claude-lady',reactionSources:['codex-cli']},b:{appearance:'dragon-girl-D',reactionSources:['codex-cli']}};
  const {d,sent}=rig({profiles,boxes:{a:box(100),b:box(700)}});
  d.report('a',{type:'state',state:'working',source:'codex-cli'});d.report('b',{type:'state',state:'working',source:'codex-cli'});
  d.report('a',{type:'state',state:'success',source:'codex-cli'});
  assert.equal(sent.filter(c=>c.type==='prepare').length,0);
});

test('aborts release both pets; a performance that cannot be staged closely falls back to a remote hand-over',()=>{
  const fixed={main:{...both.main,fixed:true},help:{...both.help,fixed:true}};
  const {d,sent,clock}=rig({profiles:fixed,boxes:{main:box(1500),help:box(100)}});
  d.collab({events:[]});d.collab({events:[{seq:1,kind:'task.assigned',source:'codex-cli',at:clock.t}]});
  let prep=sent.filter(c=>c.type==='prepare');
  assert(prep.every(c=>!c.walk),'fixed pets never walk');
  assert(prep.every(c=>!c.script.some(x=>x.op==='prop'||x.op==='duet')),'far apart: no prop thrown across the screen');
  d.report('help',{type:'abort',showId:prep[0].showId,reason:'user'});
  assert(sent.some(c=>c.type==='cancel'&&c.id==='main'));assert.equal(d.show,null);
});

test('turning lines off removes both bubbles but keeps the action',()=>{
  const {d,sent,clock}=rig({profiles:{main:both.main,help:{...both.help,interaction:{helperSources:['codex-cli'],lines:false}}},boxes:{main:box(800),help:box(500)}});
  d.collab({events:[]});d.collab({events:[{seq:1,kind:'task.assigned',source:'codex-cli',at:clock.t}]});
  const prep=sent.filter(c=>c.type==='prepare');
  assert.equal(prep.length,2);assert(prep.every(c=>!c.script.some(x=>x.op==='say')));
  assert(prep.some(c=>c.script.some(x=>x.op==='duet'||x.op==='clip')));
});

test('idle pets chat only after both have been quiet, and demo previews are marked',()=>{
  const profiles={a:{appearance:'claude-lady'},b:{appearance:'dragon-girl-D'}};
  const {d,sent,clock}=rig({profiles,boxes:{a:box(200),b:box(900)}});
  d.tick();assert.equal(sent.length,0);
  clock.t+=10*60*1000;d.tick();
  const prep=sent.filter(c=>c.type==='prepare');
  assert.equal(prep[0].kind,'social.chat');assert(prep.some(c=>c.walk),'one of them walks over');
  d.cancel('x');sent.length=0;
  assert.equal(d.demo('collab.assign').ok,true);
  assert(sent.filter(c=>c.type==='prepare').every(c=>c.demo===true));
  const giver=sent.find(c=>c.type==='prepare'&&c.script.some(x=>x.op==='duet'&&x.role==='giver'));
  assert.equal(giver?.id,'a','both directions have a paired take, so the preview keeps the natural order');
  d.cancel('x');sent.length=0;
  assert.equal(d.demo('collab.assign').ok,true);
  const again=sent.find(c=>c.type==='prepare'&&c.script.some(x=>x.op==='duet'&&x.role==='giver'));
  assert.equal(again?.id,'b','the same demo again lets the other pet lead');
  assert.equal(new Director({send(){},boxes:()=>({})}).demo('social.cheer').ok,false);
});

test('a demo asked from a pet\'s own menu casts that pet, with each partner it has a paired take with in turn',()=>{
  const profiles={lady:{appearance:'claude-lady'},dragon:{appearance:'dragon-girl-D'},fish:{appearance:'blue-fish'}};
  const {d,sent}=rig({profiles,boxes:{lady:box(600),dragon:box(1100),fish:box(100)}});
  const cast=()=>{const p=sent.filter(c=>c.type==='prepare');d.cancel('x');sent.length=0;return p.find(c=>c.script.some(x=>x.op==='duet'&&x.role==='giver'))?.id+'>'+p.find(c=>c.script.some(x=>x.op==='duet'&&x.role==='receiver'))?.id;};
  // The fish has paired takes with the lady only, so the dragon (first in line otherwise) sits it out.
  assert.equal(d.demo('collab.assign',false,'fish').ok,true);assert.equal(cast(),'fish>lady');
  assert.equal(d.demo('collab.assign',false,'fish').ok,true);assert.equal(cast(),'lady>fish');
  // The lady has them with both: each partner, both ways.
  const seen=[];for(let i=0;i<4;i++){d.demo('collab.assign',false,'lady');seen.push(cast());}
  assert.deepEqual(seen,['lady>dragon','dragon>lady','lady>fish','fish>lady']);
});

test('host keeps the per-pet interaction settings through read and save',async()=>{
  const patched=patchStandalone(await readFile(new URL('../vendor/dsh-pet/lib/standalone.original.js',import.meta.url),'utf8'));
  const region=patched.slice(patched.indexOf('//#region src/host/config.ts'),patched.indexOf('//#region src/host/helper-process.ts'));
  const ctx={...appearances,...sources,...I,console:{warn(){},log(){}}};vm.createContext(ctx);
  vm.runInContext(region+';globalThis.api={mergePet,saveUserConfig};',ctx);
  const raw={id:'p',name:'P',size:300,balanceEnabled:false,display:'desktop',position:{corner:'bottom-left',marginX:1,marginY:2},interaction:{helperSources:['codex-cli','bogus'],idle:false}};
  const merged=ctx.api.mergePet({position:{}},raw,'main',new Set());
  assert.deepEqual(JSON.parse(JSON.stringify(merged.interaction)),{helperSources:['codex-cli'],social:true,collab:true,idle:false,approach:true,lines:true});
  assert.equal(ctx.api.saveUserConfig({pets:[{...raw,interaction:{helperSources:['codex-cli'],idle:false}}]}).pets[0].interaction.helperSources[0],'codex-cli');
  assert.equal(ctx.api.saveUserConfig({pets:[{...raw,interaction:{helperSources:['nope']}}]}),null,'invalid helper source rejected');
  assert.equal(ctx.api.mergePet({position:{}},{...raw,activity:'quiet'},'main',new Set()).activity,'quiet');
  assert.equal(merged.activity,'normal','a pet without a level is normal');
  assert.equal(ctx.api.saveUserConfig({pets:[{...raw,interaction:{helperSources:['codex-cli']},activity:'lively'}]}).pets[0].activity,'lively');
  assert.equal(ctx.api.saveUserConfig({pets:[{...raw,interaction:{helperSources:['codex-cli']},activity:'frantic'}]}),null,'invalid activity rejected');
  assert.ok(readFileSync(new URL('../src/patches.mjs',import.meta.url),'utf8').includes('deskpet-duets'));
});
