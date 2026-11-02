import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';

const require=createRequire(import.meta.url);
const staged=process.env.CLAUDE_STAGE_DIR;
const {patchStandalone,patchSprite}=await import(staged?pathToFileURL(join(staged,'patches.mjs')):new URL('../src/patches.mjs',import.meta.url));
const appearances=require(staged?join(staged,'pet-appearances.cjs'):'../src/pet-appearances.cjs');
const sources=require('../src/reaction-sources.cjs');
const interaction=require('../src/interaction-catalog.cjs');
// The lady's first packaged clip set: which clips exist, what they replaced, and the fields it shipped with.
const definition=JSON.parse(await readFile(new URL('fixtures/claude-lady-actions.json',import.meta.url),'utf8'));
const fields=JSON.parse(await readFile(new URL('fixtures/claude-lady-fields.json',import.meta.url),'utf8'));
const sharedCtx={Math:Object.create(Math)};vm.createContext(sharedCtx);
vm.runInContext(await readFile(new URL('../vendor/dsh-pet/runtime/electron-helper/shared-core.js',import.meta.url),'utf8'),sharedCtx);
const S=sharedCtx.PetShared;

test('Claude has 108 distinct reachable clips covering all 106 original intents, with eight frequently offered specials',async()=>{
  const a=fields.animations;
  const names=new Set([...a.idle,...a.turn,...a.drag,...a.clicks,...a.moves.actions.map(x=>x.name),...a.categories.flatMap(c=>c.actions),...Object.values(a.events).flat(2)]);
  assert.equal(names.size,108);assert.deepEqual([...names].sort(),definition.actions.map(x=>x.name).sort());
  assert.equal(new Set(definition.coverage.map(x=>x.originalAction)).size,106);
  assert.equal(new Set(definition.coverage.map(x=>x.adaptedId)).size,106);
  const originalNames=(await readdir(new URL('../vendor/dsh-pet/assets/webm/',import.meta.url))).filter(n=>n.endsWith('.webm')).map(n=>n.slice(0,-5));
  assert.deepEqual(definition.coverage.map(x=>x.originalAction).sort(),originalNames.sort(),'coverage must match actual original106 video names');
  const common=a.categories[0];assert.equal(common.weight,48);
  assert.deepEqual(common.actions,definition.approvedSpecialIds.map(id=>definition.actions.find(x=>x.id===id).name));
  assert.equal(Object.values(fields.animationWeights).reduce((a,b)=>a+b,0)+a.categories.reduce((s,c)=>s+c.weight,0),100);
  for(const facing of ['left','right'])for(let i=0;i<8;i++){
    // Exercise the original selector with deterministic rolls within the first category.
    const values=[.1,(i+.5)/8];sharedCtx.Math.random=()=>values.shift();
    assert.equal(S.pickCategoryAction(a.categories,a.idle,facing,'').name,common.actions[i]);
  }
  sharedCtx.Math.random=Math.random;
});

test('non-terminal work slots rotate within their own state without accidentally entering another state',()=>{
  const tuned=appearances.applyAppearance({id:'x',appearance:'claude-lady'}).animations.events.workStatus;
  for(const work of [fields.animations.events.workStatus,tuned]) {
    assert.equal(new Set(work.flat()).size,work.flat().length);
    for(let i=0;i<work.length;i++)for(const n of work[i]){
      const next=S.nextWorkStatusAnim(work,n);
      if(work[i].length===1)assert.equal(next,null);
      else {assert(work[i].includes(next));assert.notEqual(next,n);}
    }
  }
});

test('the book burning is one result clip in four and never a random action',async()=>{
  const a=appearances.applyAppearance({id:'x',appearance:'claude-lady'}).animations,burn='读毕投书入火盆';
  assert.equal(a.events.workStatus[2].length,4);assert(a.events.workStatus[2].includes(burn));
  assert(!a.categories.some(c=>c.actions.includes(burn)));
  for(const n of a.events.workStatus[2])await readFile(new URL('../pets/claude-lady/webm/'+n+'.webm',import.meta.url));
});

test('Claude appearance is isolated per pet and host settings preserve existing controls',async()=>{
  assert.equal(appearances.APPEARANCES['claude-lady'],'Claude大小姐');
  // The lively level keeps the packaged weights; the other levels are covered in appearances.test.mjs.
  const pet={id:'custom',name:'保留名字',appearance:'claude-lady',activity:'lively',size:300,reactionSources:['claude-code'],position:{marginX:35},workStatusEnabled:true};
  // The packaged fields plus the persona idles, which rotate after the packaged resting idle.
  const expected=structuredClone(fields.animations);expected.idle.push(...appearances.PERSONA_IDLE['claude-lady']);
  appearances.tunePools('claude-lady',expected);
  // Remade walks carry their measured turn timing.
  for(const move of expected.moves.actions){const t=appearances.WALK_PARAMS['claude-lady'][move.name];if(t)move.params={...move.params,...t};}
  const applied=appearances.applyAppearance(pet);assert.equal(applied.assetRoot,'deskpet-claude-lady');assert.deepEqual(applied.animations,expected);
  for(const name of expected.idle)await readFile(new URL('../pets/claude-lady/webm/'+name+'.webm',import.meta.url));
  for(const k of ['id','name','size','reactionSources','position'])assert.deepEqual(applied[k],pet[k]);
  applied.animations.categories[0].actions.pop();assert.equal(appearances.applyAppearance(pet).animations.categories[0].actions.length,expected.categories[0].actions.length);
  const fish={...pet,appearance:'blue-fish',animations:{idle:['鱼原动作']}};assert.deepEqual(appearances.applyAppearance(fish).animations,fish.animations);
  const patched=patchStandalone(await readFile(new URL('../vendor/dsh-pet/lib/standalone.original.js',import.meta.url),'utf8'));
  const region=patched.slice(patched.indexOf('//#region src/host/config.ts'),patched.indexOf('//#region src/host/helper-process.ts'));
  const ctx={...appearances,...sources,...interaction};vm.createContext(ctx);vm.runInContext(region+';globalThis.api={saveUserConfig,findPetInstance};',ctx);
  const full={...pet,balanceEnabled:false,whisperEnabled:false,fixedEnabled:false,display:'desktop',position:{corner:'bottom-right',marginX:35,marginY:54}};
  const saved=ctx.api.saveUserConfig({pets:[full]},{custom:{preserve:true}});assert.equal(saved.pets[0].appearance,'claude-lady');assert.deepEqual(saved.custom,{preserve:true});
  assert.equal(ctx.api.findPetInstance({main:saved},'custom').conf.assetRoot,'deskpet-claude-lady');
  assert.equal(ctx.api.saveUserConfig({pets:[{...full,appearance:'../../bad'}]},saved),null);
  assert(patched.includes('"pets","claude-lady","webm"'));
});

test('written special scenes face upright when entered through random, click or work playback',async()=>{
  const patched=patchSprite(await readFile(new URL('../vendor/dsh-pet/runtime/electron-helper/sprite.original.js',import.meta.url),'utf8'));
  const start=patched.indexOf('switchTo(next, nextOnce) {')+'switchTo(next, nextOnce) {'.length;
  const prefix=patched.slice(start,patched.indexOf('const pending = this.pending;',start));
  const ctx={S};vm.createContext(ctx);const guard=vm.runInContext('(function(next,nextOnce){'+prefix+'return this.facing;})',ctx);
  for(const id of ['05-chinese-alert','10-sleep-saving']){
    const n=definition.actions.find(a=>a.id===id).name;
    assert(S.isNoMirrorAnimation(fields.animations.categories,n));
    const pet={pet:{appearance:'claude-lady'},animations:fields.animations,facing:'right'};
    assert.equal(guard.call(pet,n,true),'left');
    pet.facing='right';pet.pet.appearance='dragon-girl-D';assert.equal(guard.call(pet,n,false),'right');
  }
});

test('a frequent click or murmur returns to the active work state instead of rotating the clicked scene state',async()=>{
  const patched=patchSprite(await readFile(new URL('../vendor/dsh-pet/runtime/electron-helper/sprite.original.js',import.meta.url),'utf8'));
  const start=patched.indexOf('handleEnded() {')+'handleEnded() {'.length;
  const region=patched.slice(start,patched.indexOf('\n  // 互动/事件动画播完后恢复',start));
  const ctx={S,console:{log(){}}};vm.createContext(ctx);
  const ended=vm.runInContext('(function(){'+region.slice(0,region.lastIndexOf('}'))+'})',ctx);
  const name=id=>definition.actions.find(a=>a.id===id).name;
  function fixture(state,id){return {pet:{appearance:'claude-lady'},dragState:{active:false},animations:fields.animations,workState:state,anim:name(id),played:[],resumed:0,playOnce(n){this.played.push(n)},resumeWorkStatusAnim(){this.resumed++;return true}}}
  for(const id of definition.approvedSpecialIds){
    const pet=fixture('working',id);ended.call(pet);assert.equal(pet.resumed,1,'resume working after '+id);assert.equal(pet.played.length,0,'do not rotate another state after '+id);
  }
  for(const [state,id,other] of [['waiting','05-chinese-alert','06-singapore-probe'],['result','12-dark-enforcement','04-book-burning']]){
    const pet=fixture(state,id);ended.call(pet);assert.deepEqual(pet.played,[name(other)]);assert.equal(pet.resumed,0);
  }
});
