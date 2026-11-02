import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {RolloutAdapter} from '../src/rollout-adapter.mjs';
import {ClaudeAdapter} from '../src/claude-adapter.mjs';
const require=createRequire(import.meta.url);
const {normalizeSources,selectReaction}=require('../src/reaction-sources.cjs');
const event=(type,fields={})=>({type:'event_msg',payload:{type,...fields}});
const meta=(source,originator)=>({type:'session_meta',payload:{source,originator}});
test('CLI and desktop originators are isolated, subagents never become CLI sessions',()=>{
  const desktop=new RolloutAdapter(),cli=new RolloutAdapter({sourceKind:'codex-cli'});
  for(const a of [desktop,cli]){a.consume('cli',meta('cli','codex-tui'));a.consume('desktop',meta('vscode','Codex Desktop'));a.consume('child',meta({subagent:{}},'codex-tui'));for(const f of ['cli','desktop','child'])a.consume(f,event('task_started',{turn_id:'t'}));}
  assert.equal(desktop.status().activeSessions,1);assert(!desktop.isActive('cli'));
  assert.equal(cli.status().activeSessions,1);assert(cli.isActive('cli'));assert(!cli.isActive('child'));
});
test('per-pet selections do not inherit another source activity',()=>{
  const states={'chatgpt-desktop':{state:'thinking',source:'local-rollout',activeSessions:1,lastEventAt:1},'codex-cli':{state:'working',source:'local-rollout',activeSessions:1,lastEventAt:3},'claude-code':{state:'waiting',source:'local-rollout',activeSessions:1,lastEventAt:2}};
  assert.equal(selectReaction(['chatgpt-desktop'],states).state,'thinking');
  assert.equal(selectReaction(['codex-cli'],states).state,'working');
  assert.equal(selectReaction(['codex-cli'],states).source,'codex-cli');
  assert(!selectReaction(['codex-cli'],states).task.includes('undefined'));
  assert.equal(selectReaction(['claude-code'],states).state,'waiting');
  assert.equal(selectReaction(['codex-cli','claude-code'],states).state,'waiting');
  assert.equal(selectReaction([],states).state,'idle');
  assert.deepEqual(normalizeSources(undefined),['chatgpt-desktop']);
});
test('selected active work dominates old error or completion, unselected waiting cannot block',()=>{
  const states={'chatgpt-desktop':{state:'error',activeSessions:0,lastEventAt:9},'codex-cli':{state:'working',activeSessions:1,lastEventAt:1},'claude-code':{state:'waiting',activeSessions:1,lastEventAt:2}};
  assert.equal(selectReaction(['chatgpt-desktop','codex-cli'],states).state,'working');
});
test('Claude metadata maps thinking, tools, tool result, question and explicit Stop summary',()=>{
  const a=new ClaudeAdapter({now:()=>1000});
  a.consume('f',{type:'user',uuid:'u',message:{content:'PRIVATE'}});assert.equal(a.status().state,'thinking');
  a.consume('f',{type:'assistant',message:{content:[{type:'tool_use',name:'Bash',id:'call',input:'PRIVATE'}]}});assert.equal(a.status().state,'working');
  a.consume('f',{type:'user',message:{content:[{type:'tool_result',tool_use_id:'call',content:'PRIVATE'}]}});assert.equal(a.status().state,'result');
  a.consume('f',{type:'assistant',message:{content:[{type:'tool_use',name:'AskUserQuestion',id:'q'}]}});assert.equal(a.status().state,'waiting');
  a.consume('f',{type:'user',message:{content:[{type:'tool_result',tool_use_id:'q'}]}});assert.equal(a.status().state,'result');
  a.consume('f',{type:'system',subtype:'stop_hook_summary',preventedContinuation:false});assert.equal(a.status().state,'success');
  assert(!JSON.stringify(a.status()).includes('PRIVATE'));
});
test('Claude sidechains, blocked Stop hooks, plain text and duration alone are not completion',()=>{
  const a=new ClaudeAdapter();a.consume('f',{type:'user',uuid:'u',message:{content:'PRIVATE'}});
  a.consume('f',{type:'system',subtype:'stop_hook_summary',isSidechain:true,preventedContinuation:false});
  a.consume('f',{type:'assistant',message:{content:[{type:'text',text:'PRIVATE'}]}});
  a.consume('f',{type:'system',subtype:'turn_duration'});assert.equal(a.status().activeSessions,1);
  a.consume('f',{type:'system',subtype:'stop_hook_summary',preventedContinuation:true});assert.equal(a.status().activeSessions,1);
});
test('Claude idle without a Stop is cancellation, dead processes clear active state, history never celebrates',()=>{
  const a=new ClaudeAdapter();a.consume('f',{type:'user',uuid:'u',message:{content:'PRIVATE'}},{replay:true});
  a.consume('f',{type:'system',subtype:'stop_hook_summary',preventedContinuation:false},{replay:true});assert.equal(a.status().state,'idle');
  a.peer('f','busy');assert.equal(a.status().state,'working');a.peer('f','idle');assert.equal(a.status().state,'idle');
  a.peer('f','waiting');assert.equal(a.status().state,'waiting');a.reset('f');assert.equal(a.status().state,'idle');
});
