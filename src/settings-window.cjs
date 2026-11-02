'use strict';
const {ipcMain,dialog,shell,nativeTheme}=require('electron');
const {readFileSync,writeFileSync,unlinkSync,existsSync}=require('node:fs');
const {join}=require('node:path');
const {pathToFileURL}=require('node:url');
const {createSettingsClient,settingsFingerprint}=require('./settings-client.cjs');
module.exports=({app,BrowserWindow,data,interactionPreview=()=>({ok:false})})=>{
  const file=join(__dirname,'settings.html'),url=pathToFileURL(file).href;
  const marker=join(data,'settings-window.json');
  let win,quitting=false,saving=false;
  const request=async(path,method='GET',body)=>{
    const runtime=JSON.parse(readFileSync(join(data,'runtime.json'),'utf8'));
    const res=await fetch(`http://127.0.0.1:${runtime.port}${path}`,{method,headers:{'content-type':'application/json','x-deskpet-capability':runtime.capability},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});
    if(!res.ok)throw new Error(res.status===409?'配置文件无法解析，请先修复配置文件；本次没有覆盖。':'设置操作未完成，请检查参数后重试。');
    return res.json();
  };
  const client=createSettingsClient({data,request});
  const safe=(fn)=>async(event,...args)=>{
    if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==url)throw new Error('不允许的设置请求');
    try{return {ok:true,value:await fn(...args)};}catch(error){return {ok:false,error:error.message?.startsWith('配置')||error.message?.startsWith('读取')||error.message?.startsWith('设置')||error.message?.startsWith('请')||error.message?.startsWith('大小')||error.message?.startsWith('重力')||error.message?.startsWith('弹性')||error.message?.startsWith('名字')||error.message?.startsWith('宠物')||error.message?.startsWith('物理')||error.message?.startsWith('功能')?error.message:'设置操作未完成，请重试。'};}
  };
  const state=()=>{try{return JSON.parse(readFileSync(marker,'utf8'));}catch{return {};}};
  // Start with Windows: only the installed program, which starts the pets when opened without arguments (app-entry.cjs).
  // The entry is in the user's Run key, so it needs no administrator rights; uninstalling removes it (build/installer.nsh).
  // Electron names it after the app id (deskpet-extension.cjs) and reads it back only under that name.
  const login={path:process.execPath,args:[]};
  const autostart=()=>{
    if(!process.env.AGENT_MUSUME_PACKAGED)return {available:false,enabled:false};
    const s=app.getLoginItemSettings(login);return {available:true,enabled:s.openAtLogin&&s.executableWillLaunchAtLogin!==false};
  };
  function open() {
    if(win&&!win.isDestroyed()){win.show();win.focus();return win;}
    writeFileSync(marker,JSON.stringify({...state(),open:true}));
    win=new BrowserWindow({title:'桌宠设置',width:820,height:780,minWidth:640,minHeight:540,backgroundColor:nativeTheme.shouldUseDarkColors?'#18191c':'#f4f5f7',autoHideMenuBar:true,show:false,webPreferences:{preload:join(__dirname,'settings-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',e=>e.preventDefault());
    win.once('ready-to-show',()=>{win.show();win.focus();});
    win.on('close',event=>{
      if(quitting)return;
      if(saving){event.preventDefault();return;}
      if(win.deskpetDirty){const choice=dialog.showMessageBoxSync(win,{type:'question',buttons:['继续编辑','放弃更改'],defaultId:0,cancelId:0,message:'设置尚未保存',detail:'是否放弃本次更改并关闭？'});if(choice===0){event.preventDefault();return;}}
      try{unlinkSync(marker);}catch{}
    });
    win.on('closed',()=>{win=null;});
    win.loadFile(file);return win;
  }
  ipcMain.handle('deskpet:settings-load',safe(async()=>{
    const view=await client.load();const previous=state();
    if(previous.pending){writeFileSync(marker,JSON.stringify({open:true}));view.applied=previous.expected===settingsFingerprint(view.config);view.applyUnconfirmed=!view.applied;}
    return view;
  }));
  ipcMain.handle('deskpet:settings-save',safe(async view=>{
    if(saving)throw new Error('设置正在保存。');
    saving=true;
    try{
      // The original host restarts this helper after a successful save. Reopen the settings
      // window in the replacement helper instead of losing the user's entry point.
      writeFileSync(marker,JSON.stringify({open:true,pending:true,expected:settingsFingerprint(view.config)}));
      const result=await client.save(view);if(win)win.deskpetDirty=false;return result;
    }catch(e){writeFileSync(marker,JSON.stringify({open:true}));throw e;}finally{saving=false;}
  }));
  ipcMain.handle('deskpet:settings-preview',safe(async state=>{
    if(!['thinking','working','result','waiting','success','error','live'].includes(state))throw new Error('请选择有效反应。');
    return request('/control/'+(state==='live'?'live':'preview'),'POST',state==='live'?{}:{state});
  }));
  // The pet open in the window takes part in the demo.
  ipcMain.handle('deskpet:settings-interaction',safe(async(kind,pet)=>{
    if(!['collab.assign','collab.deliver','collab.complete','collab.failed','social.cheer','social.comfort','social.nudge','social.chat'].includes(kind))throw new Error('请选择有效的互动。');
    const result=interactionPreview(kind,false,typeof pet==='string'&&pet.length<=80?pet:null);if(!result.ok)throw new Error(result.error??'请稍后再试。');return result;
  }));
  // 运行状态: the host's local status page, opened in the browser.
  ipcMain.handle('deskpet:settings-status',safe(async()=>{
    const url=process.env.AGENT_MUSUME_PANEL_URL??'';if(!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url))throw new Error('请稍后再试。');
    await shell.openExternal(url);return true;
  }));
  // Applies at once: it is a Windows setting, not part of the pet configuration that Save writes.
  ipcMain.handle('deskpet:settings-autostart',safe(async on=>{
    if(typeof on!=='boolean')return autostart();
    if(!autostart().available)throw new Error('请使用安装版：从源码运行时不能开机启动。');
    app.setLoginItemSettings({...login,openAtLogin:on,enabled:on});
    const now=autostart();if(now.enabled!==on)throw new Error('设置开机启动未成功，请重试。');return now;
  }));
  ipcMain.handle('deskpet:settings-file',safe(async()=>{
    if(await shell.openPath(join(data,'dsh-pet','main-config.jsonc')))throw new Error('设置文件未能打开，请使用文件编辑器打开本程序 data/dsh-pet/main-config.jsonc。');
    return {ok:true};
  }));
  ipcMain.on('deskpet:settings-dirty',(event,value)=>{if(win&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame)win.deskpetDirty=value===true;});
  ipcMain.on('deskpet:open-settings',event=>{
    const sender=BrowserWindow.fromWebContents(event.sender);
    if(sender&&sender!==win&&event.senderFrame===event.sender.mainFrame&&event.sender.getURL().startsWith(pathToFileURL(join(__dirname,'index.html')).href+'?'))open();
  });
  app.on('before-quit',()=>{quitting=true;});
  app.whenReady().then(()=>{if(existsSync(marker)&&state().open)open();});
  return {open,get window(){return win;},isSettings:w=>w===win};
};
