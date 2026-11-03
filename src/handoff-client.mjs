import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';

export function dataDirectories(){
  return [...new Set([process.env.AGENT_MUSUME_DATA,join(fileURLToPath(new URL('../',import.meta.url)),'data'),
    join(process.env.APPDATA??join(homedir(),'AppData','Roaming'),'Agent-Musume')].filter(Boolean))];
}
/** Never echo runtime capabilities, task contents, command arguments or raw network errors. */
export async function sendHandoff(event,{directories=dataDirectories(),timeoutMs=1800}={}){
  for(const data of directories){
    try{
      const runtime=JSON.parse(await readFile(join(data,'runtime.json'),'utf8'));
      if(!Number.isSafeInteger(runtime.port)||runtime.port<1||runtime.port>65535||typeof runtime.capability!=='string')continue;
      const response=await fetch(`http://127.0.0.1:${runtime.port}/control/handoff`,{method:'POST',headers:{'content-type':'application/json','x-deskpet-capability':runtime.capability},body:JSON.stringify(event),signal:AbortSignal.timeout(timeoutMs)});
      if(response.ok)return await response.json();
      if(response.status===400)return {ok:false,error:'桌宠拒绝了无效的交接事件。'};
    }catch{}
  }
  return {ok:false,error:'桌宠未运行或交接接口尚未更新。'};
}
