import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,appendFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {APP_ROOT} from '../src/prepare.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const normalData=join(APP_ROOT,'data'),originalConfig=await readFile(join(normalData,'dsh-pet','main-config.jsonc'),'utf8');
const data=join(normalData,'qa','source-fixture-'+Date.now()),logs=join(data,'codex-records'),claude=join(data,'claude-records');
await Promise.all([mkdir(logs,{recursive:true}),mkdir(join(claude,'sessions'),{recursive:true}),mkdir(join(claude,'projects','test'),{recursive:true}),mkdir(join(data,'dsh-pet'),{recursive:true})]);
const qa=join(data,'qa');await mkdir(qa,{recursive:true});
const config={pets:[{id:'codex-pet',name:'Codex 测试桌宠',size:220,balanceEnabled:false,whisperEnabled:false,workStatusEnabled:true,fixedEnabled:true,display:'desktop',position:{corner:'bottom-right',marginX:40,marginY:60},reactionSources:['codex-cli']},{id:'claude-pet',name:'Claude 测试桌宠',size:220,balanceEnabled:false,whisperEnabled:false,workStatusEnabled:true,fixedEnabled:true,display:'desktop',position:{corner:'bottom-right',marginX:340,marginY:60},reactionSources:['claude-code']}],notificationsEnabled:false};
await writeFile(join(data,'dsh-pet','main-config.jsonc'),JSON.stringify(config));
const codex=join(logs,'cli.jsonl'),desktop=join(logs,'desktop.jsonl'),transcript=join(claude,'projects','test','fixture-session.jsonl'),peer=join(claude,'sessions','fixture.json');
await writeFile(codex,JSON.stringify({type:'session_meta',payload:{source:'cli',originator:'codex-tui'}})+'\n');
await writeFile(desktop,JSON.stringify({type:'session_meta',payload:{source:'vscode',originator:'Codex Desktop'}})+'\n');await writeFile(transcript,'');
const setPeer=status=>writeFile(peer,JSON.stringify({sessionId:'fixture-session',pid:process.pid,entrypoint:'cli',kind:'interactive',status}));await setPeer('idle');
async function record(file,r){await appendFile(file,JSON.stringify({...r,timestamp:new Date().toISOString()})+'\n');}
const event=(type,fields={})=>({type:'event_msg',payload:{type,...fields}});
async function runtime(dir){return JSON.parse(await readFile(join(dir,'runtime.json'),'utf8'));}
async function request(dir,path,body){const rt=await runtime(dir);const r=await fetch(`http://127.0.0.1:${rt.port}${path}`,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json','x-deskpet-capability':rt.capability},body:JSON.stringify(body)});assert(r.ok);return r.json();}
async function stop(dir){
  let rt;try{rt=await runtime(dir);}catch{return;}
  await request(dir,'/control/stop',{});
  for(let i=0;i<70;i++){try{process.kill(rt.pid,0);}catch{return;}await sleep(100);}throw new Error('Fixture host did not stop');
}
const launch=dir=>spawn(process.execPath,[join(APP_ROOT,'src','start.mjs')],{windowsHide:true,stdio:'ignore',env:{...process.env,AGENT_MUSUME_DATA:dir,...(dir===data?{AGENT_MUSUME_SESSIONS:logs,AGENT_MUSUME_CLAUDE_HOME:claude,AGENT_MUSUME_SETTINGS_QA:'1'}:{})}}).unref();
async function ready(dir){for(let i=0;i<90;i++){try{const r=await request(dir,'/control/status');if(r.sourcesReady)return r;}catch{}await sleep(100);}throw new Error('Source runtime not ready');}
let serial=Date.now();
async function ui(action,values={}){
  const id=++serial;await writeFile(join(qa,'settings-request.json'),JSON.stringify({serial:id,action,...values}));
  for(let i=0;i<80;i++){await sleep(120);let r;try{r=JSON.parse(await readFile(join(qa,'settings-response.json'),'utf8'));}catch{continue;}if(r.serial===id&&!r.started){assert(!r.error,`UI ${action}`);return r;}}throw new Error('UI timeout '+action);
}
async function captures(expected,label){
  const names={thinking:'工作状态-思考冒泡.webm',working:'工作状态-忙碌点按.webm',waiting:'工作状态-原地踱步张望.webm',success:'工作状态-雀跃庆祝.webm',error:'工作状态-垂头叹气冒汗.webm'};
  const shown=r=>r.reaction&&r.reaction.state===expected[r.reaction.petId]&&r.videos.some(v=>v.name===names[r.reaction.state]&&v.readyState>=2&&Number(v.opacity)>.8);
  await sleep(1400);let rows;
  // A busy clip finishes before the next one starts, so the new state can take a whole clip to appear.
  for(let attempt=0;attempt<40;attempt++){
    const call=await request(data,'/control/capture',{label});
    for(let i=0;i<20;i++){
      await sleep(180);rows=[];
      for(const f of await readdir(qa)){if(!f.startsWith(label+'-')||!f.endsWith('.json'))continue;const r=JSON.parse(await readFile(join(qa,f),'utf8'));if(r.serial===call.serial)rows.push(r);}
      if(rows.length===2)break;
    }
    if(rows.length===2&&rows.every(shown))break;
    await sleep(300);
  }
  assert.equal(rows.length,2,'both real renderer windows captured');
  for(const r of rows){assert.equal(r.reaction.state,expected[r.reaction.petId],`pet ${r.reaction.petId}`);assert(r.visible);assert(r.configOk);assert(r.videos.some(v=>v.name===names[r.reaction.state]&&v.readyState>=2&&v.width===640&&v.height===360&&Number(v.opacity)>.8),'corresponding original video is decoded and visible');}
  return rows.map(r=>({petId:r.reaction.petId,state:r.reaction.state,source:r.reaction.source,video:names[r.reaction.state],decodedAndVisible:true}));
}
const checks=[];let stopped=false;
try{
  await stop(normalData);stopped=true;launch(data);await ready(data);
  await record(codex,event('task_started',{turn_id:'cli-turn'}));await record(codex,{type:'response_item',payload:{type:'function_call',name:'exec_command',call_id:'c'}});
  await record(transcript,{type:'user',uuid:'claude-turn',message:{content:'Synthetic local verification only'}});await setPeer('busy');
  checks.push(await captures({'codex-pet':'working','claude-pet':'thinking'},'source-isolation-1'));
  assert.equal(checks[0].find(x=>x.petId==='codex-pet').source,'codex-cli');assert.equal(checks[0].find(x=>x.petId==='claude-pet').source,'claude-code');
  await record(codex,event('request_user_input',{turn_id:'cli-turn'}));
  await record(transcript,{type:'assistant',message:{content:[{type:'tool_use',name:'Bash',id:'c'}]}});
  await record(desktop,event('task_started',{turn_id:'desktop-turn'}));await record(desktop,event('task_failed',{turn_id:'desktop-turn'}));
  checks.push(await captures({'codex-pet':'waiting','claude-pet':'working'},'source-isolation-2'));
  await ui('open-from-menu');let view=await ui('inspect');assert.deepEqual(view.info.sources,['codex-cli']);
  await ui('set-sources',{sources:['chatgpt-desktop']});await ui('save');await sleep(1600);
  checks.push(await captures({'codex-pet':'error','claude-pet':'working'},'source-isolation-3'));
  assert.equal(checks[2].find(x=>x.petId==='codex-pet').source,'chatgpt-desktop');
  view=await ui('inspect');assert.deepEqual(view.info.sources,['chatgpt-desktop']);
  await ui('set-sources',{sources:['codex-cli','claude-code']});await ui('save');await sleep(1600);
  view=await ui('inspect');assert.deepEqual(view.info.sources,['codex-cli','claude-code']);
  checks.push(await captures({'codex-pet':'waiting','claude-pet':'working'},'source-isolation-4'));
  await record(codex,event('task_complete',{turn_id:'cli-turn'}));
  checks.push(await captures({'codex-pet':'working','claude-pet':'working'},'source-isolation-5'));
  await record(transcript,{type:'system',subtype:'stop_hook_summary',preventedContinuation:false});await setPeer('idle');
  checks.push(await captures({'codex-pet':'success','claude-pet':'success'},'source-isolation-6'));
  const saved=JSON.parse(await readFile(join(data,'dsh-pet','main-config.jsonc'),'utf8'));assert.deepEqual(saved.pets[0].reactionSources,['codex-cli','claude-code']);
  await ui('close');
}finally{
  await stop(data).catch(()=>{});
  if(stopped){launch(normalData);await ready(normalData);}
}
assert.equal(await readFile(join(normalData,'dsh-pet','main-config.jsonc'),'utf8'),originalConfig,'normal user config untouched');
const live=await request(normalData,'/control/status');
const report={verifiedAt:new Date().toISOString(),synthetic:true,realRendererWindows:true,checks,perPetIsolation:true,settingsSavedSourceAndCombination:true,normalConfigUntouched:true,normalMode:live.mode,nativeDesktopAndCliSessionsSeen:{desktop:live.sources['chatgpt-desktop'].desktopSessions,codexCli:live.sources['codex-cli'].desktopSessions,claudeCli:live.claudeWatcher.liveCliSessions}};
await writeFile(join(normalData,'qa','source-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log('PASS isolated CLI fixtures -> actual original videos; per-pet source changes and combinations persist; normal config preserved and runtime restored.');
