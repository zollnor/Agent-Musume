'use strict';
// Entry of the installed program, where one exe plays three parts. Opened from a shortcut, it starts the host and leaves.
// The host is the same exe running as Node (ELECTRON_RUN_AS_NODE). The pet windows are the same exe again: they arrive
// here with the helper's main.js as an argument, which a packaged Electron does not load by itself.
const {spawn}=require('node:child_process');
const {closeSync,mkdirSync,openSync}=require('node:fs');
const {join}=require('node:path');

const helper=process.argv.slice(1).find(arg=>/electron-helper[\\/]main\.js$/.test(arg));
if(helper)require(helper);
else {
  const {app}=require('electron');
  const data=join(app.getPath('appData'),'Agent-Musume');
  mkdirSync(data,{recursive:true});
  // Running pet windows hold this lock (deskpet-extension.cjs): asking for it makes them open the settings instead.
  app.setPath('userData',join(data,'electron'));
  if(app.requestSingleInstanceLock()) {
    app.releaseSingleInstanceLock();
    const log=openSync(join(data,'runtime.log'),'a');
    spawn(process.execPath,[join(__dirname,'main.mjs')],{cwd:data,detached:true,windowsHide:true,stdio:['ignore',log,log],
      env:{...process.env,ELECTRON_RUN_AS_NODE:'1',AGENT_MUSUME_DATA:data,AGENT_MUSUME_PACKAGED:'1'}}).unref();
    closeSync(log);
  }
  app.exit(0);
}
