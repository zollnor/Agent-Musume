import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DEFAULT_CONFIG} from '../src/default-config.mjs';
const require=createRequire(import.meta.url);
const I=require('../src/interaction-catalog.cjs');
const {Director}=require('../src/interaction-director.cjs');
const {SOURCE_LABELS}=require('../src/reaction-sources.cjs');
const {homePositions}=require('../src/home-spacing.cjs');

const byLook=app=>DEFAULT_CONFIG.pets.find(p=>p.appearance===app);

test('a first start shows all three pets, each following its own sessions',()=>{
  assert.deepEqual(DEFAULT_CONFIG.pets.map(p=>p.appearance).sort(),['blue-fish','claude-lady','dragon-girl-D']);
  assert.deepEqual(byLook('claude-lady').reactionSources,['claude-code']);
  assert.deepEqual(byLook('dragon-girl-D').reactionSources,['chatgpt-desktop','codex-cli']);
  assert.deepEqual(byLook('blue-fish').reactionSources,['dsh-desktop']);
  assert(DEFAULT_CONFIG.pets.every(p=>p.display==='desktop'&&p.workStatusEnabled&&!p.fixedEnabled));
  assert.deepEqual(DEFAULT_CONFIG.pets.flatMap(p=>p.reactionSources).sort(),Object.keys(SOURCE_LABELS).sort(),'every source has a pet');
  assert.equal(new Set(DEFAULT_CONFIG.pets.map(p=>p.id)).size,3);
});

test('every interaction is on and every source has a helper with a paired take',()=>{
  for(const p of DEFAULT_CONFIG.pets) {
    for(const k of ['social','collab','idle','approach','lines'])assert.equal(p.interaction[k],true,`${p.name} ${k}`);
    assert.deepEqual(I.normalizeInteraction(p.interaction),p.interaction,'stored as the settings window would store it');
  }
  const box=x=>({x,y:500,size:200,bottomPad:15}),boxes=Object.fromEntries(DEFAULT_CONFIG.pets.map((p,i)=>[p.id,box(300*i+200)]));
  const d=new Director({send(){},boxes:()=>boxes,random:()=>0.3});
  for(const p of DEFAULT_CONFIG.pets)d.report(p.id,{type:'hello',profile:p});
  for(const source of Object.keys(SOURCE_LABELS)) {
    const pair=d.pairFor(source);assert(pair,`${source} has a main pet and a helper`);
    const look=id=>DEFAULT_CONFIG.pets.find(p=>p.id===id).appearance;
    assert(I.duetCast('collab.assign',look(pair.main),look(pair.helper)),`${source}: the assignment is a paired take`);
    assert(I.duetCast('collab.deliver',look(pair.helper),look(pair.main)),`${source}: the delivery is a paired take`);
  }
});

test('the three pets start side by side, not on one spot',()=>{
  const homes=homePositions(DEFAULT_CONFIG.pets).map(h=>h.marginX);
  assert.equal(new Set(homes).size,3);
});
