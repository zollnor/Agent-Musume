import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';

/** Live turns of the watched sessions, as the adapters report them ({source, file, phase, outcome}), kept 30 s. */
export class SessionTurns {
  constructor({now=Date.now}={}){this.now=now;this.recent=[];this.waiters=new Set();}
  record({source,file,phase,outcome=null}){
    const turn={source,file,phase,outcome,at:this.now()};
    this.recent=this.recent.filter(t=>turn.at-t.at<30000);this.recent.push(turn);
    for(const waiter of [...this.waiters])waiter(turn);
  }
  /** The first turn matching `accept` from `since` on, waiting up to `within` ms; null when none comes or on cancel(). */
  next(accept,{since=this.now(),within}){
    const seen=this.recent.find(t=>t.at>=since&&accept(t));
    if(seen)return Object.assign(Promise.resolve(seen),{cancel(){}});
    let done;
    const waiting=new Promise(resolve=>{
      const waiter=turn=>{if(accept(turn))done(turn);};
      const timer=setTimeout(()=>done(null),within);if(within>60000)timer.unref?.(); // a long wait never keeps the host up
      done=turn=>{this.waiters.delete(waiter);clearTimeout(timer);resolve(turn);};
      this.waiters.add(waiter);
    });
    return Object.assign(waiting,{cancel:()=>done(null)});
  }
  close(){for(const waiter of [...this.waiters])this.waiters.delete(waiter);}
}

const OUTCOME={success:'delivered',error:'failed',idle:'cancelled'};
const TERMINAL_AGENTS=['claude-code','codex-cli'];

/**
 * Hand-overs whose recipient shows itself by starting a turn:
 *  - text typed into a terminal pane ("wezterm cli send-text", WezTerm under any file name): the pane can run anything, so the
 *    recipient is the Claude Code or Codex CLI session of another harness that starts a turn within a few seconds;
 *  - a message queued for a Codex session ("codex queue --thread"): that session, desktop or CLI, once it takes the
 *    message up, which may be later if it is busy.
 * The hand-back is the end of that turn: completed, failed, or cancelled when it was interrupted.
 */
export class SessionRelays {
  constructor({tracker,turns,window=8000,limit=2*60*60*1000,threads=threadIdOf,owns=ownsSession}={}){
    this.tracker=tracker;this.turns=turns;this.window=window;this.limit=limit;this.threads=threads;this.owns=owns;this.pending=new Map();this.follows=new Set();this.closed=false;
  }
  /**
   * The first turn of the session that a Claude Code or Codex CLI process started with a task runs ("claude task" in a
   * new window or tab): a promise of its outcome ('success', 'error', 'idle'), or null when none comes. cancel() stops it.
   */
  firstTurn({to,pid}){
    if(!this.turns)return null;
    const since=this.turns.now()-1500,deadline=this.turns.now()+this.limit,checked=new Set();let current=null,stopped=false;
    const left=()=>Math.max(0,deadline-this.turns.now());
    const run=async()=>{
      while(!stopped&&!this.closed){
        current=this.turns.next(t=>t.phase==='start'&&t.source===to&&!checked.has(t),{since,within:left()});
        const start=await current;if(!start||stopped)return null;checked.add(start);
        if(!await this.owns({source:to,pid,file:start.file,since})||stopped)continue;
        current=this.turns.next(t=>t.phase==='end'&&t.file===start.file,{since:start.at,within:left()});
        const end=await current;return end&&!stopped?end.outcome:null;
      }
      return null;
    };
    const follow=Object.assign(run().finally(()=>this.follows.delete(follow)),{cancel(){stopped=true;current?.cancel();}});
    this.follows.add(follow);return follow;
  }
  async dispatched({key,from,kind,target}){
    if(!this.turns||this.pending.has(key))return;
    // The turn may have started a moment before this process was seen.
    const since=this.turns.now()-1500,relay={key,stopped:false,cancel(){}};this.pending.set(key,relay);
    const wait=(accept,within)=>{const waiting=this.turns.next(accept,{since,within});relay.cancel=waiting.cancel;return waiting;};
    let turn=null;
    if(kind==='term-text')turn=await wait(t=>t.phase==='start'&&t.source!==from&&TERMINAL_AGENTS.includes(t.source),this.window);
    else if(kind==='codex-queue'){
      const thread=await this.threads(target);
      if(thread&&!relay.stopped)turn=await wait(t=>t.phase==='start'&&t.file.includes(thread),this.limit);
      if(turn?.source===from)turn=null;
    }
    if(!turn||relay.stopped||this.closed){this.pending.delete(key);return;}
    const task={id:`${kind}:${key.replace('.','_')}`,from,to:turn.source};
    if(!this.tracker.consume({...task,phase:'started'}).ok){this.pending.delete(key);return;}
    const ending=this.turns.next(t=>t.phase==='end'&&t.file===turn.file,{since:turn.at,within:this.limit});relay.cancel=ending.cancel;
    const end=await ending;this.pending.delete(key);
    if(!this.closed)this.tracker.consume({...task,phase:end?OUTCOME[end.outcome]??'delivered':'cancelled'});
  }
  /** A queue command that failed (no such session) leaves nothing to wait for. */
  exited(key,exitCode){
    const relay=this.pending.get(key);if(!relay)return false;
    if(exitCode!==0){relay.stopped=true;relay.cancel();}
    return true;
  }
  close(){this.closed=true;for(const relay of this.pending.values())relay.cancel();this.pending.clear();for(const follow of this.follows)follow.cancel();}
}

/** The session id behind a "codex queue --thread" target: an id as it is, or an exact session name from the index. */
export async function threadIdOf(target,{home=process.env.CODEX_HOME??join(homedir(),'.codex')}={}){
  if(typeof target!=='string'||!target)return null;
  if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target))return target.toLowerCase();
  try{
    let id=null;
    for(const line of (await readFile(join(home,'session_index.jsonl'),'utf8')).split('\n')){
      try{const entry=JSON.parse(line);if(entry.thread_name===target&&typeof entry.id==='string')id=entry.id;}catch{}
    }
    return id;
  }catch{return null;}
}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
/**
 * Whether a session file belongs to process `pid`, seen starting at `since`. Claude Code registers each session under the
 * process that runs it (sessions/<pid>.json, written as it starts). Codex keeps no such record; a session started with a
 * task writes a new session file, so the file is the process's own when it was created after the process started.
 */
export async function ownsSession({source,pid,file,since},{claudeHome=process.env.AGENT_MUSUME_CLAUDE_HOME??process.env.CLAUDE_CONFIG_DIR??join(homedir(),'.claude'),tries=10}={}){
  if(source==='claude-code'){
    for(let i=0;i<tries;i++){
      // The Claude monitor names a session "claude-native:<id>"; a transcript path ends in "<id>.jsonl".
      const id=String(file).split(/[\\/]/).pop().replace(/\.jsonl$/,'').replace(/^claude-native:/,'');
      try{const entry=JSON.parse(await readFile(join(claudeHome,'sessions',`${pid}.json`),'utf8'));if(typeof entry.sessionId==='string')return id===entry.sessionId;}catch{}
      await sleep(300);
    }
    return false;
  }
  try{return (await stat(file)).birthtimeMs>=since-1500;}catch{return false;}
}
