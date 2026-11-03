import test from 'node:test';
import assert from 'node:assert/strict';
import {HandoffTracker,ProcessHandoffs} from '../src/handoffs.mjs';
import {CollabTracker} from '../src/collab-tracker.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{Director}=require('../src/interaction-director.cjs');
const sources=['chatgpt-desktop','codex-cli','claude-code','dsh-desktop'];

for(const from of sources)for(const to of sources)if(from!==to)test(`handoff lifecycle ${from} -> ${to}`,()=>{
  const collab=new CollabTracker({now:()=>100000});
  const t=new HandoffTracker({collab,now:()=>100000});
  assert.equal(t.consume({id:'opaque-task',from,to,phase:'started'}).ok,true);
  assert.equal(t.consume({id:'opaque-task',from,to,phase:'delivered'}).ok,true);
  assert.deepEqual(collab.events.map(e=>[e.kind,e.source,e.target]),[['task.assigned',from,to],['result.delivered',from,to]]);
  assert.equal(collab.events[0].task,collab.events[1].task);
  assert(!JSON.stringify(collab.status()).includes('opaque-task'));
});

test('handoffs validate, deduplicate, isolate task ids and never infer success',()=>{
  const collab=new CollabTracker(),t=new HandoffTracker({collab});
  assert.equal(t.consume({id:'a',from:sources[0],to:sources[0],phase:'started'}).ok,false);
  assert.equal(t.consume({id:'a',from:'unknown',to:sources[2],phase:'started'}).ok,false);
  assert.equal(t.consume({id:'a',from:sources[0],to:sources[2],phase:'started',prompt:'PRIVATE'}).ok,false);
  assert.equal(t.consume({id:'a',from:sources[0],to:sources[2],phase:'delivered'}).ok,false);
  const a={id:'a',from:sources[0],to:sources[2]};
  t.consume({...a,phase:'started'});t.consume({...a,phase:'started'});
  assert.equal(t.consume({...a,to:sources[3],phase:'failed'}).ok,false);
  t.consume({...a,phase:'cancelled'});t.consume({...a,phase:'delivered'});
  assert.deepEqual(collab.events.map(e=>e.kind),['task.assigned','task.failed']);
  assert.equal(t.status().active,0);
});

test('process ancestry detects nested cross-harness launch, not unrelated simultaneous work',()=>{
  const collab=new CollabTracker(),tracker=new HandoffTracker({collab}),p=new ProcessHandoffs({tracker});
  const parent={pid:1,parentPid:0,startedAt:100,source:sources[0]};
  p.snapshot([parent]); // baseline does not replay old work
  p.snapshot([parent,{pid:2,parentPid:1,startedAt:200,source:null},{pid:3,parentPid:2,startedAt:300,source:sources[2]},
    {pid:4,parentPid:0,startedAt:300,source:sources[3]}]);
  assert.deepEqual(collab.events.map(e=>[e.kind,e.source,e.target]),[['task.assigned',sources[0],sources[2]]]);
  p.exited({pid:3,startedAt:300,exitCode:0});p.exited({pid:3,startedAt:300,exitCode:0});
  assert.deepEqual(collab.events.map(e=>e.kind),['task.assigned','result.delivered']);
});

test('a task started in the background still leads back to its harness through the exited starter',()=>{
  const collab=new CollabTracker(),tracker=new HandoffTracker({collab}),p=new ProcessHandoffs({tracker});
  const desktop={pid:1,parentPid:0,startedAt:100,source:sources[0]},runner={pid:2,parentPid:1,startedAt:150,source:null};
  p.snapshot([desktop,runner]);
  // Start-Process: the starter shell (pid 7) has exited; only the recorder saw it. Pid 7 now belongs to a later process.
  p.snapshot([desktop,runner,{pid:7,parentPid:0,startedAt:900,source:null},{pid:8,parentPid:7,startedAt:400,source:sources[2],mode:'cli-task'},
    {pid:7,parentPid:2,startedAt:300,source:null,mode:'gone'}]);
  assert.deepEqual(collab.events.map(e=>[e.kind,e.source,e.target]),[['task.assigned',sources[0],sources[2]]]);
  // An exited process is never a task itself, and a reused PID that started after the child is not its parent.
  p.snapshot([desktop,{pid:9,parentPid:0,startedAt:950,source:null},{pid:10,parentPid:9,startedAt:500,source:sources[1],mode:'cli-task'},
    {pid:11,parentPid:2,startedAt:600,source:sources[1],mode:'gone'}]);
  assert.equal(collab.events.length,1);
});

test('a task whose starter is recorded a moment late is still linked; an orphan stops waiting after a few snapshots',()=>{
  const collab=new CollabTracker(),tracker=new HandoffTracker({collab}),p=new ProcessHandoffs({tracker,retries:2});
  const codex={pid:1,parentPid:0,startedAt:100,source:sources[1]};p.snapshot([codex]);
  const task={pid:8,parentPid:7,startedAt:400,source:sources[2],mode:'cli-task'};
  p.snapshot([codex,task]);assert.equal(collab.events.length,0,'starter not known yet');
  p.snapshot([codex,task,{pid:7,parentPid:1,startedAt:300,source:null,mode:'gone'}]);
  assert.deepEqual(collab.events.map(e=>[e.kind,e.source,e.target]),[['task.assigned',sources[1],sources[2]]]);
  const orphan={pid:20,parentPid:19,startedAt:500,source:sources[2],mode:'cli-task'};
  for(let i=0;i<4;i++)p.snapshot([codex,orphan]);
  assert.equal(p.waiting.size,0);assert.equal(collab.events.length,1);
});

test('process identity survives PID reuse; unknown exit is cancelled, wrapped launches are not doubled',()=>{
  const collab=new CollabTracker(),tracker=new HandoffTracker({collab}),p=new ProcessHandoffs({tracker});
  const parent={pid:1,parentPid:0,startedAt:100,source:sources[2]};p.snapshot([parent]);
  p.snapshot([parent,{pid:2,parentPid:1,startedAt:200,source:sources[1]}]);
  p.exited({pid:2,startedAt:199,exitCode:0});assert.equal(collab.events.length,1);
  p.exited({pid:2,startedAt:200,exitCode:null});assert.equal(collab.events[1].kind,'task.failed');
  p.snapshot([parent,{pid:5,parentPid:1,startedAt:300,source:null,bridge:true},{pid:6,parentPid:5,startedAt:400,source:sources[1]}]);
  assert.equal(collab.events.length,2);
});

test('GUI launchers and empty interactive terminals never turn process exit into task success',()=>{
  const collab=new CollabTracker(),tracker=new HandoffTracker({collab}),p=new ProcessHandoffs({tracker});
  const parent={pid:1,parentPid:0,startedAt:100,source:'claude-code'};p.snapshot([parent]);
  for(const [pid,source,mode] of [[2,'dsh-desktop','gui'],[3,'chatgpt-desktop','gui'],[4,'codex-cli','interactive']]){
    p.snapshot([parent,{pid,parentPid:1,startedAt:200,source,mode}]);p.exited({pid,startedAt:200,exitCode:0});
  }
  assert.deepEqual(collab.events,[]);
});

function rig(from,to){
  let now=100000;const sent=[];
  const d=new Director({now:()=>now,send:(id,c)=>sent.push({id,...c}),random:()=>0.3,
    boxes:()=>({sender:{x:900,y:400,size:200},receiver:{x:500,y:400,size:200},bystander:{x:850,y:400,size:200}})});
  for(const [id,appearance,reactionSources,helperSources] of [
    ['sender','dragon-girl-D',[from],[]],['receiver','claude-lady',[to],[]],['bystander','blue-fish',[],[from]]
  ])d.hello(id,{appearance,reactionSources,interaction:{helperSources}});
  d.collab({events:[]});return {d,sent,advance:()=>now+=10000,now:()=>now};
}
for(const from of sources)for(const to of sources)if(from!==to)test(`director casts actual recipient ${from} -> ${to}`,()=>{
  const {d,sent,now}=rig(from,to);
  d.collab({events:[{seq:1,kind:'task.assigned',source:from,target:to,task:'one',at:now()}]});
  assert.deepEqual(sent.filter(c=>c.type==='prepare').map(c=>c.id).sort(),['receiver','sender']);
  assert.equal(sent.find(c=>c.id==='sender').script.find(x=>x.op==='duet').role,'giver');
});

test('a hand-back goes to the pets that staged its assignment, even after they moved',()=>{
  let now=100000;const boxes={sender:{x:900,y:400,size:200},near:{x:700,y:400,size:200},far:{x:200,y:400,size:200}};
  const d=new Director({now:()=>now,send:()=>{},random:()=>0.3,boxes:()=>boxes});
  for(const [id,appearance,reactionSources] of [['sender','dragon-girl-D',[sources[0]]],['near','claude-lady',[sources[2]]],['far','blue-fish',[sources[2]]]])
    d.hello(id,{appearance,reactionSources,interaction:{helperSources:[]}});
  d.collab({events:[]});
  const cast=kind=>[d.show,...d.queue].find(c=>c?.kind===kind)?.members;
  d.collab({events:[{seq:1,kind:'task.assigned',source:sources[0],target:sources[2],task:'t',at:now}]});
  assert.deepEqual(cast('collab.assign'),['sender','near']);
  boxes.near.x=100;boxes.far.x=800; // the walk moved them: the other recipient is closer now
  d.collab({events:[{seq:2,kind:'result.delivered',source:sources[0],target:sources[2],task:'t',at:now}]});
  assert.deepEqual(cast('collab.deliver'),['near','sender']);
  assert.equal(d.taskPairs.size,0);
});

test('parallel deliveries do not discard another target assignment; celebration keeps the actual pair',()=>{
  const {d,sent,advance,now}=rig(sources[0],sources[2]);
  d.report('sender',{type:'busy',busy:true});
  d.hello('bystander',{appearance:'blue-fish',reactionSources:[sources[3]]});
  d.collab({events:[{seq:1,kind:'task.assigned',source:sources[0],target:sources[2],task:'a',at:now()},
    {seq:2,kind:'task.assigned',source:sources[0],target:sources[3],task:'b',at:now()},
    {seq:3,kind:'result.delivered',source:sources[0],target:sources[2],task:'a',at:now()}]});
  assert(d.queue.some(c=>c.kind==='collab.assign'&&c.handoff==='b'));
  d.queue=[];d.report('sender',{type:'busy',busy:false});advance();
  d.report('sender',{type:'state',state:'success',source:sources[0]});
  assert.deepEqual(sent.filter(c=>c.type==='prepare').map(c=>c.id).sort(),['receiver','sender']);
});

test('sources sharing a pet can stage a handoff with a configured helper, without inventing a same-pet duet',()=>{
  const {d}=rig(sources[0],sources[2]);
  d.hello('sender',{appearance:'dragon-girl-D',reactionSources:[sources[0],sources[1]]});
  const pair=d.pairFor(sources[0],sources[1]);
  assert.equal(pair.main,'sender');assert.equal(pair.helper,'bystander');
  d.hello('bystander',{appearance:'blue-fish',reactionSources:[],interaction:{collab:false,helperSources:[sources[0]]}});
  assert.equal(d.pairFor(sources[0],sources[1]),null,'disabled helpers are not drafted');
});

test('an internal helper cannot impersonate an unconfigured cross-harness target',()=>{
  const {d}=rig(sources[0],sources[2]);d.forget('receiver');
  assert.equal(d.pairFor(sources[0],sources[2]),null);
  d.hello('bystander',{appearance:'blue-fish',reactionSources:[],interaction:{helperSources:[sources[2]]}});
  assert.equal(d.pairFor(sources[0],sources[2]).helper,'bystander','explicit target assistance is allowed');
});
