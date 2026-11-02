import {readdir,readFile,stat} from 'node:fs/promises';
import {watch} from 'node:fs';
import {join,dirname} from 'node:path';
import {TailFile} from './rollout-watcher.mjs';
// Session kinds the user works in: a terminal session, or a background job (claude --bg, a branched or parked session,
// agent view). Both register a live pid and a busy/idle status of their own.
const USER_KINDS=new Set(['interactive','bg']);
export class ClaudeMonitor {
  constructor({root,adapter,collab=null,pollMs=750,onChange=()=>{},isAlive=pid=>{try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}}}={}){
    this.root=root;this.adapter=adapter;this.collab=collab;this.pollMs=pollMs;this.onChange=onChange;this.isAlive=isAlive;this.watchers=[];this.again=false;this.sessions=new Map();this.running=false;this.busy=false;this.available=false;this.errors=0;this.malformed=0;this.peerCount=0;this.readBytes=0;
    this.startedAt=Date.now();
  }
  fresh(r,opts){const time=Date.parse(r.timestamp??'');return opts.replay&&!opts.forceReplay&&Number.isFinite(time)&&time>=this.startedAt;}
  /** Sub-agent transcripts sit beside the main transcript. Only their lifecycle reaches the tracker. */
  async agents(tracked,id){
    const dir=join(dirname(tracked.file),id,'subagents');
    const names=await readdir(dir).catch(()=>null);if(!names)return;
    tracked.agents??=new Map();
    for(const name of names){
      const agentId=/^agent-([A-Za-z0-9_-]{1,64})\.jsonl$/.exec(name)?.[1];if(!agentId||tracked.agents.has(agentId))continue;
      // Finished helpers from long ago only cost reads; a quiet file is never a live delegation.
      const info=await stat(join(dir,name)).catch(()=>null);
      if(!info||info.mtimeMs<this.startedAt-10*60*1000){tracked.agents.set(agentId,null);continue;}
      let toolUseId=null;try{const meta=JSON.parse(await readFile(join(dir,`agent-${agentId}.meta.json`),'utf8'));if(typeof meta.toolUseId==='string')toolUseId=meta.toolUseId;}catch{}
      tracked.agents.set(agentId,new TailFile(join(dir,name),{onRecord:(r,opts)=>this.collab.consumeClaudeAgent(tracked.key,agentId,r,{replay:opts.replay&&!this.fresh(r,opts),toolUseId}),onMalformed:()=>this.malformed++}));
    }
    for(const tail of tracked.agents.values()){if(!tail)continue;const first=!tail.started;tail.started=true;await tail.readAvailable({replay:first});}
  }
  async start(){this.running=true;this.startedAt=Date.now();this.watch();await this.pump();this.timer=setInterval(()=>void this.pump(),this.pollMs);}
  /** A write to a live session's status file or transcript wakes the pump at once; the poll stays as the fallback. */
  watch(){
    const wake=()=>{if(!this.debounce)this.debounce=setTimeout(()=>{this.debounce=null;void this.pump();},30);};
    const tracked=name=>{for(const id of this.sessions.keys())if(name.includes(id))return true;return false;};
    for(const [dir,options,accept] of [[join(this.root,'sessions'),{},name=>name.endsWith('.json')],[join(this.root,'projects'),{recursive:true},name=>name.endsWith('.jsonl')&&tracked(name)]]){
      try{const watcher=watch(dir,{...options,persistent:false},(_event,name)=>{if(name&&accept(String(name)))wake();});watcher.on('error',()=>{this.errors++;});this.watchers.push(watcher);}catch{this.errors++;}
    }
  }
  async transcript(id){
    const root=join(this.root,'projects');const dirs=await readdir(root,{withFileTypes:true}).catch(()=>[]);
    for(const dir of dirs){if(!dir.isDirectory())continue;const file=join(root,dir.name,id+'.jsonl');if(await stat(file).catch(()=>null))return file;}
    return null;
  }
  async pump(){
    if(!this.running)return;if(this.busy){this.again=true;return;}this.busy=true;this.again=false;
    try{
      const root=join(this.root,'sessions'),files=await readdir(root).catch(()=>null);this.available=files!==null;
      const live=new Set();
      for(const name of files??[]){
        if(!name.endsWith('.json'))continue;
        let peer;try{peer=JSON.parse(await readFile(join(root,name),'utf8'));}catch{this.errors++;continue;}
        if(peer.entrypoint!=='cli'||!USER_KINDS.has(peer.kind)||!Number.isSafeInteger(peer.pid)||peer.pid<=0||!this.isAlive(peer.pid)||typeof peer.sessionId!=='string'||!/^[-a-zA-Z0-9]{1,128}$/.test(peer.sessionId))continue;
        const key=peer.sessionId;live.add(key);let tracked=this.sessions.get(key);
        if(!tracked){tracked={key:'claude-native:'+key,file:null,tail:null,peerStatus:null};this.sessions.set(key,tracked);}
        if(!tracked.file)tracked.file=await this.transcript(key);
        if(tracked.file){
          const initial=!tracked.tail;
          if(initial)tracked.tail=new TailFile(tracked.file,{onRecord:(r,opts)=>{
            const replay=opts.replay&&!this.fresh(r,opts);
            this.adapter.consume(tracked.key,r,{replay});
            this.collab?.consumeClaude(tracked.key,r,{replay});
          },onReset:()=>{this.adapter.reset(tracked.key);this.collab?.resetClaude(tracked.key);},onMalformed:()=>this.malformed++});
          const previous=tracked.tail.bytesRead;const result=await tracked.tail.readAvailable({replay:initial});this.readBytes+=tracked.tail.bytesRead-previous;
          if(!result.available){this.errors++;this.adapter.reset(tracked.key);this.collab?.resetClaude(tracked.key);tracked.tail=null;tracked.file=null;tracked.agents=null;}
          else if(this.collab)await this.agents(tracked,key).catch(()=>{this.errors++;});
        }
        // A live native peer is authoritative for busy/idle. Never infer success from idle.
        this.adapter.peer(tracked.key,peer.status);tracked.peerStatus=peer.status;
      }
      this.peerCount=live.size;
      for(const [id,tracked] of this.sessions)if(!live.has(id)){this.adapter.reset(tracked.key);this.collab?.resetClaude(tracked.key);this.sessions.delete(id);}
    }catch{this.errors++;}finally{this.busy=false;}
    this.onChange();
    if(this.again)void this.pump(); // a write landed while this pass was reading
  }
  status(){return {running:this.running,sourceAvailable:this.available,liveCliSessions:this.peerCount,watchedFiles:[...this.sessions.values()].filter(s=>s.tail).length,readErrors:this.errors,malformedRecords:this.malformed};}
  async close(){this.running=false;clearInterval(this.timer);clearTimeout(this.debounce);for(const watcher of this.watchers)watcher.close();this.watchers=[];while(this.busy)await new Promise(r=>setTimeout(r,10));}
}
