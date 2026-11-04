import { createServer as nativeCreateServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdir,open,readFile,writeFile,unlink,stat } from 'node:fs/promises';
import { readFileSync,unlinkSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { APP_ROOT,NO_ELECTRON,electronPath,prepare } from './prepare.mjs';
import { DEFAULT_CONFIG } from './default-config.mjs';
import { RolloutAdapter } from './rollout-adapter.mjs';
import { RolloutWatcher } from './rollout-watcher.mjs';
import { ClaudeAdapter } from './claude-adapter.mjs';
import { ClaudeMonitor } from './claude-monitor.mjs';
import { DshAdapter } from './dsh-adapter.mjs';
import { DshMonitor } from './dsh-monitor.mjs';
import { requestGate,stripWildcardCors } from './request-gate.mjs';
import { PANEL } from './panel.mjs';
import {LiveWriterEvidence,SessionSourceRouter} from './session-source-router.mjs';
import {CollabTracker} from './collab-tracker.mjs';
import {HandoffTracker} from './handoffs.mjs';
import {HarnessMonitor} from './harness-monitor.mjs';
import {SessionTurns} from './session-turns.mjs';
import {installHandoffSkill} from './handoff-install.mjs';

const data=process.env.AGENT_MUSUME_DATA??join(APP_ROOT,'data');
await mkdir(data,{recursive:true});
const lockPath=join(data,'process.lock');
try {
  const lock=await open(lockPath,'wx');await lock.writeFile(String(process.pid));await lock.close();
} catch(error) {
  if(error.code!=='EEXIST')throw error;
  const pid=Number(await readFile(lockPath,'utf8').catch(()=>''));
  let alive=false;try{if(Number.isSafeInteger(pid)&&pid>0){process.kill(pid,0);alive=true;}}catch{}
  if(alive){console.log('桌宠已经运行。');process.exit(0);}
  await unlink(lockPath);
  const lock=await open(lockPath,'wx');await lock.writeFile(String(process.pid));await lock.close();
}
process.on('exit',()=>{
  for(const file of [join(data,'runtime.json'),lockPath])try{
    const text=readFileSync(file,'utf8');const owner=file===lockPath?Number(text):JSON.parse(text).pid;
    if(owner===process.pid)unlinkSync(file);
  }catch{}
});

const vendor=await prepare();
const electron=electronPath();
if(!electron||!await stat(electron).catch(()=>null))throw new Error(NO_ELECTRON);
await mkdir(join(data,'dsh-pet'),{recursive:true});
await mkdir(join(data,'qa'),{recursive:true});
const configPath=join(data,'dsh-pet','main-config.jsonc');
try {
  await writeFile(configPath,JSON.stringify(DEFAULT_CONFIG,null,2)+'\n',{flag:'wx'});
}catch(error){if(error.code!=='EEXIST')throw error;}
// The pet host keeps its own files under data; DeepSeek Harness's real home (its session records) is read before that.
const dshHome=process.env.AGENT_MUSUME_DSH_HOME??process.env.DSH_HOME??join(homedir(),'.dsh');
process.env.DSH_HOME=data;
process.env.DSH_PET_ELECTRON_PATH=electron;
process.env.DSH_PET_DEBUG='0';
process.env.AGENT_MUSUME_DATA=data;
delete process.env.ELECTRON_RUN_AS_NODE;

const capability=randomBytes(32).toString('base64url');
process.env.AGENT_MUSUME_BRIDGE_CAPABILITY=randomBytes(32).toString('base64url');
const bus=new EventEmitter();
globalThis[Symbol.for('agent-musume.events')]=bus;
let demo=null,demoTimer,watcher,claudeMonitor,dshMonitor,sourceEvidence,sourceTimer,sourceRefreshBusy=false,stopping=false,sourcesReady=false,serverPort=0,captureSerial=Date.now();
// Live session turns, for hand-overs to an agent already open (a terminal pane, a Codex queue).
const turns=new SessionTurns(),onTurn=turn=>turns.record(turn);
const adapter=new RolloutAdapter({emit:(...args)=>{if(!demo)bus.emit(...args);},onTurn});
const codexCli=new RolloutAdapter({sourceKind:'codex-cli',onTurn});
const claudeCli=new ClaudeAdapter({onTurn});
const dsh=new DshAdapter({onTurn});
const collab=new CollabTracker();
const handoffs=new HandoffTracker({collab});
const harnessMonitor=new HarnessMonitor({tracker:handoffs,turns,data,onChange:()=>notifyReactions()});
const sourceStates=()=>({'chatgpt-desktop':adapter.status(),'codex-cli':codexCli.status(),'claude-code':claudeCli.status(),'dsh-desktop':dsh.status()});
const emitDemo=(type,fields={})=>bus.emit('session/event',{id:'manual-preview',header:{id:'manual-preview'}},{type,seq:Date.now(),data:fields});
const json=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj));};
// What the pets react to. The pet process keeps one request open (?wait=<rev>) and gets the next revision the
// moment it differs; rev starts at the clock so a restarted host never repeats an old revision.
let reactionRev=Date.now(),reactionKey='',notifyQueued=false;const reactionWaiters=new Set();
const reactionState=()=>({sources:sourceStates(),helpers:collab.status().helpers,collab:{seq:collab.seq,events:collab.events.slice(-16)},demo:demo?{state:demo.state,label:demo.label}:null});
function reactions(){const state=reactionState(),key=JSON.stringify(state);if(key!==reactionKey){reactionKey=key;reactionRev++;}return {rev:reactionRev,...state};}
function notifyReactions(){
  if(notifyQueued)return;notifyQueued=true;
  setImmediate(()=>{notifyQueued=false;const before=reactionRev,next=reactions();if(next.rev!==before)for(const answer of [...reactionWaiters])answer(next);});
}
setInterval(notifyReactions,1000).unref(); // terminal states and helper results expire with time, not with a record
const VERSION=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
const snapshot=()=>({application:'agent-musume',version:VERSION,...adapter.status(),mode:demo?'demo':'live',demoLabel:demo?.label??null,watcher:watcher?.status()??{running:false,sourceAvailable:false},dsh:dshMonitor?.status()??{running:false,sourceAvailable:false},sourceRouting:sourceEvidence?.status()??{available:false},sourcesReady,sources:sourceStates(),claudeWatcher:claudeMonitor?.status()??{running:false,sourceAvailable:false},handoffs:handoffs.status(),harnessWatcher:harnessMonitor.status()});
function endDemo() {
  if(!demo)return;clearTimeout(demoTimer);demo=null;
  emitDemo('turn/end',{reason:{kind:'aborted'}});adapter.republish();notifyReactions();
}
function preview(state) {
  const types={thinking:'turn/start',working:'tool/call',result:'tool/result',waiting:'approval/asked',success:'turn/end',error:'turn/end'};
  if(!types[state])return false;
  endDemo();
  adapter.hideFromHost();
  const labels={thinking:'思考',working:'忙碌',result:'整理',waiting:'等待',success:'完成',error:'出错'};
  demo={state,label:labels[state]};
  emitDemo('turn/start');
  emitDemo(types[state],state==='success'?{reason:{kind:'completed'}}:state==='error'?{reason:{kind:'error'}}:state==='working'?{name:'preview'}:{});
  emitDemo('todo/write',{todos:[{status:'in_progress',content:`演示：${labels[state]}`} ]});
  demoTimer=setTimeout(endDemo,12000);notifyReactions();return true;
}
async function stop() {
  if(stopping)return;stopping=true;clearTimeout(demoTimer);clearInterval(sourceTimer);sourceEvidence?.close();harnessMonitor.close();
  await watcher?.close();
  await claudeMonitor?.close();
  await dshMonitor?.close();
  process.emit('SIGTERM');
  setTimeout(()=>process.exit(0),3500).unref();
}
async function body(req,res) {
  if(Number(req.headers['content-length']??0)>8192){json(res,413,{error:'请求过大'});req.resume();return null;}
  let content='';for await(const chunk of req){content+=chunk;if(Buffer.byteLength(content)>8192){json(res,413,{error:'请求过大'});return null;}}
  try{return content?JSON.parse(content):{};}catch{json(res,400,{error:'请求格式无效'});return null;}
}
async function controls(req,res,path) {
  if(path==='/'&&req.method==='GET') {res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"});res.end(PANEL);return true;}
  if(path==='/control/status'&&req.method==='GET'){json(res,200,snapshot());return true;}
  if(path==='/control/reactions'&&req.method==='GET') {
    const now=reactions(),wait=Number(new URL(req.url,'http://127.0.0.1').searchParams.get('wait'));
    if(wait!==now.rev){json(res,200,now);return true;}
    const answer=next=>{clearTimeout(timer);reactionWaiters.delete(answer);if(!res.writableEnded)json(res,200,next);};
    const timer=setTimeout(()=>answer(reactions()),20000);
    reactionWaiters.add(answer);res.on('close',()=>{clearTimeout(timer);reactionWaiters.delete(answer);});
    return true;
  }
  if(!path.startsWith('/control/'))return false;
  if(req.method!=='POST'){json(res,405,{error:'方法不支持'});return true;}
  const input=await body(req,res);if(input===null)return true;
  if(path==='/control/handoff'){const result=handoffs.consume(input);json(res,result.ok?200:400,result);notifyReactions();}
  else if(path==='/control/install-handoff-skill'){
    try{json(res,200,await installHandoffSkill({roots:[join(process.env.CODEX_HOME??join(homedir(),'.codex'),'skills'),join(process.env.CLAUDE_CONFIG_DIR??join(homedir(),'.claude'),'skills'),join(dshHome,'skills')]}));}
    catch{json(res,409,{ok:false,error:'已有同名文件或技能目录不可写，未覆盖。'});}
  }
  else if(path==='/control/stop'){json(res,200,{ok:true});setImmediate(()=>void stop());}
  else if(path==='/control/preview'){json(res,preview(input.state)?200:400,{ok:!!demo});}
  else if(path==='/control/live'){endDemo();json(res,200,{ok:true});}
  else if(path==='/control/capture') {
    const label=String(input.label??'capture').replace(/[^a-z0-9_-]/gi,'').slice(0,50)||'capture';
    const serial=++captureSerial;await writeFile(join(data,'qa','capture-request.json'),JSON.stringify({serial,label}));json(res,200,{ok:true,serial});
  } else json(res,404,{error:'未找到控制操作'});
  return true;
}
globalThis[Symbol.for('agent-musume.host')]={createServer(handler) {
  const server=nativeCreateServer((req,res)=>{
    stripWildcardCors(res);
    let path;try{path=new URL(req.url,'http://127.0.0.1').pathname;if(!requestGate(req,capability)){json(res,403,{error:'不允许的本机请求'});return;}}catch{json(res,400,{error:'请求无效'});return;}
    void controls(req,res,path).then(handled=>{if(!handled)handler(req,res);}).catch(()=>{if(!res.headersSent)json(res,500,{error:'本机操作未完成'});else res.end();});
  });
  server.once('listening',()=>{
    serverPort=server.address().port;
    process.env.AGENT_MUSUME_PANEL_URL=`http://127.0.0.1:${serverPort}/`;
    writeFileSync(join(data,'runtime.json'),JSON.stringify({pid:process.pid,port:serverPort,capability},null,2),{mode:0o600});
    setTimeout(async()=>{
      if(stopping)return;
      sourceEvidence=new LiveWriterEvidence({database:join(process.env.CODEX_HOME??join(homedir(),'.codex'),'logs_2.sqlite')});
      await sourceEvidence.refresh();if(stopping)return;
      const router=new SessionSourceRouter({desktop:adapter,cli:codexCli,lookup:id=>sourceEvidence.lookup(id)});
      sourceTimer=setInterval(async()=>{if(sourceRefreshBusy||stopping)return;sourceRefreshBusy=true;try{await sourceEvidence.refresh()}finally{sourceRefreshBusy=false}},5000);
      watcher=new RolloutWatcher({root:process.env.AGENT_MUSUME_SESSIONS??join(process.env.CODEX_HOME??join(homedir(),'.codex'),'sessions'),onRecord:(file,r,options)=>{router.consume(file,r,options);collab.consumeCodex(file,r,options,router.sourceOf(file));notifyReactions();},onReplayDone:file=>router.finishReplay(file),onReset:file=>{router.reset(file);collab.reset(file);notifyReactions();},isActive:file=>adapter.isActive(file)||codexCli.isActive(file)});
      claudeMonitor=new ClaudeMonitor({root:process.env.AGENT_MUSUME_CLAUDE_HOME??process.env.CLAUDE_CONFIG_DIR??join(homedir(),'.claude'),adapter:claudeCli,collab,onChange:notifyReactions});
      // DeepSeek Harness desktop: its own session records, followed like the others (the original fish's source).
      dshMonitor=new DshMonitor({root:dshHome,adapter:dsh,onChange:notifyReactions});
      await Promise.all([watcher.start(),claudeMonitor.start(),dshMonitor.start()]);harnessMonitor.start();sourcesReady=true;console.log('桌面、Codex CLI、Claude Code CLI 与 DeepSeek Harness 本地会话和跨工具交接监听已启动。');
    },350);
  });
  return server;
}};
process.on('SIGTERM',()=>{stopping=true;clearTimeout(demoTimer);clearInterval(sourceTimer);sourceEvidence?.close();harnessMonitor.close();void watcher?.close();void claudeMonitor?.close();void dshMonitor?.close();});
process.on('SIGINT',()=>void stop());
process.argv=[process.execPath,join(vendor,'lib','standalone.patched.mjs'),'--port','31471'];
await import(pathToFileURL(join(vendor,'lib','standalone.patched.mjs')).href);
