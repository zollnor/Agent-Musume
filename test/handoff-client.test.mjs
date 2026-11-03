import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {runHandoff} from '../src/handoff.mjs';
import {sendHandoff} from '../src/handoff-client.mjs';
import {installHandoffSkill} from '../src/handoff-install.mjs';

test('runner reports actual spawn and exit while leaving work independent from the pet',async()=>{
  for(const exit of [0,7]){
    const events=[];const code=await runHandoff({from:'claude-code',to:'codex-cli',command:process.execPath,args:['-e',`process.exit(${exit})`],stdio:'ignore',notify:async e=>{events.push(e);}});
    assert.equal(code,exit);assert.deepEqual(events.map(e=>e.phase),['started',exit===0?'delivered':'failed']);
    assert.equal(events[0].id,events[1].id);assert(!JSON.stringify(events).includes('process.exit'));
  }
  assert.equal(await runHandoff({from:'dsh-desktop',to:'claude-code',command:process.execPath,args:['-e','process.exit(0)'],stdio:'ignore',notify:()=>Promise.reject(new Error('offline'))}),0);
  const events=[];assert.equal(await runHandoff({from:'dsh-desktop',to:'claude-code',command:'Z:/missing-agent-executable.exe',stdio:'ignore',notify:e=>events.push(e)}),1);
  assert.deepEqual(events,[]);
});

test('client uses loopback and capability without leaking metadata; rejects invalid events',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'musume-handoff-'));let received;
  const server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;received={url:req.url,cap:req.headers['x-deskpet-capability'],body:JSON.parse(raw)};res.setHeader('content-type','application/json');res.end('{"ok":true}');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    await writeFile(join(dir,'runtime.json'),JSON.stringify({port:server.address().port,capability:'test-only-capability'}));
    const event={id:'random',from:'chatgpt-desktop',to:'claude-code',phase:'started'};
    assert.deepEqual(await sendHandoff(event,{directories:[dir]}),{ok:true});
    assert.equal(received.url,'/control/handoff');assert.equal(received.cap,'test-only-capability');assert.deepEqual(received.body,event);
    assert.deepEqual(await sendHandoff(event,{directories:[join(dir,'missing')]}),{ok:false,error:'桌宠未运行或交接接口尚未更新。'});
  }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});

test('integration install is local, portable, and preserves unrelated configuration',async()=>{
  const home=await mkdtemp(join(tmpdir(),'musume-skill-'));
  try{
    const roots=['codex','claude','dsh'].map(p=>join(home,p));
    const result=await installHandoffSkill({home,roots});assert.equal(result.files.length,6);
    for(const root of roots){const skill=await readFile(join(root,'agent-musume-handoff','SKILL.md'),'utf8');assert(!skill.includes('__LAUNCHER__'));assert.match(skill,/cancelled/);}
    assert.deepEqual((await installHandoffSkill({home,roots})).files,result.files);
  }finally{await rm(home,{recursive:true,force:true});}
});

test('installer preflights every file and preserves an existing unmanaged launcher',async()=>{
  const home=await mkdtemp(join(tmpdir(),'musume-conflict-'));
  try{
    const roots=[join(home,'first'),join(home,'occupied')],dir=join(roots[1],'agent-musume-handoff','scripts');await mkdir(dir,{recursive:true});
    const file=join(dir,'handoff.cmd');await writeFile(file,'USER CONTENT');
    await assert.rejects(installHandoffSkill({home,roots}),/未覆盖/);
    assert.equal(await readFile(file,'utf8'),'USER CONTENT');
    await assert.rejects(access(join(roots[0],'agent-musume-handoff','SKILL.md')));
  }finally{await rm(home,{recursive:true,force:true});}
});

test('installer respects custom configuration homes',async()=>{
  const home=await mkdtemp(join(tmpdir(),'musume-homes-'));const old={};
  for(const name of ['CODEX_HOME','CLAUDE_CONFIG_DIR','DSH_HOME','AGENT_MUSUME_DSH_HOME'])old[name]=process.env[name];
  try{
    process.env.CODEX_HOME=join(home,'codex-custom');process.env.CLAUDE_CONFIG_DIR=join(home,'claude-custom');process.env.DSH_HOME=join(home,'dsh-custom');delete process.env.AGENT_MUSUME_DSH_HOME;
    const result=await installHandoffSkill({home});assert(result.files.includes(join(home,'claude-custom','skills','agent-musume-handoff','SKILL.md')));
  }finally{for(const [name,value] of Object.entries(old)){if(value===undefined)delete process.env[name];else process.env[name]=value;}await rm(home,{recursive:true,force:true});}
});

test('installed PowerShell entry forwards metacharacters as data instead of executing them',{skip:process.platform!=='win32'},async()=>{
  const home=await mkdtemp(join(tmpdir(),'musume-arguments-'));
  try{
    const root=join(home,'skills');await installHandoffSkill({home,roots:[root]});
    const entry=join(root,'agent-musume-handoff','scripts','handoff.ps1').replaceAll("'","''");
    const script=`& '${entry}' invalid 'a&echo.INJECTED'; exit $LASTEXITCODE`;
    let stdout='',code,stderr;try{const result=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true});stdout=result.stdout;}catch(error){stdout=error.stdout??'';stderr=error.stderr;code=error.code;}
    assert(!stdout.includes('INJECTED'));assert.equal(code,2);assert.match(stderr,/用法|请指定/);
  }finally{await rm(home,{recursive:true,force:true});}
});

test('installed run preserves full native argv and reports the actual task through the bridge',{skip:process.platform!=='win32'},async()=>{
  const home=await mkdtemp(join(tmpdir(),'musume-roundtrip-')),phases=[];
  const server=createServer(async(req,res)=>{let raw='';for await(const part of req)raw+=part;phases.push(JSON.parse(raw).phase);res.end('{"ok":true}');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    await writeFile(join(home,'runtime.json'),JSON.stringify({port:server.address().port,capability:'test-only'}));
    const root=join(home,'skills'),probe=join(home,'probe.cjs'),output=join(home,'argv.json');await installHandoffSkill({home,roots:[root]});
    await writeFile(probe,`require('node:fs').writeFileSync(${JSON.stringify(output)},JSON.stringify(process.argv.slice(2)));`);
    const expected=['{"x":"y"}','','a"b','a&echo.INJECTED','x|y','C:\\trailing\\','plain'];
    const quote=v=>"'"+v.replaceAll("'","''")+"'";
    const script=`& ${quote(join(root,'agent-musume-handoff','scripts','handoff.ps1'))} run --from chatgpt-desktop --to codex-cli --command ${[process.execPath,probe,...expected].map(quote).join(' ')}`;
    const result=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,env:{...process.env,AGENT_MUSUME_DATA:home}});
    assert.deepEqual(JSON.parse(await readFile(output,'utf8')),expected);assert.deepEqual(phases,['started','delivered']);assert(!result.stdout.includes('INJECTED'));
  }finally{await new Promise(r=>server.close(r));await rm(home,{recursive:true,force:true});}
});

test('cancelling a Windows shell wrapper terminates the owned worker tree', {skip:process.platform!=='win32'}, async()=>{
  const home=await mkdtemp(join(tmpdir(),'musume-cancel-'));let worker;
  try{
    const pidFile=join(home,'pid.txt'),script=join(home,'parent.cjs'),events=[];
    await writeFile(script,`const {spawn}=require('node:child_process');const fs=require('node:fs');const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pidFile)},String(p.pid));setInterval(()=>{},1000);`);
    const run=runHandoff({from:'chatgpt-desktop',to:'claude-code',command:process.env.ComSpec??'cmd.exe',args:['/d','/c','node',script],stdio:'ignore',notify:e=>events.push(e)});
    for(let i=0;i<40;i++){try{worker=Number(await readFile(pidFile,'utf8'));break;}catch{}await new Promise(r=>setTimeout(r,50));}
    assert(worker,'owned worker started');process.emit('SIGINT');assert.equal(await run,130);
    assert.deepEqual(events.map(e=>e.phase),['started','cancelled']);
    let alive=true;try{process.kill(worker,0);}catch{alive=false;}assert.equal(alive,false,'no orphan worker after cancellation');
  }finally{if(worker)try{process.kill(worker);}catch{}await rm(home,{recursive:true,force:true});}
});
