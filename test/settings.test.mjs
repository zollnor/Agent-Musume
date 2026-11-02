import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { patchSprite,patchPreload } from '../src/patches.mjs';
const require=createRequire(import.meta.url);
const {createSettingsClient,validateSettings}=require('../src/settings-client.cjs');
const pet={id:'main',name:'桌宠',size:400,balanceEnabled:false,whisperEnabled:false,workStatusEnabled:true,fixedEnabled:false,display:'desktop',position:{corner:'bottom-right',marginX:24,marginY:54}};
const physics={gravity:1400,restitution:.78,groundFriction:2.5,throwPower:1,ceilingBounce:true,petCollision:false};
const main={pets:[pet],physics,confineToScreen:false,whisperPrompt:'must not reach settings UI',animations:{idle:['original']},workStatusTexts:[['one']]};
async function fixture(){
  const data=await mkdtemp(join(tmpdir(),'deskpet-settings-'));await mkdir(join(data,'dsh-pet'));
  const file=join(data,'dsh-pet','main-config.jsonc');await writeFile(file,'// keep advanced fields\n{"custom":true}');
  const calls=[];
  const client=createSettingsClient({data,request:async(path,method='GET',body)=>{calls.push({path,method,body});return {main:structuredClone(main)};}});
  return {data,file,calls,client};
}
test('settings exposes editable fields and revision without DSH model prompts',async()=>{
  const {client}=await fixture();const view=await client.load();
  assert.equal(view.config.pets[0].size,400);assert.equal(typeof view.revision,'string');
  assert(!JSON.stringify(view).includes('must not reach'));assert(!('animations' in view.config));
});
test('save backs up exact user layer and submits only editable controls',async()=>{
  const {client,file,calls}=await fixture();const before=await readFile(file,'utf8');const view=await client.load();
  view.config.pets[0].size=420;await client.save(view);
  assert.equal(await readFile(file+'.previous','utf8'),before);
  const put=calls.find(c=>c.method==='PUT');assert.equal(put.body.pets[0].size,420);assert(!('animations' in put.body));
});
test('stale settings cannot overwrite a config edited after opening',async()=>{
  const {client,file,calls}=await fixture();const view=await client.load();await writeFile(file,'{"external":true}');
  await assert.rejects(client.save(view),/配置已.*变化/);assert(!calls.some(c=>c.method==='PUT'));
});
test('settings defaults old pets to desktop and preserves independent CLI source combinations',async()=>{
  const {client,calls}=await fixture();const view=await client.load();
  assert.deepEqual(view.config.pets[0].reactionSources,['chatgpt-desktop']);
  view.config.pets[0].reactionSources=['codex-cli','claude-code'];await client.save(view);
  assert.deepEqual(calls.find(c=>c.method==='PUT').body.pets[0].reactionSources,['codex-cli','claude-code']);
  assert.throws(()=>validateSettings({...view.config,pets:[{...view.config.pets[0],reactionSources:['unknown']}]}),/来源/);
});
test('settings validates duplicate IDs, hidden last pet, size and physics',()=>{
  const conf={pets:[structuredClone(pet)],physics:structuredClone(physics),confineToScreen:false};
  assert.doesNotThrow(()=>validateSettings(conf));
  assert.throws(()=>validateSettings({...conf,pets:[pet,pet]}),/重复/);
  assert.throws(()=>validateSettings({...conf,pets:[{...pet,size:0}]}),/大小/);
  assert.throws(()=>validateSettings({...conf,pets:[{...pet,display:'none'}]}),/至少.*桌面/);
  assert.throws(()=>validateSettings({...conf,physics:{...physics,restitution:1.1}}),/弹性/);
});
test('legacy pets default to blue fish and appearance changes preserve other pet controls',async()=>{
  const {client,calls}=await fixture();const view=await client.load();
  assert.equal(view.config.pets[0].appearance,'blue-fish');
  const before=structuredClone(view.config.pets[0]);
  view.config.pets[0].appearance='dragon-girl-D';await client.save(view);
  assert.deepEqual(calls.find(c=>c.method==='PUT').body.pets[0],{...before,appearance:'dragon-girl-D'});
});
test('unknown appearances cannot be saved',()=>{
  assert.throws(()=>validateSettings({pets:[{...pet,appearance:'../../elsewhere'}],physics,confineToScreen:false}),/形象/);
});
test('pet right-click adds settings while preserving original action menu',async()=>{
  const root=new URL('../vendor/dsh-pet/runtime/electron-helper/',import.meta.url);
  const s=patchSprite(await readFile(new URL('sprite.original.js',root),'utf8'));
  assert(s.includes("label: '设置…', action: 'deskpet-settings'"));
  assert(s.includes('window.petBridge.openSettings()'));assert(s.includes("S.buildMenuTree(this.animations), { label: '重载配置', action: 'reload' }"));
  assert(s.includes("action: 'home'"));assert(s.includes("action: 'reload'"));
  const p=patchPreload(await readFile(new URL('preload.original.js',root),'utf8'));
  assert(p.includes("ipcRenderer.send('deskpet:open-settings')"));
});
