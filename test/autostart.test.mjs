import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_ROOT } from '../src/prepare.mjs';
const read=file=>readFile(join(APP_ROOT,file),'utf8');
test('starting with Windows is a switch on the Advanced page, off until turned on',async()=>{
  const html=await read('src/settings.html');
  assert.match(html,/<input id="autostart" class="switch" type="checkbox" disabled>/);
  assert(!/id="autostart"[^>]*checked/.test(html));
  const js=await read('src/settings.js');
  assert(js.includes("autostart={available:false,enabled:false}"));
  // Applied at once and kept out of the unsaved-changes check.
  assert(js.includes("event?.target?.id==='autostart'"));
  // Its state often arrives while the configuration is still loading; that must not leave it disabled.
  assert(js.includes("$('autostart').disabled=!autostart.available;"));
});
test('only the installed program registers itself, in the user Run key under its app id',async()=>{
  const main=await read('src/settings-window.cjs');
  assert(main.includes('const login={path:process.execPath,args:[]};'));
  // Electron writes and reads the entry under the app id; the installer gives its shortcuts the same id.
  const appId=JSON.parse(await read('package.json')).build.appId;
  assert((await read('src/deskpet-extension.cjs')).includes(`if(process.env.AGENT_MUSUME_PACKAGED)app.setAppUserModelId('${appId}');`));
  assert(main.includes('if(!process.env.AGENT_MUSUME_PACKAGED)return {available:false,enabled:false};'));
  const preload=await read('src/settings-preload.cjs');
  assert(preload.includes("autostart:on=>ipcRenderer.invoke('deskpet:settings-autostart',on)"));
});
test('uninstalling removes the entry and an update keeps it',async()=>{
  const script=await read('build/installer.nsh');
  const uninstall=script.slice(script.indexOf('!macro customUnInstall'));
  assert(uninstall.includes('${ifNot} ${isUpdated}'));
  assert(uninstall.includes('DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "${APP_ID}"'));
  assert(uninstall.includes('StartupApproved\\Run" "${APP_ID}"'));
});
