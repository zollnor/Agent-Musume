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

// How long a terminal's new tab or window may take to show the Claude Code or Codex process it was asked to run.
const LAUNCH_WINDOW=15000;
const OUTCOME={success:'delivered',error:'failed',idle:'cancelled'};

/**
 * A different harness must be an actual descendant, never just simultaneously busy. A task is a new CLI task process
 * (claude -p, codex exec), an interactive session started with a task (claude "task", in a new window for example), or
 * text handed to an agent already open (Herdr, a terminal pane, a Codex queue), given to `relays`.
 * A terminal may run the new session under itself rather than under the harness that asked for it (wt new-tab, wezterm
 * cli spawn): the request is recorded, and the next such session of that program within a few seconds is its task.
 */
export class ProcessHandoffs {
  constructor({tracker,relays=null,retries=5,now=Date.now}={}){
    this.tracker=tracker;this.relays=relays;this.retries=retries;this.now=now;
    this.seen=new Set();this.active=new Map();this.following=new Map();this.launches=[];this.initial=true;this.waiting=new Map();
  }
  snapshot(rows){
    if(!Array.isArray(rows))return;
    const valid=rows.filter(p=>Number.isSafeInteger(p.pid)&&Number.isSafeInteger(p.parentPid)&&Number.isFinite(p.startedAt));
    const live=valid.filter(p=>p.mode!=='gone');
    // Exited processes ('gone') only link a task to its harness: one started in the background outlives its starter.
    // A PID can recur, so a parent is the latest process with that PID that started no later than the child.
    const byPid=new Map();for(const p of valid)byPid.set(p.pid,[...(byPid.get(p.pid)??[]),p]);
    const parentOf=p=>(byPid.get(p.parentPid)??[]).reduce((best,c)=>c!==p&&c.startedAt<=p.startedAt&&(!best||c.startedAt>best.startedAt)?c:best,null);
    const launchOf=p=>HARNESS_SOURCES.includes(p?.relay?.target)?p.relay.target:null; // 'gone' rows keep their relay
    this.launches=this.launches.filter(l=>this.now()-l.at<=LAUNCH_WINDOW);
    // Requests for a new tab come first: the tab they open may be in the same snapshot.
    for(const target of [...live.filter(p=>p.mode==='term-launch'),...live.filter(p=>p.mode!=='term-launch')]){
      const key=identity(target);if(this.seen.has(key))continue;
      const relay=RELAYS.has(target.mode)&&target.relay&&typeof target.relay.target==='string'?target.relay:null;
      const launch=target.mode==='term-launch'?launchOf(target):null;
      const session=HARNESS_SOURCES.includes(target.source)&&(!target.mode||target.mode==='cli-task'||target.mode==='interactive-task')&&!['chatgpt-desktop','dsh-desktop'].includes(target.source);
      const task=relay||launch||session;
      // A task whose starter is not recorded yet gets a few more snapshots before it counts as unrelated.
      if(task&&!this.initial&&!parentOf(target)&&target.parentPid>0&&(this.waiting.get(key)??0)<this.retries){this.waiting.set(key,(this.waiting.get(key)??0)+1);continue;}
      this.seen.add(key);this.waiting.delete(key);
      if(this.initial||!task)continue;
      let p=target,source=null,bridged=false;const visited=new Set([key]);
      for(let depth=0;depth<64;depth++){
        const parent=parentOf(p);
        if(!parent||visited.has(identity(parent)))break;
        if(parent.bridge){bridged=true;break;} // the explicit runner already reports this task, including its exit status
        visited.add(identity(parent));p=parent;
        if(HARNESS_SOURCES.includes(p.source)){source=p.source;break;}
      }
      if(launch){
        // One request seen twice (wezterm start runs the terminal itself with the same command) is recorded once.
        if(source&&source!==launch&&!launchOf(parentOf(target)))this.launches.push({from:source,to:launch,order:target.startedAt,at:this.now()});
        continue;
      }
      if(relay){if(source)void this.relays?.dispatched({key,from:source,kind:target.mode,target:relay.target,wait:relay.wait===true,image:relay.image});continue;}
      // The session a harness asked a terminal for; one it started directly no longer needs the request.
      const asked=this.launches.findIndex(l=>l.to===target.source&&l.order<target.startedAt&&(!source||l.from===source));
      if(asked>=0){if(!source&&!bridged)source=this.launches[asked].from;if(source===this.launches[asked].from)this.launches.splice(asked,1);}
      if(!source||source===target.source)continue;
      const handoff={id:'process:'+key.replace('.', '_'),from:source,to:target.source};
      if(!this.tracker.consume({...handoff,phase:'started'}).ok)continue;
      this.active.set(key,handoff);
      if(target.mode==='interactive-task')this.follow(key,handoff,target);
    }
    this.initial=false;
    // Seen identities are only required for processes still present. Active tasks keep their own identity.
    this.seen=new Set(live.map(identity).filter(key=>!this.waiting.has(key)));
    for(const key of this.waiting.keys())if(!live.some(p=>identity(p)===key))this.waiting.delete(key);
  }
  /** An interactive session stays open after its task: the end of its first turn is the hand-back. */
  follow(key,handoff,target){
    const turn=this.relays?.firstTurn?.({to:target.source,pid:target.pid});if(!turn)return;
    this.following.set(key,turn);
    void turn.then(outcome=>{
      if(this.active.get(key)!==handoff)return;
      this.active.delete(key);this.following.delete(key);
      this.tracker.consume({...handoff,phase:OUTCOME[outcome]??'cancelled'});
    });
  }
  exited({pid,startedAt,exitCode}){
    const key=identity({pid,startedAt}),task=this.active.get(key);if(!task){this.relays?.exited(key,exitCode);return;}
    const turn=this.following.get(key);
    this.active.delete(key);this.following.delete(key);turn?.cancel();
    // An interactive session closed before its first turn ended leaves the task undone.
    this.tracker.consume({...task,phase:turn?'cancelled':exitCode===0?'delivered':Number.isInteger(exitCode)?'failed':'cancelled'});
  }
}
