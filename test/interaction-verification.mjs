// Native check of multi-pet interaction in an isolated instance with synthetic local records and
// two real pet windows at the left of the primary screen. It neither touches the normal data
// folder nor stops the running pets, and no model is called.
//   node test/interaction-verification.mjs delegation   assign → sub-agent work → hand-back → done
//   node test/interaction-verification.mjs social       waiting nudge, cheer, comfort, demos, abort
//   node test/interaction-verification.mjs fish         the fish's own work lines, chat and hand-over lines
//   node test/interaction-verification.mjs lf           the lady and the fish: their paired takes, both ways
//   node test/interaction-verification.mjs launch       new console window and Windows Terminal tabs started with a task
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,appendFile,readdir,open,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {zstdCompressSync} from 'node:zlib';
import {APP_ROOT} from '../src/prepare.mjs';
const scenario=process.argv[2]??'delegation';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const data=join(APP_ROOT,'data','qa',`interaction-${scenario}-${Date.now()}`),dshHome=join(data,'dsh-home'),codex=join(data,'codex-records'),claude=join(data,'claude-records'),qa=join(data,'qa'),frames=join(data,'frames');
await Promise.all([mkdir(codex,{recursive:true}),mkdir(join(claude,'sessions'),{recursive:true}),mkdir(join(data,'dsh-pet'),{recursive:true}),mkdir(qa,{recursive:true}),mkdir(join(dshHome,'sessions'),{recursive:true}),mkdir(frames,{recursive:true})]);
const pet=(id,name,appearance,marginX,extra)=>({id,name,size:400,appearance,balanceEnabled:false,whisperEnabled:false,workStatusEnabled:true,fixedEnabled:false,display:'desktop',position:{corner:'bottom-left',marginX,marginY:54},...extra});
const pets=scenario==='delegation'?[
  pet('qa-claude','测试 · 大小姐','claude-lady',40,{reactionSources:[],interaction:{helperSources:['codex-cli'],idle:false}}),
  pet('qa-dragon','测试 · 龙娘','dragon-girl-D',640,{reactionSources:['codex-cli'],interaction:{idle:false}})
]:scenario==='lf'?[
  pet('qa-claude','测试 · 大小姐','claude-lady',40,{reactionSources:[],interaction:{idle:false}}),
  pet('qa-fish','测试 · 肥鱼','blue-fish',560,{reactionSources:[],interaction:{idle:false}})
]:scenario==='launch'?[
  pet('qa-claude','测试 · 大小姐','claude-lady',40,{reactionSources:['claude-code'],interaction:{helperSources:['claude-code','codex-cli'],idle:false}}),
  pet('qa-dragon','测试 · 龙娘','dragon-girl-D',600,{reactionSources:['chatgpt-desktop'],interaction:{idle:false}})
]:scenario==='relay'?[
  pet('qa-claude','测试 · 大小姐','claude-lady',40,{reactionSources:['claude-code'],interaction:{idle:false}}),
  pet('qa-dragon','测试 · 龙娘','dragon-girl-D',600,{reactionSources:['chatgpt-desktop'],interaction:{idle:false}})
]:scenario==='df'?[
  pet('qa-dragon','测试 · 龙娘','dragon-girl-D',40,{reactionSources:[],interaction:{idle:false}}),
  pet('qa-fish','测试 · 肥鱼','blue-fish',560,{reactionSources:[],interaction:{idle:false}})
]:scenario==='fish'?[
  pet('qa-fish','测试 · 肥鱼','blue-fish',40,{reactionSources:['codex-cli','dsh-desktop'],interaction:{idle:false}}),
  pet('qa-dragon','测试 · 龙娘','dragon-girl-D',600,{reactionSources:['chatgpt-desktop'],interaction:{idle:false}})
]:scenario==='claude'?[
  pet('qa-claude','测试 · 大小姐','claude-lady',40,{reactionSources:['claude-code'],interaction:{idle:false}}),
  pet('qa-fish','测试 · 肥鱼','blue-fish',620,{reactionSources:[],interaction:{helperSources:['claude-code'],idle:false}})
]:[
  pet('qa-claude','测试 · 大小姐','claude-lady',40,{reactionSources:['codex-cli'],interaction:{idle:false}}),
  pet('qa-dragon','测试 · 龙娘','dragon-girl-D',560,{reactionSources:['chatgpt-desktop'],interaction:{idle:false}})
];
await writeFile(join(data,'dsh-pet','main-config.jsonc'),JSON.stringify({pets,physics:{gravity:1400,restitution:0.78,groundFriction:2.5,ceilingBounce:true,throwPower:1,petCollision:false},confineToScreen:false}));
const record=(file,r)=>appendFile(join(codex,file),JSON.stringify({...r,timestamp:new Date().toISOString()})+'\n');
const event=(type,fields={})=>({type:'event_msg',payload:{type,...fields}});
const item=payload=>({type:'response_item',payload});
const runtime=async()=>JSON.parse(await readFile(join(data,'runtime.json'),'utf8'));
async function request(path,body){const rt=await runtime();const r=await fetch(`http://127.0.0.1:${rt.port}${path}`,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json','x-deskpet-capability':rt.capability},body:JSON.stringify(body)});assert(r.ok,path);return r.json();}
let shot=0,serial=Date.now();const log=[];
async function capture(phase) {
  const label=`f${String(++shot).padStart(3,'0')}`;const call=await request('/control/capture',{label});
  for(let i=0;i<40;i++){
    await sleep(120);const rows=[];
    for(const f of await readdir(qa))if(f.startsWith(label+'-')&&f.endsWith('.json')){const r=JSON.parse(await readFile(join(qa,f),'utf8'));if(r.serial===call.serial)rows.push({file:f.replace('.json','.png'),...r});}
    if(rows.length===2){log.push({label,phase,at:Date.now(),rows:rows.map(r=>({png:r.file,bounds:r.bounds,stage:r.stage,lines:r.lines,props:r.props,duet:r.duet,facing:r.facing,pos:r.pos,reaction:r.reaction,videos:r.videos.filter(v=>Number(v.opacity)>0.5).map(v=>v.name)}))});return log.at(-1);}
  }
  throw new Error('capture timeout');
}
async function film(phase,ms){const end=Date.now()+ms;while(Date.now()<end)await capture(phase);}
async function ui(action,values={}) {
  const id=++serial;await writeFile(join(qa,'settings-request.json'),JSON.stringify({serial:id,action,...values}));
  for(let i=0;i<80;i++){await sleep(120);let r;try{r=JSON.parse(await readFile(join(qa,'settings-response.json'),'utf8'));}catch{continue;}if(r.serial===id&&!r.started){assert(!r.error,`UI ${action}`);return r;}}
  throw new Error('UI timeout '+action);
}
const kinds=phase=>new Set(log.filter(f=>f.phase===phase).flatMap(f=>f.rows.map(r=>r.stage?.kind)).filter(Boolean));
const said=phase=>new Set(log.filter(f=>f.phase===phase).flatMap(f=>f.rows.flatMap(r=>r.lines)));
const checks=[];let proc;
try {
  const out=await open(join(data,'runtime.log'),'a');
  proc=spawn(process.execPath,[join(APP_ROOT,'src','main.mjs')],{cwd:APP_ROOT,windowsHide:true,stdio:['ignore',out.fd,out.fd],env:{...process.env,AGENT_MUSUME_DATA:data,AGENT_MUSUME_SESSIONS:codex,AGENT_MUSUME_CLAUDE_HOME:claude,AGENT_MUSUME_DSH_HOME:dshHome,AGENT_MUSUME_STAGE_LOG:'1',AGENT_MUSUME_SETTINGS_QA:['social','fish','lf','df'].includes(scenario)?'1':'0'}});
  for(let i=0;i<120;i++){try{if((await request('/control/status')).sourcesReady)break;}catch{}await sleep(150);}
  if(scenario==='delegation') {
    await record('parent.jsonl',{type:'session_meta',payload:{id:'qa-parent-thread',source:'cli',originator:'codex-tui'}});
    await sleep(3500);
    assert.equal((await capture('boot')).rows.length,2,'two pet windows');
    await record('parent.jsonl',event('task_started',{turn_id:'qa-turn'}));
    await sleep(1600);
    await record('parent.jsonl',item({type:'function_call',name:'spawn_agent',call_id:'qa-spawn',arguments:'{}'}));
    await record('parent.jsonl',item({type:'function_call_output',call_id:'qa-spawn',output:'{"task_name":"qa"}'}));
    await record('child.jsonl',{type:'session_meta',payload:{id:'qa-child-thread',source:{subagent:{thread_spawn:{parent_thread_id:'qa-parent-thread',agent_path:'/root/qa_helper',depth:1}}}}});
    await record('child.jsonl',event('task_started',{turn_id:'qa-child-turn'}));
    await record('child.jsonl',event('exec_command_begin',{call_id:'qa-exec'}));
    await film('assign',17000);
    assert(kinds('assign').has('collab.assign'));
    assert(log.some(f=>f.phase==='assign'&&f.rows.every(r=>r.duet.length&&r.duet[0].currentTime>1)),'both paired layers played');
    assert(log.some(f=>f.phase==='assign'&&f.rows.some(r=>r.reaction?.source==='helper:codex-cli')),'helper pet followed the sub-agent');
    await record('child.jsonl',event('task_complete',{turn_id:'qa-child-turn'}));
    await record('parent.jsonl',item({type:'agent_message',author:'/root/qa_helper',recipient:'/root',content:[]}));
    await film('deliver',13000);
    assert(kinds('deliver').has('collab.deliver'));assert(log.some(f=>f.phase==='deliver'&&f.rows.every(r=>r.duet.length)),'the result is handed over in the paired take');
    await record('parent.jsonl',event('task_complete',{turn_id:'qa-turn'}));
    await film('complete',7000);
    assert(kinds('complete').has('collab.complete'));
    checks.push('assign-paired-take','helper-follows-subagent','deliver-folder','team-complete');
  } else if(scenario==='lf'||scenario==='df') {
    // Every kind of hand-over between the two plays as a paired take; the directed ones twice, so each leads once.
    await sleep(3500);
    assert.equal((await capture('boot')).rows.length,2,'two pet windows');
    for(const [phase,kind] of [['assign-1','collab.assign'],['assign-2','collab.assign'],['deliver-1','collab.deliver'],['deliver-2','collab.deliver'],['complete','collab.complete'],['failed-1','collab.failed'],['failed-2','collab.failed']]){
      await ui('stage-demo',{kind});
      await film(phase,13000);
      assert(kinds(phase).has(kind),phase);
      assert(log.some(f=>f.phase===phase&&f.rows.every(r=>r.duet.length)),'both pets played their layer of the paired take: '+phase);
      await sleep(4000);
    }
    checks.push(scenario==='lf'?'lady-fish-paired-takes':'dragon-fish-paired-takes');
  } else if(scenario==='fish') {
    // The fish speaks in its own voice: persona work lines with the session above them, chat stays light.
    await record('cli.jsonl',{type:'session_meta',payload:{id:'qa-cli',source:'cli',originator:'codex-tui'}});
    await sleep(3500);
    assert.equal((await capture('boot')).rows.length,2,'two pet windows');
    // Every work state in turn, a question left long enough for the first reminder, then chat and a hand-over.
    await record('cli.jsonl',event('task_started',{turn_id:'t1'}));
    await film('thinking',2500);
    await record('cli.jsonl',event('exec_command_begin',{turn_id:'t1',call_id:'x'}));
    await film('working',2500);
    await record('cli.jsonl',item({type:'function_call_output',call_id:'x',output:'ok'}));
    await film('result',2500);
    await record('cli.jsonl',event('request_user_input',{turn_id:'t1',call_id:'ask'}));
    await film('waiting',2500);
    await record('cli.jsonl',event('user_input_received',{turn_id:'t1'}));await sleep(800);
    await record('cli.jsonl',event('task_complete',{turn_id:'t1'}));
    await film('success',2500);
    await record('cli.jsonl',event('task_started',{turn_id:'t2'}));await sleep(1200);
    await record('cli.jsonl',event('task_failed',{turn_id:'t2'}));
    await film('error',2500);
    await record('cli.jsonl',event('task_started',{turn_id:'t3'}));await sleep(800);
    await record('cli.jsonl',event('request_user_input',{turn_id:'t3',call_id:'ask3'}));
    await sleep(30500);
    await film('reminder',2500);
    await record('cli.jsonl',event('user_input_received',{turn_id:'t3'}));await sleep(800);
    await record('cli.jsonl',event('task_complete',{turn_id:'t3'}));await sleep(10000);
    // DeepSeek Harness: its compressed session record, a frame per event, followed like the original plugin stream.
    const dshDir=join(dshHome,'sessions','--D-qa--','session-qa');await mkdir(dshDir,{recursive:true});
    let dshSeq=0;const dsh=(type,d={})=>appendFile(join(dshDir,'session.v4.jsonl.zstd'),zstdCompressSync(Buffer.from(JSON.stringify({type,seq:++dshSeq,time:Date.now(),data:d})+'\n')));
    await dsh('turn/start',{turn:1});await dsh('step/start',{turn:1,step:1});
    await film('dsh-thinking',2500);
    await dsh('tool/call',{turn:1,step:1,callId:'d1',name:'pwsh'});
    await film('dsh-working',2500);
    assert(log.some(f=>f.phase==='dsh-working'&&f.rows.some(r=>r.reaction?.source==='dsh-desktop'&&r.reaction?.state==='working')),'the fish follows the DSH session');
    await dsh('tool/result',{turn:1,step:1,toolCallId:'d1'});await dsh('turn/end',{turn:1,reason:{kind:'completed'}});
    await sleep(10000);
    checks.push('fish-follows-dsh');
    await ui('stage-demo',{kind:'social.chat'});
    await film('chat',9000);
    assert(kinds('chat').has('social.chat'));
    await sleep(5000);
    await ui('stage-demo',{kind:'collab.assign'});
    await film('demo-assign',9000);
    assert(kinds('demo-assign').has('collab.assign'));
    const fishLines=[...said('chat'),...said('demo-assign')].join(' ');
    assert(/白饭|近路|歇会|躺会|摸鱼|拜托|G姐|克洛德/.test(fishLines),'the fish speaks in its own voice: '+fishLines);
    checks.push('fish-persona-lines');
  } else if(scenario==='claude') {
    // A live interactive Claude Code peer (this test process) with an async Agent sub-agent.
    const projects=join(claude,'projects','qa'),main=join(projects,'qa-session.jsonl'),agents=join(projects,'qa-session','subagents');
    await mkdir(agents,{recursive:true});await writeFile(main,'');
    const peer=status=>writeFile(join(claude,'sessions','qa.json'),JSON.stringify({sessionId:'qa-session',pid:process.pid,entrypoint:'cli',kind:'interactive',status}));
    const line=(file,r)=>appendFile(file,JSON.stringify({...r,timestamp:new Date().toISOString()})+'\n');
    await peer('idle');await sleep(3500);
    assert.equal((await capture('boot')).rows.length,2,'two pet windows');
    await line(main,{type:'user',uuid:'u1',message:{content:'synthetic'}});await peer('busy');await sleep(1500);
    await line(main,{type:'assistant',message:{content:[{type:'tool_use',name:'Agent',id:'tu-qa',input:{}}]}});
    await line(main,{type:'user',toolUseResult:{status:'async_launched',agentId:'aqa'},message:{content:[{type:'tool_result',tool_use_id:'tu-qa',content:'launched'}]}});
    await writeFile(join(agents,'agent-aqa.meta.json'),JSON.stringify({toolUseId:'tu-qa'}));
    await line(join(agents,'agent-aqa.jsonl'),{type:'assistant',isSidechain:true,agentId:'aqa',message:{content:[{type:'tool_use',name:'Read',id:'r1'}]}});
    await film('assign',14000);
    assert(kinds('assign').has('collab.assign'));
    assert(log.some(f=>f.phase==='assign'&&f.rows.some(r=>r.reaction?.source==='helper:claude-code')),'fish followed the Claude sub-agent');
    assert(log.some(f=>f.phase==='assign'&&f.rows.every(r=>r.duet.length)),'the task is handed over in the paired take');
    await line(main,{type:'user',origin:{kind:'peer',from:'aqa',handback:true},message:{content:'hand-back'}});
    await film('deliver',13000);
    assert(kinds('deliver').has('collab.deliver'));
    await line(main,{type:'assistant',message:{stop_reason:'end_turn',content:[{type:'text',text:'done'}]}});
    await line(main,{type:'system',subtype:'turn_duration'});
    await film('complete',7000);
    assert(kinds('complete').has('collab.complete'));
    checks.push('claude-agent-assign','fish-follows-subagent','claude-handback-deliver','claude-team-complete');
  } else if(scenario==='relay') {
    // Hand-overs to an agent that is already open, played by stand-in processes (test/fixtures/fake-harness.cs, no
    // model): ChatGPT types into a terminal pane where Claude Code runs, Claude queues a message for a ChatGPT desktop
    // session, ChatGPT presses keys in a Herdr pane. The recipient's turn is written by this test.
    const fakes=join(data,'fakes'),as=(folder,name)=>join(fakes,folder,name);
    await mkdir(fakes,{recursive:true});
    await new Promise((resolve,reject)=>spawn('C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',['-nologo','-out:'+join(fakes,'fake.exe'),join(APP_ROOT,'test','fixtures','fake-harness.cs')],{windowsHide:true,stdio:'ignore'}).on('exit',c=>c===0?resolve():reject(new Error('csc '+c))));
    for(const [folder,name] of [['OpenAI.Codex','ChatGPT.exe'],['claude','claude.exe'],['term','MyTerminal.exe'],['codex','codex.exe'],['herdr','herdr.exe']]){await mkdir(join(fakes,folder),{recursive:true});await writeFile(as(folder,name),await readFile(join(fakes,'fake.exe')));}
    const harness=(exe,...command)=>spawn(exe,['1500','0','--spawn',...command],{windowsHide:true,stdio:'ignore'});
    const projects=join(claude,'projects','qa'),main=join(projects,'qa-session.jsonl');await mkdir(projects,{recursive:true});await writeFile(main,'');
    const peer=status=>writeFile(join(claude,'sessions','qa.json'),JSON.stringify({sessionId:'qa-session',pid:process.pid,entrypoint:'cli',kind:'interactive',status}));
    const line=(file,r)=>appendFile(file,JSON.stringify({...r,timestamp:new Date().toISOString()})+'\n');
    const thread='019f5bc0-a9cb-76b2-922e-ea1d48f629b1',desktop=`rollout-2026-11-03T00-00-00-${thread}.jsonl`;
    await record(desktop,{type:'session_meta',payload:{id:thread,source:'vscode',originator:'Codex Desktop'}});
    await peer('idle');await sleep(3500);
    assert.equal((await capture('boot')).rows.length,2,'two pet windows');
    harness(as('OpenAI.Codex','ChatGPT.exe'),as('term','MyTerminal.exe'),'cli','send-text','--pane-id','3','synthetic task');
    await sleep(1200);await line(main,{type:'user',uuid:'u-pane',message:{content:'synthetic'}});await peer('busy');
    await film('pane-assign',14000);assert(kinds('pane-assign').has('collab.assign'),'typing into the Claude pane is an assignment');
    await line(main,{type:'assistant',message:{stop_reason:'end_turn',content:[{type:'text',text:'done'}]}});await line(main,{type:'system',subtype:'turn_duration'});await peer('idle');
    await film('pane-deliver',13000);assert(kinds('pane-deliver').has('collab.deliver'),'the end of that Claude turn is the hand-back');
    harness(as('claude','claude.exe'),as('codex','codex.exe'),'queue','--thread',thread,'--message','synthetic');
    await sleep(1200);await record(desktop,event('task_started',{turn_id:'qa-queued'}));
    await film('queue-assign',14000);assert(kinds('queue-assign').has('collab.assign'),'a queued message is an assignment once the desktop session takes it up');
    await record(desktop,event('task_complete',{turn_id:'qa-queued'}));
    await film('queue-deliver',13000);assert(kinds('queue-deliver').has('collab.deliver'));
    harness(as('OpenAI.Codex','ChatGPT.exe'),as('herdr','herdr.exe'),'agent','send-keys','wD:p9','synthetic','text');
    await film('keys-typing',9000);assert(!kinds('keys-typing').has('collab.assign'),'text still waiting for Enter is not a task');
    // The stand-in Herdr reports this Claude session for its pane, so Enter is a task when that session starts a turn.
    harness(as('OpenAI.Codex','ChatGPT.exe'),as('herdr','herdr.exe'),'agent','send-keys','wD:p9','Enter');
    await sleep(1200);await line(main,{type:'user',uuid:'u-keys',message:{content:'synthetic'}});await peer('busy');
    await film('keys-assign',14000);assert(kinds('keys-assign').has('collab.assign'),'Enter that starts a turn of the pane agent is an assignment');
    await line(main,{type:'assistant',message:{stop_reason:'end_turn',content:[{type:'text',text:'done'}]}});await line(main,{type:'system',subtype:'turn_duration'});await peer('idle');
    await film('keys-deliver',13000);assert(kinds('keys-deliver').has('collab.deliver'),'the end of that turn is the hand-back');
    checks.push('pane-text-handover','codex-queue-handover','herdr-keys-handover','typing-without-enter-ignored');
  } else if(scenario==='launch') {
    // Sessions started with a task in a new window or tab, played by stand-in programs (test/fixtures/fake-harness.cs, no
    // model): ChatGPT opens a new console window that runs Claude Code (cmd start), then asks Windows Terminal, already
    // open, for tabs that run Codex and Claude Code; those run under the terminal, not under ChatGPT. The windows show for
    // a few seconds each. The sessions' turns are written by this test.
    const fakes=join(data,'fakes'),as=(folder,name)=>join(fakes,folder,name);
    await mkdir(fakes,{recursive:true});
    await new Promise((resolve,reject)=>spawn('C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',['-nologo','-out:'+join(fakes,'fake.exe'),join(APP_ROOT,'test','fixtures','fake-harness.cs')],{windowsHide:true,stdio:'ignore'}).on('exit',c=>c===0?resolve():reject(new Error('csc '+c))));
    for(const [folder,name] of [['OpenAI.Codex','ChatGPT.exe'],['claude','claude.exe'],['codex','codex.exe'],['holder','holder.exe']]){await mkdir(join(fakes,folder),{recursive:true});await writeFile(as(folder,name),await readFile(join(fakes,'fake.exe')));}
    const harness=(...command)=>spawn(as('OpenAI.Codex','ChatGPT.exe'),['1500','0','--spawn',...command],{windowsHide:true,stdio:'ignore'});
    const session=async folder=>{for(let i=0;i<150;i++){const pid=Number(await readFile(as(folder,'pid.txt'),'utf8').catch(()=>''));if(pid)return pid;await sleep(200);}throw new Error('no session started in '+folder);};
    const close=async folder=>{await writeFile(as(folder,'done.txt'),'');await sleep(800);await rm(as(folder,'pid.txt'),{force:true});await rm(as(folder,'done.txt'),{force:true});};
    const parentOf=async pid=>(await new Promise(resolve=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}";(Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)").Name`],{windowsHide:true},(e,out)=>resolve(String(out??''))))).trim();
    const projects=join(claude,'projects','qa');await mkdir(projects,{recursive:true});
    const line=(file,r)=>appendFile(file,JSON.stringify({...r,timestamp:new Date().toISOString()})+'\n');
    // Claude Code registers the session under its process id, then the turn starts.
    const claudeTurn=async(pid,id)=>{
      const main=join(projects,id+'.jsonl'),peer=status=>writeFile(join(claude,'sessions',`${pid}.json`),JSON.stringify({sessionId:id,pid,entrypoint:'cli',kind:'interactive',status}));
      await writeFile(main,'');await peer('idle');await sleep(1500);
      await line(main,{type:'user',uuid:'u-'+id,message:{content:'synthetic'}});await peer('busy');
      return async()=>{await line(main,{type:'assistant',message:{stop_reason:'end_turn',content:[{type:'text',text:'done'}]}});await line(main,{type:'system',subtype:'turn_duration'});await peer('idle');};
    };
    try{
      await sleep(3500);assert.equal((await capture('boot')).rows.length,2,'two pet windows');
      // A terminal window that is open already, started by nobody's harness.
      spawn('wt.exe',['-w','agent-musume-qa','nt',as('holder','holder.exe'),'hold'],{windowsHide:true,stdio:'ignore'});await session('holder');await sleep(1500);
      harness('cmd.exe','/c','start','','cmd','/c',as('claude','claude.exe'),'synthetic task');
      const windowed=await session('claude'),windowParent=await parentOf(windowed),endWindow=await claudeTurn(windowed,'qa-window');
      await film('window-assign',14000);assert(kinds('window-assign').has('collab.assign'),'a new console window that starts Claude Code with a task is an assignment');
      await endWindow();await film('window-deliver',13000);assert(kinds('window-deliver').has('collab.deliver'),'the end of its first turn is the hand-back');
      await close('claude');
      harness('wt.exe','-w','agent-musume-qa','nt',as('codex','codex.exe'),'synthetic task');
      const codexTab=await session('codex'),codexParent=await parentOf(codexTab);
      assert(!/ChatGPT|cmd/i.test(codexParent),'the Codex tab runs under the terminal: '+codexParent);
      const thread='019f5bc0-a9cb-76b2-922e-ea1d48f62000',rollout=`rollout-2026-11-04T00-00-00-${thread}.jsonl`;
      await record(rollout,{type:'session_meta',payload:{id:thread,source:'cli',originator:'codex-tui'}});await sleep(1200);
      await record(rollout,event('task_started',{turn_id:'qa-tab'}));
      await film('codex-tab-assign',14000);assert(kinds('codex-tab-assign').has('collab.assign'),'a Windows Terminal tab that runs Codex with a task is an assignment');
      await record(rollout,event('task_complete',{turn_id:'qa-tab'}));
      await film('codex-tab-deliver',13000);assert(kinds('codex-tab-deliver').has('collab.deliver'),'the end of its first turn is the hand-back');
      await close('codex');
      harness('wt.exe','-w','agent-musume-qa','nt',as('claude','claude.exe'),'synthetic task');
      const claudeTab=await session('claude'),claudeParent=await parentOf(claudeTab),endTab=await claudeTurn(claudeTab,'qa-tab');
      await film('claude-tab-assign',14000);assert(kinds('claude-tab-assign').has('collab.assign'),'a Windows Terminal tab that runs Claude Code with a task is an assignment');
      await endTab();await film('claude-tab-deliver',13000);assert(kinds('claude-tab-deliver').has('collab.deliver'));
      checks.push(`new-window-handover (session under ${windowParent})`,`wt-tab-codex-handover (session under ${codexParent})`,`wt-tab-claude-handover (session under ${claudeParent})`);
    }finally{for(const folder of ['claude','codex','holder'])await writeFile(as(folder,'done.txt'),'').catch(()=>{});}
  } else {
    await record('cli.jsonl',{type:'session_meta',payload:{id:'qa-cli',source:'cli',originator:'codex-tui'}});
    await record('desktop.jsonl',{type:'session_meta',payload:{id:'qa-desktop',source:'vscode',originator:'Codex Desktop'}});
    await sleep(3500);
    assert.equal((await capture('boot')).rows.length,2,'two pet windows');
    await record('cli.jsonl',event('task_started',{turn_id:'cli'}));await sleep(1200);
    await record('cli.jsonl',event('request_user_input',{turn_id:'cli',call_id:'ask'}));
    await film('nudge',5000);
    assert(kinds('nudge').has('social.nudge'));assert([...said('nudge')].some(t=>t.includes('大小姐等你')),'dragon points at the waiting lady');
    await record('cli.jsonl',event('user_input_received',{turn_id:'cli'}));await sleep(800);
    await record('cli.jsonl',event('task_complete',{turn_id:'cli'}));
    await film('cheer',6000);
    assert(kinds('cheer').has('social.cheer'));
    await record('desktop.jsonl',event('task_started',{turn_id:'d'}));await sleep(900);
    await record('desktop.jsonl',event('task_failed',{turn_id:'d'}));
    await film('comfort',6000);
    assert(kinds('comfort').has('social.comfort'));
    await ui('open-from-menu');await ui('scroll',{y:470});
    await ui('interaction-preview',{kind:'social.chat'});
    await film('chat',12000);
    assert(kinds('chat').has('social.chat'));assert([...said('chat')].some(t=>t.startsWith('演示')),'demo lines are marked');
    await sleep(6000);
    await ui('interaction-preview',{kind:'collab.assign'});
    await film('demo-assign',11000);
    assert(kinds('demo-assign').has('collab.assign'));
    await sleep(6000);
    await ui('interaction-preview',{kind:'collab.deliver'});
    await sleep(900);
    await ui('open-from-menu');
    await film('abort',2500);
    const tail=log.filter(f=>f.phase==='abort').at(-1);
    assert(tail.rows.every(r=>!r.stage),'a menu during a performance releases both pets');
    // Roles are set in the settings page and survive the save-and-rebuild path.
    await ui('select-pet',{index:1});await ui('set-helpers',{sources:['codex-cli']});await ui('save');
    let saved;for(let i=0;i<60;i++){await sleep(250);try{saved=JSON.parse(await readFile(join(data,'dsh-pet','main-config.jsonc'),'utf8'));if(saved.pets[1].interaction?.helperSources?.includes('codex-cli'))break;}catch{}}
    assert.deepEqual(saved.pets[1].interaction.helperSources,['codex-cli']);assert.deepEqual(saved.pets[0].interaction.helperSources,[]);
    assert.equal(saved.pets[1].interaction.idle,false,'other interaction switches kept');
    await sleep(5000);assert.equal((await capture('after-save')).rows.length,2,'pets rebuilt after saving roles');
    checks.push('waiting-nudge','success-cheer','error-comfort','settings-demo-chat','settings-demo-assign','menu-abort','settings-save-roles');
  }
} finally {
  await writeFile(join(frames,'frames.json'),JSON.stringify({qa,log},null,1));
  try{await request('/control/stop',{});}catch{}
  await sleep(2500);try{proc?.kill();}catch{}
}
console.log(JSON.stringify({scenario,data,frames:log.length,checks,director:(await readFile(join(qa,'director.log'),'utf8').catch(()=>'')).trim().split('\n')},null,1));
