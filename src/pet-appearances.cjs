'use strict';
// Shared by the host, settings and desktop renderer. Original fish uses its existing pools.
const APPEARANCES=Object.freeze({'blue-fish':'蓝色大肥鱼','dragon-girl-D':'龙娘','claude-lady':'Claude大小姐'});
const CLAUDE_LADY={
  "animations": {
    "idle": [
      "待机-抱书安静呼吸"
    ],
    "turn": [
      "转向-抱书循声张望"
    ],
    "drag": [
      "拖拽-护裙悬空晃腿"
    ],
    "clicks": [
      "点击-矜持的小雀跃",
      "点击-袖口掩面害羞",
      "点击-不合礼数小生气",
      "点击-掩口忍不住笑",
      "点击-大小姐端庄招手",
      "圣女提裙礼",
      "听见中文后警觉",
      "新加坡朋友多吗",
      "温柔劝睡省算力",
      "黑化放大镜审视"
    ],
    "moves": {
      "default": {
        "minDist": 60,
        "maxDist": 180,
        "margin": 20,
        "leadSec": 0.65,
        "tailSec": 0.65
      },
      "actions": [
        {
          "name": "移动-提裙礼仪侧步"
        },
        {
          "name": "移动-轻盈踮脚步"
        },
        {
          "name": "移动-提裙赶路小跑"
        }
      ]
    },
    "categories": [
      {
        "id": "大小姐常用专属",
        "weight": 48,
        "actions": [
          "圣女提裙礼",
          "高速研读翻页",
          "读毕投书入火盆",
          "听见中文后警觉",
          "新加坡朋友多吗",
          "温柔劝睡省算力",
          "黑化前的碎碎念",
          "黑化放大镜审视"
        ]
      },
      {
        "id": "大小姐日常与学业",
        "weight": 6,
        "actions": [
          "日常-低声哼圣歌",
          "日常-端庄伸懒腰",
          "日常-指尖轻敲小案",
          "日常-提裙轻轻屈膝",
          "日常-抱手小憩",
          "日常-受惊护住花饰",
          "日常-礼服原地转一圈",
          "日常-偷吃茶点被发现",
          "日常-礼仪教鞭轻点",
          "日常-打盹后立刻端正",
          "日常-花饰小镜整仪容",
          "日常-绶带试色又复原",
          "学业-金边笔记速记",
          "学业-琥珀键盘敲代码",
          "日常-蕾丝折扇纳凉",
          "日常-花柄牙刷晨间礼仪"
        ]
      },
      {
        "id": "大小姐才艺与玩耍",
        "weight": 6,
        "actions": [
          "才艺-金纹魔方推演",
          "玩耍-发条马车轻推",
          "才艺-掌心琥珀泡泡",
          "玩耍-踮脚摘下小圣星",
          "玩耍-游戏失利仍守礼",
          "玩耍-小水枪被发现就收好",
          "才艺-金棕小提琴练习",
          "才艺-掌心金羽灵鸟",
          "才艺-提裙端庄小舞",
          "才艺-悄悄摇摆又端正",
          "才艺-害羞比心小舞",
          "玩耍-花纹小气球",
          "玩耍-两只小雀绕裙边",
          "玩耍-金边燕子小风筝",
          "玩耍-礼盒拆得很规矩",
          "才艺-袖中白鸽",
          "才艺-圣印卡牌小魔术",
          "玩耍-圣印小陀螺",
          "才艺-象牙短笛小练习",
          "玩耍-花饰边的小蝶",
          "玩耍-偷偷摸摸白猫",
          "才艺-掌心橙花绽放",
          "玩耍-小木马上的偷闲",
          "才艺-三颗琥珀小球",
          "玩耍-金羽小毽子",
          "玩耍-黑白棋子认真推演",
          "玩耍-花结小秋千"
        ]
      },
      {
        "id": "大小姐茶点与用餐",
        "weight": 5,
        "actions": [
          "饮食-小银勺慢慢吃饭",
          "饮食-零食也要配银盘",
          "饮食-算力糖片细细品",
          "饮食-银盘吐司早餐",
          "饮食-规整小便当",
          "饮食-端庄小银盘晚餐",
          "饮食-甜筒融化小慌张",
          "饮食-小银钳拆蟹宴",
          "饮食-糖葫芦小口尝",
          "饮食-银筷尝一口长面",
          "饮食-小银叉尝西瓜",
          "饮食-小铜锅礼仪涮食"
        ]
      },
      {
        "id": "大小姐时节仪式",
        "weight": 5,
        "actions": [
          "时节-裙边金叶轻落",
          "时节-赏月切月饼",
          "时节-花饰小雪人",
          "时节-掌心圣印小星火",
          "时节-金绳小粽子",
          "时节-小银叉尝年糕",
          "时节-青团细细品",
          "时节-金边碗尝腊八粥",
          "时节-重阳小菊糕",
          "时节-收红包先道谢",
          "时节-挥毫金边福纸",
          "时节-金线小绣绷",
          "时节-掌托小狮头",
          "时节-南瓜小灯讨糖",
          "时节-捧小菊轻嗅秋香",
          "时节-掌心莲灯祈愿",
          "时节-小幽灵指偶吓唬人",
          "时节-给小树挂金星",
          "时节-掌托小灯祈愿",
          "时节-小银勺尝汤圆",
          "时节-金边碟尝饺子"
        ]
      },
      {
        "id": "大小姐问候与劝睡",
        "weight": 3,
        "noMirror": true,
        "actions": [
          "听见中文后警觉",
          "温柔劝睡省算力",
          "文字-晚餐菜单犹豫"
        ]
      },
      {
        "id": "大小姐算力家产",
        "weight": 3,
        "actions": [
          "家产-算力金币满溢",
          "家产-算力筹码叮当",
          "家产-账本平稳收好",
          "家产-皱眉核对算力",
          "家产-空袋也要守体面",
          "家产-最后一枚筹码也没有"
        ]
      },
      {
        "id": "大小姐小声碎念",
        "weight": 4,
        "actions": [
          "碎念-擦拭圣印小银盘",
          "碎念-抱手出神又回神",
          "碎念-对屏幕小声嘀咕"
        ]
      }
    ],
    "events": {
      "balance": [
        "家产-算力金币满溢",
        "家产-算力筹码叮当",
        "家产-账本平稳收好",
        "家产-皱眉核对算力",
        "家产-空袋也要守体面",
        "家产-最后一枚筹码也没有"
      ],
      "workStatus": [
        [
          "高速研读翻页"
        ],
        [
          "工作-羽毛笔严谨誊写",
          "学业-琥珀键盘敲代码",
          "学业-金边笔记速记"
        ],
        [
          "黑化放大镜审视",
          "读毕投书入火盆"
        ],
        [
          "听见中文后警觉",
          "新加坡朋友多吗"
        ],
        [
          "圣女提裙礼",
          "工作-审校完成矜持点赞"
        ],
        [
          "黑化前的碎碎念",
          "工作-犯错掩面小冒汗"
        ]
      ],
      "whisper": [
        "黑化前的碎碎念",
        "碎念-擦拭圣印小银盘",
        "碎念-抱手出神又回神",
        "碎念-对屏幕小声嘀咕"
      ]
    }
  },
  "animationWeights": {
    "idle": 10,
    "turn": 5,
    "move": 5
  },
  "assetRoot": "deskpet-claude-lady"
};
const DRAGON_D={
  "animations": {
    "idle": [
      "待机-呼吸摆尾",
      "待机-眨眼理裙"
    ],
    "turn": [
      "转向-东张西望"
    ],
    "drag": [
      "拖拽-悬空晃腿"
    ],
    "clicks": [
      "点击-两指敬礼",
      "点击-被戳装没事",
      "点击-叉腰训话",
      "点击-爽朗大笑",
      "点击-握拳叫好"
    ],
    "moves": {
      "default": {
        "minDist": 60,
        "maxDist": 180,
        "margin": 20,
        "leadSec": 0.65,
        "tailSec": 0.65
      },
      "actions": [
        {
          "name": "移动-轻步侧行"
        },
        {
          "name": "移动-原地小跑",
          "params": {
            "minDist": 120,
            "maxDist": 280
          }
        },
        {
          "name": "移动-扇翼漂浮",
          "params": {
            "minDist": 40,
            "maxDist": 120
          }
        }
      ]
    },
    "categories": [
      {
        "id": "龙娘日常",
        "weight": 17,
        "actions": [
          "日常-伸懒腰",
          "日常-困倦哈欠",
          "日常-抱尾小憩",
          "日常-龙尾轻拍",
          "日常-回头看翼",
          "日常-掌心星光",
          "日常-龙尾打拍哼歌",
          "日常-抚胸点头致意",
          "日常-护角挑眉",
          "日常-龙角小镜照照",
          "日常-晶石键盘敲代码",
          "日常-翼形小扇纳凉",
          "日常-龙爪轻敲小桌",
          "日常-叉腰热身蹲",
          "日常-收翼原地转圈",
          "日常-瞌睡竖角惊醒",
          "日常-紫粉裙装试色",
          "日常-水晶笔记速记",
          "日常-龙牙泡泡刷牙"
        ]
      },
      {
        "id": "龙娘玩耍",
        "weight": 17,
        "actions": [
          "玩耍-水晶魔方",
          "玩耍-龙角小手柄",
          "玩耍-龙息泡泡",
          "玩耍-宝石礼盒",
          "玩耍-星纹卡牌魔术",
          "玩耍-尾尖逗小猫",
          "玩耍-龙角迷你车",
          "玩耍-跃起捉小星",
          "玩耍-龙头小水枪",
          "玩耍-紫晶小提琴",
          "玩耍-掌心召唤小蓝鲸",
          "玩耍-提裙优雅小舞",
          "玩耍-卷尾摇摆舞",
          "玩耍-帅气比心舞",
          "玩耍-龙角小气球",
          "玩耍-迷你伙伴绕圈",
          "玩耍-紫晶小龙风筝",
          "玩耍-袖中变白鸽",
          "玩耍-紫晶陀螺转转",
          "玩耍-龙纹小短笛",
          "玩耍-角边蝴蝶花开",
          "玩耍-掌心玫瑰绽放",
          "玩耍-龙角小木马",
          "玩耍-三颗晶球抛接",
          "玩耍-龙羽小毽子",
          "玩耍-紫白晶石五子棋",
          "玩耍-月牙小秋千"
        ]
      },
      {
        "id": "龙娘饮食",
        "weight": 14,
        "actions": [
          "饮食-偷吃星形饼干",
          "饮食-紫晶糖豆补能",
          "饮食-龙角甜筒",
          "饮食-龙纹碗吃面",
          "饮食-冰镇月牙西瓜",
          "饮食-迷你龙鼎火锅",
          "饮食-龙纹碗扒白饭",
          "饮食-星纹零食袋",
          "饮食-龙角吐司早餐",
          "饮食-紫白小饭盒",
          "饮食-小银盘晚餐",
          "饮食-龙角蟹蟹小宴",
          "饮食-晶糖小葫芦串"
        ]
      },
      {
        "id": "龙娘时节",
        "weight": 14,
        "actions": [
          "时节-抱月吃月饼",
          "时节-龙角小雪人",
          "时节-紫金星灯",
          "时节-掌心星火庆典",
          "时节-龙角南瓜讨糖",
          "时节-水晶小树挂星",
          "时节-金叶堆里冒龙角",
          "时节-紫绳小粽子",
          "时节-软糯小年糕",
          "时节-浅玉团子尝鲜",
          "时节-紫米腊八小粥",
          "时节-小菊重阳糕",
          "时节-龙纹红包收好",
          "时节-龙纹福纸挥毫",
          "时节-星线小绣绷",
          "时节-掌托小龙狮头",
          "时节-茱萸小菊赏秋",
          "时节-掌心莲花河灯",
          "时节-龙角小幽灵",
          "时节-紫晶碗吃汤圆",
          "时节-龙角小饺子"
        ]
      },
      {
        "id": "龙娘文字反应",
        "weight": 6,
        "actions": [
          "文字-今天吃点什么",
          "文字-龙角深度碎碎念"
        ],
        "noMirror": true
      },
      {
        "id": "龙娘宝物",
        "weight": 6,
        "actions": [
          "宝物-晶石袋满溢",
          "宝物-晶石叮当小龙息",
          "宝物-晶袋稳稳收好",
          "宝物-皱眉数小晶币",
          "宝物-空袋倒倒看",
          "宝物-摊手一颗也没有"
        ]
      },
      {
        "id": "龙娘碎碎念",
        "weight": 6,
        "actions": [
          "碎碎念-龙息晶片抛光",
          "碎碎念-倚尾巴打盹",
          "碎碎念-对着小屏嘀咕"
        ]
      }
    ],
    "events": {
      "balance": [
        "宝物-晶石袋满溢",
        "宝物-晶石叮当小龙息",
        "宝物-晶袋稳稳收好",
        "宝物-皱眉数小晶币",
        "宝物-空袋倒倒看",
        "宝物-摊手一颗也没有"
      ],
      "workStatus": [
        "工作-思考",
        "工作-忙碌",
        "工作-整理",
        "工作-等待",
        "工作-完成",
        "工作-出错"
      ],
      "whisper": [
        "碎碎念-龙息晶片抛光",
        "碎碎念-倚尾巴打盹",
        "碎碎念-对着小屏嘀咕"
      ]
    }
  },
  "animationWeights": {
    "idle": 10,
    "turn": 5,
    "move": 5
  },
  "assetRoot": "deskpet-dragon-d"
};
// Idles acted to each character (persona remake 2026-10-26) rotate with the original resting idle, which stays first.
const PERSONA_IDLE=Object.freeze({'claude-lady':['待机-偷瞄后端正','待机-翻书冷眼','待机-抬颌轻哼','待机-整理花饰'],'dragon-girl-D':['待机-抱臂巡视','待机-抛晶币','待机-手搭凉棚远眺']});
CLAUDE_LADY.animations.idle.push(...PERSONA_IDLE['claude-lady']);
DRAGON_D.animations.idle.push(...PERSONA_IDLE['dragon-girl-D']);
/**
 * Pool changes on top of the packaged fields. The book burning comes round only now and then while results come in
 * (one result clip in four, with two quieter reviewing clips added) and is no longer a random action.
 */
function tunePools(appearance,animations) {
  if(appearance!=='claude-lady')return animations;
  const burn='读毕投书入火盆',result=animations.events.workStatus[2];
  animations.events.workStatus[2]=[...result.filter(n=>n!==burn),'碎念-对屏幕小声嘀咕','日常-指尖轻敲小案',burn];
  for(const c of animations.categories)c.actions=c.actions.filter(n=>n!==burn);
  return animations;
}
tunePools('claude-lady',CLAUDE_LADY.animations);
const PERSONA_IDLE_NAMES=new Set(Object.values(PERSONA_IDLE).flat());
// Remade walks (2026-10-27) turn into a three-quarter view before stepping and back to the front after it; the window
// travels only while she steps. Measured on each generated take (persona-pilot/walk_timing.py), checked against its frames.
// Paired takes start and end side-on on sideFrame, the last stepping frame before the walk's turn back. A walker stops
// there (stopNear: stepping frames that look like it, where the walk can end without a visible jump); the partner turns
// to it with the walk's turn out, which ends on turnEnd, a frame that also looks like it; both turn back to the front
// with the walk's turn back from sideFrame on (persona-pilot/duets.py WALK_SIDE).
const WALK_PARAMS=Object.freeze({
  'claude-lady':{'移动-轻盈踮脚步':{leadSec:0.45,tailSec:0.6,sideFrame:106,turnEnd:15,stopNear:[15,46,76,106]},'移动-提裙礼仪侧步':{leadSec:0.55,tailSec:0.65},
    '移动-提裙赶路小跑':{leadSec:0.45,tailSec:0.5,minDist:120,maxDist:280}}, // a trot covers ground like the dragon's jog
  'dragon-girl-D':{'移动-轻步侧行':{leadSec:0.45,tailSec:0.65,sideFrame:106,turnEnd:11,stopNear:[12,35,58,82,106]},'移动-原地小跑':{leadSec:0.45,tailSec:0.55},'移动-扇翼漂浮':{leadSec:0.6,tailSec:0.85}},
  // The fish's own side walk (2026-10-29, persona-pilot m-f-001), added to her original moves (pets/blue-fish/webm).
  'blue-fish':{'移动-侧身小碎步':{minDist:60,maxDist:240,leadSec:0.45,tailSec:0.5,sideFrame:109,turnEnd:12,stopNear:[12,37,61,85,109]}}});
for(const [fields,app] of [[CLAUDE_LADY,'claude-lady'],[DRAGON_D,'dragon-girl-D']])
  for(const move of fields.animations.moves.actions)if(WALK_PARAMS[app][move.name])move.params={...move.params,...WALK_PARAMS[app][move.name]};
// Each persona speaks its own status bubbles (thinking, working, result, waiting, success, error) in place of the
// source label, and has sharper lines plus an attention clip for a question left unanswered (reaction-renderer.js).
Object.assign(CLAUDE_LADY,{personaStatus:true,
  workStatusTexts:[['容我想一想。','……正在斟酌。','别出声，我在想。'],['我来处理。','正在办，请稍候。','这点小事，交给我。'],['结果来了，我看看。','让我整理一下。'],['这一步，需要你定夺。','……我在等你回话。'],['完成了。理所当然。','这一轮，处理妥当。'],['……出了点差错。','抱歉，这次没能完成。']],
  waitingReminders:['……还在等你。别让我久等。','请尽快答复。……我可没那么多耐心。','你是不是忘了我？……才、才没有在意。'],
  reminderClip:'点击-大小姐端庄招手'});
Object.assign(DRAGON_D,{personaStatus:true,
  workStatusTexts:[['我盘算一下。','让我想想怎么打。','思路理着呢。'],['动手了。','交给我，稳着呢。','在办，别急。'],['结果到手，过一遍。','我核一下。'],['这步得你拍板。','等你一句话。'],['搞定，收工。','办妥了。'],['啧，卡住了。','没成，我换个办法。']],
  waitingReminders:['喂，这边还等你拍板呢。','别晾着我，回个话。','还等着呢，抽空回一句。'],
  reminderClip:'点击-两指敬礼'});
// The fish keeps its original clips and pools and only gets its own voice: cute, sometimes plays cute and wheedles,
// usually lazy and always after a shortcut, and she lives on plain white rice (吃白饭), never fish.
const BLUE_FISH={personaStatus:true,
  workStatusTexts:[['让本鱼想想……有没有捷径～','脑子转不动了，等我一下嘛～','想完要奖励一碗白饭哦！'],['在干活啦，别催嘛～','嘘～偷偷抄了条近路。','干完这票就去扒碗白饭！'],['结果来啦，我瞄一眼～','看看能不能直接照抄～'],['这步要你点头才行哦～','等你说话呢，快嘛快嘛～'],['搞定！快夸夸我～','完成啦，奖励我一大碗白饭！'],['呜……翻车了，不是我的错吧？','出错啦……摸摸头再重来嘛～']],
  waitingReminders:['喂～还在等你呢，饭都要凉了～','理理我嘛……再不理我就去睡午觉了！','你是不是把本鱼忘了？哼，两碗白饭才原谅你～'],
  reminderClip:'点击回应-元气挥手'};
/**
 * Next idle clip. Like the upstream pick (never the clip just shown), except in a pool with persona idles, where an
 * acted idle is followed by the resting idle (the pool's first) three times in four, so the resting idle fills
 * about 45% of idle time and the acted ones stay occasional.
 */
function pickIdle(pool,current,random=Math.random){
  if(pool.length>2&&current!==pool[0]&&pool.some(n=>PERSONA_IDLE_NAMES.has(n))&&random()<0.75)return pool[0];
  const rest=pool.filter(n=>n!==current),src=rest.length?rest:pool;
  return src[Math.floor(random()*src.length)];
}
// How busy a pet is between sessions. Lively keeps the packaged weights (10 resting idle, 5 turn, 5 walk, 80 actions);
// normal and quiet give more of each roll to the resting idle.
const ACTIVITIES=Object.freeze({quiet:'安静',normal:'普通',lively:'活泼'});
const ACTIVITY_WEIGHTS=Object.freeze({quiet:{idle:65,turn:5,move:5},normal:{idle:40,turn:5,move:10}});
const normalizeActivity=value=>Object.hasOwn(ACTIVITIES,value)?value:'normal';
/** Shares that each stay at or below cap, taking the excess from capped entries proportionally from the others. */
function capShares(weights,cap){
  const total=weights.reduce((a,b)=>a+b,0)||1;let share=weights.map(w=>w/total);
  for(let pass=0;pass<weights.length;pass++){
    const over=share.map(s=>s>cap);if(!over.some(Boolean))break;
    const excess=share.reduce((a,s,i)=>a+(over[i]?s-cap:0),0),free=share.reduce((a,s,i)=>a+(over[i]||s>=cap?0:s),0);
    if(free<=0)break;
    share=share.map((s,i)=>over[i]?cap:s>=cap?s:s+excess*s/free);
  }
  return share;
}
/** Whole-number weights summing to total, by largest remainder. */
function apportion(share,total){
  const raw=share.map(s=>s*total),out=raw.map(Math.floor);
  const order=raw.map((r,i)=>[r-Math.floor(r),i]).sort((a,b)=>b[0]-a[0]);
  const missing=total-out.reduce((a,b)=>a+b,0);
  for(let k=0;k<missing;k++)out[order[k%order.length][1]]++;
  return out;
}
/** A pet's animation weights at an activity level. No single action category takes more than a quarter of the actions,
 *  so a handful of signature scenes does not come round every minute. */
function withActivity(fields,level){
  const top=ACTIVITY_WEIGHTS[level],cats=fields.animations?.categories;
  if(!top||!fields.animationWeights||!Array.isArray(cats)||!cats.length)return fields;
  const out={...fields,animations:{...fields.animations},animationWeights:{...fields.animationWeights,...top}};
  const weights=apportion(capShares(cats.map(c=>c.weight),0.25),100-top.idle-top.turn-top.move);
  out.animations.categories=cats.map((c,i)=>({...c,weight:weights[i]}));
  return out;
}
function normalizeAppearance(value){return Object.hasOwn(APPEARANCES,value)?value:'blue-fish';}
function appearanceFields(pet){const fields=pet.appearance==='dragon-girl-D'?DRAGON_D:pet.appearance==='claude-lady'?CLAUDE_LADY:normalizeAppearance(pet.appearance)==='blue-fish'?BLUE_FISH:null;return fields?structuredClone(fields):{};}
// The fish's drawing fills more of its clip than the lady's or the dragon's, so at one size setting it stood about a
// tenth taller; it is drawn at this share of the set size (200 draws like 180).
const DRAWN_SCALE=Object.freeze({'blue-fish':0.9});
function applyAppearance(pet){
  const merged={...pet,...appearanceFields(pet)},scale=DRAWN_SCALE[normalizeAppearance(pet.appearance)];
  if(scale&&Number.isFinite(pet.size))merged.size=Math.round(pet.size*scale);
  // The fish keeps her original pools; her side walk joins her moves.
  const moves=merged.animations?.moves?.actions;
  if(normalizeAppearance(pet.appearance)==='blue-fish'&&Array.isArray(moves)) {
    const added=Object.entries(WALK_PARAMS['blue-fish']).filter(([name])=>!moves.some(m=>m.name===name)).map(([name,params])=>({name,params:{...params}}));
    if(added.length)merged.animations={...merged.animations,moves:{...merged.animations.moves,actions:[...moves,...added]}};
  }
  return withActivity(merged,normalizeActivity(pet.activity));
}
const api={APPEARANCES,PERSONA_IDLE,WALK_PARAMS,ACTIVITIES,tunePools,pickIdle,normalizeAppearance,normalizeActivity,withActivity,appearanceFields,applyAppearance};
if(typeof module!=='undefined')module.exports=api;
else globalThis.DeskpetAppearances=api;
