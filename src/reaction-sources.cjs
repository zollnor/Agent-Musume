'use strict';
const SOURCE_LABELS=Object.freeze({'chatgpt-desktop':'ChatGPT 桌面版','codex-cli':'Codex CLI','claude-code':'Claude Code CLI','dsh-desktop':'DeepSeek Harness'});
const STATE_LABELS=Object.freeze({thinking:'正在思考下一步',working:'正在执行工具',result:'正在整理工具结果',waiting:'需要你输入或确认',success:'这一轮回复已结束',error:'本轮运行遇到错误',idle:'等待新的会话'});
const HELPER_LABELS=Object.freeze({thinking:'正在思考',working:'正在执行工具',result:'正在整理结果',success:'已交回结果',error:'子任务未完成'});
function normalizeSources(value){return value===undefined?['chatgpt-desktop']:Array.isArray(value)?[...new Set(value.filter(v=>Object.hasOwn(SOURCE_LABELS,v)))]:['chatgpt-desktop'];}
/** Main sessions of the selected sources, plus sub-agents of the sources this pet assists. */
function selectReaction(selection,states,helpers=[],helperStates={}){
  const main=normalizeSources(selection).map(source=>({...states[source],source,label:SOURCE_LABELS[source]+' · '+STATE_LABELS[states[source]?.state]}));
  const assisting=(Array.isArray(helpers)?helpers:[]).filter(s=>Object.hasOwn(SOURCE_LABELS,s)&&Object.hasOwn(HELPER_LABELS,helperStates?.[s]?.state)).map(source=>({...helperStates[source],source:'helper:'+source,label:SOURCE_LABELS[source]+' 子代理 · '+HELPER_LABELS[helperStates[source].state]}));
  const selected=[...main.filter(s=>Object.hasOwn(STATE_LABELS,s.state)),...assisting];
  const active=selected.filter(s=>s.activeSessions>0);
  const candidates=active.length?active:selected.filter(s=>s.state==='success'||s.state==='error');
  candidates.sort((a,b)=>(active.length?Number(b.state==='waiting')-Number(a.state==='waiting'):0)||(b.lastEventAt??0)-(a.lastEventAt??0));
  const chosen=candidates[0];
  return chosen?{state:chosen.state,source:chosen.source,task:chosen.label,revision:['success','error'].includes(chosen.state)?chosen.terminalAt??chosen.lastEventAt:0}:{state:'idle',source:null,task:null};
}
if(typeof module!=='undefined')module.exports={SOURCE_LABELS,STATE_LABELS,normalizeSources,selectReaction};
else globalThis.DeskpetSources={SOURCE_LABELS,STATE_LABELS,normalizeSources,selectReaction};
