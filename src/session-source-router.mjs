import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),require=createRequire(import.meta.url);

export function classifyWriter(row,processes){
  const pid=Number(/^pid:(\d+):/.exec(row?.process_uuid??'')?.[1]);
  const p=processes.find(p=>p.pid===pid);
  if(!p||!Number.isFinite(row?.ts)||row.ts*1000<p.startedAt-1000)return null;
  return ['chatgpt-desktop','codex-cli'].includes(p.kind)?p.kind:null;
}

// Read only thread/PID/time metadata. Never read log bodies or change either database.
export class LiveWriterEvidence{
  constructor({database,now=Date.now}={}){this.database=database;this.now=now;this.processes=[];this.cache=new Map();this.available=false;this.failures=0}
  async refresh(){
    if(this.closed)return;
    try{
      const script=`$all=Get-CimInstance Win32_Process; $rows=@(); foreach($p in $all){if($p.Name -ine 'codex.exe'){continue};$parent=$all|Where-Object {$_.ProcessId -eq $p.ParentProcessId}|Select-Object -First 1;$kind=$null;if($p.CommandLine -match '(?:^|\\s)app-server(?:\\s|$)' -and $parent.Name -ieq 'ChatGPT.exe' -and $parent.ExecutablePath -match 'OpenAI'){$kind='chatgpt-desktop'}elseif($p.CommandLine -notmatch '(?:^|\\s)(?:app-server|exec-server)(?:\\s|$)'){$kind='codex-cli'};if($kind){$rows+=@{pid=[int]$p.ProcessId;kind=$kind;startedAt=([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds()}}};ConvertTo-Json -InputObject @($rows) -Compress`;
      const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:6000,maxBuffer:256*1024});
      if(this.closed)return;
      this.processes=JSON.parse(stdout.trim()||'[]');if(!Array.isArray(this.processes))this.processes=[this.processes];
      if(!this.db){const {DatabaseSync}=require('node:sqlite');this.db=new DatabaseSync(this.database,{readOnly:true});this.query=this.db.prepare("SELECT ts,process_uuid FROM logs WHERE thread_id=? AND target LIKE 'codex_core::%' ORDER BY ts DESC,ts_nanos DESC LIMIT 1")}
      this.available=true;this.cache.clear();
    }catch{this.failures++;this.available=false;this.processes=[];this.cache.clear()}
  }
  lookup(id){
    if(!this.available||typeof id!=='string')return null;
    const hit=this.cache.get(id);if(hit&&this.now()-hit.at<1000)return hit.source;
    try{const source=classifyWriter(this.query.get(id),this.processes);this.cache.set(id,{at:this.now(),source});return source}catch{this.failures++;return null}
  }
  status(){return{available:this.available,method:'live-writer-process',readErrors:this.failures}}
  close(){if(this.closed)return;this.closed=true;this.available=false;this.db?.close()}
}

export class SessionSourceRouter{
  constructor({desktop,cli,lookup=()=>null}={}){this.desktop=desktop;this.cli=cli;this.lookup=lookup;this.files=new Map()}
  consume(file,record,options={}){
    if(record?.type==='session_meta')this.files.set(file,{meta:record,source:undefined});
    const tracked=this.files.get(file);if(!tracked)return;
    const p=tracked.meta.payload??{},root=typeof p.source==='string'&&['cli','vscode','desktop','app'].includes(p.source)&&(/^(codex-tui|codex_cli_rs|codex-cli)$/i.test(p.originator??'')||/(?:codex|chatgpt).*desktop/i.test(p.originator??''));
    const observed=root?this.lookup(p.id):null;
    const source=observed??tracked.source??null;
    if(source!==tracked.source){
      if(tracked.source!==undefined){this.desktop.reset(file);this.cli.reset(file)}
      tracked.source=source;
      const meta=source?{...tracked.meta,payload:{...tracked.meta.payload,source:source==='chatgpt-desktop'?'desktop':'cli',originator:source==='chatgpt-desktop'?'Codex Desktop':'codex-tui'}}:tracked.meta;
      this.desktop.consume(file,meta,options);this.cli.consume(file,meta,options);
    }
    if(record.type!=='session_meta'){this.desktop.consume(file,record,options);this.cli.consume(file,record,options)}
  }
  /** Effective source of a root session file (live writer evidence first, then its own metadata). */
  sourceOf(file){
    const tracked=this.files.get(file);if(!tracked)return null;if(tracked.source)return tracked.source;
    const p=tracked.meta.payload??{};if(typeof p.source!=='string')return null;
    if(p.source==='cli'&&/^(codex-tui|codex_cli_rs|codex-cli)$/i.test(p.originator??''))return 'codex-cli';
    return ['vscode','desktop','app'].includes(p.source)&&/(?:codex|chatgpt).*desktop/i.test(p.originator??'')?'chatgpt-desktop':null;
  }
  finishReplay(file){this.desktop.finishReplay(file);this.cli.finishReplay(file)}
  reset(file){this.files.delete(file);this.desktop.reset(file);this.cli.reset(file)}
}
