import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {patchSprite} from '../src/patches.mjs';
const require=createRequire(import.meta.url);
const {homePositions}=require('../src/home-spacing.cjs');
const pet=(marginX,size=200,corner='bottom-right',marginY=54)=>({size,position:{corner,marginX,marginY}});
const xs=pets=>homePositions(pets).map(p=>p.marginX);
test('pets sharing a corner start side by side with their bodies clear of each other',()=>{
  const [a,b]=xs([pet(24),pet(64)]);assert.equal(a,24,'the first pet keeps its configured spot');
  assert(b-a>=200*240/640,'body centres at least one body width apart');
  assert.deepEqual(xs([pet(24,300),pet(64,300),pet(104,300)]).map((x,i,all)=>i?x-all[i-1]>=300*240/640:true),[true,true,true]);
});
test('pets already apart, in other corners or at other heights keep their configured spots',()=>{
  assert.deepEqual(xs([pet(24),pet(400)]),[24,400]);
  assert.deepEqual(xs([pet(24),pet(24,200,'bottom-left')]),[24,24]);
  assert.deepEqual(xs([pet(24),pet(24,200,'bottom-right',500)]),[24,24]);
  assert.deepEqual(homePositions([pet(24)])[0],{corner:'bottom-right',marginX:24,marginY:54});
});
test('the pet window places itself at the spaced home spot',async()=>{
  const sprite=patchSprite(await readFile(new URL('../vendor/dsh-pet/runtime/electron-helper/sprite.original.js',import.meta.url),'utf8'));
  assert(sprite.includes('marginX: globalThis.DeskpetHome?.homePositions(config.pets.filter((p) => S.isDesktopVisible(p.display)))[CONFIG.petIndex]?.marginX ?? this.pet.position.marginX,'));
});
test('the scripts a pet window loads side by side share one global scope without clashing',async()=>{
  // Classic scripts in one page share top-level const/let names, which node modules never reveal.
  const ctx={structuredClone};ctx.globalThis=ctx;vm.createContext(ctx);
  for(const file of ['pet-appearances.cjs','home-spacing.cjs','reaction-sources.cjs','interaction-catalog.cjs'])
    vm.runInContext(await readFile(new URL('../src/'+file,import.meta.url),'utf8'),ctx,{filename:file});
  assert.deepEqual(['DeskpetAppearances','DeskpetHome','DeskpetSources','DeskpetInteraction'].filter(name=>!ctx[name]),[]);
  assert.equal(ctx.DeskpetHome.homePositions([pet(24),pet(64)])[1].marginX,139);
});
