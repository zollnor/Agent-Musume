import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,appendFile,rm,mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TailFile,RolloutWatcher } from '../src/rollout-watcher.mjs';
import { RolloutAdapter } from '../src/rollout-adapter.mjs';
const withDir=async fn=>{const dir=await mkdtemp(join(tmpdir(),'deskpet-test-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}};
test('incremental reader retains split UTF-8 and does not duplicate records',()=>withDir(async dir=>{
  const file=join(dir,'a.jsonl');const records=[];await writeFile(file,'');
  const tail=new TailFile(file,{onRecord:r=>records.push(r)});
  const bytes=Buffer.from(JSON.stringify({type:'event_msg',payload:{type:'task_started',label:'开始'}})+'\n');
  const split=bytes.indexOf(Buffer.from('开始'))+1;
  await appendFile(file,bytes.subarray(0,split));await tail.readAvailable();assert.equal(records.length,0);
  await appendFile(file,bytes.subarray(split));await tail.readAvailable();assert.equal(records.length,1);assert.equal(records[0].payload.label,'开始');
  await tail.readAvailable();assert.equal(records.length,1);
}));
test('reader resets after truncation and skips malformed lines',()=>withDir(async dir=>{
  const file=join(dir,'a.jsonl');const records=[];let resets=0;
  await writeFile(file,'{"old":1,"padding":"long-value"}\n');
  const tail=new TailFile(file,{onRecord:r=>records.push(r),onReset:()=>resets++});
  await tail.readAvailable();await writeFile(file,'broken\n{"new":2}\n');await tail.readAvailable();
  assert.equal(resets,1);assert.deepEqual(records,[{old:1,padding:'long-value'},{new:2}]);
}));
test('watcher discovers a newly appended session and stops cleanly',()=>withDir(async dir=>{
  const records=[];
  const watcher=new RolloutWatcher({root:dir,onRecord:(file,r,opts)=>records.push({r,replay:opts.replay}),pollMs:40,rescanMs:60});
  await watcher.start();
  const day=join(dir,'2026','10','21');await mkdir(day,{recursive:true});
  const file=join(day,'rollout.jsonl');await writeFile(file,'{"type":"session_meta","payload":{"source":"vscode"}}\n');
  await new Promise(resolve=>setTimeout(resolve,160));
  await appendFile(file,'{"type":"event_msg","payload":{"type":"task_started"}}\n');
  await new Promise(resolve=>setTimeout(resolve,160));
  await watcher.close();
  assert(records.some(x=>x.r.payload.type==='task_started'&&x.replay===false));
  assert.equal(watcher.status().running,false);
}));
test('startup-after new short turn is live even when the entire turn lands before discovery',()=>withDir(async dir=>{
  const records=[];
  const watcher=new RolloutWatcher({root:dir,onRecord:(f,r,opts)=>records.push({r,replay:opts.replay}),pollMs:40,rescanMs:50});
  await watcher.start();await new Promise(r=>setTimeout(r,20));
  const timestamp=new Date().toISOString();
  await writeFile(join(dir,'new.jsonl'),[
    {type:'session_meta',timestamp,payload:{source:'vscode'}},
    {type:'event_msg',timestamp,payload:{type:'task_started',turn_id:'fresh'}},
    {type:'event_msg',timestamp,payload:{type:'task_complete',turn_id:'fresh'}}
  ].map(r=>JSON.stringify(r)+'\n').join(''));
  await new Promise(r=>setTimeout(r,180));await watcher.close();
  assert(records.some(x=>x.r.payload.type==='task_complete'&&!x.replay));
}));
test('truncation rebuilds silently and does not replay an old completion',()=>withDir(async dir=>{
  const emissions=[];const adapter=new RolloutAdapter({emit:(...args)=>emissions.push(args)});
  const file=join(dir,'history.jsonl');
  const history=[{type:'session_meta',payload:{source:'vscode',originator:'Codex Desktop'}},{type:'event_msg',payload:{type:'task_started',turn_id:'old'}},{type:'event_msg',payload:{type:'task_complete',turn_id:'old'}}].map(r=>JSON.stringify(r)+'\n').join('');
  await writeFile(file,history+' '.repeat(1000)+'\n');
  const watcher=new RolloutWatcher({root:dir,onRecord:(f,r,o)=>adapter.consume(f,r,o),onReplayDone:f=>adapter.finishReplay(f),onReset:f=>adapter.reset(f),pollMs:40,rescanMs:60});
  await watcher.start();assert.equal(emissions.length,0);
  await writeFile(file,history);await new Promise(r=>setTimeout(r,160));await watcher.close();
  assert(!emissions.some(x=>x[2]?.data?.reason?.kind==='completed'));
}));
test('lost source directory is reported and tracked active state is reset',()=>withDir(async dir=>{
  const root=join(dir,'sessions');await mkdir(root);let resets=0;
  await writeFile(join(root,'one.jsonl'),'{}\n');
  const watcher=new RolloutWatcher({root,onReset:()=>resets++,pollMs:40,rescanMs:50});
  await watcher.start();await rm(root,{recursive:true});await new Promise(r=>setTimeout(r,180));
  const status=watcher.status();await watcher.close();
  assert.equal(status.sourceAvailable,false);assert(resets>0);
}));
test('inactive old files are evicted so capacity does not permanently hide new sessions',()=>withDir(async dir=>{
  for(const name of ['old-a.jsonl','old-b.jsonl'])await writeFile(join(dir,name),'{}\n');
  const watcher=new RolloutWatcher({root:dir,pollMs:40,rescanMs:50,maxFiles:2,isActive:()=>false});
  await watcher.start();await new Promise(r=>setTimeout(r,30));
  const newest=join(dir,'newest.jsonl');await writeFile(newest,'{}\n');
  await new Promise(r=>setTimeout(r,180));await watcher.close();
  assert(watcher.files.has(newest));assert(watcher.files.size<=2);
}));
