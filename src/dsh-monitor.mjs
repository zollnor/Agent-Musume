import {readdir,stat,open} from 'node:fs/promises';
import {watch} from 'node:fs';
import {join} from 'node:path';
import {zstdDecompressSync} from 'node:zlib';
// DeepSeek Harness writes each session as zstd frames appended to ~/.dsh/sessions/<cwd>/<session>/session.v4.jsonl.zstd,
// a frame every one to three events, so following new frames is as live as the plugin stream the original pet had.
const RECENT_MS=2*60*60*1000; // sessions written to in the last two hours are followed; older ones are history

/** Length of the zstd frame at pos, read from its header and block headers (RFC 8878), or 0 while it is incomplete.
 *  The decoder itself cannot tell: given half a frame it returns what it has. Throws on bytes that are not a frame. */
export function frameLength(buf,pos) {
  const need=n=>pos+n<=buf.length;
  if(!need(4))return 0;
  const magic=buf.readUInt32LE(pos);
  if(magic>=0x184d2a50&&magic<=0x184d2a5f){if(!need(8))return 0;const n=8+buf.readUInt32LE(pos+4);return need(n)?n:0;} // skippable
  if(magic!==0xfd2fb528)throw new Error('not a zstd frame');
  if(!need(5))return 0;
  const fhd=buf[pos+4],single=(fhd>>5)&1,checksum=(fhd>>2)&1,fcs=[single,2,4,8][fhd>>6],did=[0,1,2,4][fhd&3];
  let at=5+(single?0:1)+did+fcs;
  for(;;){
    if(!need(at+3))return 0;
    const h=buf[pos+at]|(buf[pos+at+1]<<8)|(buf[pos+at+2]<<16),type=(h>>1)&3;
    if(type===3)throw new Error('reserved zstd block');
    at+=3+(type===1?1:h>>>3);
    if(h&1)break;
  }
  at+=checksum?4:0;
  return need(at)?at:0;
}

/** Follows one appended-frames file: decodes every complete frame once, keeps an incomplete tail for the next read. */
export class ZstdTail {
  constructor(file,{onRecord,onMalformed=()=>{}}){this.file=file;this.onRecord=onRecord;this.onMalformed=onMalformed;this.offset=0;this.size=0;this.partial='';}
  async readAvailable({replay=false}={}){
    let handle;try{handle=await open(this.file,'r');}catch{return {available:false};}
    try{
      const {size}=await handle.stat();
      if(size<this.offset){this.offset=0;this.partial='';} // rewritten (compaction): start over
      if(size===this.offset)return {available:true};
      const chunk=Buffer.alloc(size-this.offset);await handle.read(chunk,0,chunk.length,this.offset);
      let used=0;
      while(used<chunk.length){
        let length;try{length=frameLength(chunk,used);}catch{this.onMalformed();used=chunk.length;break;} // unreadable: skip what is there
        if(!length)break; // the last frame is still being written
        const frame=chunk.subarray(used,used+length);used+=length;
        if(frame.readUInt32LE(0)!==0xfd2fb528)continue; // skippable frame
        let text;try{text=zstdDecompressSync(frame).toString('utf8');}catch{this.onMalformed();continue;}
        const lines=(this.partial+text).split('\n');this.partial=lines.pop(); // a line split across frames waits for the rest
        for(const line of lines){if(!line.trim())continue;let r;try{r=JSON.parse(line);}catch{this.onMalformed();continue;}this.onRecord(r,{replay});}
      }
      this.offset+=used;this.size=size;return {available:true};
    }finally{await handle.close();}
  }
}

export class DshMonitor {
  constructor({root,adapter,pollMs=750,onChange=()=>{},now=Date.now}={}){
    this.root=root;this.adapter=adapter;this.pollMs=pollMs;this.onChange=onChange;this.now=now;
    this.tails=new Map();this.watchers=[];this.running=false;this.current=null;this.again=false;this.available=false;this.errors=0;this.malformed=0;
  }
  async start(){this.running=true;this.startedAt=this.now();this.watch();await this.pump();this.timer=setInterval(()=>void this.pump(),this.pollMs);}
  /** A write under the sessions folder wakes the pump at once; the poll stays as the fallback. */
  watch(){
    const wake=()=>{if(!this.debounce)this.debounce=setTimeout(()=>{this.debounce=null;void this.pump();},30);};
    try{const w=watch(join(this.root,'sessions'),{recursive:true,persistent:false},(_e,name)=>{if(name&&String(name).endsWith('.zstd'))wake();});w.on('error',()=>{this.errors++;});this.watchers.push(w);}catch{this.errors++;}
  }
  async files(){
    const root=join(this.root,'sessions'),out=[];
    const dirs=await readdir(root,{withFileTypes:true}).catch(()=>null);this.available=dirs!==null;
    for(const dir of dirs??[]){
      if(!dir.isDirectory())continue;
      for(const session of await readdir(join(root,dir.name),{withFileTypes:true}).catch(()=>[])){
        if(!session.isDirectory())continue;
        const file=join(root,dir.name,session.name,'session.v4.jsonl.zstd'); // older sessions also keep a pre-v4 file
        const info=await stat(file).catch(()=>null);
        if(info&&(this.tails.has(file)||this.now()-info.mtimeMs<RECENT_MS))out.push(file);
      }
    }
    return out;
  }
  /** Reads what is new. A call while a read runs gets that read plus one more pass for whatever landed meanwhile. */
  pump(){
    if(!this.running)return Promise.resolve();
    if(this.current){this.again=true;return this.current;}
    this.current=(async()=>{
      do{this.again=false;await this.read();this.onChange();}while(this.again&&this.running);
    })().finally(()=>{this.current=null;});
    return this.current;
  }
  async read(){
    try{
      for(const file of await this.files()){
        let tail=this.tails.get(file);const initial=!tail;
        if(initial){tail=new ZstdTail(file,{onRecord:(r,o)=>this.adapter.consume(file,r,o),onMalformed:()=>this.malformed++});this.tails.set(file,tail);}
        const result=await tail.readAvailable({replay:initial});
        if(!result.available){this.errors++;this.adapter.reset(file);this.tails.delete(file);continue;}
        if(initial)this.adapter.finishReplay(file); // a turn still running when the pet started shows at once
      }
    }catch{this.errors++;}
  }
  status(){return {running:this.running,sourceAvailable:this.available,watchedFiles:this.tails.size,readErrors:this.errors,malformedRecords:this.malformed};}
  async close(){this.running=false;clearInterval(this.timer);clearTimeout(this.debounce);for(const w of this.watchers)w.close();this.watchers=[];await this.current;}
}
