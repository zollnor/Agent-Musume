'use strict';
const {readFile,writeFile}=require('node:fs/promises');
const {join}=require('node:path');
const {createHash}=require('node:crypto');
const {normalizeSources,SOURCE_LABELS}=require('./reaction-sources.cjs');
const {normalizeAppearance,APPEARANCES,normalizeActivity,ACTIVITIES}=require('./pet-appearances.cjs');
const {normalizeInteraction,interactionValid}=require('./interaction-catalog.cjs');
const fields=['pets','physics','confineToScreen'];
function validateSettings(config) {
  if(!config||!Array.isArray(config.pets)||!config.pets.length||config.pets.length>24)throw new Error('请保留 1～24 只宠物。');
  const ids=new Set();let desktop=false;
  for(const p of config.pets) {
    if(typeof p.id!=='string'||!p.id||p.id.length>64||/[<>:"/\\|?*\x00-\x1f]/.test(p.id))throw new Error('宠物标识无效。');
    if(ids.has(p.id))throw new Error('宠物标识重复。');ids.add(p.id);
    if(typeof p.name!=='string'||p.name.length>80)throw new Error('名字最多 80 个字符。');
    if(p.appearance!==undefined&&!Object.hasOwn(APPEARANCES,p.appearance))throw new Error('请选择有效的宠物形象。');
    if(p.activity!==undefined&&!Object.hasOwn(ACTIVITIES,p.activity))throw new Error('请选择有效的活跃度。');
    if(!Number.isFinite(p.size)||p.size<80||p.size>1600)throw new Error('大小请填写 80～1600 px。');
    if(!['desktop','both','none'].includes(p.display))throw new Error('请选择桌面显示或隐藏。');
    if(p.display!=='none')desktop=true;
    if(!['top-left','top-right','bottom-left','bottom-right'].includes(p.position?.corner)||!Number.isFinite(p.position.marginX)||!Number.isFinite(p.position.marginY))throw new Error('请检查位置和偏移。');
    for(const f of ['balanceEnabled','whisperEnabled','workStatusEnabled','fixedEnabled'])if(typeof p[f]!=='boolean')throw new Error('功能开关无效。');
    if(p.reactionSources!==undefined&&(!Array.isArray(p.reactionSources)||p.reactionSources.some(v=>!Object.hasOwn(SOURCE_LABELS,v))))throw new Error('请选择有效的会话来源。');
    if(!interactionValid(p.interaction))throw new Error('请检查宠物互动设置。');
  }
  if(!desktop)throw new Error('请至少保留一只在桌面显示的宠物，避免丢失右键入口。');
  const p=config.physics;
  if(!p||!Number.isFinite(p.gravity)||p.gravity<0||!Number.isFinite(p.groundFriction)||p.groundFriction<0||!Number.isFinite(p.throwPower)||p.throwPower<=0)throw new Error('重力、摩擦需 ≥ 0，总力度需 > 0。');
  if(!Number.isFinite(p.restitution)||p.restitution<0||p.restitution>1)throw new Error('弹性需在 0～1 之间。');
  if(typeof p.ceilingBounce!=='boolean'||typeof p.petCollision!=='boolean'||typeof config.confineToScreen!=='boolean')throw new Error('物理开关无效。');
}
function editable(main) {
  const pets=main.pets.map(p=>({id:p.id,name:p.name,appearance:normalizeAppearance(p.appearance),activity:normalizeActivity(p.activity),size:p.size,balanceEnabled:p.balanceEnabled===true,whisperEnabled:p.whisperEnabled===true,workStatusEnabled:p.workStatusEnabled===true,fixedEnabled:p.fixedEnabled===true,display:p.display,position:{...p.position},reactionSources:normalizeSources(p.reactionSources),interaction:normalizeInteraction(p.interaction)}));
  return {pets,physics:{...main.physics},confineToScreen:main.confineToScreen===true};
}
function settingsFingerprint(config) {
  const normal=editable(config);
  for(const p of normal.pets)p.name=p.name.trim()||p.id;
  const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])])):value;
  return createHash('sha256').update(JSON.stringify(sorted(normal))).digest('hex');
}
function createSettingsClient({data,request}) {
  const file=join(data,'dsh-pet','main-config.jsonc');
  const bytes=()=>readFile(file).catch(e=>{if(e.code==='ENOENT')return Buffer.alloc(0);throw e;});
  const hash=b=>createHash('sha256').update(b).digest('hex');
  return {
    async load() {
      const before=await bytes();const merged=await request('/dsh-pet-7340/config');const after=await bytes();
      if(!before.equals(after))throw new Error('读取期间配置发生变化，请重新加载。');
      return {config:editable(merged.main),revision:hash(after),extraPets:Object.entries(merged).filter(([k])=>k!=='main').reduce((n,[,c])=>n+(c.pets?.length??0),0)};
    },
    async save(view) {
      validateSettings(view?.config);
      const current=await bytes();
      if(view.revision!==hash(current))throw new Error('配置已发生变化，请先重新加载再保存。');
      const clean=Object.fromEntries(fields.map(f=>[f,view.config[f]]));
      if(current.length)await writeFile(file+'.previous',current,{mode:0o600});
      await request('/dsh-pet-7340/config','PUT',clean);
      return {ok:true};
    }
  };
}
module.exports={createSettingsClient,validateSettings,settingsFingerprint};
