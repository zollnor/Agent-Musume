import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {patchSprite,patchPreload} from '../src/patches.mjs';

// A small stand-in for the menu page's DOM: enough elements, buttons, keys and clicks to drive pet-menu.js.
function page() {
  const make=tag=>{const classes=new Set();const el={tag,children:[],attrs:{},dataset:{},style:{setProperty(){}},hidden:false,textContent:'',title:'',value:'',listeners:{},scrollLeft:0,
    set className(v){classes.clear();for(const c of String(v).split(/\s+/).filter(Boolean))classes.add(c);},get className(){return [...classes].join(' ');},
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle:(c,on)=>{if(on??!classes.has(c))classes.add(c);else classes.delete(c);}},
    replaceChildren(...kids){this.children=kids;},append(...kids){this.children.push(...kids);},setAttribute(k,v){this.attrs[k]=String(v);},getAttribute(k){return this.attrs[k]??null;},
    addEventListener(t,f){(this.listeners[t]??=[]).push(f);},fire(t,e={}){for(const f of this.listeners[t]??[])f({target:this,preventDefault(){},...e});},
    insertAdjacentHTML(){},click(){this.fire('click');},focus(){doc.activeElement=this;},getBoundingClientRect:()=>({height:420})};
    Object.defineProperty(el,'text',{get(){return el.children.length?el.children.map(c=>c.textContent).join('|'):el.textContent;}});return el;};
  const ids={};for(const id of ['card','avatar','name','state-dot','state-text','source','settings','close','toolbar','search','count','browse','tabs','items','demo-block','demo-toggle','demos','foot'])ids[id]=make('div');
  const picks=[],sent={};let render;
  const window={deskpetMenu:{onModel:f=>{render=f;},onShow(){},pick:p=>picks.push(p),close:()=>{sent.close=true;},resize:h=>{sent.height=h;}}};
  const doc={activeElement:null,getElementById:id=>ids[id],createElement:make,listeners:{},addEventListener(t,f){(this.listeners[t]??=[]).push(f);},documentElement:make('html'),body:make('body')};
  const storage={};const localStorage={getItem:k=>storage[k]??null,setItem:(k,v)=>{storage[k]=v;}};
  const ctx={window,document:doc,localStorage,JSON};vm.createContext(ctx);
  const key=(k,target=doc.activeElement)=>{for(const f of doc.listeners.keydown??[])f({key:k,target,preventDefault(){}});};
  return {ctx,ids,picks,sent,render:m=>render(m),storage,key};
}
const leaf=name=>({label:name,anim:name});
const tree=[
  {label:'设置…',action:'deskpet-settings'},{label:'查看实时状态',action:'open-site'},{label:'回到初始位置',action:'home'},
  {label:'恢复走动',action:'deskpet-walk'},{label:'安静 30 分钟',action:'deskpet-quiet'},
  {label:'互动演示',children:[{label:'派任务',action:'deskpet-demo',kind:'collab.assign'},{label:'闲聊',action:'deskpet-demo',kind:'social.chat'}]},
  {label:'动作',children:[{label:'待机',children:[leaf('待机-呼吸摆尾')]},{label:'点击回应',children:[leaf('点击-两指敬礼')]},
    {label:'日常',children:[leaf('日常-伸懒腰'),leaf('日常-困倦哈欠')]},{label:'碎碎念',children:[leaf('碎碎念-倚尾巴打盹')]},
    {label:'工作状态',children:[leaf('工作-思考')]}]},
  {label:'重载配置',action:'reload'}];

test('the pop-up menu lays out a pet\'s tree: header, toggles, counted tabs, short clip names, then reports its height',async()=>{
  const p=page();vm.runInContext(await readFile(new URL('../src/pet-menu.js',import.meta.url),'utf8'),p.ctx);
  const model={name:'GPT龙娘',appearance:'dragon-girl-D',accent:'#9a7fe0',avatar:null,status:{state:'working',text:'正在执行工具',source:'ChatGPT 桌面版'},tree};
  p.render(model);
  assert.equal(p.ids.name.textContent,'GPT龙娘');assert.equal(p.ids['state-dot'].dataset.state,'working');assert.equal(p.ids.avatar.textContent,'G','initial without an avatar');
  const tools=p.ids.toolbar.children;
  assert.deepEqual(tools.map(b=>b.textContent),['恢复走动','安静 30 分','回到原位'],'walk, quiet, home; settings sits in the header');
  assert.equal(tools[0].attrs['aria-pressed'],'true','paused walking shows as pressed');assert.equal(tools[1].attrs['aria-pressed'],'false');
  assert.deepEqual(p.ids.tabs.children.map(b=>b.text),['基础|1','点击|1','日常|2','碎碎念|1','工作状态|1'],'each tab counts its clips; the engine\'s small groups share 基础');
  assert.equal(p.ids.tabs.children.find(b=>b.attrs['aria-selected']==='true').dataset.key,'g2','opens on the daily tab');
  assert.deepEqual(p.ids.items.children.map(b=>b.text),['伸懒腰','困倦哈欠']);
  assert.deepEqual(p.ids.foot.children.map(b=>b.textContent),['Esc 关闭','运行状态','重新加载'],'the footer says what its two actions do');
  assert.equal(p.ids.search.placeholder,'搜索 6 个动作');assert.equal(p.sent.height,420);
  p.ids.items.children[1].click();p.ids.settings.onclick();p.ids.demos.children[1].click();
  p.ids.tabs.children[4].click();p.ids.items.children[0].click();
  assert.deepEqual(JSON.parse(JSON.stringify(p.picks)),[[6,2,1],[0],[5,1],[6,4,0]],'only paths into the pet\'s own tree go back');
  assert.equal(p.storage['tab:dragon-girl-D'],'"工作状态"','the last tab is remembered per appearance');
});

test('the menu searches every clip, keeps recent picks in front and closes on Escape after clearing the search',async()=>{
  const p=page();vm.runInContext(await readFile(new URL('../src/pet-menu.js',import.meta.url),'utf8'),p.ctx);
  p.render({name:'龙娘',appearance:'dragon-girl-D',accent:'#9a7fe0',status:{state:'idle',text:'空闲',source:''},tree});
  p.ids.search.value='尾';p.ids.search.fire('input');
  assert.deepEqual(p.ids.items.children.map(b=>b.text),['呼吸摆尾|待机','倚尾巴打盹|碎碎念'],'matches from all tabs, each with its tab');
  assert.equal(p.ids.tabs.hidden,true);assert.equal(p.ids.count.textContent,'2 个');
  p.ids.search.fire('keydown',{key:'Enter'});
  assert.deepEqual(JSON.parse(JSON.stringify(p.picks)),[[6,0,0]],'Enter plays the first match');
  p.render({name:'龙娘',appearance:'dragon-girl-D',accent:'#9a7fe0',status:{state:'idle',text:'空闲',source:''},tree});
  assert.equal(p.ids.tabs.children[0].dataset.key,'recent','a recent tab leads once something was played');
  assert.equal(p.ids.tabs.children[0].text,'最近');
  p.ids.search.value='x';p.key('Escape');assert.equal(p.ids.search.value,'');assert.equal(p.sent.close,undefined,'first Escape clears the search');
  p.key('Escape');assert.equal(p.sent.close,true,'the next one closes');
});

test('the pet opens the pop-up menu when its bridge offers one and keeps the in-window menu otherwise',async()=>{
  const root=new URL('../vendor/dsh-pet/runtime/electron-helper/',import.meta.url);
  const sprite=patchSprite(await readFile(new URL('sprite.original.js',root),'utf8'));
  assert(sprite.includes('    if (this.openPopupMenu && this.openPopupMenu(tree)) return;\n    this.menuOpen = true;'));
  assert(sprite.includes('S.mountContextMenu('),'fallback stays');
  const preload=patchPreload(await readFile(new URL('preload.original.js',root),'utf8'));
  for(const call of ["ipcRenderer.send('deskpet:menu-open', model)","ipcRenderer.on('deskpet:menu-pick'","ipcRenderer.on('deskpet:menu-closed'"])assert(preload.includes(call),call);
  const prepare=await readFile(new URL('../src/prepare.mjs',import.meta.url),'utf8');
  for(const f of ['pet-menu-window.cjs','pet-menu-preload.cjs','pet-menu.html','pet-menu.css','pet-menu.js','pet-menu-client.js'])assert(prepare.includes(`'${f}'`),f);
  assert(prepare.includes('<script src="pet-menu-client.js"></script>'));
});

test('a picked path runs only a leaf of the tree the pet itself sent',async()=>{
  const ran=[];class PetSprite{syncInputBusy(){}onMenuAction(leaf){ran.push(leaf.label);}}
  let pick;const sprite=new PetSprite();sprite.pet={name:'大小姐',appearance:'claude-lady',reactionSources:['claude-code']};
  // The menu's 动作 branch is rebuilt from these pools: 待机, 点击, 日常 (indices 0-2).
  sprite.animations={idle:['待机-呼吸摆尾'],turn:[],drag:[],clicks:['点击-两指敬礼'],moves:{actions:[]},categories:[{id:'龙娘日常',actions:['日常-伸懒腰','日常-困倦哈欠']}],events:{}};
  const ctx={PetSprite,sprites:[sprite],globalThis:null,JSON,window:{__dshPetDebug:{},petBridge:{openMenu(){},onMenuPick:f=>{pick=f;},onMenuClosed(){}}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(await readFile(new URL('../src/pet-menu-client.js',import.meta.url),'utf8'),ctx);
  sprite.openPopupMenu(tree);pick([6,2,0]);assert.deepEqual(ran,['日常-伸懒腰']);
  sprite.openPopupMenu(tree);pick([6,2]);assert.deepEqual(ran,['日常-伸懒腰'],'a branch is not an action');assert.equal(sprite.menuOpen,false);
  pick([0]);assert.deepEqual(ran,['日常-伸懒腰'],'nothing runs once the menu is closed');
});

test('every pet menu lists each of its clips exactly once, all of them, in non-empty tabs with distinct names',async()=>{
  const {createRequire}=await import('node:module');const appearances=createRequire(import.meta.url)('../src/pet-appearances.cjs');
  const source=await readFile(new URL('../src/pet-menu-client.js',import.meta.url),'utf8');
  for(const appearance of ['claude-lady','dragon-girl-D']){
    const a=appearances.applyAppearance({appearance}).animations;
    const all=new Set([...a.idle,...a.turn,...a.drag,...a.clicks,...a.moves.actions.map(m=>m.name),...a.categories.flatMap(c=>c.actions),...Object.values(a.events).flat(2)]);
    let sent;class PetSprite{syncInputBusy(){}}const sprite=new PetSprite();sprite.pet={name:'p',appearance,reactionSources:[]};sprite.animations=a;
    const ctx={PetSprite,sprites:[sprite],JSON,window:{__dshPetDebug:{},petBridge:{openMenu:m=>{sent=m;},onMenuPick(){},onMenuClosed(){}}}};ctx.globalThis=ctx;
    vm.createContext(ctx);vm.runInContext(source,ctx);
    sprite.openPopupMenu([{label:'设置…',action:'deskpet-settings'},{label:'动作',children:[{label:'旧',children:[]}]}]);
    const groups=sent.tree[1].children,names=groups.flatMap(g=>g.children.map(c=>c.anim));
    assert.equal(names.length,new Set(names).size,appearance+': no clip in two tabs');
    assert.deepEqual([...names].sort(),[...all].sort(),appearance+': every clip is in the menu');
    assert.equal(all.size,112);assert(groups.every(g=>g.children.length>0));
    assert.equal(new Set(groups.map(g=>g.label)).size,groups.length,appearance+': no two tabs share a name');
  }
});
