import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { electronPath,prepare,APP_ROOT } from '../src/prepare.mjs';
import { patchHelper } from '../src/patches.mjs';
import { join } from 'node:path';
const packaged=async run=>{process.env.AGENT_MUSUME_PACKAGED='1';try{return await run();}finally{delete process.env.AGENT_MUSUME_PACKAGED;}};
test('the installed program runs as its own Electron and writes nothing into the package',async()=>{
  assert.equal(await packaged(()=>electronPath()),process.execPath);
  const before=await readFile(join(APP_ROOT,'vendor','dsh-pet','runtime','electron-helper','main.js'),'utf8');
  assert.equal(await packaged(()=>prepare()),join(APP_ROOT,'vendor','dsh-pet'));
  assert.equal(await readFile(join(APP_ROOT,'vendor','dsh-pet','runtime','electron-helper','main.js'),'utf8'),before);
});
test('the pet page is found from the helper folder, not from the program root',async()=>{
  const helper=await readFile(join(APP_ROOT,'vendor','dsh-pet','runtime','electron-helper','main.original.js'),'utf8');
  assert(patchHelper(helper).includes(".loadFile(path.join(__dirname, 'index.html'), {"));
});
test('a scale probe is not mistaken for the program being opened again',async()=>{
  const extension=await readFile(join(APP_ROOT,'src','deskpet-extension.cjs'),'utf8');
  assert(extension.includes('!process.env.DSH_PET_DPI_PROBE&&app.requestSingleInstanceLock()'));
});
test('the installer leaves no copy of itself behind',async()=>{
  const script=await readFile(join(APP_ROOT,'build','installer.nsh'),'utf8');
  const pkg=JSON.parse(await readFile(join(APP_ROOT,'package.json'),'utf8'));
  assert(script.includes(`$LOCALAPPDATA\\${pkg.name}-updater`));
});
test('the shortcut and the pet windows share one entry',async()=>{
  const pkg=JSON.parse(await readFile(join(APP_ROOT,'package.json'),'utf8'));
  assert.equal(pkg.main,'src/app-entry.cjs');
  const entry=await readFile(join(APP_ROOT,pkg.main),'utf8');
  assert(entry.includes('electron-helper'));
  assert(entry.includes("ELECTRON_RUN_AS_NODE:'1'"));
});
