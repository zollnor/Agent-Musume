import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn,execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { APP_ROOT } from '../src/prepare.mjs';
const run=promisify(execFile),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const data=join(APP_ROOT,'data'),path=join(data,'runtime.json');
const old=JSON.parse(await readFile(path,'utf8'));
const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Get-CimInstance Win32_Process -Filter "ParentProcessId=${old.pid} AND Name='electron.exe'" | Select-Object -ExpandProperty ProcessId | ConvertTo-Json`],{windowsHide:true});
const value=stdout.trim()?JSON.parse(stdout):[];const helpers=Array.isArray(value)?value:[value];
const result=await fetch(`http://127.0.0.1:${old.port}/control/stop`,{method:'POST',headers:{'x-deskpet-capability':old.capability}});assert(result.ok);
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
for(let i=0;i<50&&(alive(old.pid)||helpers.some(alive));i++)await sleep(100);
assert(!alive(old.pid),'owned host must stop');assert(!helpers.some(alive),'owned helper must stop');
const child=spawn(process.execPath,[join(APP_ROOT,'src','start.mjs')],{windowsHide:true,stdio:'ignore'});await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});
let current,status;
for(let i=0;i<80;i++) {
  try {current=JSON.parse(await readFile(path,'utf8'));if(current.pid!==old.pid){status=await (await fetch(`http://127.0.0.1:${current.port}/control/status`)).json();if(status.watcher.running)break;}}catch{}
  await sleep(100);
}
assert(current?.pid!==old.pid&&status?.watcher.running,'new independent instance must start');
const badShutdown=await fetch(`http://127.0.0.1:${current.port}/shutdown`);assert.equal(badShutdown.status,403);
const encodedChat=await fetch(`http://127.0.0.1:${current.port}/dsh-pet-7340/%63hat`);assert.equal(encodedChat.status,403);
await mkdir(join(data,'qa'),{recursive:true});
await writeFile(join(data,'qa','lifecycle-verification.json'),JSON.stringify({ok:true,ownedHostStopped:true,ownedHelperStopped:true,ownedHelperCount:helpers.length,restarted:true,liveMonitoring:status.watcher.running,legacyGetShutdownDenied:true,encodedChatDenied:true},null,2)+'\n');
console.log('PASS owned host/helper stopped, restarted, live monitoring and HTTP restrictions verified.');
