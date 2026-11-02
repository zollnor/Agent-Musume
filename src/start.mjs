import { mkdir,open } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { APP_ROOT,NO_ELECTRON,electronPath } from './prepare.mjs';
if(!electronPath()){console.error(NO_ELECTRON);process.exit(1);}
const data=process.env.AGENT_MUSUME_DATA??join(APP_ROOT,'data');
await mkdir(data,{recursive:true});
const out=await open(join(data,'runtime.log'),'a');
const child=spawn(process.execPath,[join(APP_ROOT,'src','main.mjs')],{cwd:APP_ROOT,detached:true,windowsHide:true,stdio:['ignore',out.fd,out.fd]});
child.unref();await out.close();
console.log('已请求启动 Agent-Musume；稍候可在托盘查看状态或退出。');
