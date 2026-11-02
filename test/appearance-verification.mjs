import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {APP_ROOT} from '../src/prepare.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const data=join(APP_ROOT,'data','qa','appearance-fixture-'+Date.now()),qa=join(data,'qa'),file=join(data,'dsh-pet','main-config.jsonc');
await Promise.all(['qa','dsh-pet','empty-sessions','empty-claude'].map(p=>mkdir(join(data,p),{recursive:true})));
const base={size:240,balanceEnabled:false,whisperEnabled:false,workStatusEnabled:true,fixedEnabled:true,display:'desktop',position:{corner:'bottom-right',marginX:140,marginY:180},reactionSources:['codex-cli','claude-code']};
const initial={pets:[{...base,id:'fish-test',name:'肥鱼测试'},{...base,id:'dragon-test',name:'龙娘测试',appearance:'dragon-girl-D',position:{...base.position,marginX:440}}],notificationsEnabled:false,workStatusTexts:[['TEST THINK'],['TEST WORK'],['TEST RESULT'],['TEST WAIT'],['TEST DONE'],['TEST ERROR']]};
await writeFile(file,JSON.stringify(initial));
const launch=async()=>{const child=spawn(process.execPath,[join(APP_ROOT,'src','start.mjs')],{windowsHide:true,stdio:'ignore',env:{...process.env,AGENT_MUSUME_DATA:data,AGENT_MUSUME_SETTINGS_QA:'1',AGENT_MUSUME_SESSIONS:join(data,'empty-sessions'),AGENT_MUSUME_CLAUDE_HOME:join(data,'empty-claude')}});await new Promise((res,rej)=>{child.on('exit',res);child.on('error',rej);});};
async function request(path,body){const rt=JSON.parse(await readFile(join(data,'runtime.json'),'utf8'));const r=await fetch(`http://127.0.0.1:${rt.port}${path}`,{...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json','x-deskpet-capability':rt.capability},body:JSON.stringify(body)}),signal:AbortSignal.timeout(5000)});assert(r.ok,`${path}: ${r.status}`);return r.json();}
async function ready(){for(let i=0;i<100;i++){try{const r=await request('/control/status');if(r.sourcesReady)return;}catch{}await delay(120);}throw new Error('Fixture host not ready');}
async function stop(){let rt;try{rt=JSON.parse(await readFile(join(data,'runtime.json'),'utf8'));}catch{return;}await request('/control/stop',{});for(let i=0;i<70;i++){try{process.kill(rt.pid,0);}catch{return;}await delay(100);}throw new Error('Fixture did not stop');}
let serial=Date.now();
async function ui(action,extra={}){const id=++serial;await writeFile(join(qa,'settings-request.json'),JSON.stringify({serial:id,action,...extra}));for(let i=0;i<80;i++){await delay(140);let r;try{r=JSON.parse(await readFile(join(qa,'settings-response.json'),'utf8'));}catch{continue;}if(r.serial===id&&!r.started){assert(!r.error,`settings ${action}`);return r;}}throw new Error('Settings timeout: '+action);}
async function applied(expected){for(let i=0;i<30;i++){const r=await ui('inspect');if(!r.info.errors&&!/^正在/.test(r.info.message)&&r.info.appearance===expected)return r;await delay(150);}throw new Error('Appearance not applied');}
const fishNames={thinking:'工作状态-思考冒泡.webm',working:'工作状态-忙碌点按.webm',result:'工作状态-清点归档.webm',waiting:'工作状态-原地踱步张望.webm',success:'工作状态-雀跃庆祝.webm',error:'工作状态-垂头叹气冒汗.webm'};
const dragonNames={thinking:'工作-思考.webm',working:'工作-忙碌.webm',result:'工作-整理.webm',waiting:'工作-等待.webm',success:'工作-完成.webm',error:'工作-出错.webm'};
const checks=[];
async function capture(state,appearances,label){
  await request('/control/preview',{state});await delay(1500);
  async function take(suffix){const l=label+suffix,call=await request('/control/capture',{label:l});for(let i=0;i<60;i++){await delay(150);const rows=[];for(const f of await readdir(qa)){if(!f.startsWith(l+'-')||!f.endsWith('.json'))continue;const row=JSON.parse(await readFile(join(qa,f),'utf8'));if(row.serial===call.serial)rows.push(row);}if(rows.length===2)return rows;}throw new Error('Capture timeout');}
  // A busy clip finishes before the next one starts, so the new state can take a whole clip to appear.
  const shown=rows=>rows.every(row=>{const name=(appearances[row.reaction?.petId]==='blue-fish'?fishNames:dragonNames)[state];return row.videos.some(v=>v.name===name&&Number(v.opacity)>.8);});
  let a=await take('-a');for(let i=0;i<50&&!shown(a);i++){await delay(300);a=await take('-a');}
  await delay(550);const b=await take('-b');
  for(const row of b){const id=row.reaction?.petId,appearance=appearances[id];assert(appearance,`unexpected pet ${id}`);assert(row.visible&&row.configOk&&!row.errorVisible);assert.equal(row.appearance,appearance);assert.equal(row.reaction.state,state);const name=(appearance==='blue-fish'?fishNames:dragonNames)[state],v=row.videos.find(v=>v.name===name&&Number(v.opacity)>.8);assert(v&&v.readyState>=2&&v.width===640&&v.height===360&&!v.paused,`${id}: ${name} must decode and play`);const before=a.find(x=>x.reaction.petId===id)?.videos.find(x=>x.name===name&&Number(x.opacity)>.8);assert(before&&v.currentTime!==before.currentTime,`${id}: playback time must advance`);checks.push({state,petId:id,appearance,video:name,decoded:true,timeAdvanced:true});}
}
function preserved(saved){for(let i=0;i<initial.pets.length;i++){const {appearance,...actual}=saved.pets[i],{appearance:old,...expected}=initial.pets[i];for(const [k,v] of Object.entries(expected))assert.deepEqual(actual[k],v,'preserve pet control '+k);}assert.deepEqual(saved.workStatusTexts,initial.workStatusTexts);}
try{
  await launch();await ready();
  const config=await request('/dsh-pet-7340/config');assert.equal(config.main.pets[0].appearance,'blue-fish');assert.equal(config.main.pets[1].appearance,'dragon-girl-D');
  await capture('thinking',{'fish-test':'blue-fish','dragon-test':'dragon-girl-D'},'mixed-skins');
  const opened=await ui('open-from-menu');assert.equal(opened.menu.labels[0],'设置…');let view=await applied('blue-fish');assert.equal(view.info.appearances.length,3);assert(!view.info.overflow);assert.deepEqual(view.info.sources,base.reactionSources);
  await ui('set-appearance',{appearance:'dragon-girl-D'});await ui('save');await applied('dragon-girl-D');
  let saved=JSON.parse(await readFile(file,'utf8'));preserved(saved);assert(saved.pets.every(p=>p.appearance==='dragon-girl-D'));
  for(const state of Object.keys(dragonNames))await capture(state,{'fish-test':'dragon-girl-D','dragon-test':'dragon-girl-D'},'dragon-'+state);
  await ui('set-appearance',{appearance:'blue-fish'});await ui('save');view=await applied('blue-fish');saved=JSON.parse(await readFile(file,'utf8'));preserved(saved);assert.equal(saved.pets[1].appearance,'dragon-girl-D');
  await capture('working',{'fish-test':'blue-fish','dragon-test':'dragon-girl-D'},'switched-back');
  await stop();await launch();await ready();view=await applied('blue-fish');assert.deepEqual(view.info.sources,base.reactionSources);
  await ui('select-pet',{index:1});view=await applied('dragon-girl-D');assert.deepEqual(view.info.sources,base.reactionSources);assert(!view.info.overflow);
  await copyFile(join(qa,'settings-window.png'),join(APP_ROOT,'data','qa','settings-appearance.png'));
  await ui('select-pet',{index:0});await applied('blue-fish');
  await request('/control/live',{});await ui('close');
  const report={verifiedAt:new Date().toISOString(),isolatedFixture:true,actualRightClickSettings:true,choices:view.info.appearances,perPetMixedAppearances:true,bothSwitchDirections:true,petControlsPreserved:true,advancedFieldsPreserved:true,persistedAfterRestart:true,noHorizontalOverflow:true,originalAssetsByteVerifiedByUnitTest:true,checks};
  await writeFile(join(APP_ROOT,'data','qa','appearance-verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log('PASS real right-click settings, blue fish/dragon switch both ways, mixed pets, six dragon states, time advancement, controls preserved and restart persistence.');
}catch(e){console.error('Fixture data:',data);throw e;}finally{await stop().catch(()=>{});}
