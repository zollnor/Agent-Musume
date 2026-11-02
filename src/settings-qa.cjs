'use strict';
// Bounded local integration harness; reads only this app's own QA command file.
// No arbitrary JavaScript, file paths, URLs or configuration bodies are accepted.
const {readFileSync,writeFileSync}=require('node:fs');
const {join}=require('node:path');
module.exports=({app,settings,petWindows,qa,petMenu,interactionPreview})=>{
  const reply=join(qa,'settings-response.json');
  let serial=0,busy=false;
  try{serial=JSON.parse(readFileSync(reply,'utf8')).serial||0;}catch{}
  const timer=setInterval(async()=>{
    if(busy)return;
    let input;try{input=JSON.parse(readFileSync(join(qa,'settings-request.json'),'utf8'));}catch{return;}
    if(!Number.isSafeInteger(input.serial)||input.serial<=serial)return;
    serial=input.serial;busy=true;
    const send=value=>writeFileSync(reply,JSON.stringify({serial,...value},null,2));
    send({started:true});
    try{
      let menu;
      if(input.action==='open-from-menu') {
        const pet=petWindows()[0];if(!pet)throw new Error('No pet window');
        // Right-click the pet and choose 设置… from the pop-up menu, the way a click there does.
        menu=await pet.webContents.executeJavaScript(`(()=>{
          const hit=document.querySelector('.pet-hit');const r=hit.getBoundingClientRect();
          hit.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
          const s=sprites[0],labels=(s.menuTree??[]).map(n=>n.label),i=labels.indexOf('设置…');if(i<0)throw new Error('Settings menu missing');
          s.pickFromMenu([i]);return {labels};
        })()`);
        petMenu?.hide();
        await new Promise(r=>setTimeout(r,500));
      }else if(input.action==='save-size') {
        if(!Number.isFinite(input.size)||input.size<80||input.size>1600)throw new Error('Invalid QA size');
        send({accepted:true});
        await settings.window.webContents.executeJavaScript(`(()=>{const s=document.getElementById('pet-size');s.value=${input.size};s.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('settings-form').requestSubmit();return true;})()`);
        return;
      }else if(input.action==='save') {
        send({accepted:true});await settings.window.webContents.executeJavaScript(`document.getElementById('settings-form').requestSubmit()`);return;
      }else if(input.action==='set-sources') {
        if(!Array.isArray(input.sources)||input.sources.some(x=>!['chatgpt-desktop','codex-cli','claude-code'].includes(x)))throw new Error('Invalid QA sources');
        await settings.window.webContents.executeJavaScript(`(()=>{const selected=${JSON.stringify(input.sources)};for(const [id,source] of [['source-desktop','chatgpt-desktop'],['source-codex','codex-cli'],['source-claude','claude-code']]){const c=document.getElementById(id);c.checked=selected.includes(source);c.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
      }else if(input.action==='autostart') {
        // Clicks the switch on the Advanced page like a user, then reports what the page shows.
        if(typeof input.on!=='boolean')throw new Error('Invalid QA autostart');
        // Polled from here: timers in a hidden settings page are throttled.
        const page=settings.open().webContents,read=()=>page.executeJavaScript(`(()=>{const s=document.getElementById('autostart');return {checked:s.checked,disabled:s.disabled,message:document.getElementById('message').textContent,note:document.getElementById('autostart-note').textContent};})()`);
        let shown;for(let i=0;i<50;i++){shown=await read().catch(()=>null);if(shown&&!shown.disabled)break;await new Promise(r=>setTimeout(r,100));}
        if(shown&&!shown.disabled&&shown.checked!==input.on){
          await page.executeJavaScript(`document.querySelector('.nav-item[data-page=advanced]').click();document.getElementById('autostart').click()`);
          for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,100));shown=await read();if(!shown.disabled&&shown.message.includes('开机'))break;}
        }
        send({page:shown,login:app.getLoginItemSettings({path:process.execPath,args:[]})});return;
      }else if(input.action==='set-appearance') {
        if(!['blue-fish','dragon-girl-D','claude-lady'].includes(input.appearance))throw new Error('Invalid QA appearance');
        await settings.window.webContents.executeJavaScript(`document.querySelector('input[name=appearance][value=${input.appearance}]').click()`);
      }else if(input.action==='select-pet') {
        if(!Number.isInteger(input.index)||input.index<0||input.index>23)throw new Error('Invalid QA pet index');
        await settings.window.webContents.executeJavaScript(`document.querySelectorAll('#pet-tabs button')[${input.index}].click()`);
      }else if(input.action==='add-pet') {
        await settings.window.webContents.executeJavaScript(`document.getElementById('add-pet').click()`);
      }else if(input.action==='remove-last-pet') {
        await settings.window.webContents.executeJavaScript(`(()=>{document.querySelector('#pet-tabs button:last-child').click();const original=window.confirm;try{window.confirm=()=>true;document.getElementById('remove-pet').click();}finally{window.confirm=original;}})()`);
      }else if(input.action==='preview') {
        if(!['thinking','working','result','waiting','success','error','live'].includes(input.state))throw new Error('Invalid QA state');
        await settings.window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(input.state==='live'?'#live':`[data-preview="${input.state}"]`)}).click()`);
      }else if(input.action==='interaction-preview') {
        if(!['collab.assign','collab.deliver','collab.complete','collab.failed','social.cheer','social.comfort','social.nudge','social.chat'].includes(input.kind))throw new Error('Invalid QA interaction');
        await settings.window.webContents.executeJavaScript(`document.querySelector('[data-show="${input.kind}"]').click()`);
      }else if(input.action==='set-helpers') {
        if(!Array.isArray(input.sources)||input.sources.some(x=>!['chatgpt-desktop','codex-cli','claude-code'].includes(x)))throw new Error('Invalid QA helpers');
        await settings.window.webContents.executeJavaScript(`(()=>{const selected=${JSON.stringify(input.sources)};for(const [id,source] of [['helper-desktop','chatgpt-desktop'],['helper-codex','codex-cli'],['helper-claude','claude-code']]){const c=document.getElementById(id);c.checked=selected.includes(source);c.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
      }else if(input.action==='scroll') {
        if(!Number.isFinite(input.y)||input.y<0||input.y>5000)throw new Error('Invalid QA scroll');
        await settings.window.webContents.executeJavaScript(`(document.getElementById('main')??document.scrollingElement).scrollTop=${Math.round(input.y)}`);
      }else if(input.action==='inspect-pet-actions') {
        const pet=petWindows()[0];if(!pet)throw new Error('No pet window');
        const result=await pet.webContents.executeJavaScript(`(()=>{const s=sprites[0],a=s.animations;return {petId:s.pet.id,appearance:s.pet.appearance,categories:a.categories.map(c=>({id:c.id,actions:c.actions})),knownNames:[...new Set([...a.idle,...a.turn,...a.drag,...a.clicks,...a.moves.actions.map(x=>x.name),...a.categories.flatMap(c=>c.actions),...Object.values(a.events).flat(2)])],assetRoot:s.assetRoot,menuLabels:S.buildMenuTree(a).map(x=>x.label)};})()`);
        send({pet:result});return;
      }else if(input.action==='walk-pet') {
        // A real move with the named walk, as the right-click 动作 menu plays it; pet is the window index.
        if(typeof input.name!=='string'||input.name.length>80)throw new Error('Invalid QA action name');
        const pet=petWindows()[Number.isInteger(input.pet)&&input.pet>=0&&input.pet<24?input.pet:0];if(!pet)throw new Error('No pet window');
        const result=await pet.webContents.executeJavaScript(`(()=>{const s=sprites[0],name=${JSON.stringify(input.name)};if(!s.animations.moves.actions.some(a=>a.name===name))throw new Error('Unknown walk');const start=s.pos.x;s.facing=${JSON.stringify(input.facing==='right'?'right':'left')};const moved=s.tryMove(name);
          const trace=window.__dshPetDebug.walkTrace=[],t0=performance.now(),tick=()=>{const v=s.front===0?s.videoA:s.videoB;trace.push([Math.round(performance.now()-t0),+(v?.currentTime??0).toFixed(3),Math.round(s.pos.x),s.anim,s.moveRef!==null?1:0,s.__stage?1:0,s.workState??null,v?.loop?1:0,v?.seeking?1:0,s.front]);if(performance.now()-t0<6500)requestAnimationFrame(tick);};requestAnimationFrame(tick);
          return {name,appearance:s.pet.appearance,moved,startX:start,facing:s.facing};})()`);
        send({walk:result});return;
      }else if(input.action==='trace-pet') {
        // Records the same walk trace for 12 s without starting a walk, e.g. while an interaction demo walks the pet.
        const pet=petWindows()[Number.isInteger(input.pet)&&input.pet>=0&&input.pet<24?input.pet:0];if(!pet)throw new Error('No pet window');
        await pet.webContents.executeJavaScript(`(()=>{const s=sprites[0],trace=window.__dshPetDebug.walkTrace=[],t0=performance.now(),tick=()=>{const v=s.front===0?s.videoA:s.videoB;const du=s.el.querySelector('.deskpet-duet'),o=x=>x?+getComputedStyle(x).opacity.slice(0,4):-1,other=s.front===0?s.videoB:s.videoA;trace.push([Math.round(performance.now()-t0),+(v?.currentTime??0).toFixed(3),Math.round(s.pos.x),s.anim,s.moveRef!==null?1:0,s.__stage?1:0,s.workState??null,v?.loop?1:0,v?.seeking?1:0,s.front,o(v),o(other),o(du),s.el.className.replace('pet-sprite','').trim()]);if(performance.now()-t0<14000)requestAnimationFrame(tick);};requestAnimationFrame(tick);return true;})()`);
        send({tracing:true});return;
      }else if(input.action==='seek-probe') {
        // Plays one of the pet's clips in a detached video, seeks it and reports where playback goes (QA only).
        if(typeof input.name!=='string'||input.name.length>80||!Number.isFinite(input.to))throw new Error('Invalid QA seek');
        const pet=petWindows()[Number.isInteger(input.pet)&&input.pet>=0&&input.pet<24?input.pet:0];if(!pet)throw new Error('No pet window');
        send({probe:await pet.webContents.executeJavaScript(`(async()=>{const s=sprites[0],v=document.createElement('video'),w=ms=>new Promise(r=>setTimeout(r,ms)),log=[];
          v.muted=true;v.loop=${input.loop===true};v.src=BASE+'/thumb/'+encodeURIComponent(s.assetRoot)+'/'+encodeURIComponent(${JSON.stringify(input.name)})+'.webm';
          await new Promise((r,j)=>{v.oncanplaythrough=r;v.onerror=()=>j(new Error('load'));});await v.play();await w(1200);log.push(['playing',+v.currentTime.toFixed(3)]);
          v.loop=false;await w(${Number.isFinite(input.settle)?Math.min(3000,Math.max(0,input.settle)):0});v.currentTime=${input.to};for(let i=0;i<10;i++){await w(80);log.push([(i+1)*80,+v.currentTime.toFixed(3),v.ended,v.seeking]);}
          v.remove();return {duration:v.duration,log};})()`)});return;
      }else if(input.action==='seek-probe-front') {
        // The same seek on the pet's own on-screen video, switched to the clip the way a walk does (QA only).
        if(typeof input.name!=='string'||input.name.length>80||!Number.isFinite(input.to))throw new Error('Invalid QA seek');
        const pet=petWindows()[Number.isInteger(input.pet)&&input.pet>=0&&input.pet<24?input.pet:0];if(!pet)throw new Error('No pet window');
        send({probe:await pet.webContents.executeJavaScript(`(async()=>{const s=sprites[0],w=ms=>new Promise(r=>setTimeout(r,ms)),log=[],f=()=>s.front===0?s.videoA:s.videoB;
          s.stopMove();s.anim=${JSON.stringify(input.name)};s.once=false;s.switchTo(${JSON.stringify(input.name)},false);await w(400);
          const v=f();log.push(['front',decodeURIComponent((v.currentSrc||'').split('/').pop()),v.loop]);v.loop=false;await w(1000);
          log.push(['before',+v.currentTime.toFixed(3)]);v.currentTime=${input.to};
          for(let i=0;i<12;i++){await w(40);log.push([(i+1)*40,+f().currentTime.toFixed(3),f()===v,v.seeking,v.ended]);}
          return log;})()`)});return;
      }else if(input.action==='stage-demo') {
        // An interaction demo straight from the director; swap lets the second pet lead, from asks as that pet's menu would (QA only).
        if(!['collab.assign','collab.deliver','collab.complete','collab.failed','social.cheer','social.comfort','social.nudge','social.chat'].includes(input.kind))throw new Error('Invalid QA interaction');
        send({demo:interactionPreview?.(input.kind,input.swap===true,typeof input.from==='string'?input.from:null)??null});return;
      }else if(input.action==='burst') {
        // Captures only the pet windows' own pixels (nothing behind them) several times a second, for transitions.
        const seconds=Math.min(20,Math.max(1,Number(input.seconds)||10)),fps=Math.min(12,Math.max(1,Number(input.fps)||8));
        const dir=join(qa,'burst');require('node:fs').rmSync(dir,{recursive:true,force:true});require('node:fs').mkdirSync(dir,{recursive:true});
        const t0=Date.now(),index=[];send({bursting:true});
        void (async()=>{for(let k=0;Date.now()-t0<seconds*1000;k++){const at=Date.now()-t0;const wins=petWindows();
          // A capture can stay unanswered (seen with three pets during a show); skip that window's frame rather than stop the burst.
          for(const [w,win] of wins.entries()){if(win.isDestroyed())continue;try{const img=await Promise.race([win.webContents.capturePage(),new Promise((_,no)=>setTimeout(()=>no(new Error('capture timeout')),600))]);writeFileSync(join(dir,`${k}-${w}.png`),img.toPNG());index.push({k,w,at,bounds:win.getBounds()});}catch{index.push({k,w,at,missed:true});}}
          const wait=t0+(k+1)*1000/fps-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));}
          writeFileSync(join(dir,'index.json'),JSON.stringify(index));})();
        return;
      }else if(input.action==='mute-work') {
        // Stops a pet reacting to its sessions until the next restart, so a QA walk is not cut short by a state change.
        const pet=petWindows()[Number.isInteger(input.pet)&&input.pet>=0&&input.pet<24?input.pet:0];if(!pet)throw new Error('No pet window');
        send({muted:await pet.webContents.executeJavaScript('(()=>{sprites[0].pet.workStatusEnabled=false;return sprites[0].pet.appearance;})()')});return;
      }else if(input.action==='walk-trace') {
        const pet=petWindows()[Number.isInteger(input.pet)&&input.pet>=0&&input.pet<24?input.pet:0];if(!pet)throw new Error('No pet window');
        send({trace:await pet.webContents.executeJavaScript('window.__dshPetDebug.walkTrace??null')});return;
      }else if(input.action==='play-pet-action'||input.action==='play-known-pet-action') {
        if(typeof input.name!=='string'||input.name.length>80)throw new Error('Invalid QA action name');
        const pet=petWindows()[Number.isInteger(input.pet)&&input.pet>=0&&input.pet<24?input.pet:0];if(!pet)throw new Error('No pet window');
        const result=await pet.webContents.executeJavaScript(`(()=>{const s=sprites[0],a=s.animations,name=${JSON.stringify(input.name)},known=${JSON.stringify(input.action)}==='play-known-pet-action'?[...a.idle,...a.turn,...a.drag,...a.clicks,...a.moves.actions.map(x=>x.name),...a.categories.flatMap(c=>c.actions),...Object.values(a.events).flat(2)]:a.categories.flatMap(c=>c.actions);if(!known.includes(name))throw new Error('Unknown configured animation');s.playOnce(name);return {name,appearance:s.pet.appearance,assetRoot:s.assetRoot};})()`);
        send({played:result});return;
      }else if(input.action==='pet-menu'||input.action==='pet-menu-close') {
        // Opens (or closes) a pet's pop-up menu; pick is a list of label prefixes, one per level, chosen as a click would.
        const pet=petWindows()[Number.isInteger(input.pet)&&input.pet>=0&&input.pet<24?input.pet:0];if(!pet)throw new Error('No pet window');
        if(input.action==='pet-menu-close'){petMenu?.hide();send({menu:{closed:true}});return;}
        const pick=Array.isArray(input.pick)&&input.pick.length<=3&&input.pick.every(x=>typeof x==='string'&&x.length<=20)?input.pick:[];
        const result=await pet.webContents.executeJavaScript(`(()=>{const s=sprites[0],r=s.hit.getBoundingClientRect();if(!s.menuOpen)s.onContextMenu({preventDefault(){},clientX:r.left+r.width/2,clientY:r.top+r.height/3});
          const items=(s.menuTree??[]).map(n=>n.label),pick=${JSON.stringify(pick)},path=[];let nodes=s.menuTree;
          for(const p of pick){const i=(nodes??[]).findIndex(n=>n.label.startsWith(p));if(i<0)throw new Error('No menu item '+p);path.push(i);nodes=nodes[i].children;}
          if(path.length)s.pickFromMenu(path);
          const groups=(s.menuTree.find(n=>n.label==='动作')?.children??[]).map(g=>[g.label,g.children.length]);
          return {items,path,groups,open:s.menuOpen,quiet:s.quietUntil>Date.now(),fixed:s.pet.fixedEnabled===true,anim:s.anim};})()`);
        if(pick.length)petMenu?.hide();
        send({menu:result});return;
      }else if(input.action==='menu-shot') {
        // The pop-up menu as shown, for review.
        const w=petMenu?.window;if(!w||w.isDestroyed()||!w.isVisible())throw new Error('Menu not shown');
        writeFileSync(join(qa,'menu-popup.png'),(await w.webContents.capturePage()).toPNG());
        send({shot:{bounds:w.getBounds(),focused:w.isFocused(),hwnd:w.getNativeWindowHandle().readBigUInt64LE(0).toString()}});return;
      }else if(input.action==='close') {settings.window?.close();send({closed:!settings.window});return;}
      else if(input.action!=='inspect')throw new Error('Unknown QA action');
      const win=settings.window;
      if(!win||win.isDestroyed())throw new Error('Settings window missing');
      const info=await win.webContents.executeJavaScript(`({title:document.title,appearance:document.querySelector('input[name=appearance]:checked')?.value,appearances:[...document.querySelectorAll('.look')].map(l=>({value:l.querySelector('input').value,label:l.textContent.trim()})),size:document.getElementById('pet-size').value,saveDisabled:document.getElementById('save').disabled,message:document.getElementById('message').textContent,errors:document.getElementById('message').classList.contains('error'),overflow:document.documentElement.scrollWidth>innerWidth,cardCount:document.querySelectorAll('.group').length,petCount:document.querySelectorAll('#pet-tabs button').length,fieldCount:document.querySelectorAll('input,select').length,sources:[['source-desktop','chatgpt-desktop'],['source-codex','codex-cli'],['source-claude','claude-code']].filter(([id])=>document.getElementById(id).checked).map(([,value])=>value)})`);
      writeFileSync(join(qa,'settings-window.png'),(await win.webContents.capturePage()).toPNG());
      send({info,menu,petWindows:petWindows().length,windowId:win.id,visible:win.isVisible(),bounds:win.getBounds()});
    }catch{send({error:true});}finally{busy=false;}
  },350);
  timer.unref();app.on('before-quit',()=>clearInterval(timer));
};
