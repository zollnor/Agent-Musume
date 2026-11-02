import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { RolloutAdapter } from '../src/rollout-adapter.mjs';
const source=readFileSync(new URL('../vendor/dsh-pet/lib/standalone.original.js',import.meta.url),'utf8');
const start=source.indexOf('function turnEndState(');
const end=source.indexOf('\n//#endregion',source.indexOf('var WorkStatusStore = class'));
assert(start>=0&&end>start,'pure upstream work-status region must exist');
function setup() {
  const context={Date};vm.createContext(context);
  vm.runInContext(source.slice(start,end)+'\nglobalThis.api={WorkStatusStore,reduceWorkStatus,currentTaskFromTodo};',context);
  const {WorkStatusStore,reduceWorkStatus,currentTaskFromTodo}=context.api;const store=new WorkStatusStore();
  const adapter=new RolloutAdapter({emit:(_name,session,event)=>{
    const id=session.header.id;
    if(event.type==='todo/write') {if(store.has(id))store.setTask(id,currentTaskFromTodo(event));return;}
    const state=reduceWorkStatus(event);
    if(state)store.setState(id,state,event.seq);
    else if(event.type==='turn/end')store.clear(id);
  }});
  for(const file of ['a','b'])adapter.consume(file,{type:'session_meta',payload:{originator:'Codex Desktop',source:'vscode'}});
  const event=(file,type,fields)=>adapter.consume(file,{type:'event_msg',payload:{type,...fields}});
  return {adapter,store,event};
}
test('a previous error cannot mask a newly running task in the original priority store',()=>{
  const {adapter,store,event}=setup();
  event('a','task_started',{turn_id:'a'});event('a','task_failed',{turn_id:'a'});
  assert.equal(store.snapshot().state,'error');
  event('b','task_started',{turn_id:'b'});
  assert.equal(store.snapshot().state,'thinking');
  adapter.consume('b',{type:'response_item',payload:{type:'function_call',name:'exec_command'}});
  assert.equal(store.snapshot().state,'working');assert.equal(adapter.status().state,'working');
});
