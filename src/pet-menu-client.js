'use strict';
// Pet side of the pop-up menu (pet-menu-window.cjs): sends this pet's menu tree and runs the item that comes back.
// Without the bridge the pet keeps the original in-window menu.
(()=>{
  const bridge=window.petBridge;
  if(!bridge?.openMenu)return;
  // The animation pools overlap (a special is a click reaction, a category entry and a work clip at once). The menu
  // lists every clip of the pet exactly once: in the smallest pool or category that holds it, then the work clips
  // found nowhere else, then any balance or murmur clip still missing.
  function actionGroups(a){
    const groups=[['待机',a.idle],['转向',a.turn],['拖拽',a.drag],['点击',a.clicks],['移动',a.moves.actions.map(m=>m.name)],
      ...(a.categories??[]).map(c=>[c.id.replace(/^(大小姐|龙娘)/,''),c.actions])].map(([label,list])=>[label,[...new Set(list)]]);
    const home=new Map();
    groups.forEach(([,list],g)=>{for(const n of list)if(!home.has(n)||groups[home.get(n)][1].length>list.length)home.set(n,g);});
    const out=groups.map(([label,list],g)=>({label,children:list.filter(n=>home.get(n)===g).map(n=>({label:n,anim:n}))}));
    const listed=new Set(home.keys());
    for(const [key,label] of [['workStatus','工作状态'],['balance','余额'],['whisper','碎碎念']]){
      const rest=[...new Set((a.events?.[key]??[]).flat())].filter(n=>!listed.has(n));
      for(const n of rest)listed.add(n);
      out.push({label,children:rest.map(n=>({label:n,anim:n}))});
    }
    return out.filter(g=>g.children.length);
  }
  PetSprite.prototype.openPopupMenu=function(tree){
    tree=tree.map(node=>node.label==='动作'&&node.children?{...node,children:actionGroups(this.animations)}:node);
    const Src=globalThis.DeskpetSources,body=globalThis.DeskpetInteraction?.BODY?.[this.pet.appearance];
    const reaction=window.__dshPetDebug.reaction;
    // A sub-agent's work shows under its own source label; the pet's main sources otherwise.
    const source=reaction?.source?.startsWith('helper:')?Src?.SOURCE_LABELS[reaction.source.slice(7)]+' 子代理':reaction?.source==='demo'?'演示':
      Src?Src.normalizeSources(this.pet.reactionSources).map(s=>Src.SOURCE_LABELS[s]).join('、'):'';
    const state=reaction?.state&&reaction.state!=='idle'?reaction.state:'idle';
    this.menuTree=tree;this.menuOpen=true;window.__dshPetDebug.menuOpen=true;this.syncInputBusy();
    bridge.openMenu({name:this.pet.name||body?.nick||'桌宠',appearance:this.pet.appearance??'blue-fish',accent:body?.accent??'#7a8ba8',
      status:{state,text:state==='idle'?'空闲':Src?.STATE_LABELS[state]??'',source},tree:JSON.parse(JSON.stringify(tree))});
    return true;
  };
  const done=s=>{s.menuOpen=false;s.menuTree=null;window.__dshPetDebug.menuOpen=false;s.syncInputBusy();};
  PetSprite.prototype.pickFromMenu=function(path){
    if(!this.menuTree)return;
    const leaf=path.reduce((node,i)=>Array.isArray(node)?node[i]:node?.children?.[i],this.menuTree);
    done(this);
    if(leaf&&!leaf.children)this.onMenuAction(leaf);
  };
  bridge.onMenuPick(path=>sprites[0]?.pickFromMenu(path));
  bridge.onMenuClosed(()=>{const s=sprites[0];if(s?.menuOpen&&s.menuTree)done(s);});
})();
