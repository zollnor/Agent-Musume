'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('deskpetSettings',Object.freeze({
  load:()=>ipcRenderer.invoke('deskpet:settings-load'),
  save:view=>ipcRenderer.invoke('deskpet:settings-save',view),
  dirty:value=>ipcRenderer.send('deskpet:settings-dirty',!!value),
  openConfig:()=>ipcRenderer.invoke('deskpet:settings-file'),
  openStatus:()=>ipcRenderer.invoke('deskpet:settings-status'),
  autostart:on=>ipcRenderer.invoke('deskpet:settings-autostart',on),
  preview:state=>ipcRenderer.invoke('deskpet:settings-preview',state),
  interaction:(kind,pet)=>ipcRenderer.invoke('deskpet:settings-interaction',kind,pet)
}));
