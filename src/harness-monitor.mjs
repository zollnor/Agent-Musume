import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ProcessHandoffs} from './handoffs.mjs';
import {HerdrRelays} from './herdr-relays.mjs';
import {SessionRelays} from './session-turns.mjs';

export class HarnessMonitor {
  constructor({tracker,turns=null,data=join(tmpdir(),'agent-musume-'+process.pid),onChange=()=>{}}={}){
    // Herdr panes answer for themselves; a terminal pane or a Codex queue is known by the session turn it starts.
    const herdr=new HerdrRelays({tracker,turns}),sessions=new SessionRelays({tracker,turns});
    this.relays={dispatched:r=>r.kind.startsWith('herdr')?herdr.dispatched(r):sessions.dispatched(r),exited:(key,code)=>herdr.exited(key,code)||sessions.exited(key,code),close(){herdr.close();sessions.close();}};
    this.links=new ProcessHandoffs({tracker,relays:this.relays});this.data=data;this.onChange=onChange;this.running=false;this.available=false;this.errors=0;this.processes=0;}
  async start(){
    if(this.running||process.platform!=='win32')return;this.running=true;
    let script;
    try{
      // An external PowerShell cannot open a file inside app.asar. Extract only this public script.
      const folder=join(this.data,'runtime');await mkdir(folder,{recursive:true});script=join(folder,'harness-processes.ps1');
      await writeFile(script,await readFile(new URL('./harness-processes.ps1',import.meta.url)));
    }catch{this.running=false;this.errors++;return;}
    if(!this.running)return;
    const child=this.child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-OwnerPid',String(process.pid)],{windowsHide:true,stdio:['ignore','pipe','ignore']});
    let buffer='';child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{
      buffer+=chunk;if(buffer.length>2*1024*1024){buffer='';this.errors++;return;}
      let at;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at).replace(/^\uFEFF/,'');buffer=buffer.slice(at+1);
        try{const record=JSON.parse(line);
          if(record.type==='snapshot'){this.links.snapshot(record.rows);this.available=true;this.processes=record.rows.filter(p=>p.source&&p.mode!=='gone').length;}
          else if(record.type==='exit')this.links.exited(record);
          else if(record.type==='unavailable'){this.available=false;this.errors++;}
          this.onChange();
        }catch{this.errors++;}
      }
    });
    child.on('error',()=>{this.errors++;this.available=false;});
    child.on('exit',()=>{this.available=false;if(this.running){this.errors++;this.running=false;this.retry=setTimeout(()=>this.start(),3000);this.retry.unref();}});
  }
  status(){return {running:this.running,available:this.available,harnessProcesses:this.processes,activeLinks:this.links.active.size,readErrors:this.errors};}
  close(){this.running=false;clearTimeout(this.retry);this.child?.kill();this.relays.close();}
}
