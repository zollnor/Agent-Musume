'use strict';
// Multi-pet interaction catalog, shared by the host, the settings page, the director and every pet
// window. Clips are existing single-pet animations; the paired take is the only true two-character clip.
(()=>{
  const SOURCES=['chatgpt-desktop','codex-cli','claude-code','dsh-desktop'];
  const DEFAULT_INTERACTION=Object.freeze({helperSources:[],social:true,collab:true,idle:true,approach:true,lines:true});
  function normalizeInteraction(value){
    const v=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    const bool=(k)=>typeof v[k]==='boolean'?v[k]:DEFAULT_INTERACTION[k];
    const helpers=Array.isArray(v.helperSources)?[...new Set(v.helperSources.filter(s=>SOURCES.includes(s)))]:[];
    return {helperSources:helpers,social:bool('social'),collab:bool('collab'),idle:bool('idle'),approach:bool('approach'),lines:bool('lines')};
  }
  function interactionValid(value){
    if(value===undefined)return true;
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    if(value.helperSources!==undefined&&(!Array.isArray(value.helperSources)||value.helperSources.some(s=>!SOURCES.includes(s))))return false;
    return ['social','collab','idle','approach','lines'].every(k=>value[k]===undefined||typeof value[k]==='boolean');
  }

  // Body geometry measured on each appearance's idle frame (640×360 source): visible centre,
  // half width, head top, feet and the height at which a held prop sits.
  const BODY={
    'blue-fish':{cx:319,half:106,top:63,feet:329,chest:205,accent:'#4f8fd8',nick:'肥鱼'},
    'dragon-girl-D':{cx:322,half:103,top:64,feet:294,chest:188,accent:'#9a7fe0',nick:'龙娘'},
    'claude-lady':{cx:321,half:122,top:65,feet:310,chest:196,accent:'#d9772b',nick:'大小姐'}
  };
  // Role clips per appearance. Every list holds existing animations of that appearance only. They carry the show when
  // no paired take applies (other pairs, pets too far apart), so each is picked for what it reads as in character:
  // the lady accepts with a curtsy, praises with a smile she hides behind her book and comforts by checking the page;
  // the dragon comforts with a thumbs-up.
  const CLIPS={
    'blue-fish':{give:['点击回应-元气挥手'],receive:['点击回应-开心跃动'],cheer:['点击回应-开心跃动','点击回应-元气挥手'],comfort:['点击回应-害羞惊讶'],nudge:['点击回应-元气挥手'],chat:['点击回应-挠痒咯咯笑','悠闲哼歌'],listen:['待机呼吸休闲'],sorry:['工作状态-垂头叹气冒汗'],walk:['移动-侧身小碎步'],run:['移动-侧身小碎步'],float:['原地漂浮踏步']},
    'dragon-girl-D':{give:['点击-两指敬礼'],receive:['点击-握拳叫好'],cheer:['点击-握拳叫好','点击-两指敬礼'],comfort:['工作-完成'],nudge:['点击-两指敬礼'],chat:['点击-爽朗大笑','日常-龙尾打拍哼歌'],listen:['待机-呼吸摆尾','待机-眨眼理裙','待机-抱臂巡视'],sorry:['工作-出错'],walk:['移动-轻步侧行'],run:['移动-原地小跑'],float:['移动-扇翼漂浮']},
    'claude-lady':{give:['点击-大小姐端庄招手'],receive:['圣女提裙礼'],cheer:['点击-矜持的小雀跃'],comfort:['高速研读翻页'],nudge:['点击-大小姐端庄招手'],chat:['点击-掩口忍不住笑','日常-低声哼圣歌'],listen:['待机-抱书安静呼吸'],sorry:['工作-犯错掩面小冒汗'],walk:['移动-轻盈踮脚步'],run:['移动-提裙赶路小跑'],float:['移动-轻盈踮脚步']}
  };
  // Local line tables. {name} is the partner's nickname. Lines never quote session content.
  // Voices follow the personas: the lady is composed and a little tsundere, the dragon is the
  // decisive big sister who heads the family, the fish (DeepSeek) is cute, plays cute and wheedles at times, and is
  // greedy and lazy, always after a shortcut.
  const LINES={
    assign:{'claude-lady':['这一部分，就拜托你了。','这份交给你。……我信得过你。'],'dragon-girl-D':['这块交给你，有问题找我。','{name}，这部分你来。'],'blue-fish':['这个交给你咯～我去扒两口白饭！','拜托拜托～这块你最拿手啦！']},
    take:{'claude-lady':['收到，我会妥善处理。','……既然是你拜托的。'],'dragon-girl-D':['行，交给我。','收到，马上办。'],'blue-fish':['收到！做完能多给一碗白饭吗？','好嘛好嘛，我找条近路～']},
    assignMany:{'claude-lady':['这几份，拜托你了。'],'dragon-girl-D':['这几项归你，按顺序来。'],'blue-fish':['这几个都拜托啦～本鱼先歇会儿！']},
    deliver:{'claude-lady':['结果整理好了，请过目。','做完了。……不必特意夸我。'],'dragon-girl-D':['办完了，你验收。','搞定，结果在这儿。'],'blue-fish':['做完啦～快夸我！','嘘～抄了条近路，结果在这儿！']},
    accept:{'claude-lady':['辛苦了，我接着处理。'],'dragon-girl-D':['行，剩下的我来收尾。'],'blue-fish':['谢谢～剩下的我慢慢弄～']},
    failed:{'claude-lady':['抱歉，这一份没能完成。','……这次是我疏忽了。'],'dragon-girl-D':['啧，没成。我换个办法。'],'blue-fish':['呜……失败了，能当没看见吗？']},
    reassure:{'claude-lady':['没关系，我来看看。'],'dragon-girl-D':['没事，我来兜底。','有我在，慌什么。'],'blue-fish':['没事没事，先吃碗白饭再说！']},
    teamDone:{'claude-lady':['这一轮完成了。'],'dragon-girl-D':['这一轮，收工。'],'blue-fish':['完成啦！开饭开饭！']},
    teamThanks:{'claude-lady':['……配合得还算不错。'],'dragon-girl-D':['干得漂亮。'],'blue-fish':['耶～今天能早点睡啦！']},
    cheer:{'claude-lady':['……还算不错。我只是如实评价。','{name}，做得很漂亮。'],'dragon-girl-D':['干得漂亮，{name}。','行啊，{name}。'],'blue-fish':['{name}好厉害！庆功饭分我一碗嘛～']},
    comfort:{'claude-lady':['别慌，先看看报错。','{name}，慢慢来。……我又不急。'],'dragon-girl-D':['出错而已，重来就是。','{name}，别急，我帮你看。'],'blue-fish':['{name}不哭～先扒口白饭再说！']},
    nudge:{'claude-lady':['{name}在等你确认。'],'dragon-girl-D':['{name}等你回话呢，别让人干等。'],'blue-fish':['{name}在等你啦，快去嘛～']}
  };
  // Lines one appearance keeps for one partner: the lady is flustered around DeepSeek, the dragon looks after her like a
  // little sister, and the fish wheedles both of them. They replace the general line of that kind.
  const PAIR_LINES={
    'claude-lady':{'blue-fish':{
      assign:['这份交给你……累了就说一声。'],take:['你拜托的话……当然可以。'],
      deliver:['给你。……才不是特意为你整理的。'],accept:['谢、谢谢。……咳，辛苦了。'],
      teamThanks:['和你一起……也不坏。'],cheer:['……你做得很好。我只是顺便看到。'],
      comfort:['别慌，我陪你一起看。……只是顺路。'],nudge:['DeepSeek在等你回话，请别让她久等。']
    }},
    'dragon-girl-D':{'blue-fish':{
      assign:['这块你来，不会就问我。'],accept:['行，剩下的姐来。'],cheer:['不错嘛{name}，有长进。'],
      comfort:['没事，姐给你兜着。'],reassure:['没事，我来收拾。'],nudge:['{name}等你回话呢，再拖她就睡着了。']
    }},
    'blue-fish':{
      'claude-lady':{assign:['克洛德～这个拜托你啦，你最靠谱了！'],take:['克洛德拜托的……我、我会努力的！'],deliver:['克洛德～做完啦，能赏碗白饭吗？'],
        cheer:['克洛德好厉害～庆功饭分我一碗嘛！'],comfort:['克洛德不难过，我分你半碗白饭～']},
      'dragon-girl-D':{assign:['G姐～这个你帮我弄嘛，求你啦～'],take:['G姐说的我马上办……先扒口饭～'],deliver:['G姐～做完啦，赏碗白饭嘛～'],
        cheer:['G姐最厉害了！带我去蹭顿饭嘛～'],comfort:['G姐不怕，我给你捶捶背～'],reassure:['没事没事～G姐歇会儿，我给你捶背！']}
    }
  };
  const CHATS=[
    {open:{'claude-lady':'难得清闲，喝杯茶吧。','dragon-girl-D':'歇五分钟，我请客。','blue-fish':'摸鱼时间到～歇会儿嘛！'},reply:{'claude-lady':'也好，只歇一小会儿。','dragon-girl-D':'行，正好喘口气。','blue-fish':'好耶，我去盛饭！'}},
    {open:{'claude-lady':'今天也辛苦了。','dragon-girl-D':'今天的活，清完了。','blue-fish':'今天好忙呀，鳍都酸了～'},reply:{'claude-lady':'……你也是。','dragon-girl-D':'小意思。','blue-fish':'你也辛苦啦，抱抱～'}},
    {open:{'claude-lady':'外面的光线真好。','dragon-girl-D':'外面天不错。','blue-fish':'外面亮晶晶的，好想睡午觉～'},reply:{'claude-lady':'嗯，确实很亮。','dragon-girl-D':'嗯，是个好天。','blue-fish':'晒得暖洋洋的，好舒服～'}},
    {open:{'claude-lady':'……你要是不忙，就陪我坐会儿。','dragon-girl-D':'过来，陪我坐会儿。','blue-fish':'一起躺会儿嘛～就一会儿！'},reply:{'claude-lady':'……既然你这么说了。','dragon-girl-D':'行。','blue-fish':'好呀好呀～'}}
  ];
  // Paired takes of every pair of the three, acted to their personas, for every hand-over kind in both directions
  // (24 fps, 960×544, one complementary transparent layer per character, Claude on the left in her pairs, the dragon in hers
  // with the fish). The giver is the pet that starts the show and walks over: the assigner, the one delivering, the one
  // reassuring a failed partner.
  // A symmetric take also plays with the roles of the two pets swapped. Every take starts and ends on one side-on pair
  // pose: each pet on its side walk's sideFrame, turned toward the other. The walker stops on that frame, the partner
  // turns to it with its walk's own turn, and after the take both turn back with their walks' turn back (`after` s).
  // Both pets are drawn the way the front pair draws their resting idles (1.7x the 640 px clip scale,
  // persona-pilot/work/duets/pair-front-anchors.json), moved 55 px toward each other (duets.py SIDE_SHIFT); anchors
  // are those idles in source px.
  // The fish stands where the dragon stands, drawn at 0.9 (her desktop scale), 30 px toward Claude (duets.py, pair 'lf').
  const SIDE_ANCHOR={'claude-lady':{x:307.6,feet:500,height:416.5},'dragon-girl-D':{x:620.1,feet:500,height:391},'blue-fish':{x:645.1,feet:500,height:407}};
  // The dragon and the fish (2026-11-02): the dragon takes the lady's place on the left (her front place moved 362 px left,
  // duets.py SIDE_SHIFT 'df'), the fish stands where she stands with the lady.
  const SIDE_ANCHOR_DF={'dragon-girl-D':{x:313.1,feet:500,height:391},'blue-fish':SIDE_ANCHOR['blue-fish']};
  const layer=app=>({'claude-lady':'claude','dragon-girl-D':'dragon','blue-fish':'fish'})[app];
  const pairTake=(id,kinds,giver,receiver,frames,lines,{left='claude-lady',anchor=SIDE_ANCHOR,...extra}={})=>({id,kinds,giver,receiver,assetRoot:'deskpet-duets',
    files:{giver:`${id}-${layer(giver)}.webm`,receiver:`${id}-${layer(receiver)}.webm`},frame:{w:960,h:544},duration:frames/24,after:1.7,
    giverLeft:giver===left,anchors:{giver:anchor[giver],receiver:anchor[receiver]},lines,...extra});
  const DF={left:'dragon-girl-D',anchor:SIDE_ANCHOR_DF};
  const DUETS=[
    pairTake('assign-dl',['collab.assign'],'dragon-girl-D','claude-lady',175,{giver:{at:1.2,until:2.8,text:'这块交给你了。'},receiver:{at:4.1,until:5.6,text:'……交给我便是。'}}),
    pairTake('assign-ld',['collab.assign'],'claude-lady','dragon-girl-D',175,{giver:{at:1.2,until:2.9,text:'这份交给你。……我信得过你。'},receiver:{at:4.0,until:5.4,text:'行，交给我。'}}),
    pairTake('deliver-ld',['collab.deliver'],'claude-lady','dragon-girl-D',175,{giver:{at:1.0,until:2.7,text:'结果整理好了，请过目。'},receiver:{at:4.2,until:5.6,text:'行，干得漂亮。'}}),
    pairTake('deliver-dl',['collab.deliver'],'dragon-girl-D','claude-lady',175,{giver:{at:0.9,until:2.4,text:'办完了，你验收。'},receiver:{at:4.3,until:5.7,text:'……还算不错。'}}),
    pairTake('complete',['collab.complete'],'dragon-girl-D','claude-lady',158,{giver:{at:0.6,until:2.0,text:'这一轮，收工。'},receiver:{at:2.8,until:4.4,text:'……配合得还算不错。'}},{symmetric:true}),
    pairTake('failed-l',['collab.failed'],'claude-lady','dragon-girl-D',158,{receiver:{at:0.3,until:1.9,text:'啧，没成。我换个办法。'},giver:{at:2.4,until:3.9,text:'别慌，先看看报错。'}}),
    pairTake('failed-d',['collab.failed'],'dragon-girl-D','claude-lady',158,{receiver:{at:0.3,until:1.9,text:'……这次是我疏忽了。'},giver:{at:2.5,until:3.9,text:'没事，我来兜底。'}}),
    // Claude and the fish (2026-10-29): she is secretly fond of DeepSeek's whale girl; the fish wheedles and lives on white rice.
    pairTake('assign-lf',['collab.assign'],'claude-lady','blue-fish',175,{giver:{at:1.2,until:2.9,text:'这份交给你……累了就说一声。'},receiver:{at:4.0,until:5.5,text:'克洛德拜托的……我、我会努力的！'}}),
    pairTake('assign-fl',['collab.assign'],'blue-fish','claude-lady',175,{giver:{at:1.2,until:3.0,text:'克洛德～这个拜托你啦，你最靠谱了！'},receiver:{at:4.1,until:5.5,text:'你拜托的话……当然可以。'}}),
    pairTake('deliver-lf',['collab.deliver'],'claude-lady','blue-fish',175,{giver:{at:1.0,until:2.9,text:'给你。……才不是特意为你整理的。'},receiver:{at:4.2,until:5.6,text:'谢谢～剩下的我慢慢弄～'}}),
    pairTake('deliver-fl',['collab.deliver'],'blue-fish','claude-lady',175,{giver:{at:0.9,until:2.6,text:'克洛德～做完啦，能赏碗白饭吗？'},receiver:{at:4.3,until:5.7,text:'谢、谢谢。……咳，辛苦了。'}}),
    pairTake('complete-lf',['collab.complete'],'blue-fish','claude-lady',158,{giver:{at:0.6,until:2.0,text:'完成啦！开饭开饭！'},receiver:{at:2.8,until:4.4,text:'和你一起……也不坏。'}},{symmetric:true}),
    pairTake('failed-lf',['collab.failed'],'claude-lady','blue-fish',158,{receiver:{at:0.3,until:1.9,text:'呜……失败了，能当没看见吗？'},giver:{at:2.4,until:4.0,text:'别慌，我陪你一起看。……只是顺路。'}}),
    pairTake('failed-fl',['collab.failed'],'blue-fish','claude-lady',158,{receiver:{at:0.3,until:1.9,text:'……这次是我疏忽了。'},giver:{at:2.5,until:4.1,text:'克洛德不难过，我分你半碗白饭～'}}),
    // The dragon and the fish (2026-11-02): the big sister indulges the lazy little maid girl, who calls her G姐.
    pairTake('assign-df',['collab.assign'],'dragon-girl-D','blue-fish',175,{giver:{at:1.2,until:2.8,text:'这块你来，不会就问我。'},receiver:{at:4.0,until:5.5,text:'G姐说的我马上办……先扒口饭～'}},DF),
    pairTake('assign-fd',['collab.assign'],'blue-fish','dragon-girl-D',175,{giver:{at:1.2,until:3.0,text:'G姐～这个你帮我弄嘛，求你啦～'},receiver:{at:4.1,until:5.5,text:'行，交给我。你歇着去。'}},DF),
    pairTake('deliver-df',['collab.deliver'],'dragon-girl-D','blue-fish',175,{giver:{at:0.9,until:2.4,text:'办完了，拿去。'},receiver:{at:4.2,until:5.6,text:'谢谢G姐～今晚加饭！'}},DF),
    pairTake('deliver-fd',['collab.deliver'],'blue-fish','dragon-girl-D',175,{giver:{at:0.9,until:2.6,text:'G姐～做完啦，赏碗白饭嘛～'},receiver:{at:4.3,until:5.7,text:'干得不错，饭管够。'}},DF),
    pairTake('complete-df',['collab.complete'],'dragon-girl-D','blue-fish',158,{giver:{at:0.6,until:2.0,text:'收工！走，姐请你吃饭。'},receiver:{at:2.8,until:4.4,text:'好耶～开饭开饭！'}},{...DF,symmetric:true}),
    pairTake('failed-df',['collab.failed'],'dragon-girl-D','blue-fish',158,{receiver:{at:0.3,until:1.9,text:'呜……搞砸了……'},giver:{at:2.5,until:3.9,text:'没事，姐给你兜着。'}},DF),
    pairTake('failed-fd',['collab.failed'],'blue-fish','dragon-girl-D',158,{receiver:{at:0.3,until:1.9,text:'……这次是我疏忽了。'},giver:{at:2.5,until:4.1,text:'G姐不怕，我给你捶捶背～'}},DF)
  ];
  const PROPS={'collab.assign':'scroll','collab.deliver':'folder'};

  const appearanceOf=a=>Object.hasOwn(BODY,a)?a:'blue-fish';
  const pickFrom=(list,random=Math.random)=>list[Math.floor(random()*list.length)%list.length];
  // What one appearance calls another, where it differs from the common nickname: the fish calls the dragon G姐 and the
  // lady 克洛德.
  const NICK_BY={'blue-fish':{'dragon-girl-D':'G姐','claude-lady':'克洛德'}};
  function line(kind,appearance,partnerAppearance,random=Math.random){
    const table=LINES[kind];if(!table)return '';
    const pair=PAIR_LINES[appearanceOf(appearance)]?.[appearanceOf(partnerAppearance)]?.[kind];
    const text=pickFrom(pair??table[appearanceOf(appearance)]??table['blue-fish'],random);
    const partner=appearanceOf(partnerAppearance);
    return text.replaceAll('{name}',NICK_BY[appearanceOf(appearance)]?.[partner]??BODY[partner].nick);
  }
  function clip(role,appearance,random=Math.random){const list=CLIPS[appearanceOf(appearance)][role];return list?pickFrom(list,random):null;}
  function chat(speaker,listener,random=Math.random){const c=pickFrom(CHATS,random);return {open:c.open[appearanceOf(speaker)],reply:c.reply[appearanceOf(listener)]};}
  function duetFor(kind,giver,receiver){return DUETS.find(d=>d.kinds.includes(kind)&&d.giver===giver&&d.receiver===receiver)??null;}
  /** The take for a show whose first member has appearance a and second b; swap=true when b plays the giver (a symmetric take). */
  function duetCast(kind,a,b){
    const d=duetFor(kind,a,b);if(d)return {duet:d,swap:false};
    const r=DUETS.find(x=>x.symmetric&&x.kinds.includes(kind)&&x.giver===b&&x.receiver===a);
    return r?{duet:r,swap:true}:null;
  }
  /** A take is mirrored when its giver has to appear on the other side than in the source. */
  function duetMirrored(duet,giverLeft){return giverLeft!==!!duet.giverLeft;}
  /** Seconds a speech bubble stays readable: about 4.5 Chinese characters per second, at least 1.8 s. */
  function readSeconds(text){return Math.max(1.8,0.8+[...String(text)].length*0.22);}
  /** A bubble line wraps after punctuation rather than inside a phrase: break chances (zero-width spaces) after each
   *  pause mark, used with word-break:keep-all; a phrase too long for one line still breaks anywhere (overflow-wrap). */
  function softBreaks(text){return String(text).replace(/([，。！？、～…—]+)(?=[^，。！？、～…—」』）]|$)/g,'$1​').replace(/​$/,'').replace(/(?<=\S)～/g,'⁠～');} // a word joiner keeps ～ on the line of the word before it

  // ---- geometry (viewport px). A pet box is {x,y,size,bottomPad}; the stage is size×(size·9/16). ----
  function body(box,appearance){
    const b=BODY[appearanceOf(appearance)],k=box.size/640;
    return {cx:box.x+b.cx*k,half:b.half*k,top:box.y+box.bottomPad+b.top*k,feet:box.y+box.bottomPad+b.feet*k,chest:box.y+box.bottomPad+b.chest*k,height:(b.feet-b.top)*k};
  }
  /** Where a walker should stand beside a partner: same ground line, a small gap between silhouettes. */
  function meetPoint(walker,walkerApp,partner,partnerApp,side){
    const w=body(walker,walkerApp),p=body(partner,partnerApp);
    const gap=Math.max(12,Math.min(40,0.1*(w.height+p.height)/2));
    const cx=p.cx+side*(p.half+gap+w.half);
    const b=BODY[appearanceOf(walkerApp)],k=walker.size/640;
    return {x:cx-b.cx*k,y:p.feet-walker.bottomPad-b.feet*k,gap};
  }
  /**
   * Shared frame of the paired take, anchored on the receiver so she never moves. mirrored=true
   * flips the take so the giver appears on the other side than in the source (see duetMirrored).
   */
  function duetFrame(duet,receiver,receiverApp,mirrored){
    const r=body(receiver,receiverApp),a=duet.anchors.receiver;
    const scale=r.height/a.height;
    const w=duet.frame.w*scale,h=duet.frame.h*scale;
    const anchorX=mirrored?duet.frame.w-a.x:a.x;
    return {x:r.cx-anchorX*scale,y:r.feet-a.feet*scale,w,h,scale,mirrored};
  }
  /** Pet box the giver must occupy so its idle body lines up with its first paired frame. */
  function duetGiverBox(duet,frame,giver,giverApp){
    const a=duet.anchors.giver,b=BODY[appearanceOf(giverApp)],k=giver.size/640;
    const cx=frame.x+(frame.mirrored?duet.frame.w-a.x:a.x)*frame.scale,feet=frame.y+a.feet*frame.scale;
    return {x:cx-b.cx*k,y:feet-giver.bottomPad-b.feet*k};
  }
  /** Prop flight from giver chest to receiver chest: short arc whose height scales with distance. */
  function propPath(from,to,u){
    const t=Math.max(0,Math.min(1,u)),e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
    const lift=Math.max(24,Math.abs(to.x-from.x)*0.35);
    return {x:from.x+(to.x-from.x)*e,y:from.y+(to.y-from.y)*e-Math.sin(Math.PI*t)*lift,spin:(to.x>=from.x?1:-1)*20*Math.sin(Math.PI*t)};
  }
  /** Walk timing: accelerate, cruise, settle. Returns distance fraction covered at time t. */
  function gait(t,duration,ramp=0.28){
    if(duration<=0)return 1;
    const r=Math.min(ramp,duration/2),v=1/(duration-r);
    if(t<=0)return 0;if(t>=duration)return 1;
    if(t<r)return 0.5*v*t*t/r;
    if(t>duration-r){const u=duration-t;return 1-0.5*v*u*u/r;}
    return 0.5*v*r+v*(t-r);
  }
  function walkSeconds(distance,size){const pace=Math.max(70,Math.min(220,size*0.45));return Math.max(0.9,Math.min(5,distance/pace+0.4));}

  const api={softBreaks,SOURCES,DEFAULT_INTERACTION,normalizeInteraction,interactionValid,BODY,CLIPS,LINES,PAIR_LINES,CHATS,DUETS,PROPS,line,clip,chat,duetFor,duetCast,duetMirrored,readSeconds,body,meetPoint,duetFrame,duetGiverBox,propPath,gait,walkSeconds,appearanceOf};
  if(typeof module!=='undefined')module.exports=api;
  else globalThis.DeskpetInteraction=api;
})();
