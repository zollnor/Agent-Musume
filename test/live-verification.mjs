import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_ROOT } from '../src/prepare.mjs';
const data=process.env.AGENT_MUSUME_DATA??join(APP_ROOT,'data');
const runtime=JSON.parse(await readFile(join(data,'runtime.json'),'utf8'));
const base=`http://127.0.0.1:${runtime.port}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const get=async path=>(await fetch(base+path)).json();
const post=async (path,input={})=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json','x-deskpet-capability':runtime.capability},body:JSON.stringify(input)});assert(r.ok,`control ${path}: ${r.status}`);return r.json();};
async function capture(label) {
  const request=await post('/control/capture',{label});
  for(let i=0;i<40;i++) {
    await sleep(100);
    try {const c=JSON.parse(await readFile(join(data,'qa',`${label}-0.json`),'utf8'));if(c.serial===request.serial)return c;}catch{}
  }
  throw new Error('Fresh capture was not produced');
}
const report={generatedAt:new Date().toISOString(),scope:'Original desktop renderer plus explicitly labelled reaction previews',checks:[]};
report.liveBefore=await get('/control/status');
assert.equal(report.liveBefore.mode,'live');assert(report.liveBefore.watcher.running);
const denied=await fetch(base+'/control/preview',{method:'POST',headers:{'content-type':'application/json'},body:'{"state":"error"}'});
assert.equal(denied.status,403);report.unauthorizedWriteRejected=true;
const expected={thinking:'工作状态-思考冒泡.webm',working:'工作状态-忙碌点按.webm',result:'工作状态-清点归档.webm',waiting:'工作状态-原地踱步张望.webm',success:'工作状态-雀跃庆祝.webm',error:'工作状态-垂头叹气冒汗.webm'};
try {
  for(const [state,filename] of Object.entries(expected)) {
    await post('/control/preview',{state});
    await sleep(1200);
    const engine=await get('/dsh-pet-7340/state');
    assert.equal(engine.sections.workStatus.data.state,state,`original host ${state}`);
    let verified;
    // A busy clip finishes before the next one starts, so the new state can take a whole clip to appear.
    for(let attempt=0;attempt<60&&!verified;attempt++) {
      if(attempt)await sleep(250);
      const label=`${state}-${attempt}`;const first=await capture(label);
      const front=first.videos?.find(v=>Number(v.opacity)>0.5&&!v.paused);
      if(first.visible&&first.configOk&&front?.readyState>=3&&front.name===filename) {
        await sleep(400);const second=await capture(`${state}-motion`);
        const later=second.videos?.find(v=>Number(v.opacity)>0.5&&!v.paused);
        if(later?.name===filename&&Math.abs(later.currentTime-front.currentTime)>0.05)verified={state,expectedVideo:filename,decoded:true,visible:true,motionTimeAdvanced:true,timeSamples:[front.currentTime,later.currentTime],screenshot:`${label}-0.png`,frame:{width:front.width,height:front.height}};
      }
    }
    assert(verified,`expected original video did not play: ${state}`);
    report.checks.push(verified);console.log(`PASS original animation: ${state}`);
  }
} finally {await post('/control/live');}
await sleep(1200);
report.liveAfter=await get('/control/status');assert.equal(report.liveAfter.mode,'live');
report.liveCapture=await capture('live-final');
assert(report.liveCapture.configOk);report.ok=true;
await writeFile(join(data,'qa','runtime-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log('PASS restored actual local-session monitoring; report saved.');
