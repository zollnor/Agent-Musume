'use strict';
const $=id=>document.getElementById(id);
const SOURCES=[['desktop','chatgpt-desktop','ChatGPT'],['codex','codex-cli','Codex'],['claude','claude-code','Claude Code'],['dsh','dsh-desktop','DSH']],ACTS=['collab','social','idle','approach','lines'];
const LOOKS={'claude-lady':'Claude大小姐','dragon-girl-D':'龙娘','blue-fish':'蓝色大肥鱼'};
const CORNERS={'top-left':'左上角','top-right':'右上角','bottom-left':'左下角','bottom-right':'右下角'};
const PHYSICS=['gravity','restitution','groundFriction','throwPower'],SWITCHES=['ceilingBounce','petCollision'];
// Each slider drives the number field beside it; the field still takes any value the config allows.
const SLIDERS=['pet-size',...PHYSICS];
let view,base,index=0,page='pet',cast=null,dirty=false,busy=false,autostart={available:false,enabled:false};
const radio=name=>document.querySelector(`input[name="${name}"]:checked`)?.value;
const setRadio=(name,value)=>{for(const r of document.getElementsByName(name))r.checked=r.value===value;};
const message=(text,kind='')=>{$('message').textContent=text;$('message').className=kind;};
function current(){return view.config.pets[index];}
const basePet=id=>base?.pets.find(p=>p.id===id);

function readPet(){
  // A pet shown in the browser too (display both) keeps that; the switch only shows or hides it on the desktop.
  const p=current();p.name=$('pet-name').value;p.size=$('pet-size').valueAsNumber;
  p.display=$('pet-display').checked?(basePet(p.id)?.display==='both'?'both':'desktop'):'none';
  p.appearance=radio('appearance')??p.appearance;p.activity=radio('activity')??'normal';
  p.position={...p.position,corner:radio('corner')??p.position.corner,marginX:$('pet-x').valueAsNumber,marginY:$('pet-y').valueAsNumber};
  p.workStatusEnabled=$('pet-work').checked;p.fixedEnabled=$('pet-fixed').checked;
  p.reactionSources=SOURCES.filter(([k])=>$('source-'+k).checked).map(([,source])=>source);
  p.interaction={...p.interaction,helperSources:SOURCES.filter(([k])=>$('helper-'+k).checked).map(([,source])=>source),...Object.fromEntries(ACTS.map(k=>[k,$('act-'+k).checked]))};
}
function readPhysics(){
  for(const k of PHYSICS)view.config.physics[k]=$(k).valueAsNumber;
  for(const k of SWITCHES)view.config.physics[k]=$(k).checked;
  view.config.confineToScreen=$('confineToScreen').checked;
}
const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
const same=(a,b)=>JSON.stringify(canon(a))===JSON.stringify(canon(b));
const petChanged=p=>!same(p,basePet(p.id));
const physicsChanged=()=>!same(view.config.physics,base.physics)||view.config.confineToScreen!==base.confineToScreen;

function subtitle(p){
  if(p.display==='none')return '已隐藏';
  const names=SOURCES.filter(([,s])=>(p.reactionSources??[]).includes(s)).map(([,,n])=>n);
  return names.length?'响应 '+names.join('、'):'只做随机动作';
}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function renderNav(){
  $('pet-tabs').replaceChildren(...view.config.pets.map((p,i)=>{
    const b=el('button','nav-item pet'),face=el('span','avatar'),text=el('span','nav-text');
    b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-selected',String(page==='pet'&&i===index));b.tabIndex=page==='pet'&&i===index?0:-1;
    face.dataset.look=p.appearance??'blue-fish';text.append(el('b',null,p.name||p.id),el('small',null,subtitle(p)));b.append(face,text);
    if(petChanged(p)){const d=el('i','dirty');d.title='有未保存的更改';b.append(d);}
    b.onclick=()=>{if(page==='pet')readPet();index=i;showPage('pet');renderPet();};
    return b;
  }));
  for(const b of document.querySelectorAll('.nav-item[data-page]')){
    const on=b.dataset.page===page;if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    b.querySelector('.dirty')?.remove();if(b.dataset.page==='physics'&&base&&physicsChanged())b.append(el('i','dirty'));
  }
  $('remove-pet').disabled=view.config.pets.length<=1;$('add-pet').disabled=view.config.pets.length>=24;
}
function renderHead(){
  const p=current();$('pet-avatar').dataset.look=p.appearance??'blue-fish';
  $('pet-title').textContent=p.name||p.id;$('pet-subtitle').textContent=`${LOOKS[p.appearance]??''} · ${p.display==='none'?'已隐藏':'显示在桌面上'}`;
}
function renderCorner(){
  const c=radio('corner')??'bottom-right';
  $('corner-name').textContent=CORNERS[c];
  $('pet-x').previousElementSibling.textContent=c.endsWith('left')?'距左边':'距右边';
  $('pet-y').previousElementSibling.textContent=c.startsWith('top')?'距上边':'距下边';
}
function fill(id){
  const n=$(id),r=$(id+'-range');if(!r)return;
  const v=Number.isFinite(n.valueAsNumber)?n.valueAsNumber:Number(r.min),min=Number(r.min),max=Number(r.max);
  r.value=String(Math.min(max,Math.max(min,v)));r.style.setProperty('--p',`${(Number(r.value)-min)/(max-min)*100}%`);
}
function renderPet(){
  const p=current();$('pet-name').value=p.name;$('pet-size').value=p.size;$('pet-display').checked=p.display!=='none';
  setRadio('appearance',p.appearance??'blue-fish');setRadio('activity',p.activity??'normal');setRadio('corner',p.position.corner);
  $('pet-x').value=p.position.marginX;$('pet-y').value=p.position.marginY;
  $('pet-work').checked=p.workStatusEnabled;$('pet-fixed').checked=p.fixedEnabled;
  for(const [k,source] of SOURCES){$('source-'+k).checked=(p.reactionSources??['chatgpt-desktop']).includes(source);$('helper-'+k).checked=(p.interaction?.helperSources??[]).includes(source);}
  const act=p.interaction??{};for(const k of ACTS)$('act-'+k).checked=act[k]!==false;
  fill('pet-size');renderCorner();renderHead();renderNav();
}
function renderCast(){
  const pets=view.config.pets;if(!pets.some(p=>p.id===cast))cast=current().id;
  $('demo-cast').replaceChildren(...pets.map(p=>{
    const l=el('label'),r=el('input'),face=el('span','avatar');r.type='radio';r.name='cast';r.value=p.id;r.checked=p.id===cast;
    r.onchange=()=>{cast=p.id;};face.dataset.look=p.appearance??'blue-fish';l.append(r,face,el('span',null,p.name||p.id));return l;
  }));
}
// Independent of loading the configuration (busy): the state often arrives first. Saving disables it with every input.
function renderAutostart(){
  $('autostart').checked=autostart.enabled;$('autostart').disabled=!autostart.available;
  if(!autostart.available)$('autostart-note').textContent='安装版才能开机启动，从源码运行时不可用。';
}
async function loadAutostart(){const r=await window.deskpetSettings.autostart();if(r.ok)autostart=r.value;renderAutostart();}
function showPage(name){
  page=name;for(const s of document.querySelectorAll('.page'))s.hidden=s.dataset.page!==name;
  if(name==='preview'){cast=current().id;renderCast();}
  $('main').scrollTop=0;renderNav();
}
// Dirty means different from what was loaded: undoing an edit clears it again.
function refresh(event){
  if(!view||busy||event?.target?.id==='autostart')return;
  if(page==='pet')readPet();readPhysics();
  const changed=view.config.pets.length!==base.pets.length||view.config.pets.some(petChanged)||physicsChanged();
  dirty=changed;window.deskpetSettings.dirty(changed);
  $('save').disabled=!changed;$('reload').hidden=!changed;
  message(changed?'有未保存的更改':'修改后点击“保存”生效。',changed?'dirty':'');
  renderHead();renderNav();
}
async function load(){
  if(dirty&&!confirm('放弃尚未保存的更改，重新读取配置吗？'))return;
  busy=true;$('save').disabled=true;
  try{
    const result=await window.deskpetSettings.load();if(!result.ok)throw new Error(result.error);
    view=result.value;base=structuredClone(view.config);index=Math.min(index,view.config.pets.length-1);
    for(const k of PHYSICS){$(k).value=view.config.physics[k];fill(k);}
    for(const k of SWITCHES)$(k).checked=view.config.physics[k];
    $('confineToScreen').checked=view.config.confineToScreen;
    $('extra-pets').hidden=!view.extraPets;$('extra-pets').textContent=`另有 ${view.extraPets} 只宠物由种类配置文件定义，可在其文件中调整。`;
    renderPet();busy=false;refresh();
    if(view.applied)message('已保存，桌宠已按新设置重载。');else if(view.applyUnconfirmed)message('设置已重新读取，请核对。');
  }catch(e){message(e.message,'error');}finally{busy=false;}
}

// ---------- events ----------
for(const id of SLIDERS){
  const r=$(id+'-range');
  r.addEventListener('input',()=>{$(id).value=id==='restitution'?Number(r.value).toFixed(2):r.value;fill(id);});
  $(id).addEventListener('input',()=>fill(id));
}
for(const r of document.getElementsByName('corner'))r.addEventListener('change',renderCorner);
$('settings-form').addEventListener('input',refresh);
$('settings-form').addEventListener('change',refresh);
for(const b of document.querySelectorAll('.nav-item[data-page]'))b.onclick=()=>{if(!view)return;if(page==='pet')readPet();showPage(b.dataset.page);};
$('pet-tabs').addEventListener('keydown',e=>{
  const d={ArrowDown:1,ArrowUp:-1}[e.key];if(d===undefined||!view)return;e.preventDefault();
  const tabs=[...$('pet-tabs').children],i=(tabs.indexOf(document.activeElement)+d+tabs.length)%tabs.length;tabs[i].click();$('pet-tabs').children[i].focus();
});
$('add-pet').onclick=()=>{
  if(!view||busy)return;if(page==='pet')readPet();const p=structuredClone(current());let suffix=2;while(view.config.pets.some(p=>p.id===`pet-${suffix}`))suffix++;
  p.id=`pet-${suffix}`;p.name=`桌宠 ${suffix}`;p.position.marginX+=40;p.balanceEnabled=false;p.whisperEnabled=false;p.display='desktop';
  view.config.pets.push(p);index=view.config.pets.length-1;showPage('pet');renderPet();refresh();message('新宠物将在保存后出现。','dirty');
  $('pet-name').focus();$('pet-name').select();
};
$('remove-pet').onclick=()=>{
  if(!view||busy||view.config.pets.length<=1)return;
  if(!confirm(`删除“${current().name||current().id}”？保存后生效。`))return;
  view.config.pets.splice(index,1);index=Math.min(index,view.config.pets.length-1);renderPet();refresh();message('宠物将在保存后移除。','dirty');
};
$('settings-form').onsubmit=async e=>{
  e.preventDefault();if(!view||busy)return;if(page==='pet')readPet();readPhysics();
  // Fields live on separate pages: show the page of the first one that needs fixing.
  const bad=[...$('settings-form').querySelectorAll('input')].find(i=>!i.checkValidity());
  if(bad){const s=bad.closest('.page');if(s&&s.dataset.page!==page)showPage(s.dataset.page);bad.focus();message('请先修正标红的项。','error');return;}
  busy=true;for(const c of document.querySelectorAll('input,select,button'))c.disabled=true;message('正在保存…');
  try{
    const result=await window.deskpetSettings.save(view);if(!result.ok)throw new Error(result.error);
    dirty=false;window.deskpetSettings.dirty(false);message('已保存，正在应用…');
    // A geometry change restarts this helper; the replacement restores this window.
    setTimeout(()=>void load(),800);
  }catch(e){message(e.message,'error');}finally{busy=false;for(const c of document.querySelectorAll('input,select,button'))c.disabled=false;$('save').disabled=!dirty;renderAutostart();renderNav();}
};
$('autostart').onchange=async()=>{
  const on=$('autostart').checked;$('autostart').disabled=true;
  const r=await window.deskpetSettings.autostart(on);
  if(r.ok){autostart=r.value;message(on?'已设为开机启动。':'已取消开机启动。');}else message(r.error,'error');
  renderAutostart();
};
$('reload').onclick=()=>{if(!busy)void load();};
for(const b of document.querySelectorAll('[data-preview]'))b.onclick=async()=>{const r=await window.deskpetSettings.preview(b.dataset.preview);message(r.ok?'正在播放演示，约 12 秒后恢复实时。':r.error,r.ok?'':'error');};
for(const b of document.querySelectorAll('[data-show]'))b.onclick=async()=>{const r=await window.deskpetSettings.interaction(b.dataset.show,cast??view?.config.pets[index]?.id);message(r.ok?'正在播放互动演示，宠物会先走近再开始。':r.error,r.ok?'':'error');};
$('live').onclick=async()=>{const r=await window.deskpetSettings.preview('live');message(r.ok?'已恢复实时。':r.error,r.ok?'':'error');};
$('config-file').onclick=async()=>{const r=await window.deskpetSettings.openConfig();if(!r.ok)message(r.error,'error');};
$('open-status').onclick=async()=>{const r=await window.deskpetSettings.openStatus();if(!r.ok)message(r.error,'error');};
void load();void loadAutostart();
