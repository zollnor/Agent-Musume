import {spawn,execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {HARNESS_SOURCES} from './handoffs.mjs';
import {sendHandoff} from './handoff-client.mjs';

export async function runHandoff({from,to,command,args=[],id=randomUUID(),notify=sendHandoff,stdio='inherit'}={}){
  if(!HARNESS_SOURCES.includes(from)||!['codex-cli','claude-code'].includes(to)||from===to||typeof command!=='string'||!command)return 2;
  const task={id,from,to};let child;
  try{child=spawn(command,args,{stdio,windowsHide:true,shell:false,detached:process.platform!=='win32'});}catch{return 1;}
  let started=Promise.resolve(),signal=null,cancellation=Promise.resolve();
  const interrupt=()=>{
    if(signal)return;signal='cancelled';
    if(process.platform==='win32'&&child.pid)cancellation=new Promise(resolve=>execFile('taskkill.exe',['/pid',String(child.pid),'/t','/f'],{windowsHide:true,timeout:5000},()=>resolve()));
    else try{process.kill(-child.pid,'SIGTERM');}catch{child.kill();}
  };
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  return await new Promise(resolve=>{
    child.once('spawn',()=>{started=Promise.resolve(notify({...task,phase:'started'})).catch(()=>{});});
    child.once('error',()=>resolve(1)); // a process which did not start cannot stage a successful assignment
    child.once('close',async code=>{
      await started;await cancellation;
      if(child.pid)await Promise.resolve(notify({...task,phase:signal?'cancelled':code===0?'delivered':'failed'})).catch(()=>{});
      resolve(signal?130:code??1);
    });
  }).finally(()=>{process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);});
}

async function main(argv){
  const [action,...rest]=argv,options={};const separator=rest.findIndex(value=>value==='--command'||value==='--'),flags=separator<0?rest:rest.slice(0,separator),command=separator<0?[]:rest.slice(separator+1);
  for(let i=0;i<flags.length;i+=2){if(!['--from','--to','--id'].includes(flags[i])||!flags[i+1])throw new Error('用法：run --from 来源 --to 目标 --command 程序 参数；已有会话用 started/delivered/failed/cancelled --id 任务标识。');options[flags[i].slice(2)]=flags[i+1];}
  if(action==='install'){const {installHandoffSkill}=await import('./handoff-install.mjs');const result=await installHandoffSkill();console.log(JSON.stringify(result));return 0;}
  if(action==='run')return runHandoff({...options,command:command[0],args:command.slice(1)});
  if(!['started','delivered','failed','cancelled'].includes(action)||!options.from||!options.to)throw new Error('请指定交接状态、--from 和 --to。');
  const id=options.id??(action==='started'?randomUUID():null);if(!id)throw new Error('回传和失败事件需要原任务的 --id。');
  const result=await sendHandoff({...options,id,phase:action});
  console.log(JSON.stringify({...result,...(result.ok?{id}:{} )}));return result.ok?0:1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{process.exitCode=await main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=2;}}
