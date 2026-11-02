import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,appendFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ClaudeMonitor} from '../src/claude-monitor.mjs';
import {ClaudeAdapter} from '../src/claude-adapter.mjs';
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'deskpet-claude-'));await mkdir(join(root,'sessions'));await mkdir(join(root,'projects','project'),{recursive:true});
  const peer=join(root,'sessions','peer.json'),file=join(root,'projects','project','fake-session.jsonl');
  const state={pid:123,sessionId:'fake-session',entrypoint:'cli',kind:'interactive',status:'busy'};
  await writeFile(peer,JSON.stringify(state));await writeFile(file,JSON.stringify({type:'user',uuid:'old',message:{content:'PRIVATE'}})+'\n'+JSON.stringify({type:'system',subtype:'stop_hook_summary',preventedContinuation:false})+'\n');
  const adapter=new ClaudeAdapter();let alive=true;
  const monitor=new ClaudeMonitor({root,adapter,isAlive:()=>alive});monitor.running=true;
  return {monitor,adapter,peer,file,state,dead:()=>{alive=false;}};
}
test('native CLI peer activates without replaying history and incremental metadata drives reactions',async()=>{
  const f=await fixture();await f.monitor.pump();assert.equal(f.adapter.status().state,'working');
  const bytes=f.monitor.readBytes;
  await appendFile(f.file,JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',id:'q',name:'AskUserQuestion',input:{private:'PRIVATE'}}]}})+'\n');
  await f.monitor.pump();assert.equal(f.adapter.status().state,'waiting');assert(f.monitor.readBytes>bytes);
  await f.monitor.pump();assert(!JSON.stringify(f.adapter.status()).includes('PRIVATE'));f.dead();await f.monitor.pump();assert.equal(f.adapter.status().activeSessions,0);
});
test('a missing peer or unsupported SDK/desktop entry is not treated as a CLI session',async()=>{
  const f=await fixture();await writeFile(f.peer,JSON.stringify({...f.state,entrypoint:'sdk'}));await f.monitor.pump();assert.equal(f.monitor.status().liveCliSessions,0);
  await writeFile(f.peer,JSON.stringify(f.state));await f.monitor.pump();await unlink(f.peer);await f.monitor.pump();assert.equal(f.adapter.status().state,'idle');
});
test('a background Claude Code job is followed like a terminal session; other kinds are not',async()=>{
  const f=await fixture();await writeFile(f.peer,JSON.stringify({...f.state,kind:'bg',jobId:'69e21d33'}));
  await f.monitor.pump();assert.equal(f.monitor.status().liveCliSessions,1);assert.equal(f.adapter.status().state,'working');
  await appendFile(f.file,JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',id:'t',name:'Bash',input:{}}]}})+'\n');
  await f.monitor.pump();assert.equal(f.adapter.status().state,'working');assert.equal(f.adapter.status().activeSessions,1);
  await writeFile(f.peer,JSON.stringify({...f.state,kind:'sdk-worker'}));await f.monitor.pump();assert.equal(f.monitor.status().liveCliSessions,0);
});
test('explicit Claude completion survives a lagging native busy state; idle alone is not success',()=>{
  const a=new ClaudeAdapter();a.peer('f','busy');a.consume('f',{type:'system',subtype:'stop_hook_summary',preventedContinuation:false});
  a.peer('f','busy');assert.equal(a.status().state,'success');assert.equal(a.status().activeSessions,0);
  a.peer('f','idle');a.peer('f','busy');assert.equal(a.status().state,'working');a.peer('f','idle');assert.equal(a.status().state,'idle');
});
test('a fresh short Claude turn completed before first discovery is live, not discarded as history',async()=>{
  const f=await fixture();await writeFile(f.peer,JSON.stringify({...f.state,status:'idle'}));
  const timestamp=new Date().toISOString();
  await writeFile(f.file,JSON.stringify({type:'user',uuid:'fresh-turn',timestamp,message:{content:'PRIVATE'}})+'\n'+JSON.stringify({type:'system',subtype:'stop_hook_summary',preventedContinuation:false,timestamp})+'\n');
  await f.monitor.pump();assert.equal(f.adapter.status().state,'success');assert.equal(f.adapter.status().activeSessions,0);
});
test('a transcript write wakes the monitor at once; the poll is only the fallback',async()=>{
  const f=await fixture();let changes=0;f.monitor.onChange=()=>{changes++;};f.monitor.running=false;f.monitor.pollMs=60000;
  await f.monitor.start();
  try{
    assert.equal(f.adapter.status().state,'working');const before=changes;
    await appendFile(f.file,JSON.stringify({type:'assistant',message:{content:[{type:'tool_use',id:'q',name:'AskUserQuestion',input:{}}]}})+'\n');
    for(let i=0;i<40&&f.adapter.status().state!=='waiting';i++)await new Promise(r=>setTimeout(r,25));
    assert.equal(f.adapter.status().state,'waiting','picked up without waiting for the 60 s poll');assert(changes>before);
  }finally{await f.monitor.close();}
  assert.equal(f.monitor.watchers.length,0);
});
