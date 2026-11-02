import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { APP_ROOT } from './prepare.mjs';
import settingsClient from './settings-client.cjs';
import appearances from './pet-appearances.cjs';
const action=process.argv[2]??'status';
try {
  const data=process.env.AGENT_MUSUME_DATA??join(APP_ROOT,'data');
  const runtime=JSON.parse(await readFile(join(data,'runtime.json'),'utf8'));
  const base=`http://127.0.0.1:${runtime.port}`;
  if(action==='panel') {const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',base+'/'],{windowsHide:true,detached:true,stdio:'ignore'});child.unref();}
  else if(action==='appearance') {
    const appearance=process.argv[3];if(!Object.hasOwn(appearances.APPEARANCES,appearance))throw new Error();
    const client=settingsClient.createSettingsClient({data,request:async(path,method='GET',body)=>{
      const r=await fetch(base+path,{method,headers:{'content-type':'application/json','x-deskpet-capability':runtime.capability},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
      if(!r.ok)throw new Error();return r.json();
    }});
    const view=await client.load();
    if(view.config.pets[0].appearance!==appearance){view.config.pets[0].appearance=appearance;await client.save(view);}
    console.log('已选择'+appearances.APPEARANCES[appearance]+'；右键设置可随时切换形象。');
  }
  else if(action==='status') {const r=await fetch(base+'/control/status',{signal:AbortSignal.timeout(3000)});console.log(JSON.stringify(await r.json(),null,2));}
  else {const r=await fetch(base+'/control/'+action,{method:'POST',headers:{'content-type':'application/json','x-deskpet-capability':runtime.capability},body:JSON.stringify(action==='preview'?{state:process.argv[3]}:{}),signal:AbortSignal.timeout(3000)});if(!r.ok)throw new Error();console.log('操作已完成。');}
} catch {console.error('桌宠尚未运行或无法连接。请先运行 npm start。');process.exitCode=1;}
