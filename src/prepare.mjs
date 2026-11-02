import { cp,readFile,writeFile,stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchStandalone,patchHelper,patchSprite,patchPreload,patchEvents,patchRenderer,patchShared,useBubbleFont } from './patches.mjs';

export const APP_ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
const exists=async path=>!!await stat(path).catch(()=>null);
export const NO_ELECTRON='没有找到 Electron。请先在项目目录运行 npm install。';
// The installed program is its own Electron. From source, DSH_PET_ELECTRON_PATH overrides the electron package, which
// resolves to the binary it downloaded at install.
export function electronPath() {
  if(process.env.AGENT_MUSUME_PACKAGED)return process.execPath;
  if(process.env.DSH_PET_ELECTRON_PATH)return process.env.DSH_PET_ELECTRON_PATH;
  try{return createRequire(import.meta.url)('electron');}catch{return null;}
}
// vendor/dsh-pet holds the upstream dsh-pet 0.3.7 distribution (provenance.json). The files this app patches stay there as
// *.original; the patched versions and the copies from src are written on every start and are not kept in git.
export async function prepare() {
  const target=join(APP_ROOT,'vendor','dsh-pet');
  if(process.env.AGENT_MUSUME_PACKAGED)return target; // built into the package, which is read-only
  if(!await exists(join(target,'lib','standalone.original.js')))throw new Error('vendor/dsh-pet 不完整，缺少上游文件。请重新获取本项目。');
  const original=await readFile(join(target,'lib','standalone.original.js'),'utf8');
  const helper=await readFile(join(target,'runtime','electron-helper','main.original.js'),'utf8');
  for(const [name,patch] of [['sprite',patchSprite],['preload',patchPreload],['events',patchEvents],['renderer',patchRenderer],['shared-core',patchShared]]) {
    const dir=join(target,'runtime','electron-helper');
    await writeFile(join(dir,`${name}.js`),patch(await readFile(join(dir,`${name}.original.js`),'utf8')));
  }
  const indexPath=join(target,'runtime','electron-helper','index.html');
  const indexHtml=await readFile(indexPath+'.original','utf8');
  if(!indexHtml.includes('</body>'))throw new Error('Upstream patch mismatch: reaction script');
  await writeFile(indexPath,useBubbleFont(indexHtml).replace('dsh-pet 桌宠（桌面模式）','Agent-Musume').replace('<script src="./renderer.js"></script>','<script src="pet-appearances.cjs"></script>\n<script src="home-spacing.cjs"></script>\n<script src="./renderer.js"></script>').replace('</body>','<script src="reaction-sources.cjs"></script>\n<script src="interaction-catalog.cjs"></script>\n<script src="reaction-renderer.js"></script>\n<script src="interaction-stage.js"></script>\n<script src="pet-menu-client.js"></script>\n</body>'));
  await writeFile(join(target,'lib','standalone.patched.mjs'),patchStandalone(original));
  await writeFile(join(target,'runtime','electron-helper','main.js'),patchHelper(helper));
  await cp(join(APP_ROOT,'src','deskpet-extension.cjs'),join(target,'runtime','electron-helper','deskpet-extension.cjs'));
  await cp(join(APP_ROOT,'src','bridge-guard.cjs'),join(target,'runtime','electron-helper','bridge-guard.cjs'));
  for(const file of ['settings-client.cjs','settings-window.cjs','settings-preload.cjs','settings-qa.cjs','settings.html','settings.css','settings.js','reaction-sources.cjs','reaction-renderer.js','pet-appearances.cjs','home-spacing.cjs','interaction-catalog.cjs','interaction-stage.js','interaction-director.cjs','pet-menu-window.cjs','pet-menu-preload.cjs','pet-menu.html','pet-menu.css','pet-menu.js','pet-menu-client.js','pet-menu-avatar-claude-lady.png','pet-menu-avatar-dragon-girl-D.png','pet-menu-avatar-blue-fish.png','app-icon.png'])await cp(join(APP_ROOT,'src',file),join(target,'runtime','electron-helper',file));
  return target;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) {
  await prepare();console.log('运行文件已准备。');
}
