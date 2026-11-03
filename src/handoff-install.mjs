import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

/** Install only a dedicated new skill; never edit AGENTS.md, settings, credentials or existing skills. */
export async function installHandoffSkill({home=homedir(),executable=process.execPath,roots}={}){
  const entry=fileURLToPath(new URL('./handoff.mjs',import.meta.url));
  const template=await readFile(new URL('./handoff-skill.md',import.meta.url),'utf8');
  const launcherTemplate=await readFile(new URL('./handoff-launcher.ps1',import.meta.url),'utf8');
  const destinations=roots??[join(process.env.CODEX_HOME??join(home,'.codex'),'skills'),join(process.env.CLAUDE_CONFIG_DIR??join(home,'.claude'),'skills'),join(process.env.AGENT_MUSUME_DSH_HOME??process.env.DSH_HOME??join(home,'.dsh'),'skills')];
  const files=[],planned=[],marker='agent-musume-managed-handoff:v1';
  for(const root of destinations){
    const dir=join(root,'agent-musume-handoff'),launcher=join(dir,'scripts','handoff.ps1'),skill=join(dir,'SKILL.md'),legacy=join(dir,'scripts','handoff.cmd');
    const content=template.replace('__LAUNCHER__',launcher.replaceAll('\\','/'));
    const quote=value=>"'"+value.replaceAll("'","''")+"'";
    const wrapper=launcherTemplate.replace('__EXECUTABLE__',quote(executable)).replace('__ENTRY__',quote(entry));
    const existing=await readdir(dir).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
    for(const [file,text] of [[skill,content],[launcher,wrapper]]){
      let previous;try{previous=await readFile(file,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
      if(previous&&!previous.includes(marker))throw new Error('同名目录已有非本程序管理的文件，未覆盖。');
      planned.push({file,text,previous});
    }
    let oldLauncher;try{oldLauncher=await readFile(legacy,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
    if(oldLauncher&&!oldLauncher.includes(marker))throw new Error('同名目录已有非本程序管理的文件，未覆盖。');
    const owned=planned.slice(-2).some(p=>p.previous?.includes(marker))||oldLauncher?.includes(marker);
    if(existing.length&&!owned)throw new Error('同名技能目录已被占用，未覆盖。');
    // Retire our previous batch entry without interpreting any arguments or deleting user files.
    if(oldLauncher)planned.push({file:legacy,text:`@echo off\r\nrem ${marker}\r\necho Please use handoff.ps1.\r\nexit /b 2\r\n`,previous:oldLauncher});
  }
  // Preflight every destination before writing any of them.
  for(const {file,text,previous} of planned){await mkdir(dirname(file),{recursive:true});if(previous&&previous!==text)await writeFile(file+'.previous',previous);await writeFile(file,text);files.push(file);}
  return {ok:true,files};
}
