import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,access,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {HarnessMonitor} from '../src/harness-monitor.mjs';
import {HandoffTracker} from '../src/handoffs.mjs';
import {CollabTracker} from '../src/collab-tracker.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

test('Windows command tokens distinguish real options from quoted prompts and accept global Codex options',{skip:process.platform!=='win32'},async()=>{
  const file=fileURLToPath(new URL('../src/harness-processes.ps1',import.meta.url));
  const cases=[['claude-code','claude.exe "Explain the -p flag"','interactive-task'],['claude-code','claude.exe -p "Explain the flag"','cli-task'],
    ['codex-cli','codex.exe --model test-model exec "task"','cli-task'],['codex-cli','codex.exe --profile work exec "task"','cli-task'],
    ['codex-cli','codex.exe "Explain exec"','interactive-task'],['claude-code','claude.exe --version','metadata'],
    // An interactive session started with a task, and the ones without: option values, commands, background jobs.
    ['claude-code','claude.exe','interactive'],['claude-code','claude.exe --model opus --permission-mode plan','interactive'],
    ['claude-code','claude.exe --model opus "Fix the build"','interactive-task'],['claude-code','claude.exe --add-dir D:\\a D:\\b','interactive'],
    ['claude-code','claude.exe --add-dir D:\\a --model opus "Fix it"','interactive-task'],['claude-code','claude.exe -r','interactive'],
    ['claude-code','claude.exe --resume 6d4438a2 "Carry on"','interactive-task'],['claude-code','claude.exe -c "Carry on"','interactive-task'],
    ['claude-code','claude.exe --name=work "Fix it"','interactive-task'],['claude-code','claude.exe -- "Fix it"','interactive-task'],
    ['claude-code','claude.exe --bg "Fix it"','interactive'],['claude-code','claude.exe agents','interactive'],['claude-code','claude.exe mcp list','metadata'],
    ['codex-cli','codex.exe','interactive'],['codex-cli','codex.exe -m gpt -C D:\\work "Fix it"','interactive-task'],['codex-cli','codex.exe resume --last','interactive'],
    ['codex-cli','codex.exe review','cli-task'],['codex-cli','codex.exe login','metadata'],
    ['codex-cli','codex.exe exec "Review the app-server output"','cli-task'],['codex-cli','codex.exe app-server','metadata'],
    ['codex-cli','codex.exe exec "Review the exec-server output"','cli-task'],['codex-cli','codex.exe --__codex-windows-mxc','metadata']];
  const quote=v=>"'"+v.replaceAll("'","''")+"'";
  const script=cases.map(([source,command])=>`& ${quote(file)} -ClassifyOnly -Source ${quote(source)} -CommandLine ${quote(command)}`).join('\n');
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true});
  const actual=stdout.trim().split(/\r?\n/).map(s=>JSON.parse(s));assert.deepEqual(actual.map(r=>r.mode),cases.map(c=>c[2]));
});

test('text handed to an open agent names its target: Herdr prompts and keys, terminal panes, Codex queues',{skip:process.platform!=='win32'},async()=>{
  const file=fileURLToPath(new URL('../src/harness-processes.ps1',import.meta.url));
  const cases=[['herdr.exe','herdr.exe agent prompt wD:p1 "Count the multiples of 4." --wait --timeout 45000',{mode:'herdr-prompt',target:'wD:p1',wait:true}],
    ['herdr.exe','herdr.exe agent prompt wD:p2 "Do it"',{mode:'herdr-prompt',target:'wD:p2',wait:false}],
    ['herdr.exe','herdr.exe agent prompt wD:p1 /model claude-sonnet-5-5',{mode:'herdr-command',target:'wD:p1',wait:false}],
    ['herdr.exe','herdr.exe agent prompt wD:p1 "  /effort medium"',{mode:'herdr-command',target:'wD:p1',wait:false}],
    ['herdr.exe','herdr.exe agent send-keys wD:p1 Enter',{mode:'herdr-keys',target:'wD:p1',wait:false}],
    ['herdr.exe','herdr.exe agent read wD:p1 --lines 12',{mode:'other',target:null,wait:false}],['herdr.exe','herdr.exe server',{mode:'other',target:null,wait:false}],
    ['wezterm.exe','wezterm.exe cli send-text --pane-id 3 "do it"',{mode:'term-text',target:'3',wait:false}],
    ['wezterm.exe','wezterm.exe cli send-text --no-paste "hi"',{mode:'term-text',target:'',wait:false}],['wezterm.exe','wezterm.exe start',{mode:'other',target:null,wait:false}],
    ['codex.exe','codex.exe -c x=1 queue --message "m" --thread 019f5bc0-a9cb-76b2-922e-ea1d48f629b1',{mode:'codex-queue',target:'019f5bc0-a9cb-76b2-922e-ea1d48f629b1',wait:false}],
    ['codex.exe','codex.exe exec "queue --thread x"',{mode:'other',target:null,wait:false}],
    // A new tab or window that runs Claude Code or Codex, through Windows Terminal or WezTerm.
    ['wt.exe','wt.exe -w 0 nt -d D:\\claude claude "Fix it"',{mode:'term-launch',target:'claude-code',wait:false}],
    ['wt.exe','wt.exe new-tab --title claude cmd /k C:\\Users\\A\\.local\\bin\\claude.exe "Fix it"',{mode:'term-launch',target:'claude-code',wait:false}],
    ['wt.exe',`wt.exe -w 0 sp pwsh -NoExit -Command "codex 'Fix it'"`,{mode:'term-launch',target:'codex-cli',wait:false}],
    ['wt.exe','wt.exe -d D:\\claude',{mode:'other',target:null,wait:false}],['wt.exe','wt.exe nt cmd /k claude-tools.exe',{mode:'other',target:null,wait:false}],
    ['wezterm.exe','wezterm.exe cli spawn --cwd D:\\codex -- claude "Fix it"',{mode:'term-launch',target:'claude-code',wait:false}],
    ['wezterm.exe','wezterm.exe --config-file x.lua start -- codex "Fix it"',{mode:'term-launch',target:'codex-cli',wait:false}],
    ['wezterm.exe','wezterm.exe cli spawn',{mode:'other',target:null,wait:false}]];
  const quote=v=>"'"+v.replaceAll("'","''")+"'";
  const script=cases.map(([program,command])=>`& ${quote(file)} -ClassifyOnly -Source ${quote('relay:'+program)} -CommandLine ${quote(command)}`).join('\n');
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true});
  assert.deepEqual(stdout.trim().split(/\r?\n/).map(s=>JSON.parse(s)),cases.map(c=>c[2]));
});

test('Windows observer runs an extracted real file and observes a CLI exit without invoking a model',{skip:process.platform!=='win32'},async()=>{
  const data=await mkdtemp(join(tmpdir(),'musume-observer-')),rows=[],exits=[];
  const m=new HarnessMonitor({data,tracker:new HandoffTracker({collab:new CollabTracker()})});
  m.links={snapshot:r=>rows.push(...r),exited:e=>exits.push(e),active:new Map()};let worker;
  try{
    await m.start();await access(join(data,'runtime','harness-processes.ps1'));
    for(let i=0;i<60&&!m.available;i++)await sleep(100);assert(m.available,'observer ready');
    const folder=join(data,'node_modules','@anthropic-ai','claude-code');await mkdir(folder,{recursive:true});const mock=join(folder,'mock.mjs');
    await writeFile(mock,'setTimeout(()=>process.exit(9),3000)');
    worker=spawn(process.execPath,[mock,'-p'],{windowsHide:true,stdio:'ignore'});
    for(let i=0;i<80&&!exits.some(e=>e.pid===worker.pid);i++)await sleep(100);
    const seen=rows.find(r=>r.pid===worker.pid);assert.equal(seen?.source,'claude-code');assert.equal(seen?.mode,'cli-task');
    assert.equal(exits.find(e=>e.pid===worker.pid)?.exitCode,9);assert.equal(m.errors,0);
    assert(rows.every(r=>!Object.hasOwn(r,'CommandLine')&&!Object.hasOwn(r,'command')));
  }finally{m.close();if(worker&&worker.exitCode===null)worker.kill();await sleep(200);await rm(data,{recursive:true,force:true});}
});
