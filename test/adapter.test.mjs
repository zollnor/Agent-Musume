import test from 'node:test';
import assert from 'node:assert/strict';
import { RolloutAdapter } from '../src/rollout-adapter.mjs';

const meta = (source='vscode', originator='Codex Desktop') => ({ type:'session_meta', payload:{id:'private-thread',source,originator} });
const event = (type, fields={}) => ({ type:'event_msg', timestamp:'2026-10-21T02:00:00.000Z', payload:{type,...fields} });
function setup(source='vscode') {
  const emissions=[];
  const adapter=new RolloutAdapter({emit:(...args)=>emissions.push(args), now:()=>1000});
  adapter.consume('file-a',meta(source));
  return {adapter,emissions};
}
test('only root desktop sessions are eligible',()=>{
  for(const source of ['cli',{subagent:{other:'guardian'}}]) {
    const {adapter,emissions}=setup(source);
    adapter.consume('file-a',event('task_started',{turn_id:'t'}));
    assert.equal(emissions.length,0);
    assert.equal(adapter.status().activeSessions,0);
  }
});
test('real task and tools map to original thinking, working and result',()=>{
  const {adapter,emissions}=setup();
  adapter.consume('file-a',event('task_started',{turn_id:'t'}));
  assert.equal(adapter.status().state,'thinking');
  adapter.consume('file-a',{type:'response_item',payload:{type:'function_call',name:'exec_command',arguments:'SENSITIVE'}});
  assert.equal(adapter.status().state,'working');
  adapter.consume('file-a',{type:'response_item',payload:{type:'function_call_output',output:'SENSITIVE'}});
  assert.equal(adapter.status().state,'result');
  assert(!JSON.stringify(emissions).includes('SENSITIVE'));
});
test('final message alone is not completion; explicit completion is',()=>{
  const {adapter}=setup();
  adapter.consume('file-a',event('task_started',{turn_id:'t'}));
  adapter.consume('file-a',{type:'response_item',payload:{type:'message',role:'assistant',phase:'final',content:[{text:'secret'}]}});
  assert.notEqual(adapter.status().state,'success');
  adapter.consume('file-a',event('task_complete',{turn_id:'t',last_agent_message:'secret'}));
  assert.equal(adapter.status().state,'success');
  assert.equal(adapter.status().activeSessions,0);
  assert(!JSON.stringify(adapter.status()).includes('secret'));
});
test('user input waits through immediate async tool result and cancellation clears it',()=>{
  const {adapter}=setup();
  adapter.consume('file-a',event('task_started',{turn_id:'t'}));
  adapter.consume('file-a',{type:'response_item',payload:{type:'custom_tool_call',name:'functions.request_user_input_async',input:'private'}});
  adapter.consume('file-a',{type:'response_item',payload:{type:'custom_tool_call_output',output:'pending'}});
  assert.equal(adapter.status().state,'waiting');
  adapter.consume('file-a',event('turn_aborted',{turn_id:'t'}));
  assert.equal(adapter.status().state,'idle');
});
test('explicit task failure maps to error, command failures alone do not end task',()=>{
  const {adapter}=setup();
  adapter.consume('file-a',event('task_started',{turn_id:'t'}));
  adapter.consume('file-a',event('item_completed',{turn_id:'t',item:{type:'CommandExecution',exit_code:1,status:'completed',aggregated_output:'secret'}}));
  assert.equal(adapter.status().activeSessions,1);
  assert.notEqual(adapter.status().state,'success');
  adapter.consume('file-a',event('task_failed',{turn_id:'t'}));
  assert.equal(adapter.status().state,'error');
});
test('bootstrap folds history without emitting and publishes only active state',()=>{
  const {adapter,emissions}=setup();
  adapter.consume('file-a',event('task_started',{turn_id:'old'}),{replay:true});
  adapter.consume('file-a',event('task_complete',{turn_id:'old'}),{replay:true});
  adapter.finishReplay('file-a');
  assert.equal(emissions.length,0);
  adapter.consume('file-a',event('task_started',{turn_id:'new'}),{replay:true});
  adapter.finishReplay('file-a');
  assert.equal(adapter.status().state,'thinking');
  assert.equal(emissions.filter(x=>x[2]?.type==='turn/end').length,0);
});
test('duplicate completion and an old-turn completion do not clear newer activity',()=>{
  const {adapter,emissions}=setup();
  adapter.consume('file-a',event('task_started',{turn_id:'first'}));
  adapter.consume('file-a',event('task_started',{turn_id:'second'}));
  adapter.consume('file-a',event('task_complete',{turn_id:'first'}));
  assert.equal(adapter.status().activeSessions,1);
  adapter.consume('file-a',event('task_complete',{turn_id:'second'}));
  const n=emissions.length;
  adapter.consume('file-a',event('task_complete',{turn_id:'second'}));
  assert.equal(emissions.length,n);
});
test('another completed thread does not mask active desktop work',()=>{
  const {adapter}=setup();
  adapter.consume('file-b',meta());
  adapter.consume('file-a',event('task_started',{turn_id:'a'}));
  adapter.consume('file-b',event('task_started',{turn_id:'b'}));
  adapter.consume('file-b',event('task_complete',{turn_id:'b'}));
  assert.equal(adapter.status().activeSessions,1);
  assert.notEqual(adapter.status().state,'success');
});
test('typed exec approval waits and the matching command start resumes work',()=>{
  const {adapter}=setup();adapter.consume('file-a',event('task_started',{turn_id:'t'}));
  adapter.consume('file-a',event('exec_approval_request',{turn_id:'t',call_id:'call-a',command:['private']}));
  assert.equal(adapter.status().state,'waiting');
  adapter.consume('file-a',event('exec_command_begin',{turn_id:'t',call_id:'call-a'}));
  assert.equal(adapter.status().state,'working');
});
test('blocking user-input tool resumes on its matching output; async question stays pending',()=>{
  const {adapter}=setup();adapter.consume('file-a',event('task_started',{turn_id:'t'}));
  adapter.consume('file-a',{type:'response_item',payload:{type:'function_call',name:'request_user_input',call_id:'q'}});
  assert.equal(adapter.status().state,'waiting');
  adapter.consume('file-a',{type:'response_item',payload:{type:'function_call_output',call_id:'unrelated'}});
  assert.equal(adapter.status().state,'waiting');
  adapter.consume('file-a',{type:'response_item',payload:{type:'function_call_output',call_id:'q'}});
  assert.equal(adapter.status().state,'result');
});
test('submission error is terminal, while retrying stream error is not',()=>{
  const {adapter}=setup();adapter.consume('file-a',event('task_started',{turn_id:'t'}));
  adapter.consume('file-a',event('stream_error',{message:'private retry detail'}));
  assert.equal(adapter.status().activeSessions,1);
  adapter.consume('file-a',event('error',{message:'private failure detail'}));
  assert.equal(adapter.status().state,'error');assert.equal(adapter.status().activeSessions,0);
});
test('a steering user-message item releases an async question in the same turn',()=>{
  const {adapter}=setup();adapter.consume('file-a',event('task_started',{turn_id:'t'}));
  adapter.consume('file-a',{type:'response_item',payload:{type:'custom_tool_call',name:'request_user_input_async',call_id:'q'}});
  assert.equal(adapter.status().state,'waiting');
  adapter.consume('file-a',event('item_completed',{turn_id:'t',item:{type:'UserMessage',content:'private answer'}}));
  assert.equal(adapter.status().state,'thinking');
});
