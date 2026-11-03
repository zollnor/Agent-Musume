import {createHash} from 'node:crypto';

export const HARNESS_SOURCES=Object.freeze(['chatgpt-desktop','codex-cli','claude-code','dsh-desktop']);
const phases=new Set(['started','delivered','failed','cancelled']);
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,24);
const identity=p=>`${p.pid}:${p.startedAt}`;
// Processes that hand text to an agent already open (harness-processes.ps1 Relay): Herdr, a terminal pane, a Codex queue.
const RELAYS=new Set(['herdr-prompt','herdr-keys','term-text','codex-queue']);

/** Metadata-only lifecycle shared by process ancestry and explicit harness integrations. */
export class HandoffTracker {
  constructor({collab,now=Date.now,maxTasks=512}={}){this.collab=collab;this.now=now;this.maxTasks=maxTasks;this.tasks=new Map();}
  consume(input){
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['id','from','to','phase'].includes(k)))return {ok:false,error:'交接只接受任务标识、来源、目标和状态。'};
    const {id,from,to,phase}=input;
    if(typeof id!=='string'||!/^[-a-zA-Z0-9_:]{1,128}$/.test(id)||!HARNESS_SOURCES.includes(from)||!HARNESS_SOURCES.includes(to)||from===to||!phases.has(phase))return {ok:false,error:'无效的交接事件。'};
    const task=hash(id);let current=this.tasks.get(task);
    if(current&&(current.from!==from||current.to!==to))return {ok:false,error:'任务的来源和目标不一致。'};
    if(current?.ended)return {ok:true,duplicate:true};
    if(phase!=='started'&&!current)return {ok:false,error:'未找到已启动的交接任务。'};
    if(phase==='started'){
      if(current)return {ok:true,duplicate:true};
      if(this.tasks.size>=this.maxTasks){for(const [key,t] of this.tasks)if(t.ended){this.tasks.delete(key);break;}}
      if(this.tasks.size>=this.maxTasks)return {ok:false,error:'活动交接任务过多。'};
      current={from,to,startedAt:this.now(),ended:false};this.tasks.set(task,current);
    }else{current.ended=true;current.endedAt=this.now();}
    this.collab.emit(phase==='started'?'task.assigned':phase==='delivered'?'result.delivered':'task.failed',from,
      hash(task+':'+phase),this.now(),false,{target:to,task});
    return {ok:true};
  }
  status(){return {active:[...this.tasks.values()].filter(t=>!t.ended).length,retained:this.tasks.size};}
}

/**
 * A different harness must be an actual descendant, never just simultaneously busy. A task is a new CLI task process
 * (claude -p, codex exec), or text handed to an agent already open (Herdr, a terminal pane, a Codex queue), given to
 * `relays`.
 */
export class ProcessHandoffs {
  constructor({tracker,relays=null,retries=5}={}){this.tracker=tracker;this.relays=relays;this.seen=new Set();this.active=new Map();this.initial=true;this.retries=retries;this.waiting=new Map();}
  snapshot(rows){
    if(!Array.isArray(rows))return;
    const valid=rows.filter(p=>Number.isSafeInteger(p.pid)&&Number.isSafeInteger(p.parentPid)&&Number.isFinite(p.startedAt));
    const live=valid.filter(p=>p.mode!=='gone');
    // Exited processes ('gone') only link a task to its harness: one started in the background outlives its starter.
    // A PID can recur, so a parent is the latest process with that PID that started no later than the child.
    const byPid=new Map();for(const p of valid)byPid.set(p.pid,[...(byPid.get(p.pid)??[]),p]);
    const parentOf=p=>(byPid.get(p.parentPid)??[]).reduce((best,c)=>c!==p&&c.startedAt<=p.startedAt&&(!best||c.startedAt>best.startedAt)?c:best,null);
    for(const target of live){
      const key=identity(target);if(this.seen.has(key))continue;
      const relay=RELAYS.has(target.mode)&&target.relay&&typeof target.relay.target==='string'?target.relay:null;
      const task=relay||HARNESS_SOURCES.includes(target.source)&&(!target.mode||target.mode==='cli-task')&&!['chatgpt-desktop','dsh-desktop'].includes(target.source);
      // A task whose starter is not recorded yet gets a few more snapshots before it counts as unrelated.
      if(task&&!this.initial&&!parentOf(target)&&target.parentPid>0&&(this.waiting.get(key)??0)<this.retries){this.waiting.set(key,(this.waiting.get(key)??0)+1);continue;}
      this.seen.add(key);this.waiting.delete(key);
      if(this.initial||!task)continue;
      let p=target,source=null;const visited=new Set([key]);
      for(let depth=0;depth<64;depth++){
        const parent=parentOf(p);
        if(!parent||visited.has(identity(parent)))break;
        if(parent.bridge)break; // the explicit runner already reports this task, including its exit status
        visited.add(identity(parent));p=parent;
        if(HARNESS_SOURCES.includes(p.source)){source=p.source;break;}
      }
      if(!source)continue;
      if(relay){void this.relays?.dispatched({key,from:source,kind:target.mode,target:relay.target,wait:relay.wait===true,image:relay.image});continue;}
      if(source===target.source)continue;
      const handoff={id:'process:'+key.replace('.', '_'),from:source,to:target.source};
      if(this.tracker.consume({...handoff,phase:'started'}).ok)this.active.set(key,handoff);
    }
    this.initial=false;
    // Seen identities are only required for processes still present. Active tasks keep their own identity.
    this.seen=new Set(live.map(identity).filter(key=>!this.waiting.has(key)));
    for(const key of this.waiting.keys())if(!live.some(p=>identity(p)===key))this.waiting.delete(key);
  }
  exited({pid,startedAt,exitCode}){
    const key=identity({pid,startedAt}),task=this.active.get(key);if(!task){this.relays?.exited(key,exitCode);return;}
    this.tracker.consume({...task,phase:exitCode===0?'delivered':Number.isInteger(exitCode)?'failed':'cancelled'});
    this.active.delete(key);
  }
}
