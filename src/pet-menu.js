'use strict';
// Pop-up pet menu: renders the menu tree a pet window sends and returns only the path of the chosen item; the pet
// resolves that path in its own tree, so nothing the menu sends can name an action the pet did not offer.
(()=>{
  const $=id=>document.getElementById(id),api=window.deskpetMenu;
  const ICONS={
    walk:'<svg viewBox="0 0 20 20"><path d="M7.5 3.5c1.2 0 1.8 1.3 1.8 2.8s-.7 2.8-1.8 2.8-1.8-1.3-1.8-2.8.6-2.8 1.8-2.8zM12.5 7.5c1.2 0 1.8 1.3 1.8 2.8s-.7 2.8-1.8 2.8-1.8-1.3-1.8-2.8.6-2.8 1.8-2.8zM6.6 11.5h1.8v3.8H6.6zM11.6 15.2h1.8v1.4h-1.8z"/></svg>',
    paused:'<svg viewBox="0 0 20 20"><path d="M7.5 5v10M12.5 5v10"/></svg>',
    quiet:'<svg viewBox="0 0 20 20"><path d="M15.5 12.4A6.2 6.2 0 0 1 7.6 4.5a6.2 6.2 0 1 0 7.9 7.9z"/></svg>',
    home:'<svg viewBox="0 0 20 20"><path d="M3.8 9.2L10 4l6.2 5.2M5.6 8v8h8.8V8M8.6 16v-3.6h2.8V16"/></svg>',
    recent:'<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5"/><path d="M10 6.6V10l2.4 1.6"/></svg>'};
  const FOOT=['open-site','reload'];
  // The engine's names for these two are terse; the menu says what they do.
  const FOOT_TEXT={'open-site':['运行状态','在浏览器里查看各会话的实时状态和功能说明'],reload:['重新加载','按配置文件重建全部宠物窗口']};
  const TOOL_TIPS={walk:'停在原地，不再自己四处走动（仍可拖拽，重启后恢复）',walkOn:'让她重新自己四处走动',quiet:'30 分钟内只安静待机：不走动、不做小动作、不参与互动；会话状态照常显示',quietOn:'现在就结束安静',home:'回到设置里的初始位置'};
  const DEMO_TIPS={'collab.assign':'她把一项任务交给同伴','collab.deliver':'同伴把做好的结果交回给她','collab.complete':'一起庆祝任务完成','collab.failed':'子任务失败时互相打气','social.cheer':'同伴为她的完成喝彩','social.comfort':'她出错时同伴来安慰','social.nudge':'提醒你去确认','social.chat':'空闲时聊几句'};
  const groupLabel=label=>({'点击回应':'点击'}[label]??label.replace(/^(大小姐|龙娘)/,''));
  // The engine's own one-or-two-clip groups share one tab.
  const BASIC=new Set(['待机','转向','拖拽','移动']);
  const clipLabel=label=>label.replace(/^[^-]{1,4}-/,'');
  const store={get:k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}},set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}}};
  const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  const button=(cls,text,onClick,title)=>{const b=el('button',cls,text);b.type='button';if(title&&title!==text)b.title=title;b.addEventListener('click',onClick);return b;};
  let model=null,entries=[],tabs=[],current=null;

  function pick(path,entry){
    if(entry){const recent=(store.get('recent:'+model.appearance)??[]).filter(l=>l!==entry.label);store.set('recent:'+model.appearance,[entry.label,...recent].slice(0,8));}
    api.pick(path);
  }

  // ---------- header, toolbar, footer, demos ----------
  function header(m,tree){
    const avatar=$('avatar');
    if(m.avatar){avatar.style.backgroundImage=`url("${m.avatar}")`;avatar.textContent='';}else{avatar.style.backgroundImage='';avatar.textContent=(m.name||'宠')[0];}
    $('name').textContent=m.name;
    $('state-dot').dataset.state=m.status?.state??'idle';$('state-text').textContent=m.status?.text??'';$('source').textContent=following(m.status?.source??'');
    const settings=tree.findIndex(n=>n.action==='deskpet-settings');
    $('settings').hidden=settings<0;$('settings').onclick=()=>pick([settings]);
  }
  // Says whose sessions the pet is following, or whom it is helping.
  function following(source){
    if(!source)return '只做随机动作';if(source==='演示')return '演示中';
    return source.endsWith('子代理')?'在帮 '+source:'跟随 '+source;
  }
  function toolbar(tree){
    const items=[];
    for(const action of ['deskpet-walk','deskpet-quiet','home']){
      const i=tree.findIndex(n=>n.action===action);if(i<0)continue;const node=tree[i];
      const on=(action==='deskpet-walk'&&node.label==='恢复走动')||(action==='deskpet-quiet'&&node.label==='结束安静');
      const text={home:'回到原位','deskpet-quiet':on?'结束安静':'安静 30 分'}[action]??node.label;
      const tip={home:TOOL_TIPS.home,'deskpet-quiet':on?TOOL_TIPS.quietOn:TOOL_TIPS.quiet,'deskpet-walk':on?TOOL_TIPS.walkOn:TOOL_TIPS.walk}[action];
      const b=button('',text,()=>pick([i]),tip);
      b.insertAdjacentHTML('afterbegin',ICONS[action==='home'?'home':action==='deskpet-quiet'?'quiet':on?'paused':'walk']);
      if(action!=='home')b.setAttribute('aria-pressed',String(on));
      items.push(b);
    }
    $('toolbar').replaceChildren(...items);
  }
  function footer(tree){
    const keys=el('span','keys','拖空白处移动 · Esc 关闭');
    $('foot').replaceChildren(keys,...FOOT.map(a=>tree.findIndex(n=>n.action===a)).filter(i=>i>=0).map(i=>{const [text,tip]=FOOT_TEXT[tree[i].action]??[tree[i].label];return button('',text,()=>pick([i]),tip);}));
  }
  function demos(tree){
    const di=tree.findIndex(n=>n.label==='互动演示'&&n.children);
    $('demo-block').hidden=di<0;if(di<0)return;
    $('demos').replaceChildren(...tree[di].children.map((leaf,k)=>button('chip',leaf.label,()=>pick([di,k]),DEMO_TIPS[leaf.kind])));
    // Open until the user closes it, so the feature is seen.
    setDemos(store.get('demos-open')!==false,false);
  }
  function setDemos(open,remember=true){
    $('demo-toggle').setAttribute('aria-expanded',String(open));$('demos').hidden=!open;
    if(remember){store.set('demos-open',open);report();}
  }

  // ---------- actions: tabs, search, items ----------
  function indexActions(tree){
    const bi=tree.findIndex(n=>n.label==='动作'&&n.children);
    entries=[];tabs=[];if(bi<0)return;
    let basic=null;
    tree[bi].children.forEach((group,g)=>{
      const list=group.children.map((leaf,k)=>({label:leaf.label,clean:clipLabel(leaf.label),group:groupLabel(group.label),path:[bi,g,k]}));
      entries.push(...list);
      if(BASIC.has(group.label)){if(basic)basic.entries.push(...list);else tabs.push(basic={key:'g'+g,label:'基础',entries:list});}
      else tabs.push({key:'g'+g,label:groupLabel(group.label),entries:list});
    });
    const byLabel=new Map(entries.map(e=>[e.label,e]));
    const recent=(store.get('recent:'+model.appearance)??[]).map(l=>byLabel.get(l)).filter(Boolean);
    if(recent.length)tabs.unshift({key:'recent',label:'最近',entries:recent});
  }
  function renderTabs(){
    // Tall enough to show every category without scrolling (25 px rows, 1 px gaps, 14 px padding), within reason.
    const h=Math.min(420,Math.max(290,tabs.length*26+14))+'px';$('browse').style.height=h;$('browse').style.flexBasis=h;
    $('tabs').replaceChildren(...tabs.map(t=>{
      const b=button(t.key==='recent'?'tab recent':'tab','',()=>selectTab(t.key,true),t.label);b.setAttribute('role','tab');b.dataset.key=t.key;
      b.append(el('span',null,t.label));
      if(t.key==='recent')b.insertAdjacentHTML('beforeend',ICONS.recent);else b.append(el('small',null,String(t.entries.length)));
      return b;
    }));
  }
  function selectTab(key,remember){
    current=tabs.find(t=>t.key===key)??tabs[0];if(!current)return;
    for(const b of $('tabs').children){const on=b.dataset.key===current.key;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}
    revealTab();
    if(remember)store.set('tab:'+model.appearance,current.label);
    renderItems();
  }
  function itemButton(e,withGroup){
    const b=button('item','',()=>pick(e.path,e),e.label);
    b.append(el('span',null,e.clean));
    if(withGroup)b.append(el('small',null,e.group));
    return b;
  }
  function renderItems(){
    const q=$('search').value.trim().toLowerCase(),box=$('items');
    $('tabs').hidden=!!q;$('browse').classList.toggle('searching',!!q);
    const list=q?entries.filter(e=>e.label.toLowerCase().includes(q)||e.group.includes(q)):current?.entries??[];
    $('count').textContent=q?`${list.length} 个`:'';
    box.replaceChildren(...(list.length?list.map(e=>itemButton(e,!!q)):[el('div','empty',q?'没有匹配的动作':'这一类还没有动作')]));
    box.scrollTop=0;
  }
  // Scrolls the rail so the active tab sits whole inside it. Plain arithmetic, so it also works while the window is
  // hidden (no frames, no smooth scrolling).
  function revealTab(){
    const rail=$('tabs'),tab=[...rail.children].find(b=>b.dataset.key===current?.key);if(!tab||!rail.clientHeight)return;
    const pad=8,top=tab.offsetTop-rail.offsetTop,bottom=top+tab.offsetHeight;
    if(top-pad<rail.scrollTop)rail.scrollTop=Math.max(0,top-pad);
    else if(bottom+pad>rail.scrollTop+rail.clientHeight)rail.scrollTop=bottom+pad-rail.clientHeight;
  }

  // ---------- keyboard ----------
  const itemButtons=()=>[...$('items').children].filter(b=>b.classList?.contains('item'));
  function moveInItems(from,delta){
    const items=itemButtons(),i=items.indexOf(from),next=i+delta;
    if(next<0){$('search').focus();return;}
    items[Math.min(items.length-1,next)]?.focus();
  }
  const currentTab=()=>[...$('tabs').children].find(b=>b.dataset.key===current?.key);
  $('items').addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'&&!$('tabs').hidden){e.preventDefault();currentTab()?.focus();return;}
    const d={ArrowDown:1,ArrowUp:-1}[e.key];
    if(d===undefined)return;e.preventDefault();moveInItems(e.target,d);
  });
  $('search').addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'){e.preventDefault();itemButtons()[0]?.focus();}
    else if(e.key==='Enter'){e.preventDefault();itemButtons()[0]?.click();}
  });
  $('search').addEventListener('input',renderItems);
  $('tabs').addEventListener('keydown',e=>{
    if(e.key==='ArrowRight'){e.preventDefault();itemButtons()[0]?.focus();return;}
    const d={ArrowDown:1,ArrowUp:-1}[e.key];if(d===undefined)return;e.preventDefault();
    const i=tabs.indexOf(current),next=tabs[(i+d+tabs.length)%tabs.length];selectTab(next.key,true);
    currentTab()?.focus();
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();if($('search').value){$('search').value='';renderItems();$('search').focus();}else api.close();return;}
    // Typing anywhere searches.
    if(e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&document.activeElement!==$('search'))$('search').focus();
  });
  $('close').addEventListener('click',()=>api.close());

  // ---------- moving ----------
  // Holding the left button on a plain part of the card (the header, a section title, the footer: anything that is not a
  // button, the search field or a list) and dragging moves the menu. A press that moves less than 4 px stays a click.
  // Only start (the grab point, at the press), move and end go out: the main process follows the pointer on screen.
  const NOT_HANDLE='button,input,label,.items,.tabs,.chips';
  let press=null;
  $('card').addEventListener('pointerdown',e=>{
    if(e.button!==0||!api.drag||e.target.closest?.(NOT_HANDLE))return;
    press={id:e.pointerId,x:e.clientX,y:e.clientY,moving:false};
    $('card').setPointerCapture?.(e.pointerId);api.drag('start');
  });
  $('card').addEventListener('pointermove',e=>{
    if(!press||e.pointerId!==press.id)return;
    if(!press.moving){
      if(Math.abs(e.clientX-press.x)<4&&Math.abs(e.clientY-press.y)<4)return;
      press.moving=true;document.body.classList.add('moving');
    }
    api.drag('move');
  });
  const release=e=>{
    if(!press||e.pointerId!==press.id)return;
    api.drag('end');document.body.classList.remove('moving');
    press=null;
  };
  $('card').addEventListener('pointerup',release);$('card').addEventListener('pointercancel',release);
  $('card').addEventListener('lostpointercapture',release);
  $('demo-toggle').addEventListener('click',()=>setDemos($('demo-toggle').getAttribute('aria-expanded')!=='true'));

  // ---------- size and entrance ----------
  // The natural height goes to the window; then the card fits whatever the screen allows (the list scrolls).
  function report(){
    const card=$('card');card.style.maxHeight='none';
    api.resize(Math.ceil(document.body.getBoundingClientRect().height)); // read now: a hidden window gets no frames
    card.style.maxHeight='calc(100vh - 20px)';
  }
  api.onShow?.(origin=>{
    const card=$('card');card.style.setProperty('--origin',origin||'top left');
    card.classList.remove('enter');void card.offsetWidth;card.classList.add('enter');
    $('search').focus();revealTab();
  });

  api.onModel(m=>{
    model=m;
    document.documentElement.style.setProperty('--accent',m.accent);
    document.documentElement.style.setProperty('--accent-tint',m.accent+'24');
    const tree=m.tree;
    header(m,tree);toolbar(tree);footer(tree);demos(tree);
    indexActions(tree);renderTabs();
    $('search').value='';$('search').placeholder=`搜索 ${entries.length} 个动作`;
    const remembered=store.get('tab:'+m.appearance);
    const start=tabs.find(t=>t.label===remembered&&t.key!=='recent')??tabs.find(t=>/日常/.test(t.label))??tabs.find(t=>t.key!=='recent');
    selectTab(start?.key,false);
    $('card').hidden=false;
    report();
  });
})();
