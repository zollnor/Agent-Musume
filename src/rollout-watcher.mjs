import { open,readdir,stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join,resolve,relative,isAbsolute } from 'node:path';

const MAX_LINE=8*1024*1024;
export class TailFile {
  constructor(file,{onRecord=()=>{},onReset=()=>{},onMalformed=()=>{}}={}) {
    this.file=file;this.onRecord=onRecord;this.onReset=onReset;this.onMalformed=onMalformed;
    this.offset=0;this.pending=Buffer.alloc(0);this.skipping=false;this.inode=null;this.modified=null;this.anchor=null;this.bytesRead=0;
  }
  feed(bytes,replay,forceReplay=false) {
    let start=0;
    for(let i=0;i<bytes.length;i++)if(bytes[i]===10) {
      const slice=bytes.subarray(start,i);start=i+1;
      if(this.skipping) {this.skipping=false;this.pending=Buffer.alloc(0);continue;}
      const line=this.pending.length?Buffer.concat([this.pending,slice]):slice;
      this.pending=Buffer.alloc(0);
      if(line.length>MAX_LINE) {this.onMalformed();continue;}
      if(!line.length)continue;
      try{const parsed=JSON.parse(line.toString('utf8'));this.onRecord(parsed,{replay,forceReplay});}catch{this.onMalformed();}
    }
    if(start<bytes.length&&!this.skipping) {
      this.pending=Buffer.concat([this.pending,bytes.subarray(start)]);
      if(this.pending.length>MAX_LINE) {this.pending=Buffer.alloc(0);this.skipping=true;this.onMalformed();}
    }
  }
  async readAvailable({replay=false}={}) {
    let handle;
    try {
      handle=await open(this.file,'r');const info=await handle.stat();
      let forceReplay=!!this.rebuildRequested;
      if(forceReplay)replay=true;
      let reset=info.size<this.offset||(this.inode!==null&&this.inode!==info.ino);
      if(!reset&&this.anchor&&this.modified!==info.mtimeMs) {
        const probe=Buffer.alloc(this.anchor.length);
        const {bytesRead}=await handle.read(probe,0,probe.length,this.offset-probe.length);
        if(bytesRead!==probe.length||!probe.equals(this.anchor))reset=true;
      }
      if(reset) {this.offset=0;this.pending=Buffer.alloc(0);this.skipping=false;this.anchor=null;this.onReset();replay=true;forceReplay=true;}
      this.inode=info.ino;
      // Lifecycle events must be contiguous, including in very large histories.
      // Splicing a prefix and tail can bind an old task start to a different turn's
      // completion. Stream once in bounded chunks; subsequent polls read only appends.
      const chunk=Buffer.alloc(64*1024);
      while(this.offset<info.size) {
        const {bytesRead}=await handle.read(chunk,0,Math.min(chunk.length,info.size-this.offset),this.offset);
        if(!bytesRead)break;
        this.offset+=bytesRead;this.bytesRead+=bytesRead;
        this.feed(chunk.subarray(0,bytesRead),replay,forceReplay);
      }
      if(this.offset) {
        this.anchor=Buffer.alloc(Math.min(64,this.offset));
        await handle.read(this.anchor,0,this.anchor.length,this.offset-this.anchor.length);
      }
      this.modified=info.mtimeMs;
      this.rebuildRequested=false;
      return {available:true,replayed:replay};
    } catch(error) {
      if(!['ENOENT','EBUSY','EPERM','EACCES'].includes(error.code))throw error;
      return {available:false,error:error.code};
    } finally {await handle?.close();}
  }
  rebuild() {this.offset=0;this.pending=Buffer.alloc(0);this.skipping=false;this.anchor=null;this.rebuildRequested=true;}
}

export class RolloutWatcher {
  constructor({root,onRecord=()=>{},onReplayDone=()=>{},onReset=()=>{},pollMs=750,rescanMs=15000,now=Date.now,maxFiles=512,isActive=()=>false}={}) {
    this.root=resolve(root);this.onRecord=onRecord;this.onReplayDone=onReplayDone;this.onReset=onReset;this.pollMs=pollMs;this.rescanMs=rescanMs;this.now=now;
    this.files=new Map();this.pending=new Set();this.failures=new Map();this.running=false;this.busy=false;this.malformed=0;this.errors=0;this.available=false;this.lastScan=0;this.startedAt=0;
    this.maxFiles=maxFiles;this.isActive=isActive;this.capacityLimited=new Set();
  }
  async discover() {
    const found=[];
    const walk=async(dir,depth)=>{
      if(depth>4)return;
      let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch{return;}
      for(const entry of entries) {
        const path=join(dir,entry.name);
        if(entry.isDirectory())await walk(path,depth+1);
        else if(entry.isFile()&&entry.name.endsWith('.jsonl')) {
          const info=await stat(path).catch(()=>null);
          if(info&&this.now()-info.mtimeMs<24*60*60*1000)found.push({path,mtime:info.mtimeMs});
        }
      }
    };
    await walk(this.root,0);found.sort((a,b)=>b.mtime-a.mtime);
    for(const f of found.slice(0,Math.min(256,this.maxFiles)))this.pending.add(f.path);
    this.lastScan=this.now();
  }
  async start() {
    if(this.running)return;
    this.running=true;
    this.startedAt=this.now();
    this.available=!!await stat(this.root).catch(()=>null);
    if(this.available) {
      try {
        this.osWatcher=watch(this.root,{recursive:true},(_event,name)=>{
          if(!name||!String(name).endsWith('.jsonl'))return;
          const path=resolve(this.root,String(name));const rel=relative(this.root,path);
          if(rel.startsWith('..')||isAbsolute(rel))return;
          this.pending.add(path);
          if(!this.debounce)this.debounce=setTimeout(()=>{this.debounce=null;void this.pump();},60);
        });
        this.osWatcher.on('error',()=>{this.errors++;});
      } catch {this.errors++;}
    }
    await this.discover();await this.pump();
    this.timer=setInterval(()=>void this.pump(true),this.pollMs);
  }
  async pump(poll=false) {
    if(!this.running||this.busy)return;
    this.busy=true;
    try {
      const available=!!await stat(this.root).catch(()=>null);
      if(!available) {
        if(this.available){for(const file of this.files.keys())this.onReset(file);this.files.clear();this.pending.clear();this.failures.clear();this.errors++;}
        this.available=false;return;
      }
      this.available=true;
      if(this.now()-this.lastScan>=this.rescanMs)await this.discover();
      if(poll)for(const file of this.files.keys())this.pending.add(file);
      const paths=[...this.pending];this.pending.clear();
      for(const file of paths) {
        if(!this.running)break;
        let tail=this.files.get(file);const initial=!tail;
        if(initial) {
          if(this.files.size>=this.maxFiles) {
            const candidate=[...this.files.entries()].filter(([path])=>!this.isActive(path)).sort((a,b)=>(a[1].modified??0)-(b[1].modified??0))[0];
            if(!candidate){this.capacityLimited.add(file);this.pending.add(file);continue;}
            this.onReset(candidate[0]);this.files.delete(candidate[0]);this.failures.delete(candidate[0]);
          }
          this.capacityLimited.delete(file);
          tail=new TailFile(file,{onRecord:(r,opts)=>{
            const time=Date.parse(r.timestamp??'');
            const fresh=opts.replay&&!opts.forceReplay&&Number.isFinite(time)&&time>=this.startedAt;
            this.onRecord(file,r,{replay:opts.replay&&!fresh});
          },onReset:()=>this.onReset(file),onMalformed:()=>this.malformed++});
          this.files.set(file,tail);
        }
        const result=await tail.readAvailable({replay:initial});
        if(!result?.available) {
          this.errors++;const failures=(this.failures.get(file)??0)+1;this.failures.set(file,failures);
          if(result?.error==='ENOENT'){this.onReset(file);this.files.delete(file);this.failures.delete(file);}
          else if(failures===3){this.onReset(file);tail.rebuild();}
        } else {
          this.failures.delete(file);
          if(initial||result.replayed)this.onReplayDone(file);
        }
      }
    } catch {this.errors++;} finally {this.busy=false;}
  }
  async close() {
    this.running=false;clearInterval(this.timer);clearTimeout(this.debounce);this.osWatcher?.close();
    while(this.busy)await new Promise(r=>setTimeout(r,5));
  }
  status() {return {running:this.running,sourceAvailable:this.available,bootstrapMode:'complete-stream',watchedFiles:this.files.size,unavailableFiles:this.failures.size,capacityLimitedFiles:this.capacityLimited.size,malformedRecords:this.malformed,readErrors:this.errors};}
}
