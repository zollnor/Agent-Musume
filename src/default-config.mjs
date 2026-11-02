// What a first start writes to data/dsh-pet/main-config.jsonc: three pets, each on its own sessions, every interaction on.
// Every pair of the three has a paired take for each hand-over (interaction-catalog DUETS). Pets sharing the corner are
// spread out at start-up (home-spacing.cjs).
const pet=(id,name,appearance,reactionSources,helperSources)=>({
  id,name,appearance,activity:'normal',size:200,balanceEnabled:false,whisperEnabled:false,workStatusEnabled:true,fixedEnabled:false,
  display:'desktop',position:{corner:'bottom-right',marginX:24,marginY:54},reactionSources,
  interaction:{helperSources,social:true,collab:true,idle:true,approach:true,lines:true}
});

export const DEFAULT_CONFIG=Object.freeze({
  pets:[
    pet('main','大小姐','claude-lady',['claude-code'],['chatgpt-desktop','codex-cli','dsh-desktop']),
    pet('pet-2','龙娘','dragon-girl-D',['chatgpt-desktop','codex-cli'],['claude-code']),
    pet('pet-3','大肥鱼','blue-fish',['dsh-desktop'],['claude-code'])
  ],
  notificationsEnabled:false,
  workStatusTexts:[['正在思考下一步'],['正在执行工具'],['正在整理工具结果'],['需要你输入或确认'],['这一轮回复已结束'],['本轮运行遇到错误']]
});
