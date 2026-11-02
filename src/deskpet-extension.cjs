'use strict';
const {Tray,Menu,nativeImage,shell,ipcMain}=require('electron');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const {join}=require('node:path');

module.exports=({app,BrowserWindow,windows,petStates})=>{
  if(process.env.DSH_PET_DPI_PROBE==='1')return;
  const data=process.env.AGENT_MUSUME_DATA;
  if(!data)return;
  // The installer's shortcuts carry this id (package.json build.appId), so the taskbar groups the windows with them, and
  // Windows files the start-with-Windows entry under it (settings-window.cjs).
  if(process.env.AGENT_MUSUME_PACKAGED)app.setAppUserModelId('io.github.agentmusume.desktop');
  const qa=join(data,'qa');mkdirSync(qa,{recursive:true});
  const director=windows&&petStates?require('./interaction-director.cjs').attachDirector({app,ipcMain,windows,petStates,data}):null;
  const interactionPreview=(kind,swap=false,from=null)=>director?director.demo(kind,swap,from):{ok:false,error:'请重启桌宠后再试。'};
  const settings=require('./settings-window.cjs')({app,BrowserWindow,data,interactionPreview});
  const petWindows=()=>BrowserWindow.getAllWindows().filter(w=>!settings.isSettings(w)&&!menu.isMenu(w));
  const menu=require('./pet-menu-window.cjs')({app,BrowserWindow,petWindows});
  // The installed program's shortcut, opened again while the pets run: show them and open the settings (app-entry.cjs).
  // The scale probe is this same file in a short-lived process, and a display change starts one while the pets run.
  if(process.env.AGENT_MUSUME_PACKAGED&&!process.env.DSH_PET_DPI_PROBE&&app.requestSingleInstanceLock())app.on('second-instance',()=>{petWindows().forEach(w=>w.showInactive());settings.open();});
  ipcMain.handle('deskpet:reaction-snapshot',async event=>{
    if(event.senderFrame!==event.sender.mainFrame||!petWindows().some(w=>w.webContents===event.sender))throw new Error('Untrusted pet renderer');
    const runtime=JSON.parse(readFileSync(join(data,'runtime.json'),'utf8'));
    const response=await fetch(`http://127.0.0.1:${runtime.port}/control/reactions`,{signal:AbortSignal.timeout(2500)});
    if(!response.ok)throw new Error('Source state unavailable');return response.json();
  });
  // The host answers ?wait=<rev> as soon as anything the pets react to changes; each new revision goes straight to
  // the pet windows and the director. Their own polls stay as the fallback.
  let reactionRev=-1,listening=true;
  void (async()=>{
    while(listening) {
      try {
        const runtime=JSON.parse(readFileSync(join(data,'runtime.json'),'utf8'));
        const response=await fetch(`http://127.0.0.1:${runtime.port}/control/reactions?wait=${reactionRev}`,{signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw new Error('Source state unavailable');
        const snapshot=await response.json();if(snapshot.rev===reactionRev)continue;reactionRev=snapshot.rev;
        for(const win of petWindows())if(!win.isDestroyed())win.webContents.send('deskpet:reaction-push',snapshot);
        director?.collab(snapshot.collab);
      }catch{await new Promise(r=>setTimeout(r,1000));}
    }
  })();
  app.on('before-quit',()=>{listening=false;});
  // 互动演示 from a pet's right-click menu: that pet is in it.
  ipcMain.on('deskpet:interaction-preview',(event,kind)=>{
    if(event.senderFrame!==event.sender.mainFrame||!petWindows().some(w=>w.webContents===event.sender))return;
    const from=[...(windows??[])].find(([,w])=>!w.isDestroyed()&&w.webContents===event.sender)?.[0]??null;
    interactionPreview(String(kind),false,from);
  });
  if(process.env.AGENT_MUSUME_SETTINGS_QA==='1')require('./settings-qa.cjs')({app,settings,petWindows,qa,petMenu:menu,interactionPreview});
  const request=async(action,body={})=>{
    try {
      const runtime=JSON.parse(readFileSync(join(data,'runtime.json'),'utf8'));
      await fetch(`http://127.0.0.1:${runtime.port}/control/${action}`,{method:'POST',headers:{'content-type':'application/json','x-deskpet-capability':runtime.capability},body:JSON.stringify(body)});
    }catch { /* Host may already be shutting down. Never log capability-bearing requests. */ }
  };
  let tray;
  app.whenReady().then(()=>{
    const icon=nativeImage.createFromPath(join(__dirname,'app-icon.png'));
    tray=new Tray(icon.resize({width:20,height:20}));
    tray.setToolTip('Agent-Musume');
    const reactions={thinking:'思考中',working:'执行中',result:'整理结果',waiting:'等你确认',success:'完成',error:'出错'};
    const item=(label,click)=>({label,click});
    // Grouped by purpose: open, show or hide, try a demo, quit.
    tray.setContextMenu(Menu.buildFromTemplate([
      {label:'Agent-Musume',enabled:false},
      {type:'separator'},
      item('设置…',()=>settings.open()),
      item('运行状态（在浏览器中打开）',()=>shell.openExternal(process.env.AGENT_MUSUME_PANEL_URL)),
      {type:'separator'},
      item('显示全部宠物',()=>petWindows().forEach(w=>w.showInactive())),
      item('隐藏全部宠物',()=>petWindows().forEach(w=>w.hide())),
      {type:'separator'},
      {label:'演示会话反应',submenu:[...Object.entries(reactions).map(([state,label])=>item(label,()=>request('preview',{state}))),{type:'separator'},item('恢复实时',()=>request('live'))]},
      {label:'演示宠物互动',submenu:[
        ...Object.entries({'collab.assign':'派任务','collab.deliver':'交回结果','collab.complete':'一起完成','collab.failed':'子任务失败'}).map(([kind,label])=>item(label,()=>interactionPreview(kind))),
        {type:'separator'},
        ...Object.entries({'social.cheer':'祝贺同伴','social.comfort':'安慰同伴','social.nudge':'提醒你确认','social.chat':'闲聊'}).map(([kind,label])=>item(label,()=>interactionPreview(kind)))]},
      {type:'separator'},
      item('退出 Agent-Musume',()=>request('stop'))
    ]));
    tray.on('double-click',()=>petWindows().forEach(w=>w.showInactive()));
  });
  app.on('before-quit',()=>tray?.destroy());
  let lastCapture=0;
  try{lastCapture=JSON.parse(readFileSync(join(qa,'capture-consumed.json'),'utf8')).serial||0;}catch{}
  const timer=setInterval(async()=>{
    let req;try{req=JSON.parse(readFileSync(join(qa,'capture-request.json'),'utf8'));}catch{return;}
    if(!Number.isSafeInteger(req.serial)||req.serial<=lastCapture)return;
    lastCapture=req.serial;
    writeFileSync(join(qa,'capture-consumed.json'),JSON.stringify({serial:lastCapture}));
    const label=String(req.label??'capture').replace(/[^a-z0-9_-]/gi,'').slice(0,50)||'capture';
    for(const [index,win] of petWindows().entries()) {
      if(win.isDestroyed())continue;
      try {
        const render=await win.webContents.executeJavaScript(`({ configOk:window.__dshPetDebug?.configOk??null, reaction:window.__dshPetDebug?.reaction??null, appearance:typeof sprites!=='undefined'?sprites[0]?.pet?.appearance:null, videos:[...document.querySelectorAll('video')].map(v=>({name:decodeURIComponent((v.currentSrc||v.src).split('/').pop()||''),readyState:v.readyState,width:v.videoWidth,height:v.videoHeight,currentTime:v.currentTime,duration:v.duration,paused:v.paused,opacity:getComputedStyle(v).opacity})),errorVisible:!!document.querySelector('#pet-error')?.offsetHeight, stage:window.__dshPetDebug?.stage??null, duet:[...document.querySelectorAll('video.deskpet-duet')].map(v=>({currentTime:v.currentTime,paused:v.paused,readyState:v.readyState,opacity:getComputedStyle(v).opacity})), lines:[...document.querySelectorAll('.deskpet-line.is-on')].map(n=>n.textContent), props:document.querySelectorAll('.deskpet-prop').length, facing:typeof sprites!=='undefined'?sprites[0]?.facing:null, pos:typeof sprites!=='undefined'?sprites[0]?.pos:null })`);
        const screenshot=await win.webContents.capturePage();
        writeFileSync(join(qa,`${label}-${index}.png`),screenshot.toPNG());
        writeFileSync(join(qa,`${label}-${index}.json`),JSON.stringify({serial:req.serial,capturedAt:new Date().toISOString(),visible:win.isVisible(),bounds:win.getBounds(),...render},null,2));
      }catch {writeFileSync(join(qa,`${label}-${index}.json`),JSON.stringify({captureError:true}));}
    }
  },500);
  timer.unref();app.on('before-quit',()=>clearInterval(timer));
};
