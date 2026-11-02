import assert from 'node:assert/strict';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {APP_ROOT} from '../src/prepare.mjs';
if(process.env.AGENT_MUSUME_SETTINGS_QA!=='1') {
  const exec=promisify(execFile),env={...process.env,AGENT_MUSUME_SETTINGS_QA:'1'};
  try {
    await exec(process.execPath,['test/lifecycle-verification.mjs'],{cwd:APP_ROOT,env,windowsHide:true});
    const result=await exec(process.execPath,['test/settings-verification.mjs'],{cwd:APP_ROOT,env,windowsHide:true});console.log(result.stdout.trim());
  }finally{await exec(process.execPath,['test/lifecycle-verification.mjs'],{cwd:APP_ROOT,windowsHide:true});}
  process.exit(0);
}
const data=join(APP_ROOT,'data'),qa=join(data,'qa'),file=join(data,'dsh-pet','main-config.jsonc');
const initial=await readFile(file,'utf8'),original=JSON.parse(initial),size=original.pets[0].size;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let serial=Date.now();
async function command(action,extra={}) {
  const id=++serial;await writeFile(join(qa,'settings-request.json'),JSON.stringify({serial:id,action,...extra}));
  for(let i=0;i<65;i++) {
    await delay(160);let r;try{r=JSON.parse(await readFile(join(qa,'settings-response.json'),'utf8'));}catch{continue;}
    if(r.serial===id&&!r.started)return r;
  }
  throw new Error(`Settings QA timeout: ${action}`);
}
async function ready(expected) {
  for(let i=0;i<8;i++){
    const r=await command('inspect');
    if(!r.error&&!r.info?.errors&&!/^正在/.test(r.info?.message??'正在')&&Number(r.info?.size)===expected)return r;
    await delay(350);
  }
  throw new Error('Settings did not become ready');
}
async function host(path,body={}) {
  const runtime=JSON.parse(await readFile(join(data,'runtime.json'),'utf8'));
  const r=await fetch(`http://127.0.0.1:${runtime.port}${path}`,{method:'POST',headers:{'content-type':'application/json','x-deskpet-capability':runtime.capability},body:JSON.stringify(body)});
  assert(r.ok);return r.json();
}
let restored=false;
try {
  const first=await command('open-from-menu');assert(!first.error,'actual pet menu must open settings');
  assert.equal(first.menu.labels[0],'设置…');
  for(const name of ['查看实时状态','回到初始位置','重载配置','动作'])assert(first.menu.labels.includes(name),`menu ${name}`);
  const second=await command('open-from-menu');assert.equal(second.windowId,first.windowId,'settings singleton');
  const start=await ready(size);assert(!start.info.overflow);assert(start.info.fieldCount>=15);
  await copyFile(join(qa,'settings-window.png'),join(APP_ROOT,'data','qa','settings-preview.png'));
  const added=await command('add-pet');assert.equal(added.info.petCount,original.pets.length+1);
  await command('save');await delay(1600);
  const multi=await ready(size);assert.equal(multi.petWindows,original.pets.length+1);assert.equal(multi.info.petCount,multi.petWindows);
  await command('remove-last-pet');await command('save');await delay(1600);
  const single=await ready(size);assert.equal(single.petWindows,original.pets.length);
  const changed=size+16;await command('save-size',{size:changed});await delay(1600);
  const applied=await ready(changed);assert(applied.info.message.includes('已保存'));
  const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.pets[0].size,changed);
  for(const [key,value] of Object.entries(original))if(!['pets','physics','confineToScreen'].includes(key))assert.deepEqual(saved[key],value,`preserve advanced ${key}`);
  await promisify(execFile)(process.execPath,['test/lifecycle-verification.mjs'],{cwd:APP_ROOT,windowsHide:true});
  const persisted=await ready(changed);assert(!persisted.info.overflow);
  await command('preview',{state:'thinking'});await delay(500);
  const runtime=JSON.parse(await readFile(join(data,'runtime.json'),'utf8'));
  const demo=await fetch(`http://127.0.0.1:${runtime.port}/control/status`).then(r=>r.json());assert.equal(demo.mode,'demo');
  await command('preview',{state:'live'});
  await command('save-size',{size});await delay(1500);await ready(size);
  // Restore the exact pre-test user file and its backup, including its field choices.
  await writeFile(file,initial);await writeFile(file+'.previous',initial);restored=true;
  await command('close');await host('/dsh-pet-7340/reload');await delay(1500);
  const status=await fetch(`http://127.0.0.1:${runtime.port}/control/status`).then(r=>r.json());assert.equal(status.mode,'live');
  const report={verifiedAt:new Date().toISOString(),actualPetMenu:true,menuLabels:first.menu.labels,singleSettingsWindow:true,settingsFields:start.info.fieldCount,noHorizontalOverflow:true,multiplePetsAddedAndRemoved:true,saveApplied:true,persistedAfterRestart:true,advancedFieldsPreserved:true,exactOriginalConfigRestored:await readFile(file,'utf8')===initial,previewAndLiveControls:true,mode:status.mode,sourceAvailable:status.watcher.sourceAvailable};
  await writeFile(join(qa,'settings-verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log('PASS pet right-click, settings window, save/reload, restart persistence, advanced-field preservation and live restoration.');
}finally{
  if(!restored){await writeFile(file,initial);await writeFile(file+'.previous',initial);await host('/control/live').catch(()=>{});await command('close').catch(()=>{});await host('/dsh-pet-7340/reload').catch(()=>{});}
}
