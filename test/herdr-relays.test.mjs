import test from 'node:test';
import assert from 'node:assert/strict';
import {HerdrRelays} from '../src/herdr-relays.mjs';
import {HandoffTracker,ProcessHandoffs} from '../src/handoffs.mjs';
import {CollabTracker} from '../src/collab-tracker.mjs';
import {SessionTurns} from '../src/session-turns.mjs';

// A Herdr pane whose status follows a script, one entry per look; the clock moves four seconds per look.
function rig(agent,statuses){
  const collab=new CollabTracker(),tracker=new HandoffTracker({collab});let clock=0,looks=0;
  const query=async()=>{clock+=4000;const status=statuses[Math.min(looks++,statuses.length-1)];return status===null?null:{agent,status};};
  const relays=new HerdrRelays({tracker,query,poll:1,now:()=>clock});
  const kinds=()=>collab.events.map(e=>[e.kind,e.source,e.target]);
  // Until every followed prompt has ended (or a second has passed).
  const settled=async()=>{for(let i=0;i<100&&relays.relays.size;i++)await new Promise(r=>setTimeout(r,10));};
  return {relays,kinds,settled};
}
const prompt={key:'7:100',from:'chatgpt-desktop',target:'wD:p1',image:'herdr.exe'};

test('a prompt waited for in a Herdr pane is a hand-over to that agent and comes back when it rests',async()=>{
  const {relays,kinds,settled}=rig('claude',['idle','idle']);
  await relays.dispatched({...prompt,wait:true});
  assert.deepEqual(kinds(),[['task.assigned','chatgpt-desktop','claude-code']]);
  relays.exited(prompt.key,0);await settled();
  assert.deepEqual(kinds().map(k=>k[0]),['task.assigned','result.delivered']);
});

test('without --wait, rest right after the submission is not yet the answer',async()=>{
  const {relays,kinds,settled}=rig('codex',['idle','idle','working','working','idle']);
  await relays.dispatched({...prompt,wait:false});relays.exited(prompt.key,0);
  await settled();
  assert.deepEqual(kinds(),[['task.assigned','chatgpt-desktop','codex-cli'],['result.delivered','chatgpt-desktop','codex-cli']]);
});

test('a rejected or stalled submission fails; a caller timeout while the agent works is followed to the end',async()=>{
  const rejected=rig('claude',['idle']);
  await rejected.relays.dispatched({...prompt,wait:true});rejected.relays.exited(prompt.key,1);await rejected.settled();
  assert.deepEqual(rejected.kinds().map(k=>k[0]),['task.assigned','task.failed']);
  const slow=rig('claude',['working','working','working','idle']);
  await slow.relays.dispatched({...prompt,wait:true});slow.relays.exited(prompt.key,1);await slow.settled();
  assert.deepEqual(slow.kinds().map(k=>k[0]),['task.assigned','result.delivered']);
});

test('other agents, the same harness, and an unreadable pane stage nothing; an exit before the lookup still settles',async()=>{
  for(const [agent,from] of [['opencode','chatgpt-desktop'],['claude','claude-code']]){
    const r=rig(agent,['idle']);await r.relays.dispatched({...prompt,from,wait:true});assert.deepEqual(r.kinds(),[]);
  }
  const unreadable=rig('claude',[null]);await unreadable.relays.dispatched({...prompt,wait:true});assert.deepEqual(unreadable.kinds(),[]);
  const early=rig('claude',['working','idle']);
  const pending=early.relays.dispatched({...prompt,wait:true});early.relays.exited(prompt.key,0);await pending;await early.settled();
  assert.deepEqual(early.kinds().map(k=>k[0]),['task.assigned','result.delivered']);
});

test('keys sent to a Herdr pane are a task only when they set a resting agent to work',async()=>{
  const keys={...prompt,kind:'herdr-keys'};
  const enter=rig('claude',['idle','idle','working','working','idle']);enter.relays.window=200;enter.relays.step=1;
  await enter.relays.dispatched(keys);await enter.settled();
  assert.deepEqual(enter.kinds().map(k=>k[0]),['task.assigned','result.delivered']);
  // Approving a permission (blocked to working) and text still waiting for Enter (idle stays idle) stage nothing.
  for(const statuses of [['blocked','working','idle'],['idle','idle','idle']]){
    const r=rig('claude',statuses);r.relays.window=20;r.relays.step=1;await r.relays.dispatched(keys);await r.settled();
    assert.deepEqual(r.kinds(),[]);
  }
});

test('with the pane session known, keys are a task when that session starts a turn, and its end is the hand-back',async()=>{
  const collab=new CollabTracker(),tracker=new HandoffTracker({collab}),turns=new SessionTurns();
  const query=async()=>({agent:'claude',status:'working',session:'6d4438a2-709e-450c-902d-350a0e31b8fe'});
  const relays=new HerdrRelays({tracker,turns,query,window:200});
  const done=relays.dispatched({...prompt,kind:'herdr-keys'});await new Promise(r=>setTimeout(r,5));
  turns.record({source:'claude-code',file:'C:/x/6d4438a2-709e-450c-902d-350a0e31b8fe.jsonl',phase:'start'});await new Promise(r=>setTimeout(r,5));
  turns.record({source:'claude-code',file:'C:/x/6d4438a2-709e-450c-902d-350a0e31b8fe.jsonl',phase:'end',outcome:'success'});await done;
  assert.deepEqual(collab.events.map(e=>e.kind),['task.assigned','result.delivered']);
  // No turn of that session within the window (Esc, an arrow, text without Enter): nothing.
  const quiet=new HerdrRelays({tracker,turns:new SessionTurns(),query,window:30});
  await quiet.dispatched({...prompt,key:'9:900',kind:'herdr-keys'});assert.equal(collab.events.length,2);
});

test('the process watcher hands a submitted Herdr prompt to the relays with its sender; commands to the agent are not tasks',()=>{
  const calls=[],exits=[];
  const relays={dispatched:c=>calls.push(c),exited:(key,code)=>exits.push([key,code])};
  const p=new ProcessHandoffs({tracker:new HandoffTracker({collab:new CollabTracker()}),relays});
  const desktop={pid:1,parentPid:0,startedAt:100,source:'chatgpt-desktop',mode:'gui'},shell={pid:2,parentPid:1,startedAt:200,source:null};
  p.snapshot([desktop,shell]);
  p.snapshot([desktop,shell,{pid:3,parentPid:2,startedAt:300,source:null,mode:'herdr-command'},
    {pid:4,parentPid:2,startedAt:400,source:null,mode:'herdr-prompt',relay:{target:'wD:p1',wait:true,image:'D:\\Herdr\\herdr.exe'}}]);
  assert.deepEqual(calls,[{key:'4:400',from:'chatgpt-desktop',kind:'herdr-prompt',target:'wD:p1',wait:true,image:'D:\\Herdr\\herdr.exe'}]);
  p.exited({pid:4,startedAt:400,exitCode:0});assert.deepEqual(exits,[['4:400',0]]);
});
