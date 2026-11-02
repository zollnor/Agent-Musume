import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {patchEvents,patchSprite} from '../src/patches.mjs';

const root=new URL('../vendor/dsh-pet/runtime/electron-helper/',import.meta.url);
const sharedCtx={Math:Object.create(Math)};vm.createContext(sharedCtx);
vm.runInContext(await readFile(new URL('shared-core.js',root),'utf8'),sharedCtx);
const S=sharedCtx.PetShared;
const events=patchEvents(await readFile(new URL('events.original.js',root),'utf8'));
const body=events.slice(events.indexOf('PetSprite.prototype.onWorkTick = function onWorkTick(snapshot, tick) {'),events.indexOf('\n};',events.indexOf('PetSprite.prototype.onWorkTick'))+3);
const ctx={S,console:{log(){},error(){}},window:{setTimeout:()=>1,clearTimeout(){}},BUBBLE_DURATION_MS:10000,PetSprite:function(){}};
vm.createContext(ctx);vm.runInContext(body,ctx);
const onWorkTick=ctx.PetSprite.prototype.onWorkTick;

// The dragon's work slots are single clips (they loop); the lady's working slot rotates three clips.
const pool=['工作-思考','工作-忙碌','工作-整理','工作-等待','工作-完成','工作-出错'];
function pet(playing,state){
  const video={src:'http://127.0.0.1/thumb/deskpet-dragon-d/'+encodeURIComponent(playing)+'.webm',loop:true,ended:false,onended:null};
  return {pet:{workStatusEnabled:true,workStatusTexts:[]},animations:{events:{workStatus:pool}},front:0,videoA:video,videoB:null,pending:null,
    anim:'待机-抱臂巡视',prevWorkState:state,prevWorkTick:0,workTimer:null,played:[],switched:[],ended:0,
    stopMove(){},renderBubble(){},playOnce(n){this.played.push(n)},switchTo(n){this.switched.push(n)},handleEnded(){this.ended++}};
}
let tick=0;
test('a busy clip plays to its end when the agent flips between thinking, working and result',()=>{
  const p=pet('工作-忙碌','working');
  onWorkTick.call(p,{state:'result'},++tick);
  assert.deepEqual([p.played,p.switched],[[],[]],'no cut mid-clip');
  assert.equal(p.workState,'result','the next clip will come from the newest state');
  assert.equal(p.videoA.loop,false);assert.equal(p.anim,'工作-忙碌');assert.equal(p.once,true);
  p.videoA.onended();assert.equal(p.ended,1,'the end of the clip hands over to handleEnded');
});
test('waiting, success, error and the first busy state cut in at once',()=>{
  for(const [from,to] of [['working','waiting'],['result','success'],['thinking','error'],[null,'thinking']]){
    const p=pet(from?'工作-思考':'待机-抱臂巡视',from);onWorkTick.call(p,{state:to},++tick);
    assert.equal(p.played.length+p.switched.length,1,`${from} -> ${to}`);assert.equal(p.videoA.loop,true);
  }
});
test('a click or other clip on screen is not held back by a busy state change',()=>{
  const p=pet('点击-叉腰训话','working');onWorkTick.call(p,{state:'result'},++tick);
  assert.equal(p.played.length+p.switched.length,1);
});
test('a clip left to finish resumes the active state, not the slot it came from',async()=>{
  const sprite=patchSprite(await readFile(new URL('sprite.original.js',root),'utf8'));
  assert(sprite.includes('const inActiveSlot = S.poolIncludes('),'every appearance hands over to the active state');
  assert(!sprite.includes("this.pet.appearance !== 'claude-lady' || S.poolIncludes("));
});

test('the right-click menu: a short root, previews, every animation under 动作, no model-only items',async()=>{
  const sprite=patchSprite(await readFile(new URL('sprite.original.js',root),'utf8'));
  const start=sprite.indexOf('    const tools = [');const block=sprite.slice(start,sprite.indexOf('    if (!tree.length) return;',start));
  const build=new vm.Script('(function(){'+block+'return tree;})');const c={S,Date};vm.createContext(c);const fn=build.runInContext(c);
  const pet={pet:{fixedEnabled:false,balanceEnabled:false},quietUntil:0,animations:{idle:['待机'],turn:['转向'],drag:['拖拽'],clicks:['点击'],moves:{actions:[{name:'走'}]},categories:[{id:'日常',weight:1,actions:['a']}],events:{}}};
  const plain=v=>JSON.parse(JSON.stringify(v)); // arrays built inside the vm have that realm's prototypes
  const tree=plain(fn.call(pet)),labels=tree.map(n=>n.label);
  assert.deepEqual(labels,['设置…','查看实时状态','回到初始位置','暂停走动','安静 30 分钟','互动演示','动作','重载配置']);
  assert(!JSON.stringify(tree).includes('"whisper"')&&!JSON.stringify(tree).includes('"chat"'),'no items that need the DSH model service');
  assert.deepEqual(tree[6].children.map(n=>n.label),['待机','转向','拖拽','点击回应','移动','日常']);
  assert.equal(tree[5].children.length,7);
  pet.pet.fixedEnabled=true;pet.quietUntil=Date.now()+1000;
  assert.deepEqual(plain(fn.call(pet)).slice(3,5).map(n=>n.label),['恢复走动','结束安静']);
  assert(sprite.includes("if (this.quietUntil > Date.now()) { this.playOnce(animations.idle[0] ?? this.anim); return; }"));
});
test('a pointer that slips off the menu has half a second to come back',async()=>{
  const {patchShared}=await import('../src/patches.mjs');
  // prepare.mjs keeps the upstream file as shared-core.original.js once it has patched shared-core.js.
  const upstream=await readFile(new URL('shared-core.original.js',root),'utf8').catch(()=>readFile(new URL('shared-core.js',root),'utf8'));
  assert(patchShared(upstream).includes('close();\n\t\t}, 500);'));
});
