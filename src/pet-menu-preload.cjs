'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('deskpetMenu',Object.freeze({
  onModel:cb=>ipcRenderer.on('deskpet:menu-model',(_e,model)=>cb(model)),
  onShow:cb=>ipcRenderer.on('deskpet:menu-show',(_e,origin)=>cb(String(origin))),
  pick:path=>ipcRenderer.send('deskpet:menu-pick',path),
  close:()=>ipcRenderer.send('deskpet:menu-close'),
  resize:height=>ipcRenderer.send('deskpet:menu-size',height),
  drag:phase=>ipcRenderer.send('deskpet:menu-drag',phase)
}));
