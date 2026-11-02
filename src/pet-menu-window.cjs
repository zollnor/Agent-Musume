'use strict';
// Pop-up pet menu: one frameless window shared by all pets, placed at the pointer. A pet window sends its menu tree
// (pet-menu-client.js); the menu returns only the path of the chosen item, which goes back to that pet alone.
const {ipcMain,screen}=require('electron');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {pathToFileURL}=require('node:url');
const CSS_WIDTH=400; // the 380 px card plus its 10 px shadow margin each side
module.exports=({app,BrowserWindow,petWindows})=>{
  const file=join(__dirname,'pet-menu.html'),url=pathToFileURL(file).href;
  let win=null,ready=null,owner=null,anchor=null,zoom=1,origin='top left';
  const avatars=new Map();
  const avatar=appearance=>{
    if(!/^[a-z][a-zA-Z-]{0,40}$/.test(appearance))return null;
    if(!avatars.has(appearance)){let uri=null;try{uri='data:image/png;base64,'+readFileSync(join(__dirname,`pet-menu-avatar-${appearance}.png`)).toString('base64');}catch{}avatars.set(appearance,uri);}
    return avatars.get(appearance);
  };
  const fromMenu=event=>!!win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url===url;
  const fromPet=event=>event.senderFrame===event.sender.mainFrame&&petWindows().some(w=>w.webContents===event.sender);
  function create() {
    win=new BrowserWindow({width:CSS_WIDTH,height:480,show:false,frame:false,transparent:true,resizable:false,movable:false,minimizable:false,
      maximizable:false,fullscreenable:false,skipTaskbar:true,hasShadow:false,backgroundColor:'#00000000',
      webPreferences:{preload:join(__dirname,'pet-menu-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false,backgroundThrottling:false}});
    win.setAlwaysOnTop(true,'pop-up-menu');
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',e=>e.preventDefault());
    win.on('blur',()=>hide());
    win.on('closed',()=>{win=null;ready=null;});
    ready=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));
    win.loadFile(file);
  }
  // The card's corner sits under the pointer; near a screen edge it opens to the other side, and grows from the corner
  // nearest the pointer. Sizes come in CSS pixels and are scaled by the pets' page zoom (the display scale the helper
  // takes off the device scale factor).
  function place(cssHeight) {
    const area=screen.getDisplayNearestPoint(anchor).workArea,w=Math.round(CSS_WIDTH*zoom),h=Math.min(Math.round(cssHeight*zoom),area.height);
    let x=anchor.x-6,y=anchor.y-6,left=true,top=true;
    if(x+w>area.x+area.width){x=anchor.x-w+6;left=false;}
    if(y+h>area.y+area.height){y=anchor.y-h+6;top=false;}
    x=Math.max(area.x,Math.min(x,area.x+area.width-w));y=Math.max(area.y,Math.min(y,area.y+area.height-h));
    origin=`${top?'top':'bottom'} ${left?'left':'right'}`;
    win.setBounds({x:Math.round(x),y:Math.round(y),width:w,height:h});
  }
  function hide() {
    if(win&&!win.isDestroyed()&&win.isVisible())win.hide();
    const pet=owner;owner=null;
    if(pet&&!pet.isDestroyed())pet.send('deskpet:menu-closed');
  }
  ipcMain.on('deskpet:menu-open',async(event,model)=>{
    if(!fromPet(event)||!model||typeof model!=='object'||!Array.isArray(model.tree))return;
    if(owner&&owner!==event.sender)hide();
    owner=event.sender;anchor=screen.getCursorScreenPoint();zoom=event.sender.getZoomFactor()||1;
    if(!win||win.isDestroyed())create();
    await ready;
    if(!win||owner!==event.sender)return;
    win.webContents.setZoomFactor(zoom);
    win.webContents.send('deskpet:menu-model',{...model,avatar:avatar(String(model.appearance))}); // shown once the page reports its height
  });
  // The first report shows the menu; later ones (the demos opening) only resize it.
  ipcMain.on('deskpet:menu-size',(event,height)=>{
    if(!fromMenu(event)||!owner||!Number.isFinite(height))return;
    place(Math.max(120,Math.min(900,height)));
    if(!win.isVisible()){win.show();win.focus();win.webContents.send('deskpet:menu-show',origin);}
  });
  ipcMain.on('deskpet:menu-pick',(event,path)=>{
    if(!fromMenu(event)||!owner||!Array.isArray(path)||path.length<1||path.length>3||!path.every(n=>Number.isInteger(n)&&n>=0&&n<400))return;
    const pet=owner;
    if(!pet.isDestroyed())pet.send('deskpet:menu-pick',path);
    hide();
  });
  ipcMain.on('deskpet:menu-close',event=>{if(fromMenu(event))hide();});
  // Built ahead of the first right-click, so even that one opens at once.
  app.whenReady().then(()=>setTimeout(()=>{if(!win)create();},2500));
  app.on('before-quit',()=>{if(win&&!win.isDestroyed())win.destroy();});
  return {isMenu:w=>!!win&&w===win,get window(){return win;},hide};
};
