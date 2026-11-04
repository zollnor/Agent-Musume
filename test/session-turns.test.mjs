import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SessionTurns,SessionRelays,threadIdOf,ownsSession} from '../src/session-turns.mjs';
import {HandoffTracker} from '../src/handoffs.mjs';
import {CollabTracker} from '../src/collab-tracker.mjs';
import {RolloutAdapter} from '../src/rollout-adapter.mjs';

const thread='019f5bc0-a9cb-76b2-922e-ea1d48f629b1';
function rig(options={}){
  const collab=new CollabTracker(),tracker=new HandoffTracker({collab}),turns=new SessionTurns();
  const relays=new SessionRelays({tracker,turns,window:200,limit:500,threads:async target=>target===thread?thread:null,...options});
  return {turns,relays,kinds:()=>collab.events.map(e=>[e.kind,e.source,e.target])};
}
const tick=()=>new Promise(r=>setTimeout(r,5));

test('text typed into a terminal pane goes to the CLI session of another harness that starts a turn right after',async()=>{
  const {turns,relays,kinds}=rig();
  const done=relays.dispatched({key:'1:10',from:'chatgpt-desktop',kind:'term-text',target:'3'});
  await tick();turns.record({source:'chatgpt-desktop',file:'own.jsonl',phase:'start'}); // the sender itself is not the recipient
  turns.record({source:'claude-code',file:'pane.jsonl',phase:'start'});await tick();
  assert.deepEqual(kinds(),[['task.assigned','chatgpt-desktop','claude-code']]);
  turns.record({source:'claude-code',file:'other.jsonl',phase:'end',outcome:'error'}); // another session's end
  turns.record({source:'claude-code',file:'pane.jsonl',phase:'end',outcome:'success'});await done;
  assert.deepEqual(kinds().map(k=>k[0]),['task.assigned','result.delivered']);
});

test('a turn that began just before the typing was seen still counts; no turn, no show; outcomes map to the shows',async()=>{
  const early=rig();early.turns.record({source:'codex-cli',file:'c.jsonl',phase:'start'});
  const done=early.relays.dispatched({key:'2:20',from:'claude-code',kind:'term-text',target:''});
  await tick();early.turns.record({source:'codex-cli',file:'c.jsonl',phase:'end',outcome:'idle'});await done;
  // An interrupted turn is cancelled, which the pets play like a failure (HandoffTracker).
  assert.deepEqual(early.kinds(),[['task.assigned','claude-code','codex-cli'],['task.failed','claude-code','codex-cli']]);
  const quiet=rig();await quiet.relays.dispatched({key:'3:30',from:'claude-code',kind:'term-text',target:''});
  assert.deepEqual(quiet.kinds(),[]);
  const failed=rig();const run=failed.relays.dispatched({key:'4:40',from:'dsh-desktop',kind:'term-text',target:''});
  await tick();failed.turns.record({source:'claude-code',file:'p.jsonl',phase:'start'});failed.turns.record({source:'claude-code',file:'p.jsonl',phase:'end',outcome:'error'});await run;
  assert.deepEqual(failed.kinds().map(k=>k[0]),['task.assigned','task.failed']);
});

test('a queued Codex message goes to the session it names, desktop or CLI, once that session takes it up',async()=>{
  const {turns,relays,kinds}=rig();
  const done=relays.dispatched({key:'5:50',from:'claude-code',kind:'codex-queue',target:thread});
  await tick();turns.record({source:'codex-cli',file:'rollout-other.jsonl',phase:'start'});
  turns.record({source:'chatgpt-desktop',file:`rollout-2026-11-03T16-02-26-${thread}.jsonl`,phase:'start'});await tick();
  assert.deepEqual(kinds(),[['task.assigned','claude-code','chatgpt-desktop']]);
  turns.record({source:'chatgpt-desktop',file:`rollout-2026-11-03T16-02-26-${thread}.jsonl`,phase:'end',outcome:'success'});await done;
  assert.equal(kinds()[1][0],'result.delivered');
  // A queue command that failed (no such session) stops the wait at once.
  const failed=rig();const run=failed.relays.dispatched({key:'6:60',from:'claude-code',kind:'codex-queue',target:thread});
  await tick();failed.relays.exited('6:60',1);await run;assert.deepEqual(failed.kinds(),[]);
});

test('a queue target given by name is looked up in the session index',async()=>{
  const home=await mkdtemp(join(tmpdir(),'musume-codex-'));
  try{
    await writeFile(join(home,'session_index.jsonl'),JSON.stringify({id:thread,thread_name:'桌宠测试',updated_at:'x'})+'\n{broken\n');
    assert.equal(await threadIdOf('桌宠测试',{home}),thread);
    assert.equal(await threadIdOf(thread.toUpperCase(),{home}),thread);
    assert.equal(await threadIdOf('nothing',{home}),null);
  }finally{await rm(home,{recursive:true,force:true});}
});

test('adapters report live turns, never replayed ones',()=>{
  const seen=[],a=new RolloutAdapter({sourceKind:'codex-cli',onTurn:t=>seen.push(t)});
  a.consume('f',{type:'session_meta',payload:{source:'cli',originator:'codex-tui'}});
  a.consume('f',{type:'event_msg',payload:{type:'task_started',turn_id:'old'}},{replay:true});
  a.consume('f',{type:'event_msg',payload:{type:'task_complete',turn_id:'old'}},{replay:true});
  a.consume('f',{type:'event_msg',payload:{type:'task_started',turn_id:'t1'}});
  a.consume('f',{type:'event_msg',payload:{type:'task_complete',turn_id:'t1'}});
  assert.deepEqual(seen,[{source:'codex-cli',file:'f',phase:'start'},{source:'codex-cli',file:'f',phase:'end',outcome:'success'}]);
});

test('a session started with a task is followed to the end of its own first turn, not another session of that program',async()=>{
  const owner=async({file})=>file==='mine.jsonl';
  const {turns,relays}=rig({owns:owner,limit:1000});
  const first=relays.firstTurn({to:'claude-code',pid:42});
  turns.record({source:'codex-cli',file:'mine.jsonl',phase:'start'}); // another program
  turns.record({source:'claude-code',file:'other.jsonl',phase:'start'});await tick();
  turns.record({source:'claude-code',file:'mine.jsonl',phase:'start'});await tick();
  turns.record({source:'claude-code',file:'other.jsonl',phase:'end',outcome:'success'});
  turns.record({source:'claude-code',file:'mine.jsonl',phase:'end',outcome:'error'});
  assert.equal(await first,'error');
  // One that started a moment before the process was seen; none at all; a cancelled wait.
  const early=rig({owns:owner,limit:1000});early.turns.record({source:'codex-cli',file:'mine.jsonl',phase:'start'});
  const run=early.relays.firstTurn({to:'codex-cli',pid:7});early.turns.record({source:'codex-cli',file:'mine.jsonl',phase:'end',outcome:'success'});
  assert.equal(await run,'success');
  assert.equal(await rig({owns:owner,limit:50}).relays.firstTurn({to:'claude-code',pid:1}),null);
  const cancelled=rig({owns:owner,limit:1000}),wait=cancelled.relays.firstTurn({to:'claude-code',pid:1});wait.cancel();
  assert.equal(await wait,null);
  const closing=rig({owns:owner,limit:1000}),open=closing.relays.firstTurn({to:'claude-code',pid:1});closing.relays.close();
  assert.equal(await open,null);
});

test('a Claude session belongs to the process that registered it; a Codex session to the process that created its file',async()=>{
  const home=await mkdtemp(join(tmpdir(),'musume-owner-'));
  try{
    await mkdir(join(home,'sessions'));await writeFile(join(home,'sessions','42.json'),JSON.stringify({pid:42,sessionId:'s-1',kind:'interactive'}));
    assert.equal(await ownsSession({source:'claude-code',pid:42,file:join(home,'projects','p','s-1.jsonl'),since:0},{claudeHome:home}),true);
    assert.equal(await ownsSession({source:'claude-code',pid:42,file:'claude-native:s-1',since:0},{claudeHome:home}),true,'as the Claude monitor names it');
    assert.equal(await ownsSession({source:'claude-code',pid:42,file:join(home,'projects','p','s-2.jsonl'),since:0},{claudeHome:home}),false);
    assert.equal(await ownsSession({source:'claude-code',pid:43,file:join(home,'projects','p','s-1.jsonl'),since:0},{claudeHome:home,tries:2}),false);
    const rollout=join(home,'rollout.jsonl');await writeFile(rollout,'');
    assert.equal(await ownsSession({source:'codex-cli',pid:7,file:rollout,since:Date.now()-500}),true);
    assert.equal(await ownsSession({source:'codex-cli',pid:7,file:rollout,since:Date.now()+60000}),false,'a file older than the process');
    assert.equal(await ownsSession({source:'codex-cli',pid:7,file:join(home,'missing.jsonl'),since:0}),false);
  }finally{await rm(home,{recursive:true,force:true});}
});
