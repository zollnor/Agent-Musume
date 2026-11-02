import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,appendFile,rm,utimes} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {zstdCompressSync} from 'node:zlib';
import {DshAdapter} from '../src/dsh-adapter.mjs';
import {DshMonitor,ZstdTail} from '../src/dsh-monitor.mjs';

// DeepSeek Harness appends one zstd frame per one to three events.
const frame=(...events)=>zstdCompressSync(Buffer.from(events.map(e=>JSON.stringify(e)+'\n').join('')));
let seq=0;const ev=(type,data={})=>({type,seq:++seq,time:Date.now(),data});

test('a DSH session is followed live from its compressed record: every work state, then the end of the turn',async()=>{
  const home=await mkdtemp(join(tmpdir(),'dsh-')),dir=join(home,'sessions','--D-work--','session-qa');await mkdir(dir,{recursive:true});
  const file=join(dir,'session.v4.jsonl.zstd');
  await appendFile(file,frame({type:'session',version:4,id:'session-qa'},ev('permission/preset',{preset:'workspace-write'})));
  const adapter=new DshAdapter(),monitor=new DshMonitor({root:home,adapter,pollMs:60000});
  try{
    await monitor.start();assert.equal(adapter.status().state,'idle');assert.equal(monitor.status().watchedFiles,1);
    const step=async(events,want)=>{await appendFile(file,frame(...events));await monitor.pump();assert.equal(adapter.status().state,want,events.map(e=>e.type).join(','));};
    await step([ev('turn/start',{turn:1}),ev('step/start',{turn:1,step:1})],'thinking');
    await step([ev('assistant/message',{turn:1}),ev('tool/call',{turn:1,step:1,callId:'c1',name:'pwsh'})],'working');
    await step([ev('tool/result',{turn:1,step:1,toolCallId:'c1',message:{source:{callId:'c1'}}})],'result');
    await step([ev('approval/asked',{id:'a1',toolName:'pwsh',callId:'c2'})],'waiting');
    await step([ev('approval/decided',{id:'a1'})],'thinking');
    await step([ev('step/end',{turn:1,step:2}),ev('turn/end',{turn:1,reason:{kind:'completed'}})],'success');
    await step([ev('turn/start',{turn:2}),ev('turn/end',{turn:2,reason:{kind:'error'}})],'error');
    assert.equal(adapter.status().activeSessions,0);
  }finally{await monitor.close();await rm(home,{recursive:true,force:true});}
});

test('a frame still being written waits for the rest, and old sessions are history only',async()=>{
  const home=await mkdtemp(join(tmpdir(),'dsh-')),dir=join(home,'sessions','--D-work--','session-qa');await mkdir(dir,{recursive:true});
  const file=join(dir,'session.v4.jsonl.zstd'),seen=[];
  const full=frame(ev('turn/start',{turn:1}));
  await appendFile(file,full.subarray(0,full.length-3));
  const tail=new ZstdTail(file,{onRecord:r=>seen.push(r.type)});
  await tail.readAvailable();assert.deepEqual(seen,[]);
  await appendFile(file,full.subarray(full.length-3));await tail.readAvailable();assert.deepEqual(seen,['turn/start']);
  // A session last written yesterday is not followed, so a turn it left open never shows as work.
  const old=join(home,'sessions','--D-work--','session-old');await mkdir(old,{recursive:true});
  const oldFile=join(old,'session.v4.jsonl.zstd');await appendFile(oldFile,frame(ev('turn/start',{turn:1})));
  const day=new Date(Date.now()-24*3600*1000);await utimes(oldFile,day,day);
  const adapter=new DshAdapter(),monitor=new DshMonitor({root:home,adapter,pollMs:60000});
  try{await monitor.start();assert.equal(monitor.status().watchedFiles,1);}finally{await monitor.close();await rm(home,{recursive:true,force:true});}
});
