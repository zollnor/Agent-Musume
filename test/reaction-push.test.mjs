import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {selectReaction}=require('../src/reaction-sources.cjs');
const DeskpetInteraction=require('../src/interaction-catalog.cjs');
const source=await readFile(new URL('../src/reaction-renderer.js',import.meta.url),'utf8');
const snap=(rev,state)=>({rev,sources:{'claude-code':{state,activeSessions:1,lastEventAt:rev}},helpers:{}});
function renderer(pet={}){
  let push,answer,now=1e12;const ticks=[],tasks=[],timers=[],played=[];
  const sprite={pet:{id:'p',workStatusEnabled:true,reactionSources:['claude-code'],...pet},dragState:{active:false},menuOpen:false,quietUntil:0,
    onWorkTick(hit){ticks.push(hit.state);tasks.push(hit.task);},renderBubble(){},playOnce:name=>played.push(name)};
  const ctx={sprites:[sprite],DeskpetInteraction,setInterval:fn=>timers.push(fn),Date:{now:()=>now},window:{__dshPetDebug:{},DeskpetSources:{selectReaction},petBridge:{reactionSnapshot:()=>new Promise(r=>{answer=r;}),onReactionPush:cb=>{push=cb;}}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
  return {sprite,ticks,tasks,played,push:s=>push(s),answer:s=>answer(s),wait:ms=>{now+=ms;for(const fn of timers)fn();}};
}
test('a pushed revision reaches the pet without waiting for the poll',()=>{
  const r=renderer();r.push(snap(5,'thinking'));r.push(snap(6,'working'));
  assert.deepEqual(r.ticks,['thinking','working']);
});
test('a poll answered before the newest push does not wind the pet back',async()=>{
  const r=renderer();r.push(snap(7,'working'));r.answer(snap(6,'thinking'));await new Promise(r=>setImmediate(r));
  assert.deepEqual(r.ticks,['working']);
});
const lady={personaStatus:true,waitingReminders:['……还在等你。','请尽快答复。'],reminderClip:'点击-大小姐端庄招手'};
test('a persona speaks its own status line; a plain pet keeps the source label',()=>{
  const plain=renderer();plain.push(snap(1,'working'));assert.match(plain.tasks[0],/Claude Code CLI/);
  const r=renderer(lady);r.push(snap(1,'working'));assert.equal(r.tasks[0],null,'events.js then picks from the persona workStatusTexts');
  const off=renderer({...lady,interaction:{lines:false}});off.push(snap(1,'working'));assert.match(off.tasks[0],/Claude Code CLI/,'lines turned off in settings');
  // The work bubble names the session over a persona's own line, and only there (a source label already names it).
  assert.equal(r.sprite.deskpetWorkLabel,'Claude Code');assert.equal(plain.sprite.deskpetWorkLabel,null);assert.equal(off.sprite.deskpetWorkLabel,null);
});
test('a question left waiting gets sharper reminders at 30 s, 2.5 min and 5.5 min, then stops',()=>{
  const r=renderer(lady);r.push(snap(1,'waiting'));
  r.wait(29000);assert.equal(r.played.length,0);
  r.wait(1500);assert.deepEqual(r.played,['点击-大小姐端庄招手']);assert.equal(r.sprite.workText,'……还在等你。');
  r.wait(120000);assert.equal(r.sprite.workText,'请尽快答复。');r.wait(180000);r.wait(600000);assert.equal(r.played.length,3);
});
test('an answered question cancels the reminder; quiet mode keeps the words but skips the clip',()=>{
  const r=renderer(lady);r.push(snap(1,'waiting'));r.wait(10000);r.push(snap(2,'working'));r.wait(60000);assert.equal(r.played.length,0);
  const q=renderer(lady);q.sprite.quietUntil=Infinity;q.push(snap(1,'waiting'));q.wait(31000);assert.equal(q.played.length,0);assert.equal(q.sprite.workText,'……还在等你。');
});
