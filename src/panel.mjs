// The local status page (托盘 / 右键 → 运行状态): what each session source is doing now, and what the pets can do.
// Served inside a String.raw template: the inline script must not use backticks or ${}.
export const PANEL=String.raw`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent-Musume 运行状态</title>
<style>
:root{--bg:#f6f7f9;--surface:#fff;--surface-2:#f1f2f5;--line:#e4e6eb;--ink:#1c1e23;--ink-2:#50555f;--ink-3:#686d77;--accent:#4a63e0;--accent-tint:rgba(74,99,224,.1);
  --busy:#3a86ff;--waiting:#e8930c;--success:#1f9d63;--error:#cc3a3a;--idle:#a3a8b1;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#1e1f23;--surface:#26272c;--surface-2:#2e3035;--line:#35373d;--ink:#eef0f3;--ink-2:#b3b7bf;--ink-3:#9599a2;--accent:#7187f2;--accent-tint:rgba(113,135,242,.15);
  --busy:#5b9bff;--waiting:#f2a93b;--success:#3cc185;--error:#f07272;--idle:#6f737c;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.65 "Microsoft YaHei UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
::selection{background:var(--accent-tint)}
main{max-width:820px;margin:0 auto;padding:48px 32px 56px}
header{margin-bottom:28px}
.brand{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
h1{margin:0;font-size:24px;font-weight:700;letter-spacing:-.01em}
.pill{display:inline-flex;align-items:center;gap:7px;padding:6px 14px;border-radius:16px;line-height:20px;background:var(--surface-2);color:var(--ink-2);font-size:13px}
.lead{margin:10px 0 0;max-width:62ch;color:var(--ink-2)}
h2{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:36px 0 12px;font-size:17px;font-weight:650}
h2 small{font-size:12.5px;font-weight:400;color:var(--ink-3)}
.dot{width:9px;height:9px;border-radius:50%;background:var(--idle);flex:none}
.dot[data-s=thinking],.dot[data-s=working],.dot[data-s=result]{background:var(--busy);animation:pulse 1.6s ease-in-out infinite}
.dot[data-s=waiting]{background:var(--waiting);animation:pulse 1.2s ease-in-out infinite}
.dot[data-s=success],.dot[data-s=on]{background:var(--success)}.dot[data-s=error],.dot[data-s=off]{background:var(--error)}
@keyframes pulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.dot{animation:none!important}}
.banner{display:flex;align-items:center;gap:10px;margin:0 0 8px;padding:12px 16px;border-radius:10px;background:var(--accent-tint);color:var(--ink)}
.banner[hidden]{display:none}
.list{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:0 20px}
.src{display:grid;grid-template-columns:minmax(150px,1fr) minmax(0,1.5fr) 96px 92px;align-items:center;gap:16px;min-height:60px;padding:10px 0;border-top:1px solid var(--line)}
.src:first-child{border-top:0}
.src .name{display:flex;align-items:center;gap:10px;font-weight:600}
.src .name i{width:9px;height:9px;border-radius:50%}
.src .state{display:flex;align-items:center;gap:9px;min-width:0;color:var(--ink)}
.src .state span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.src .num,.src .when{font-size:13px;color:var(--ink-3);font-variant-numeric:tabular-nums;text-align:right}
.src .num b{font-weight:600;color:var(--ink)}
.src.missing .state{color:var(--ink-3)}
.offline .src{opacity:.5}
.note{margin:10px 2px 0;font-size:13px;color:var(--ink-3)}
.note.warn{color:var(--waiting)}
.guide{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:0 20px}
.how{display:grid;grid-template-columns:150px minmax(0,1fr);gap:16px;padding:16px 0;border-top:1px solid var(--line)}
.how:first-child{border-top:0}
.how dt{font-weight:650}
.how dt small{display:block;font-weight:400;font-size:12.5px;color:var(--ink-3)}
.how dd{margin:0}
.how ul{margin:0;padding:0;list-style:none}
.how li{position:relative;padding-left:14px}
.how li+li{margin-top:4px}
.how li::before{content:"";position:absolute;left:0;top:.72em;width:5px;height:5px;border-radius:50%;background:var(--accent)}
.how li b{font-weight:600}
.how li span{color:var(--ink-2)}
footer{margin-top:36px;padding-top:18px;border-top:1px solid var(--line);font-size:13px;color:var(--ink-3);line-height:1.75}
footer p{margin:0 0 6px}
a{color:var(--accent);text-underline-offset:3px}
::-webkit-scrollbar{width:12px}::-webkit-scrollbar-thumb{background:var(--line);border-radius:6px;border:3px solid var(--bg)}::-webkit-scrollbar-track{background:var(--bg)}
@media (max-width:640px){main{padding:28px 18px 40px}.src{grid-template-columns:1fr auto;gap:4px 12px}.src .state{grid-column:1/-1;grid-row:2}.src .num{display:none}.how{grid-template-columns:1fr;gap:6px}}
</style>
<main>
<header>
  <div class="brand"><h1>Agent-Musume</h1><span class="pill"><i class="dot" id="run"></i><span id="run-text">正在连接…</span></span></div>
  <p class="lead">桌面宠物跟着本机的 AI 会话做出反应：思考、执行、等你确认、完成或出错时，都会换上对应的动作和台词。</p>
</header>
<div class="banner" id="demo" hidden><i class="dot" data-s="working"></i><span id="demo-text"></span></div>
<h2>会话来源<small id="updated">每秒刷新</small></h2>
<div class="list" id="sources"></div>
<p class="note" id="health"></p>
<h2>能做什么，在哪里找</h2>
<dl class="guide">
  <div class="how"><dt>右键宠物<small>最常用</small></dt><dd><ul>
    <li><b>播放动作</b> <span>按分类挑选，或直接打字搜索，点一下就播放</span></li>
    <li><b>暂停走动 · 安静 30 分钟 · 回到原位</b> <span>让她停下、安静待机或回到初始位置</span></li>
    <li><b>互动演示</b> <span>和一位同伴一起演派任务、交回结果、一起完成等</span></li>
  </ul></dd></div>
  <div class="how"><dt>直接动手</dt><dd><ul>
    <li><b>拖动</b> <span>按住宠物拖到任意位置，松手时甩一下可以把她抛出去</span></li>
    <li><b>点击</b> <span>点一下宠物，她会回应你</span></li>
  </ul></dd></div>
  <div class="how"><dt>设置<small>右键宠物或托盘打开</small></dt><dd><ul>
    <li><b>每只宠物</b> <span>形象、名字、大小、初始位置、活跃度</span></li>
    <li><b>会话</b> <span>跟随哪些来源的会话，接手哪些来源的子代理</span></li>
    <li><b>互动与手感</b> <span>协作演出、闲聊、台词开关，拖拽与抛掷的力度</span></li>
  </ul></dd></div>
  <div class="how"><dt>托盘图标<small>任务栏右下角</small></dt><dd><ul>
    <li><b>显示或隐藏全部宠物</b> <span>双击图标也能显示</span></li>
    <li><b>演示</b> <span>不开会话也能看各种反应和宠物互动</span></li>
    <li><b>退出</b></li>
  </ul></dd></div>
</dl>
<footer>
  <p>只在本机读取会话记录来判断状态，不需要 API Key，也不保存或转发对话内容。远程（SSH、WSL、云端）会话不会触发反应。</p></footer>
</main>
<script>
var SOURCES=[['chatgpt-desktop','ChatGPT 桌面版','#10a37f','watcher'],['codex-cli','Codex CLI','#7a828e','watcher'],['claude-code','Claude Code','#d97757','claudeWatcher'],['dsh-desktop','DeepSeek Harness','#4d6bfe','dsh']];
var el=function(id){return document.getElementById(id);};
function make(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
function ago(t){
  if(!t)return '—';var s=Math.round((Date.now()-t)/1000);
  if(s<10)return '刚刚';if(s<60)return s+' 秒前';if(s<3600)return Math.round(s/60)+' 分钟前';
  return clock(new Date(t),false);
}
function clock(d,sec){var p=function(n){return String(n).padStart(2,'0');};return p(d.getHours())+':'+p(d.getMinutes())+(sec?':'+p(d.getSeconds()):'');}
function row(key,name,color,info,available){
  var r=make('div','src'+(available?'':' missing')),n=make('div','name'),i=make('i'),st=make('div','state'),dot=make('i','dot');
  i.style.background=color;n.append(i,name);
  dot.dataset.s=available?(info&&info.state)||'idle':'off';
  st.append(dot,make('span',null,available?(info&&info.label)||'等待新的本地会话':'没有找到本机的会话记录'));
  var num=make('div','num'),b=make('b',null,String((info&&info.activeSessions)||0));num.append(b,' 个活动会话');
  var when=make('div','when',available?ago(info&&info.lastEventAt):'');when.title='最近一次事件';
  r.append(n,st,num,when);return r;
}
async function tick(){
  try{
    var r=await fetch('/control/status',{cache:'no-store'});if(!r.ok)throw Error();var d=await r.json();
    document.body.classList.remove('offline');
    el('run').dataset.s='on';el('run-text').textContent='运行中';
    el('demo').hidden=d.mode!=='demo';el('demo-text').textContent='正在演示「'+(d.demoLabel||'')+'」，约 12 秒后恢复实时状态。';
    el('sources').replaceChildren.apply(el('sources'),SOURCES.map(function(s){var w=d[s[3]]||{};return row(s[0],s[1],s[2],(d.sources||{})[s[0]],w.sourceAvailable!==false);}));
    var w=d.watcher||{};
    el('health').className='note'+(w.unavailableFiles?' warn':'');
    el('health').textContent=w.unavailableFiles?'有 '+w.unavailableFiles+' 个会话记录暂时读不到，会自动重试。':'子代理不计入活动会话。';
    el('updated').textContent='每秒刷新 · '+clock(new Date(),true);
  }catch(e){
    document.body.classList.add('offline');
    el('run').dataset.s='off';el('run-text').textContent='没有在运行';
    el('health').className='note warn';el('health').textContent='桌宠已停止或暂时连不上。重新启动桌宠后，这里会自动恢复。';
  }
}
tick();setInterval(tick,1000);
</script></html>`;
