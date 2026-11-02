import test from 'node:test';
import assert from 'node:assert/strict';
import {CollabTracker} from '../src/collab-tracker.mjs';
import {SessionSourceRouter} from '../src/session-source-router.mjs';
import {RolloutAdapter} from '../src/rollout-adapter.mjs';

const event=(type,fields={})=>({type:'event_msg',payload:{type,...fields}});
const item=payload=>({type:'response_item',payload});
const kinds=t=>t.status().events.map(e=>e.kind);

test('Codex spawn, helper work and confirmed hand-back become assigned and delivered',()=>{
  let now=1000;const t=new CollabTracker({now:()=>now});
  t.consumeCodex('parent',{type:'session_meta',payload:{id:'T1',source:'cli',originator:'codex-tui'}},{},'codex-cli');
  t.consumeCodex('parent',item({type:'function_call',name:'spawn_agent',call_id:'s1',arguments:'{"message":"PRIVATE"}'}),{},'codex-cli');
  t.consumeCodex('parent',item({type:'function_call_output',call_id:'s1',output:'{"task_name":"PRIVATE"}'}),{},'codex-cli');
  assert.deepEqual(kinds(t),['task.assigned']);
  t.consumeCodex('child',{type:'session_meta',payload:{id:'C1',source:{subagent:{thread_spawn:{parent_thread_id:'T1',agent_path:'/root/helper',depth:1}}}}},{},null);
  t.consumeCodex('child',event('task_started',{turn_id:'c'}),{},null);
  t.consumeCodex('child',event('exec_command_begin',{call_id:'x'}),{},null);
  assert.equal(t.status().helpers['codex-cli'].state,'working');
  assert.equal(t.status().helpers['codex-cli'].activeSessions,1);
  assert.equal(t.status().helpers['chatgpt-desktop'].state,'idle');
  // A message alone is not a delivery: the child has not finished.
  now=2000;t.consumeCodex('parent',item({type:'agent_message',author:'/root/helper',recipient:'/root',content:[{text:'PRIVATE'}]}),{},'codex-cli');
  assert.deepEqual(kinds(t),['task.assigned']);
  now=2500;t.consumeCodex('child',event('task_complete',{turn_id:'c'}),{},null);
  assert.deepEqual(kinds(t),['task.assigned','result.delivered']);
  assert.equal(t.status().helpers['codex-cli'].state,'success');
  assert.equal(t.status().helpers['codex-cli'].activeSessions,0);
  assert(!JSON.stringify(t.status()).includes('PRIVATE'));
  assert(!JSON.stringify(t.status()).includes('/root/'));
});

test('Codex guardian reviewers, failed spawns and history never stage a hand-over',()=>{
  const t=new CollabTracker({now:()=>5});
  t.consumeCodex('p',{type:'session_meta',payload:{id:'T',source:'vscode',originator:'Codex Desktop'}},{replay:true},'chatgpt-desktop');
  t.consumeCodex('p',item({type:'function_call',name:'spawn_agent',call_id:'old'}),{replay:true},'chatgpt-desktop');
  t.consumeCodex('p',item({type:'function_call_output',call_id:'old',output:'{"task_name":"x"}'}),{replay:true},'chatgpt-desktop');
  assert.deepEqual(kinds(t),[],'replayed history only builds state');
  t.consumeCodex('g',{type:'session_meta',payload:{id:'G',source:{subagent:{other:'guardian'}}}},{},null);
  t.consumeCodex('g',event('task_started',{turn_id:'g'}),{},null);
  assert.equal(t.status().helpers['chatgpt-desktop'].activeSessions,0);
  t.consumeCodex('p',item({type:'function_call',name:'spawn_agent',call_id:'bad'}),{},'chatgpt-desktop');
  t.consumeCodex('p',item({type:'function_call_output',call_id:'bad',output:'spawn rejected'}),{},'chatgpt-desktop');
  assert.deepEqual(kinds(t),['task.failed']);
  t.consumeCodex('p',item({type:'function_call_output',call_id:'old',output:'{"task_name":"x"}'}),{},'chatgpt-desktop');
  assert.deepEqual(kinds(t),['task.failed'],'an event id is never emitted twice');
});

test('Claude async Agent: launch, sidechain work and hand-back',()=>{
  const t=new CollabTracker({now:()=>10});
  t.consumeClaude('s',{type:'assistant',message:{content:[{type:'tool_use',name:'Agent',id:'tu1',input:{prompt:'PRIVATE'}}]}});
  assert.deepEqual(kinds(t),[],'a request is not yet a confirmed delegation');
  t.consumeClaude('s',{type:'user',toolUseResult:{status:'async_launched',agentId:'a1',prompt:'PRIVATE'},message:{content:[{type:'tool_result',tool_use_id:'tu1',content:'PRIVATE'}]}});
  assert.deepEqual(kinds(t),['task.assigned']);
  t.consumeClaudeAgent('s','a1',{type:'assistant',isSidechain:true,agentId:'a1',message:{content:[{type:'tool_use',name:'Read',id:'r'}]}},{toolUseId:'tu1'});
  assert.equal(t.status().helpers['claude-code'].state,'working');
  t.consumeClaude('s',{type:'user',origin:{kind:'peer',from:'a1',handback:true,body:'PRIVATE'},message:{content:'PRIVATE'}});
  t.consumeClaude('s',{type:'user',origin:{kind:'task-notification'},message:{content:'<task-notification><task-id>a1</task-id><status>completed</status>PRIVATE'}});
  assert.deepEqual(kinds(t),['task.assigned','result.delivered']);
  assert.equal(t.status().helpers['claude-code'].activeSessions,0);
  assert(!JSON.stringify(t.status()).includes('PRIVATE'));
});

test('Claude hand-back absorbed mid-turn arrives as a queued_command attachment',()=>{
  const t=new CollabTracker({now:()=>10});
  t.consumeClaude('s',{type:'assistant',message:{content:[{type:'tool_use',name:'Agent',id:'tu1'}]}});
  t.consumeClaude('s',{type:'user',toolUseResult:{status:'async_launched',agentId:'a1'},message:{content:[{type:'tool_result',tool_use_id:'tu1'}]}});
  t.consumeClaude('s',{type:'queue-operation',operation:'enqueue',content:'<task-id>a1</task-id><status>completed</status>'});
  assert.deepEqual(kinds(t),['task.assigned'],'a queued message is not yet received');
  t.consumeClaude('s',{type:'attachment',attachment:{type:'queued_command',commandMode:'prompt',prompt:'PRIVATE',origin:{kind:'peer',from:'a1',handback:true,body:'PRIVATE'}}});
  t.consumeClaude('s',{type:'attachment',attachment:{type:'queued_command',commandMode:'task-notification',prompt:'<task-id>a1</task-id> <status>completed</status> PRIVATE',origin:{kind:'task-notification',producer:'session-task'}}});
  assert.deepEqual(kinds(t),['task.assigned','result.delivered']);
  assert.equal(t.status().helpers['claude-code'].activeSessions,0);
  // A second sub-agent that fails is reported through the attachment's notification tags alone.
  t.consumeClaude('s',{type:'assistant',message:{content:[{type:'tool_use',name:'Agent',id:'tu2'}]}});
  t.consumeClaude('s',{type:'user',toolUseResult:{status:'async_launched',agentId:'a2'},message:{content:[{type:'tool_result',tool_use_id:'tu2'}]}});
  t.consumeClaude('s',{type:'attachment',attachment:{type:'queued_command',prompt:'<task-id>a2</task-id><status>failed</status>',origin:{kind:'task-notification'}}});
  assert.deepEqual(kinds(t),['task.assigned','result.delivered','task.assigned','task.failed']);
  assert(!JSON.stringify(t.status()).includes('PRIVATE'));
});

test('Claude synchronous Agent is assigned by its transcript and delivered by its tool result',()=>{
  const t=new CollabTracker({now:()=>10});
  t.consumeClaude('s',{type:'assistant',message:{content:[{type:'tool_use',name:'Task',id:'tu2'}]}});
  t.consumeClaudeAgent('s','a2',{type:'user',isSidechain:true,agentId:'a2',message:{content:'PRIVATE'}},{toolUseId:'tu2'});
  assert.deepEqual(kinds(t),['task.assigned']);
  t.consumeClaude('s',{type:'user',toolUseResult:{status:'completed',agentId:'a2'},message:{content:[{type:'tool_result',tool_use_id:'tu2'}]}});
  assert.deepEqual(kinds(t),['task.assigned','result.delivered']);
  t.consumeClaude('s',{type:'assistant',message:{content:[{type:'tool_use',name:'Agent',id:'tu3'}]}});
  t.consumeClaude('s',{type:'user',message:{content:[{type:'tool_result',tool_use_id:'tu3',is_error:true}]}});
  assert.deepEqual(kinds(t),['task.assigned','result.delivered','task.failed']);
  // A sidechain record in the main transcript is not a main-agent action.
  t.consumeClaude('s',{type:'assistant',isSidechain:true,message:{content:[{type:'tool_use',name:'Agent',id:'tu4'}]}});
  t.consumeClaude('s',{type:'user',toolUseResult:{status:'async_launched',agentId:'a4'},message:{content:[{type:'tool_result',tool_use_id:'tu4'}]}});
  assert.equal(kinds(t).length,3);
});

test('router reports the effective source of root sessions for delegation events',()=>{
  const desktop=new RolloutAdapter(),cli=new RolloutAdapter({sourceKind:'codex-cli'});
  const router=new SessionSourceRouter({desktop,cli,lookup:id=>id==='moved'?'chatgpt-desktop':null});
  router.consume('a',{type:'session_meta',payload:{id:'plain',source:'cli',originator:'codex-tui'}});
  router.consume('b',{type:'session_meta',payload:{id:'moved',source:'cli',originator:'codex-tui'}});
  router.consume('c',{type:'session_meta',payload:{id:'child',source:{subagent:{thread_spawn:{parent_thread_id:'plain'}}}}});
  assert.equal(router.sourceOf('a'),'codex-cli');
  assert.equal(router.sourceOf('b'),'chatgpt-desktop');
  assert.equal(router.sourceOf('c'),null);
});
