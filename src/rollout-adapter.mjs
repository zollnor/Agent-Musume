import { createHash } from 'node:crypto';

const LABELS = Object.freeze({thinking:'正在思考下一步',working:'正在执行工具',result:'正在整理工具结果',waiting:'需要你输入或确认',success:'这一轮回复已结束',error:'本轮运行遇到错误',idle:'等待新的本地会话'});
const WAIT_TOOL = /(?:^|\.)(?:request_user_input(?:_async)?|ask_user_question|request_permissions)$/;
const TOOL_TYPES = new Set(['function_call','custom_tool_call']);
const OUTPUT_TYPES = new Set(['function_call_output','custom_tool_call_output']);
const ITEM_TOOLS = new Set(['CommandExecution','McpToolCall','FileChange','WebSearch','Extension','DynamicToolCall']);

/** Discards all content/arguments/output. Only structured lifecycle metadata crosses this boundary. */
export class RolloutAdapter {
  constructor({emit,now=Date.now,onChange=()=>{},sourceKind='chatgpt-desktop'}={}) {
    this.sourceKind=sourceKind;
    this.emit=emit??(()=>{}); this.now=now; this.onChange=onChange;
    this.sessions=new Map(); this.counter=0; this.lastTerminal=null; this.lastEventAt=null; this.acceptedEvents=0;
  }
  session(file) {
    if(!this.sessions.has(file)) this.sessions.set(file,{key:createHash('sha256').update(file).digest('hex').slice(0,20),eligible:false,active:false,turn:null,state:'idle',waiting:false,waitingCall:null,asyncQuestion:false,published:null,hostTerminal:false,ended:new Set(),at:0,observedAt:0});
    return this.sessions.get(file);
  }
  consume(file,record,{replay=false}={}) {
    if(!record||typeof record!=='object') return;
    const p=record.payload;
    if(!p||typeof p!=='object') return;
    const s=this.session(file);
    if(record.type==='session_meta') {
      s.eligible=typeof p.source==='string' && (this.sourceKind==='codex-cli'?p.source==='cli'&&/^(codex-tui|codex_cli_rs|codex-cli)$/i.test(String(p.originator??'')):this.sourceKind==='claude-code'?p.source==='cli'&&p.originator==='claude-code':this.sourceKind==='dsh-desktop'?p.source==='desktop'&&p.originator==='dsh':['vscode','desktop','app'].includes(p.source)&&/(?:codex|chatgpt).*desktop/i.test(String(p.originator??'')));
      return;
    }
    if(!s.eligible) return;
    const kind=p.type;
    const accepted=record.type==='event_msg'||record.type==='response_item';
    if(!accepted) return;
    const observed=replay ? Date.parse(record.timestamp??'') : this.now();
    s.observedAt=Number.isFinite(observed)?observed:this.now();
    if(!replay) {this.lastEventAt=this.now();this.acceptedEvents++;}
    if(record.type==='event_msg') {
      if(kind==='task_started') {
        const turn=String(p.turn_id??p.root_turn_id??'');
        if(!turn||s.ended.has(turn)||(s.active&&s.turn===turn)) return;
        s.turn=turn;s.active=true;s.waiting=false;s.waitingCall=null;s.asyncQuestion=false;s.published=null;
        this.set(s,'thinking',replay);return;
      }
      if(['task_complete','task_failed','task_error','error','turn_aborted','task_cancelled'].includes(kind)) {
        const turn=String(p.turn_id??s.turn??'');
        if(!s.active||s.ended.has(turn)||(s.turn&&turn!==s.turn)) return;
        if(kind==='task_complete'&&p.root_turn_id&&p.turn_id!==p.root_turn_id) {this.set(s,'result',replay);return;}
        s.active=false;s.waiting=false;s.ended.add(turn);
        if(s.ended.size>64) s.ended.delete(s.ended.values().next().value);
        const terminal=kind==='task_complete'?'success':['turn_aborted','task_cancelled'].includes(kind)?'idle':'error';
        s.state=terminal;s.at=++this.counter;
        if(!replay) {
          const other=[...this.sessions.values()].some(x=>x!==s&&x.eligible&&x.active);
          this.send(s,'todo/write',{todos:[]});
          this.send(s,'turn/end',{reason:{kind:terminal==='idle'||other?'aborted':terminal==='success'?'completed':'error'}});
          s.hostTerminal=!other&&terminal!=='idle';
          this.lastTerminal=other||terminal==='idle'?null:{state:terminal,at:this.now(),until:this.now()+60000};
          this.onChange(this.status());
        }
        return;
      }
      // A tail bootstrap may start inside an active turn. Item metadata carries its turn id.
      if(kind==='item_completed'&&p.turn_id&&!s.active&&!s.ended.has(String(p.turn_id))) {
        s.turn=String(p.turn_id);s.active=true;s.waiting=false;
      }
      if(!s.active) return;
      if(p.turn_id&&s.turn&&String(p.turn_id)!==s.turn) return;
      if(['approval_requested','permission_request','exec_approval_request','apply_patch_approval_request','request_permissions','elicitation_request','request_user_input'].includes(kind)) {s.waiting=true;s.waitingCall=p.call_id??null;s.asyncQuestion=false;this.set(s,'waiting',replay);return;}
      if(['exec_command_begin','patch_apply_begin','mcp_tool_call_begin','web_search_begin'].includes(kind)) {
        if(!s.waitingCall||p.call_id===s.waitingCall){s.waiting=false;s.waitingCall=null;}
        if(!s.waiting)this.set(s,'working',replay);return;
      }
      if(['approval_resolved','user_input_received','user_message'].includes(kind)) {s.waiting=false;this.set(s,'thinking',replay);return;}
      if(kind==='agent_reasoning') {if(!s.waiting)this.set(s,'thinking',replay);return;}
      if(kind==='item_completed') {
        const item=p.item??{};
        if(item.type==='UserMessage') {s.waiting=false;s.waitingCall=null;s.asyncQuestion=false;this.set(s,'thinking',replay);}
        else if(item.type==='Reasoning') {if(!s.waiting)this.set(s,'thinking',replay);}
        else if(['RequestUserInput','PermissionRequest'].includes(item.type)) {s.waiting=true;this.set(s,'waiting',replay);}
        else if(ITEM_TOOLS.has(item.type)&&!s.waiting) this.set(s,'result',replay);
      }
      return;
    }
    if(!s.active) return;
    if(kind==='message'&&p.role==='user') {s.waiting=false;s.waitingCall=null;s.asyncQuestion=false;this.set(s,'thinking',replay);return;}
    if(TOOL_TYPES.has(kind)) {
      if(WAIT_TOOL.test(String(p.name??''))) {s.waiting=true;s.waitingCall=p.call_id??null;s.asyncQuestion=String(p.name).endsWith('_async');this.set(s,'waiting',replay);}
      else if(!s.waiting) this.set(s,'working',replay);
    } else if(OUTPUT_TYPES.has(kind)) {
      if(s.waiting&&!s.asyncQuestion&&s.waitingCall&&p.call_id===s.waitingCall){s.waiting=false;s.waitingCall=null;}
      if(!s.waiting)this.set(s,'result',replay);
    }
    else if(kind==='reasoning'&&!s.waiting) this.set(s,'thinking',replay);
    // Assistant text, including phase=final, is intentionally not a completion signal.
  }
  set(s,state,replay) {
    s.state=state;s.at=++this.counter;
    if(!replay) {
      this.lastTerminal=null;
      for(const prior of this.sessions.values())if(prior.hostTerminal) {
        if(prior!==s&&!prior.active)this.send(prior,'turn/end',{reason:{kind:'aborted'}});
        prior.hostTerminal=false;
      }
    }
    if(!replay&&s.published!==state) this.publish(s);
  }
  publish(s) {
    const type={thinking:'turn/start',working:'tool/call',result:'tool/result',waiting:'approval/asked'}[s.state];
    if(!type)return;
    this.send(s,type,type==='tool/call'?{name:'local_tool'}:{});
    this.send(s,'todo/write',{todos:[{status:'in_progress',content:LABELS[s.state]}]});
    s.published=s.state;this.onChange(this.status());
  }
  send(s,type,data) {
    this.emit('session/event',{id:s.key,header:{id:s.key}},{type,seq:++this.counter,data});
  }
  finishReplay(file) {
    const s=this.sessions.get(file);
    if(!s?.eligible||!s.active)return;
    // A stale, unfinished file is not proof that an old task is still executing.
    if(s.state!=='waiting'&&this.now()-s.observedAt>30*60*1000) {s.active=false;s.state='idle';return;}
    if(s.published!==s.state)this.publish(s);
  }
  reset(file) {
    const s=this.sessions.get(file);
    if(s?.active) this.send(s,'turn/end',{reason:{kind:'aborted'}});
    this.sessions.delete(file);this.onChange(this.status());
  }
  hideFromHost() {for(const s of this.sessions.values())if(s.eligible&&s.active)this.send(s,'turn/end',{reason:{kind:'aborted'}});}
  isActive(file) {return this.sessions.get(file)?.active===true;}
  republish() {for(const s of this.sessions.values())if(s.eligible&&s.active){s.published=null;this.publish(s);}}
  status() {
    const active=[...this.sessions.values()].filter(s=>s.eligible&&s.active).sort((a,b)=>(b.state==='waiting')-(a.state==='waiting')||b.at-a.at);
    const state=active[0]?.state??(this.lastTerminal&&this.lastTerminal.until>this.now()?this.lastTerminal.state:'idle');
    return {state,label:LABELS[state],activeSessions:active.length,desktopSessions:[...this.sessions.values()].filter(s=>s.eligible).length,lastEventAt:this.lastEventAt,terminalAt:this.lastTerminal?.at??null,acceptedEvents:this.acceptedEvents,scope:this.sourceKind==='codex-cli'?'Codex CLI 本地会话':this.sourceKind==='claude-code'?'Claude Code CLI 本地会话':this.sourceKind==='dsh-desktop'?'DeepSeek Harness 本地会话':'ChatGPT 桌面本地会话',source:'local-rollout'};
  }
}
