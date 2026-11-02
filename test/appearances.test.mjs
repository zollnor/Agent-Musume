import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {patchStandalone} from '../src/patches.mjs';
const require=createRequire(import.meta.url);
const appearances=require('../src/pet-appearances.cjs');
const sources=require('../src/reaction-sources.cjs');
const interaction=require('../src/interaction-catalog.cjs');
test('appearance selection is per pet and does not change original fish pools or personal controls',()=>{
  const fish={id:'fish',appearance:'blue-fish',size:300,position:{marginX:24},reactionSources:['codex-cli'],animations:{idle:['original']},assetRoot:'main'};
  const dragon={...fish,id:'dragon',appearance:'dragon-girl-D'};
  // The fish keeps its own pools and asset root and only gains its voice.
  const voiced=appearances.applyAppearance(fish);
  const own=({personaStatus,workStatusTexts,waitingReminders,reminderClip,size,...rest})=>rest;
  assert.deepEqual(own(voiced),own(fish));
  assert.equal(voiced.size,270,'the fish is drawn at 0.9 of its size setting, so it stands as tall as the others');
  assert.equal(voiced.personaStatus,true);assert.equal(voiced.workStatusTexts.length,6);assert(voiced.workStatusTexts.every(g=>g.length>=2));
  const rendered=appearances.applyAppearance(dragon);
  assert.equal(rendered.assetRoot,'deskpet-dragon-d');assert.equal(rendered.animations.idle[0],'待机-呼吸摆尾');
  for(const key of ['id','size','position','reactionSources'])assert.deepEqual(rendered[key],dragon[key]);
  rendered.animations.idle.push('must not affect another pet');
  assert.equal(appearances.applyAppearance(dragon).animations.idle.length,2+appearances.PERSONA_IDLE['dragon-girl-D'].length);
  // The resting idle carries most of the quiet time; acted idles stay occasional and never repeat back to back.
  const pool=appearances.applyAppearance({appearance:'claude-lady'}).animations.idle;let seq=1,current=pool[0],rest=0;
  const random=()=>{seq=(seq*16807)%2147483647;return seq/2147483647;};
  for(let i=0;i<4000;i++){const next=appearances.pickIdle(pool,current,random);assert.notEqual(next,current);if(next===pool[0])rest++;current=next;}
  assert(rest/4000>0.4&&rest/4000<0.5,`resting share ${rest/4000}`);
  assert.equal(appearances.pickIdle(['a','b','c'],'b',()=>0),'a','pools without persona idles keep the upstream pick');
  assert.deepEqual(fish.animations.idle,['original']);
});
test('activity levels give idle time back to the resting idle and keep any one category under a quarter of the actions',()=>{
  const total=f=>Object.values(f.animationWeights).reduce((a,b)=>a+b,0)+f.animations.categories.reduce((a,c)=>a+c.weight,0);
  for(const appearance of ['claude-lady','dragon-girl-D']){
    const lively=appearances.applyAppearance({appearance,activity:'lively'}),base=appearances.appearanceFields({appearance});
    assert.deepEqual(lively.animations.categories.map(c=>c.weight),base.animations.categories.map(c=>c.weight),'lively keeps the packaged weights');
    for(const [activity,idle] of [['normal',40],['quiet',65],[undefined,40]]){
      const f=appearances.applyAppearance({appearance,activity}),actions=f.animations.categories.reduce((a,c)=>a+c.weight,0);
      assert.equal(total(f),100);assert.equal(f.animationWeights.idle,idle,`${appearance} ${activity}`);
      assert(f.animations.categories.every(c=>Number.isInteger(c.weight)&&c.weight<=Math.ceil(actions/4)),`${appearance} ${activity} no dominant category`);
    }
  }
  const lady=appearances.applyAppearance({appearance:'claude-lady'});
  assert(lady.animations.categories[0].weight<=11,'the lady\'s eight signature scenes drop from 48 to about 11 in a hundred');
  assert.equal(appearances.normalizeActivity('bogus'),'normal');
});
test('upstream host normalizes, saves and resolves both appearances without replacing advanced config',async()=>{
  const patched=patchStandalone(await readFile(new URL('../vendor/dsh-pet/lib/standalone.original.js',import.meta.url),'utf8'));
  const region=patched.slice(patched.indexOf('//#region src/host/config.ts'),patched.indexOf('//#region src/host/helper-process.ts'));
  const ctx={...appearances,...sources,...interaction,console};vm.createContext(ctx);
  vm.runInContext(region+';globalThis.api={mergePet,saveUserConfig,findPetInstance};',ctx);
  const pet={id:'main',name:'custom name',size:300,balanceEnabled:false,whisperEnabled:false,workStatusEnabled:true,fixedEnabled:false,display:'desktop',position:{corner:'bottom-right',marginX:24,marginY:54},reactionSources:['codex-cli']};
  const legacy=ctx.api.mergePet(pet,pet,'test',new Set());assert.equal(legacy.appearance,'blue-fish');
  const saved=ctx.api.saveUserConfig({pets:[{...pet,appearance:'dragon-girl-D'}]},{animations:{idle:['original']},custom:{preserve:true}});
  assert.equal(saved.pets[0].appearance,'dragon-girl-D');assert.deepEqual(saved.pets[0].reactionSources,['codex-cli']);
  assert.deepEqual(saved.custom,{preserve:true});assert.deepEqual(saved.animations,{idle:['original']});
  const found=ctx.api.findPetInstance({main:saved},'main');assert.equal(found.conf.animations.events.workStatus[0],'工作-思考');
  assert.equal(ctx.api.saveUserConfig({pets:[{...pet,appearance:'../bad'}]},saved),null);
});
test('all installed dragon clips match verified package hashes; original 106 clips match provenance',async()=>{
  const root=new URL('../',import.meta.url),manifest=JSON.parse(await readFile(new URL('pets/dragon-girl-D/manifest.json',root),'utf8'));
  assert.equal(manifest.complete,true);assert.equal(manifest.actions.length,manifest.plannedCount);assert.equal(manifest.generatedCount,manifest.plannedCount);assert(manifest.plannedCount>=24);
  const digest=b=>createHash('sha256').update(b).digest('hex');
  for(const action of manifest.actions){const b=await readFile(new URL('pets/dragon-girl-D/webm/'+action.name+'.webm',root));assert.equal(digest(b),action.files.webm.sha256,action.name);}
  const provenance=JSON.parse(await readFile(new URL('vendor/provenance.json',root),'utf8'));
  const original=provenance.files.filter(f=>f.path.startsWith('assets/webm/')&&f.path.endsWith('.webm'));
  assert.equal(original.length,106);assert.equal((await readdir(new URL('vendor/dsh-pet/assets/webm/',root))).filter(f=>f.endsWith('.webm')).length,106);
  for(const f of original)assert.equal(digest(await readFile(new URL('vendor/dsh-pet/'+f.path,root))),f.sha256,f.path);
});
test('every installed dragon clip is reachable from its own animation pool and category weights total 100',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../pets/dragon-girl-D/manifest.json',import.meta.url),'utf8'));
  const dragon=appearances.applyAppearance({appearance:'dragon-girl-D'}),a=dragon.animations;
  const names=new Set([...a.idle,...a.turn,...a.drag,...a.clicks,...a.moves.actions.map(x=>x.name),...a.categories.flatMap(c=>c.actions),...Object.values(a.events).flat(2)]);
  assert.deepEqual([...names].sort(),manifest.actions.map(x=>x.name).sort());
  assert.equal(Object.values(dragon.animationWeights).reduce((x,y)=>x+y,0)+a.categories.reduce((x,c)=>x+c.weight,0),100);
});
test('every persona walk turns sideways before the window travels and back after it, leaving most of the clip to travel',async()=>{
  for(const app of ['claude-lady','dragon-girl-D']){
    const manifest=JSON.parse(await readFile(new URL(`../pets/${app}/manifest.json`,import.meta.url),'utf8'));
    for(const move of appearances.applyAppearance({appearance:app}).animations.moves.actions){
      const p=move.params??{},clip=manifest.actions.find(x=>x.name===move.name);
      assert(p.leadSec>0.2&&p.tailSec>0.2,`${move.name} has measured turn timing`);
      assert(clip.duration-p.leadSec-p.tailSec>=3,`${move.name} keeps at least 3 s of travel`);
    }
  }
});
