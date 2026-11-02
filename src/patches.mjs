function replaceOnce(source,needle,replacement,label) {
  if(source.split(needle).length!==2)throw new Error(`Upstream patch mismatch: ${label}`);
  return source.replace(needle,replacement);
}
function replaceEach(source,needle,replacement,count,label) {
  if(source.split(needle).length!==count+1)throw new Error(`Upstream patch mismatch: ${label}`);
  return source.replaceAll(needle,replacement);
}
export function patchStandalone(source) {
  let s=replaceOnce(source,'import { downloadArtifact } from "@electron/get";','const downloadArtifact = async () => { throw new Error("Automatic downloads are disabled. Configure an existing Electron runtime."); };','downloader');
  s=replaceOnce(s,'import { createServer } from "node:http";','const { createServer } = globalThis[Symbol.for("agent-musume.host")];','HTTP gate');
  s=replaceOnce(s,'const cb = typeof req.cb === "string" && /^https?:[/][/]/.test(req.cb) ? req.cb : "";','const cb = typeof req.cb === "string" && /^http:\\/\\/127\\.0\\.0\\.1:\\d+\\/respond$/.test(req.cb) ? req.cb : "";','local bridge callback');
  s=replaceOnce(s,'headers: { "content-type": "application/json" },\n\t\t\t\tbody: JSON.stringify(resp)','headers: { "content-type": "application/json", "x-deskpet-bridge-capability": process.env.AGENT_MUSUME_BRIDGE_CAPABILITY },\n\t\t\t\tbody: JSON.stringify(resp)','bridge callback authentication');
  s=replaceOnce(s,'const { createServer } = globalThis[Symbol.for("agent-musume.host")];','import reactionSources from "../runtime/electron-helper/reaction-sources.cjs";\nconst {normalizeSources}=reactionSources;\nconst { createServer } = globalThis[Symbol.for("agent-musume.host")];','source helpers after hashbang');
  s=replaceOnce(s,'workStatusEnabled: petBool(p.workStatusEnabled, base.workStatusEnabled, label, "workStatusEnabled", id),','workStatusEnabled: petBool(p.workStatusEnabled, base.workStatusEnabled, label, "workStatusEnabled", id),\n        reactionSources: normalizeSources(p.reactionSources),','read per-pet sources');
  s=replaceOnce(s,'\t\t\tworkStatusEnabled,','\t\t\tworkStatusEnabled,\n            reactionSources: normalizeSources(pp.reactionSources),','save per-pet sources');
  s=replaceOnce(s,'const {normalizeSources}=reactionSources;','const {normalizeSources}=reactionSources;\nimport petAppearances from "../runtime/electron-helper/pet-appearances.cjs";\nconst {normalizeAppearance,appearanceFields,APPEARANCES}=petAppearances;','appearance helpers');
  s=replaceOnce(s,'reactionSources: normalizeSources(p.reactionSources),','reactionSources: normalizeSources(p.reactionSources),\n        appearance: normalizeAppearance(p.appearance),','read appearance');
  s=replaceOnce(s,'const pp = p;','const pp = p;\n        if(pp.appearance !== undefined && !Object.hasOwn(APPEARANCES,pp.appearance)) return null;','validate appearance');
  s=replaceOnce(s,'reactionSources: normalizeSources(pp.reactionSources),','reactionSources: normalizeSources(pp.reactionSources),\n            appearance: normalizeAppearance(pp.appearance),','save appearance');
  s=replaceOnce(s,'\t\t\tconf,\n\t\t\tpet: found','\t\t\tconf: {...conf,...appearanceFields(found)},\n\t\t\tpet: found','host animation lookup');
  s=replaceOnce(s,'const file = extraAnimDir !== void 0 && existsSync(extraAnimDir) ? resolveExisting(extraAnimDir, fileName) : resolveExisting(userRootFor(ext), fileName) ?? resolveExisting(assetRootFor(ext), fileName);','const file = petId === "deskpet-duets" ? resolveExisting(join(PACKAGE_ROOT,"..","..","pets","duets"), fileName) : petId === "deskpet-claude-lady" ? resolveExisting(join(PACKAGE_ROOT,"..","..","pets","claude-lady","webm"), fileName) : petId === "deskpet-dragon-d" ? resolveExisting(join(PACKAGE_ROOT,"..","..","pets","dragon-girl-D","webm"), fileName) : extraAnimDir !== void 0 && existsSync(extraAnimDir) ? resolveExisting(extraAnimDir, fileName) : resolveExisting(userRootFor(ext), fileName) ?? resolveExisting(assetRootFor(ext), fileName) ?? resolveExisting(join(PACKAGE_ROOT,"..","..","pets","blue-fish","webm"), fileName);','appearance asset route');
  s=replaceOnce(s,'const {normalizeAppearance,appearanceFields,APPEARANCES}=petAppearances;','const {normalizeAppearance,appearanceFields,APPEARANCES}=petAppearances;\nimport interactionCatalog from "../runtime/electron-helper/interaction-catalog.cjs";\nconst {normalizeInteraction,interactionValid}=interactionCatalog;','interaction helpers');
  s=replaceOnce(s,'appearance: normalizeAppearance(p.appearance),','appearance: normalizeAppearance(p.appearance),\n        interaction: normalizeInteraction(p.interaction),','read interaction');
  s=replaceOnce(s,'if(pp.appearance !== undefined && !Object.hasOwn(APPEARANCES,pp.appearance)) return null;','if(pp.appearance !== undefined && !Object.hasOwn(APPEARANCES,pp.appearance)) return null;\n        if(!interactionValid(pp.interaction)) return null;','validate interaction');
  s=replaceOnce(s,'appearance: normalizeAppearance(pp.appearance),','appearance: normalizeAppearance(pp.appearance),\n            interaction: normalizeInteraction(pp.interaction),','save interaction');
  // Per-pet activity level (how much of the idle time goes to actions), read and saved like the appearance.
  s=replaceOnce(s,'const {normalizeAppearance,appearanceFields,APPEARANCES}=petAppearances;','const {normalizeAppearance,appearanceFields,APPEARANCES,normalizeActivity,ACTIVITIES}=petAppearances;','activity helpers');
  s=replaceOnce(s,'interaction: normalizeInteraction(p.interaction),','interaction: normalizeInteraction(p.interaction),\n        activity: normalizeActivity(p.activity),','read activity');
  s=replaceOnce(s,'if(!interactionValid(pp.interaction)) return null;','if(!interactionValid(pp.interaction)) return null;\n        if(pp.activity !== undefined && !Object.hasOwn(ACTIVITIES,pp.activity)) return null;','validate activity');
  s=replaceOnce(s,'interaction: normalizeInteraction(pp.interaction),','interaction: normalizeInteraction(pp.interaction),\n            activity: normalizeActivity(pp.activity),','save activity');
  return replaceOnce(s,'on() {\n\t\t\treturn () => {};\n\t\t},','on(event, handler) {\n\t\t\tconst bus = globalThis[Symbol.for("agent-musume.events")];\n\t\t\tbus.on(event, handler);\n\t\t\treturn () => bus.off(event, handler);\n\t\t},','event subscription');
}
export function patchHelper(source) {
  let s=replaceOnce(source,"app.setName('dsh-pet-electron-helper');","app.setName('agent-musume');\nif (process.env.AGENT_MUSUME_DATA) app.setPath('userData', require('node:path').join(process.env.AGENT_MUSUME_DATA, 'electron'));",'isolated userData');
  s=replaceOnce(s,"const server = http.createServer((req, res) => {\n    if (req.method !== 'POST'", "const server = http.createServer((req, res) => {\n    if (!require('./bridge-guard.cjs')(req, process.env.AGENT_MUSUME_BRIDGE_CAPABILITY)) { res.writeHead(403); res.end('Forbidden'); req.resume(); return; }\n    if (req.method !== 'POST'",'helper callback authentication');
  s=replaceOnce(s,".loadFile('index.html', {",".loadFile(path.join(__dirname, 'index.html'), {",'page path');
  s=s.replaceAll('shell.openExternal(', 'openStatusPanel(');
  // Clips are served whole with 200, so Chromium cannot seek into a part it has not buffered yet and restarts the clip
  // from 0 instead (a walk jumping to its turn back). Byte ranges make every clip seekable.
  s=replaceOnce(s,"      const data = await fsPromises.readFile(resp.file);\n      return new Response(new Uint8Array(data), { status: resp.status || 200, headers });",
    "      const data = await fsPromises.readFile(resp.file);\n      return fileResponse(data, request.headers.get('range'), resp.status || 200, headers);",'seekable clips');
  return s+`\n// Agent-Musume: byte ranges for clip files.\nfunction fileResponse(data, range, status, headers) {\n  const m = /^bytes=(\\d*)-(\\d*)$/.exec(range || '');\n  headers['accept-ranges'] = 'bytes';\n  if (!m || (m[1] === '' && m[2] === '')) { headers['content-length'] = String(data.length); return new Response(new Uint8Array(data), { status, headers }); }\n  const start = m[1] === '' ? Math.max(0, data.length - Number(m[2])) : Number(m[1]);\n  const end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;\n  if (start > end || start >= data.length) return new Response(null, { status: 416, headers: { ...headers, 'content-range': 'bytes */' + data.length } });\n  headers['content-range'] = 'bytes ' + start + '-' + end + '/' + data.length;\n  headers['content-length'] = String(end - start + 1);\n  return new Response(new Uint8Array(data.subarray(start, end + 1)), { status: 206, headers });\n}\n// Agent-Musume: user-initiated host navigation opens the local status panel.\nfunction openStatusPanel(_target) { return require('electron').shell.openExternal(process.env.AGENT_MUSUME_PANEL_URL); }\nrequire('./deskpet-extension.cjs')({app, BrowserWindow, windows, petStates});\n`;
}
export function patchSprite(source) {
  // Right-click menu: a short root of pet controls, the previews and every animation under one 动作 branch. The
  // upstream 碎碎念, 对话 and 查看余额 items are gone: they need the DSH model service and DeepSeek credentials, which this
  // standalone build does not have (the clips of those groups stay playable under 动作).
  let s=replaceOnce(source,`    const tools = [{ label: OPEN_TARGET === 'desktop' ? '打开 DeepSeek Harness' : '打开网站', action: 'open-site' }];
    if (this.pet.balanceEnabled) tools.push({ label: '查看余额', action: 'show-balance' });
    tools.push(
      { label: '碎碎念', action: 'whisper' },
      { label: '对话', action: 'chat' },
      { label: '回到初始位置', action: 'home' },
      // 改配置文件后免去回设置页点保存：请宿主重启桌面 Helper（全部桌面宠物窗口按最新配置重建）。
      // 放在最后：它是"重新加载"这类维护动作，与上面几个宠物互动项语义不同。
      { label: '重载配置', action: 'reload' },
    );
    const tree = tools.concat(S.buildMenuTree(this.animations));`,`    const tools = [
      { label: '设置…', action: 'deskpet-settings' },
      { label: '查看实时状态', action: 'open-site' },
      { label: '回到初始位置', action: 'home' },
      { label: this.pet.fixedEnabled ? '恢复走动' : '暂停走动', action: 'deskpet-walk' },
      { label: this.quietUntil > Date.now() ? '结束安静' : '安静 30 分钟', action: 'deskpet-quiet' },
    ];
    const demos = Object.entries({ 'collab.assign': '派任务', 'collab.deliver': '交回结果', 'collab.complete': '一起完成', 'collab.failed': '子任务失败', 'social.cheer': '祝贺同伴', 'social.comfort': '安慰同伴', 'social.chat': '闲聊' })
      .map(([kind, label]) => ({ label, action: 'deskpet-demo', kind }));
    // buildMenuTree already returns the single 动作 branch (or nothing).
    const tree = tools.concat({ label: '互动演示', children: demos }, S.buildMenuTree(this.animations), { label: '重载配置', action: 'reload' });`,'pet menu');
  // 安静 30 分钟: only the resting idle between sessions, no walking, no partner shows (interaction-stage.js treats a quiet
  // pet as busy). Work states still play. 暂停走动 holds the pet in place for this run, like 固定位置 in the settings.
  s=replaceOnce(s,"    const k = S.rollKind(roll, animationWeights, { fixed: this.pet.fixedEnabled });","    if (this.quietUntil > Date.now()) { this.playOnce(animations.idle[0] ?? this.anim); return; }\n    const k = S.rollKind(roll, animationWeights, { fixed: this.pet.fixedEnabled });",'quiet keeps the resting idle');
  // Roaming walks start and stop with a short ramp instead of jumping to full speed.
  s=replaceOnce(s,'else ratioX = startRatio + dir * totalRatio * ((t - leadSec) / travelWindow);','else ratioX = startRatio + dir * totalRatio * (globalThis.DeskpetInteraction ? globalThis.DeskpetInteraction.gait(t - leadSec, travelWindow, Math.min(0.5, travelWindow * 0.18)) : (t - leadSec) / travelWindow);','eased roaming');
  s=replaceOnce(s,'switchTo(next, nextOnce) {',"switchTo(next, nextOnce) {\n    if (next && this.pet.appearance === 'claude-lady' && S.isNoMirrorAnimation(this.animations.categories, next) && this.facing === 'right') this.facing = 'left';",'upright Claude text in all playback paths');
  // A freshly loaded clip can take a frame or two to appear after it is made the front one. The outgoing clip stays
  // opaque (deskpet-hold, styled in interaction-stage.js) until the incoming one has drawn a frame and faded in, so
  // the pet never shows half transparent in between. A walk starting or ending, or a switch a show asks for
  // (deskpetCut = that clip), is a cut instead (deskpet-cut): the new clip replaces the old one the moment it has
  // drawn, because a dissolve between two different poses shows both at once, an afterimage.
  s=replaceOnce(s,"      if (old && old !== el) {\n        old.classList.remove('is-front');\n        old.onended = null;\n        old.pause();\n      }\n",
    "      const moving = (name) => !!name && (this.animations.moves?.actions ?? []).some((a) => a.name === name);\n      const cut = this.deskpetCut === next || moving(next) || moving(old && old.deskpetAnim);\n      this.deskpetCut = null;\n      el.deskpetAnim = next;\n      for (const v of [el, old]) if (v) v.classList.toggle('deskpet-cut', cut);\n      el.classList.remove('deskpet-hold');\n      if (old && old !== el) {\n        old.classList.remove('is-front');\n        old.onended = null;\n        old.pause();\n        const hold = (old.deskpetHold = (old.deskpetHold || 0) + 1), since = performance.now();\n        const release = () => { if (old.deskpetHold === hold) old.classList.remove('deskpet-hold'); };\n        old.classList.add('deskpet-hold');\n        if (el.requestVideoFrameCallback) el.requestVideoFrameCallback(() => (cut ? release() : window.setTimeout(release, Math.max(0, 180 - (performance.now() - since)))));\n        window.setTimeout(release, 450);\n      }\n",'outgoing clip held until the new one is drawn');
  // Words about real agent work (the work slot) look different from chatter and murmurs: is-work, styled in
  // reaction-renderer.js, with the session it belongs to above a persona's line (deskpetWorkLabel).
  s=replaceOnce(s,"    this.bubble.classList.toggle(S.MEME_BUBBLE_CLASS, !!whisperImg);\n","    this.bubble.classList.toggle(S.MEME_BUBBLE_CLASS, !!whisperImg);\n    this.bubble.classList.toggle('is-work', slot === 'work');\n",'work bubble class');
  s=replaceOnce(s,"    if (slot === 'work') {\n      const line = document.createElement('div');\n","    if (slot === 'work') {\n      if (this.deskpetWorkLabel) {\n        const tag = document.createElement('div');\n        tag.className = 'pet-bub-source';\n        tag.textContent = this.deskpetWorkLabel;\n        this.bubble.appendChild(tag);\n      }\n      const line = document.createElement('div');\n",'work bubble source');
  s=replaceOnce(s,"      line.textContent = this.workText;\n","      line.textContent = (globalThis.DeskpetInteraction?.softBreaks ?? String)(this.workText);\n",'work bubble wraps after punctuation');
  // Persona idles come round occasionally; the resting idle carries most of the quiet time.
  s=replaceOnce(s,'next = S.pick(animations.idle, this.anim);','next = (globalThis.DeskpetAppearances?.pickIdle ?? S.pick)(animations.idle, this.anim);','weighted idle pick');
  s=replaceEach(s,'this.playOnce(S.pick(animations.idle, this.anim));','this.playOnce((globalThis.DeskpetAppearances?.pickIdle ?? S.pick)(animations.idle, this.anim));',2,'weighted idle after events');
  s=replaceOnce(s,'this.playOnce(S.pick(this.animations.idle, this.anim));','this.playOnce((globalThis.DeskpetAppearances?.pickIdle ?? S.pick)(this.animations.idle, this.anim));','weighted idle after drag');
  // A clip that ends after the work state moved on (a click, a murmur, a busy clip left to finish) hands over to the
  // active state's clips instead of rotating within the slot it came from.
  s=replaceOnce(s,"const nextWork = nonTerminal ? S.nextWorkStatusAnim(animations.events?.workStatus ?? [], this.anim) : null;","const inActiveSlot = S.poolIncludes([animations.events?.workStatus?.[S.WORK_STATUS_INDEX[this.workState]]].filter(slot => slot !== undefined), this.anim);\n      const nextWork = nonTerminal && inActiveSlot ? S.nextWorkStatusAnim(animations.events?.workStatus ?? [], this.anim) : null;",'rotation stays within active work state');
  // The pop-up menu (pet-menu-client.js) replaces the in-window cascade when the bridge offers it.
  s=replaceOnce(s,'    if (!tree.length) return;\n    this.menuOpen = true;','    if (!tree.length) return;\n    if (this.openPopupMenu && this.openPopupMenu(tree)) return;\n    this.menuOpen = true;','pop-up menu');
  // Pets sharing a corner start side by side (home-spacing.cjs); 回到初始位置 returns to the same spot.
  s=replaceOnce(s,'        marginX: this.pet.position.marginX,','        marginX: globalThis.DeskpetHome?.homePositions(config.pets.filter((p) => S.isDesktopVisible(p.display)))[CONFIG.petIndex]?.marginX ?? this.pet.position.marginX,','spaced home positions');
  return replaceOnce(s,"if (leaf.action === 'open-site') {",`if (leaf.action === 'deskpet-settings') {
      if (window.petBridge) window.petBridge.openSettings();
      return;
    }
    if (leaf.action === 'deskpet-walk') {
      this.pet.fixedEnabled = !this.pet.fixedEnabled;
      if (this.pet.fixedEnabled) this.stopMove();
      return;
    }
    if (leaf.action === 'deskpet-quiet') {
      this.quietUntil = this.quietUntil > Date.now() ? 0 : Date.now() + 30 * 60 * 1000;
      if (this.quietUntil && !this.workState) { this.stopMove(); this.playOnce(this.animations.idle[0] ?? this.anim); }
      return;
    }
    if (leaf.action === 'deskpet-demo') {
      if (window.petBridge && window.petBridge.interactionPreview) window.petBridge.interactionPreview(leaf.kind);
      return;
    }
    if (leaf.action === 'open-site') {`,'pet menu actions');
}
export function patchPreload(source) {
  return replaceOnce(source,"contextBridge.exposeInMainWorld('petBridge', {","contextBridge.exposeInMainWorld('petBridge', {\n  openSettings() { ipcRenderer.send('deskpet:open-settings'); },\n  interactionPreview(kind) { ipcRenderer.send('deskpet:interaction-preview', String(kind)); },\n  reactionSnapshot() { return ipcRenderer.invoke('deskpet:reaction-snapshot'); },\n  onReactionPush(cb) { ipcRenderer.on('deskpet:reaction-push', (e, snapshot) => cb(snapshot)); },\n  openMenu(model) { ipcRenderer.send('deskpet:menu-open', model); },\n  onMenuPick(cb) { ipcRenderer.on('deskpet:menu-pick', (e, path) => cb(path)); },\n  onMenuClosed(cb) { ipcRenderer.on('deskpet:menu-closed', () => cb()); },\n  stageReport(msg) { ipcRenderer.send('deskpet:stage-report', msg); },\n  onStageCue(cb) { ipcRenderer.on('deskpet:stage-cue', (e, cue) => cb(cue)); },",'pet settings IPC');
}
export function patchEvents(source){
  let s=replaceOnce(source,'function applyWorkStatusLeaf(leaf) {','function applyWorkStatusLeaf(leaf) {\n  return; // Per-pet source selection is applied by reaction-renderer.js.','per-pet reaction gate');
  s=replaceOnce(s,'  const stateChanged = this.prevWorkState !== state;','  const previousWorkState = this.prevWorkState;\n  const stateChanged = previousWorkState !== state;','previous work state');
  // While an agent works its state flips between thinking, working and result every second or two. The busy clip on
  // screen plays to its end and the next clip comes from the newest state (handleEnded resumes the active state);
  // the bubble text still follows at once, and waiting, success and error cut in immediately.
  return replaceOnce(s,'  const rotating = !terminal && Array.isArray(slot) && slot.length > 1;',
    "  const BUSY = ['thinking', 'working', 'result'];\n  const frontEl = this.front === 0 ? this.videoA : this.videoB;\n  // A looping work clip is started without updating this.anim, so the clip on screen is read from the video itself.\n  const playing = frontEl ? decodeURIComponent((frontEl.currentSrc || frontEl.src || '').split('/').pop() || '').replace(/\\.webm$/, '') : '';\n  if (stateChanged && BUSY.includes(state) && BUSY.includes(previousWorkState) && !this.pending && S.poolIncludes(pool, playing) && !frontEl.ended) {\n    this.anim = playing;\n    this.once = true;\n    frontEl.loop = false;\n    frontEl.onended = () => this.handleEnded();\n    return;\n  }\n  const rotating = !terminal && Array.isArray(slot) && slot.length > 1;",'busy clips play to their end');
}
// The bubble font. Upstream's is a paid font that may not be redistributed; this one is under the SIL OFL.
export const BUBBLE_FONT='MaokenAssortedSans';
export const useBubbleFont=source=>source.replaceAll('ShangshouSoftCandy',BUBBLE_FONT);
export function patchShared(source){
  // A pointer that slips off the menu for a moment (moving diagonally to a submenu) no longer closes it.
  return useBubbleFont(replaceOnce(source,'\t\t\tleaveTimer = null;\n\t\t\tclose();\n\t\t}, 200);','\t\t\tleaveTimer = null;\n\t\t\tclose();\n\t\t}, 500);','menu leave delay'));
}
export function patchRenderer(source){
  const s=replaceOnce(source,"encodeURIComponent('上首软糖体')","encodeURIComponent('MaokenAssortedSans-Lite')",'bubble font file');
  return useBubbleFont(replaceOnce(s,'pets: S.flattenConfigPets(merged),','pets: S.flattenConfigPets(merged).map(globalThis.DeskpetAppearances.applyAppearance),','per-pet appearance pools'));
}
