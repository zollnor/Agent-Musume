import { createHash } from 'node:crypto';

const LABELS = Object.freeze({thinking:'正在思考',working:'正在执行工具',result:'正在整理工具结果',success:'已交回结果',error:'子任务未完成',idle:'暂无子任务'});
const CLAUDE_AGENT_TOOLS = new Set(['Agent','Task']);
const FAILED = new Set(['failed','killed','error','cancelled','canceled','aborted']);
const STALE_MS = 30*60*1000;
const MAX_EVENTS = 48;

const key = (...parts) => createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0,16);
const timeOf = (record,fallback) => {const t=Date.parse(record?.timestamp??'');return Number.isFinite(t)?t:fallback;};

/**
 * Delegation evidence between a main agent and its sub-agents.
 * Reads only tool names, call ids, status codes, agent paths and timestamps. Prompts, tool
 * arguments, outputs and messages are never kept or forwarded; ids leave this module hashed.
 *
 * Event kinds: task.assigned (sub-agent confirmed started), result.delivered (sub-agent finished
 * and its result reached the parent), task.failed (delegation or sub-agent failed).
 */
export class CollabTracker {
  constructor({now=Date.now}={}) {
    this.now=now;this.seq=0;this.events=[];this.emitted=new Set();
    this.threads=new Map();      // codex thread id -> {file, source}
    this.codexFiles=new Map();   // file -> {role:'parent'|'child'|'other', ...}
    this.codexChildren=new Map();// agent path -> child info
    this.claude=new Map();       // session key -> {pending:Map(toolUseId->{at}), agents:Map(agentId->toolUseId)}
    this.children=new Map();     // child key -> {source,state,active,at,observedAt}
  }

  // ---------- Codex ----------
  noteThread(id,file,source) {if(typeof id==='string'&&id)this.threads.set(id,{file,source});}
  consumeCodex(file,record,{replay=false}={},source=null) {
    if(!record||typeof record!=='object')return;
    const p=record.payload;if(!p||typeof p!=='object')return;
    if(record.type==='session_meta') {
      const spawn=p.source?.subagent?.thread_spawn;
      if(spawn&&typeof spawn.parent_thread_id==='string') {
        const info={role:'child',parent:spawn.parent_thread_id,path:typeof spawn.agent_path==='string'?spawn.agent_path:null,key:key('codex-child',file)};
        this.codexFiles.set(file,info);if(info.path)this.codexChildren.set(info.path,info);
      } else this.codexFiles.set(file,{role:typeof p.source==='string'?'parent':'other',pending:new Map(),id:p.id});
      if(typeof p.id==='string'&&typeof p.source==='string')this.noteThread(p.id,file,source);
      return;
    }
    const info=this.codexFiles.get(file);if(!info)return;
    const at=timeOf(record,this.now());
    if(info.role==='parent') {
      if(info.id&&source)this.noteThread(info.id,file,source);
      if(!source)return;
      if(record.type!=='response_item')return;
      if(p.type==='function_call'&&p.name==='spawn_agent'&&p.call_id)info.pending.set(p.call_id,at);
      else if(p.type==='function_call_output'&&info.pending.has(p.call_id)) {
        info.pending.delete(p.call_id);
        let output;try{output=typeof p.output==='string'?JSON.parse(p.output):p.output;}catch{output=null;}
        const ok=output&&typeof output==='object'&&!Array.isArray(output)&&!output.error&&(output.task_name||output.agent_id||output.id);
        this.emit(ok?'task.assigned':'task.failed',source,key('codex-spawn',file,p.call_id),at,replay);
      } else if(p.type==='agent_message'&&typeof p.author==='string'&&p.author!==p.recipient&&p.recipient==='/root') {
        const child=this.codexChildren.get(p.author);
        if(child){child.messagedAt=at;child.messageSource=source;this.codexDelivery(child,replay);}
      }
      return;
    }
    if(info.role!=='child'||record.type!=='event_msg')return;
    const parentSource=this.threads.get(info.parent)?.source;
    if(!parentSource)return;
    info.source=parentSource;
    const kind=p.type;
    if(kind==='task_started')this.childState(info.key,parentSource,'thinking',at,replay,true);
    else if(['agent_reasoning'].includes(kind))this.childState(info.key,parentSource,'thinking',at,replay);
    else if(['exec_command_begin','patch_apply_begin','mcp_tool_call_begin','web_search_begin'].includes(kind))this.childState(info.key,parentSource,'working',at,replay);
    else if(kind==='item_completed')this.childState(info.key,parentSource,'result',at,replay);
    else if(kind==='task_complete'){info.completedAt=at;this.codexDelivery(info,replay);}
    else if(['task_failed','task_error','error'].includes(kind)){this.childEnd(info.key,'error',at,replay);this.emit('task.failed',parentSource,key('codex-child-failed',info.key,String(p.turn_id??'')),at,replay);}
    else if(['turn_aborted','task_cancelled'].includes(kind))this.childEnd(info.key,'idle',at,replay);
  }
  codexDelivery(child,replay) {
    // A sub-agent result counts as delivered only when the child finished and the parent
    // received its message. Either may be observed first.
    if(!child.completedAt||!child.messagedAt||Math.abs(child.completedAt-child.messagedAt)>120000)return;
    const source=child.source??child.messageSource;if(!source)return;
    const at=Math.max(child.completedAt,child.messagedAt);
    this.childEnd(child.key,'success',at,replay);
    this.emit('result.delivered',source,key('codex-delivered',child.key,String(child.completedAt)),at,replay);
    child.completedAt=child.messagedAt=0;
  }

  // ---------- Claude Code ----------
  claudeSession(sessionKey) {
    if(!this.claude.has(sessionKey))this.claude.set(sessionKey,{pending:new Map(),agents:new Map(),done:new Set()});
    return this.claude.get(sessionKey);
  }
  consumeClaude(sessionKey,record,{replay=false}={}) {
    if(!record||typeof record!=='object'||record.isSidechain===true||record.agentId)return;
    const s=this.claudeSession(sessionKey),at=timeOf(record,this.now()),content=record.message?.content;
    if(record.type==='assistant'&&Array.isArray(content)) {
      for(const item of content)if(item?.type==='tool_use'&&CLAUDE_AGENT_TOOLS.has(item.name)&&typeof item.id==='string')s.pending.set(item.id,{at,assigned:false});
      return;
    }
    // A hand-back that arrives while the parent is mid-turn is absorbed as a queued_command attachment
    // carrying the same origin; between turns it is a plain user record.
    const queued=record.type==='attachment'&&record.attachment?.type==='queued_command'?record.attachment:null;
    if(record.type!=='user'&&!queued)return;
    const source=queued??record,body=queued?queued.prompt:content;
    const origin=source.origin&&typeof source.origin==='object'?source.origin:null;
    if(origin?.kind==='peer'&&origin.handback===true&&typeof origin.from==='string') {
      this.claudeFinished(sessionKey,origin.from,'completed',at,replay);return;
    }
    if(origin?.kind==='task-notification'&&typeof body==='string') {
      // Only the harness status tag is read; the notification body is ignored.
      const id=/<task-id>([A-Za-z0-9_-]{1,64})<\/task-id>/.exec(body)?.[1],status=/<status>([a-z_]{1,24})<\/status>/.exec(body)?.[1];
      if(id&&status)this.claudeFinished(sessionKey,id,status,at,replay);
      return;
    }
    if(queued||!Array.isArray(content))return;
    for(const item of content) {
      if(item?.type!=='tool_result'||!s.pending.has(item.tool_use_id))continue;
      const call=s.pending.get(item.tool_use_id),result=record.toolUseResult&&typeof record.toolUseResult==='object'?record.toolUseResult:{};
      const status=typeof result.status==='string'?result.status:null,agentId=typeof result.agentId==='string'?result.agentId:null;
      if(item.is_error===true||FAILED.has(status)) {
        s.pending.delete(item.tool_use_id);
        if(agentId)this.childEnd(key('claude-agent',sessionKey,agentId),'error',at,replay);
        this.emit('task.failed','claude-code',key('claude-failed',sessionKey,item.tool_use_id),at,replay);continue;
      }
      if(agentId)s.agents.set(agentId,item.tool_use_id);
      if(status==='async_launched'||status==='running'){this.claudeAssigned(sessionKey,item.tool_use_id,agentId,at,replay);continue;}
      // A synchronous sub-agent returns its result in the same tool result.
      this.claudeAssigned(sessionKey,item.tool_use_id,agentId,call.at,replay);
      s.pending.delete(item.tool_use_id);
      if(agentId)this.childEnd(key('claude-agent',sessionKey,agentId),'success',at,replay);
      this.emit('result.delivered','claude-code',key('claude-delivered',sessionKey,item.tool_use_id),at,replay);
    }
  }
  claudeAssigned(sessionKey,toolUseId,agentId,at,replay) {
    const s=this.claudeSession(sessionKey),call=s.pending.get(toolUseId);
    if(!call||call.assigned)return;
    call.assigned=true;
    if(agentId)this.childState(key('claude-agent',sessionKey,agentId),'claude-code','thinking',at,replay,true);
    this.emit('task.assigned','claude-code',key('claude-assigned',sessionKey,toolUseId),at,replay);
  }
  claudeFinished(sessionKey,agentId,status,at,replay) {
    const s=this.claudeSession(sessionKey);if(s.done.has(agentId))return;
    const toolUseId=s.agents.get(agentId);
    if(!toolUseId&&!s.pending.size)return;
    s.done.add(agentId);if(s.done.size>256)s.done.delete(s.done.values().next().value);
    if(toolUseId)s.pending.delete(toolUseId);
    const child=key('claude-agent',sessionKey,agentId);
    if(status==='completed'){this.childEnd(child,'success',at,replay);this.emit('result.delivered','claude-code',key('claude-delivered',sessionKey,toolUseId??agentId),at,replay);}
    else if(FAILED.has(status)){this.childEnd(child,'error',at,replay);this.emit('task.failed','claude-code',key('claude-failed',sessionKey,toolUseId??agentId),at,replay);}
  }
  /** A sub-agent transcript proves the delegation started; its records drive the helper pet. */
  consumeClaudeAgent(sessionKey,agentId,record,{replay=false,toolUseId=null}={}) {
    if(!record||typeof record!=='object'||typeof agentId!=='string')return;
    const s=this.claudeSession(sessionKey),at=timeOf(record,this.now()),child=key('claude-agent',sessionKey,agentId);
    if(s.done.has(agentId))return;
    if(toolUseId&&s.pending.has(toolUseId)){s.agents.set(agentId,toolUseId);this.claudeAssigned(sessionKey,toolUseId,agentId,at,replay);}
    const content=record.message?.content;
    if(record.type==='assistant'&&Array.isArray(content)) {
      if(content.some(x=>x?.type==='tool_use'))this.childState(child,'claude-code','working',at,replay,true);
      else if(content.some(x=>x?.type==='thinking'))this.childState(child,'claude-code','thinking',at,replay,true);
    } else if(record.type==='user'&&Array.isArray(content)&&content.some(x=>x?.type==='tool_result'))this.childState(child,'claude-code','result',at,replay,true);
  }

  // ---------- shared ----------
  childState(childKey,source,state,at,replay,start=false) {
    let c=this.children.get(childKey);
    if(!c){if(!start&&state!=='thinking')return;c={source,state:'idle',active:false,at:0,observedAt:0};this.children.set(childKey,c);}
    if(c.ended&&!start)return;
    c.source=source;c.state=state;c.active=true;c.ended=false;c.at=++this.seq;c.observedAt=replay?at:this.now();
    if(this.children.size>256)for(const [k,v] of this.children)if(!v.active){this.children.delete(k);if(this.children.size<=192)break;}
  }
  childEnd(childKey,terminal,at,replay) {
    const c=this.children.get(childKey);if(!c)return;
    c.active=false;c.ended=true;c.state=terminal;c.at=++this.seq;c.terminalAt=replay?at:this.now();
  }
  emit(kind,source,id,at,replay,route={}) {
    if(this.emitted.has(id))return;
    this.emitted.add(id);if(this.emitted.size>1024)this.emitted.delete(this.emitted.values().next().value);
    if(replay)return; // History only builds state; it never replays a performance.
    this.events.push({id,kind,source,...route,at:this.now(),occurredAt:at,seq:++this.seq});
    if(this.events.length>MAX_EVENTS)this.events.splice(0,this.events.length-MAX_EVENTS);
  }
  reset(file) {
    const info=this.codexFiles.get(file);
    if(info?.role==='child'){this.childEnd(info.key,'idle',this.now(),true);if(info.path)this.codexChildren.delete(info.path);}
    this.codexFiles.delete(file);
  }
  resetClaude(sessionKey) {
    const s=this.claude.get(sessionKey);
    if(s)for(const agentId of s.agents.keys())this.childEnd(key('claude-agent',sessionKey,agentId),'idle',this.now(),true);
    this.claude.delete(sessionKey);
  }
  helperStatus(source) {
    const now=this.now();
    const mine=[...this.children.values()].filter(c=>c.source===source);
    const active=mine.filter(c=>c.active&&now-c.observedAt<STALE_MS).sort((a,b)=>b.at-a.at);
    const last=mine.filter(c=>!c.active&&c.terminalAt&&now-c.terminalAt<20000&&c.state!=='idle').sort((a,b)=>b.at-a.at)[0];
    const state=active[0]?.state??last?.state??'idle';
    return {state,label:LABELS[state],activeSessions:active.length,lastEventAt:active[0]?.observedAt??last?.terminalAt??null,terminalAt:active.length?null:last?.terminalAt??null};
  }
  status() {
    return {seq:this.seq,events:this.events.map(e=>({...e})),helpers:Object.fromEntries(['chatgpt-desktop','codex-cli','claude-code','dsh-desktop'].map(s=>[s,this.helperStatus(s)]))};
  }
}
