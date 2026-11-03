// Real Electron windows and authenticated bridge, using synthetic tasks only. No model is invoked.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,readdir,open} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {APP_ROOT} from '../src/prepare.mjs';
import {sendHandoff} from '../src/handoff-client.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const packagedExe=process.env.AGENT_MUSUME_QA_EXE;
const data=join(APP_ROOT,'data','qa',(packagedExe?'packaged-cross-handoff-':'cross-handoff-')+Date.now()),qa=join(data,'qa'),log=[];
for(const dir of ['qa','codex','claude/sessions','dsh/sessions','dsh-pet'])await mkdir(join(data,dir),{recursive:true});
const pets=[['qa-dragon','dragon-girl-D','chatgpt-desktop',570],['qa-lady','claude-lady','claude-code',40]].map(([id,appearance,source,marginX])=>({id,name:'联动测试',appearance,size:300,display:'desktop',balanceEnabled:false,whisperEnabled:false,workStatusEnabled:true,fixedEnabled:false,position:{corner:'bottom-left',marginX,marginY:54},reactionSources:[source],interaction:{idle:false,social:false,collab:true,approach:true,lines:true}}));
await writeFile(join(data,'dsh-pet','main-config.jsonc'),JSON.stringify({pets,physics:{gravity:1400,restitution:0.78,groundFriction:2.5,ceilingBounce:true,throwPower:1,petCollision:false},confineToScreen:false}));
async function request(path,body,auth=true){const rt=JSON.parse(await readFile(join(data,'runtime.json'),'utf8'));return fetch(`http://127.0.0.1:${rt.port}${path}`,{...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json',...(auth?{'x-deskpet-capability':rt.capability}:{})},body:JSON.stringify(body)}),signal:AbortSignal.timeout(4000)});}
let serial=0;
async function capture(phase){
  const label='handoff-'+(++serial);const r=await request('/control/capture',{label});const req=await r.json();
  for(let i=0;i<30;i++){
    await sleep(120);const rows=[];
    for(const file of await readdir(qa))if(file.startsWith(label+'-')&&file.endsWith('.json')){const row=JSON.parse(await readFile(join(qa,file),'utf8'));if(row.serial===req.serial)rows.push({png:join(qa,file.replace('.json','.png')),stage:row.stage,duet:row.duet,lines:row.lines});}
    if(rows.length===2){log.push({phase,rows});return rows;}
  }
  throw new Error('桌宠截图超时');
}
async function performance(phase,kind){
  const deadline=Date.now()+18000;let seen=false,played=false,finished=false;
  while(Date.now()<deadline){
    const rows=await capture(phase);seen ||= rows.some(r=>r.stage?.kind===kind);
    played ||= rows.every(r=>r.duet?.some(d=>d.currentTime>0.5));
    if(seen&&played&&rows.every(r=>!r.stage)){finished=true;break;}
  }
  assert(seen,phase+' received stage');assert(played,phase+' both video layers played');assert(finished,phase+' completed');
}
const output=await open(join(data,'runtime.log'),'a');
const executable=packagedExe??process.execPath,entry=packagedExe?join(dirname(packagedExe),'resources','app.asar','src','main.mjs'):join(APP_ROOT,'src/main.mjs');
const child=spawn(executable,[entry],{cwd:APP_ROOT,windowsHide:true,stdio:['ignore',output.fd,output.fd],env:{...process.env,...(packagedExe?{ELECTRON_RUN_AS_NODE:'1',AGENT_MUSUME_PACKAGED:'1'}:{}),CODEX_HOME:join(data,'codex-home'),CLAUDE_CONFIG_DIR:join(data,'claude-home'),AGENT_MUSUME_DATA:data,AGENT_MUSUME_SESSIONS:join(data,'codex'),AGENT_MUSUME_CLAUDE_HOME:join(data,'claude'),AGENT_MUSUME_DSH_HOME:join(data,'dsh'),AGENT_MUSUME_STAGE_LOG:'1'}});await output.close();
let result;
try{
  for(let i=0;i<120;i++){try{if((await (await request('/control/status')).json()).sourcesReady)break;}catch{}await sleep(150);}
  await sleep(3000);await capture('boot');
  const status=await(await request('/control/status')).json();assert.equal(status.harnessWatcher.available,true,'real extracted observer running');
  const install=await(await request('/control/install-handoff-skill',{})).json();assert(install.ok);
  const launcher=install.files.find(f=>f.endsWith('handoff.ps1'));
  let entryError;try{await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',launcher,'invalid'],{windowsHide:true});}catch(error){entryError=error;}
  assert.equal(entryError?.code,2,'installed bridge entry executes');assert(entryError.stderr.includes('请指定交接状态'),'entry reached its argument validation');
  const task={id:'native-bridge-test',from:'chatgpt-desktop',to:'claude-code'};
  assert.equal((await request('/control/handoff',{...task,phase:'started'},false)).status,403);
  assert.equal((await request('/control/handoff',{...task,phase:'started',prompt:'PRIVATE'})).status,400);
  assert((await sendHandoff({...task,phase:'started'},{directories:[data]})).ok);
  assert((await sendHandoff({...task,phase:'started'},{directories:[data]})).duplicate);
  await performance('forward-assign','collab.assign');
  assert((await sendHandoff({...task,phase:'delivered'},{directories:[data]})).ok);
  await performance('forward-deliver','collab.deliver');
  const reverse={id:'native-reverse-test',from:'claude-code',to:'chatgpt-desktop'};
  assert((await sendHandoff({...reverse,phase:'started'},{directories:[data]})).ok);
  await performance('reverse-assign','collab.assign');
  assert((await sendHandoff({...reverse,phase:'failed'},{directories:[data]})).ok);
  await performance('reverse-failed','collab.failed');
  const reactions=await (await request('/control/reactions')).json();
  assert.equal(reactions.collab.events.length,4);assert(!JSON.stringify(reactions).includes('PRIVATE'));
  result={ok:true,data,packaged:!!packagedExe,checks:['extracted-observer-running','skill-installed-to-isolated-homes','installed-entry-executed','unauthorized-rejected','private-fields-rejected','duplicates-suppressed','forward-assignment-played','forward-delivery-played','reverse-assignment-played','reverse-failure-played'],captures:log.length};
}catch(error){let reactions;try{reactions=await (await request('/control/reactions')).json();}catch{}result={ok:false,data,error:error.message,reactions};process.exitCode=1;}
finally{
  await writeFile(join(data,'verification.json'),JSON.stringify({...result,frames:log},null,2));
  try{await request('/control/stop',{});}catch{}await sleep(1800);if(child.exitCode===null)child.kill();
}
console.log(JSON.stringify(result,null,2));
