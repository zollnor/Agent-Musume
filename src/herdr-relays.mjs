import {execFile} from 'node:child_process';

// The agent kinds Herdr reports that are harness sources here.
const KINDS={claude:'claude-code',codex:'codex-cli'};

/** { agent, status, session } of one Herdr pane, read with Herdr's own CLI; only these fields are kept. */
export function queryHerdr(image,target){
  return new Promise(resolve=>execFile(image,['agent','get',target],{windowsHide:true,timeout:5000,maxBuffer:1024*1024},(error,stdout)=>{
    if(error)return resolve(null);
    try{
      const agent=JSON.parse(stdout).result?.agent,session=agent?.agent_session?.value;
      resolve(agent?{agent:String(agent.agent??''),status:String(agent.agent_status??''),session:typeof session==='string'&&/^[-\w]{8,}$/.test(session)?session:null}:null);
    }catch{resolve(null);}
  }));
}
const OUTCOME={success:'delivered',error:'failed',idle:'cancelled'};

/**
 * A prompt submitted to an agent already open in a Herdr pane ("herdr agent prompt <pane> <text>"), or keys sent to
 * it ("herdr agent send-keys") that set it to work. No new harness
 * process starts, so the submitting process is the evidence: its harness ancestor is the sender and the pane's agent
 * the recipient. The hand-back is the agent finishing that work: idle or done again after the submission. A submission
 * that ends while the agent never worked (rejected, stalled) is a failure; one that is still running when the caller
 * stops waiting (its own --timeout) is followed until the agent finishes.
 */
export class HerdrRelays {
  constructor({tracker,turns=null,query=queryHerdr,poll=2000,window=8000,step=500,limit=2*60*60*1000,now=Date.now}={}){
    this.tracker=tracker;this.turns=turns;this.query=query;this.poll=poll;this.window=window;this.step=step;this.limit=limit;this.now=now;this.relays=new Map();this.closed=false;
  }
  async dispatched({key,from,kind='herdr-prompt',target,wait=false,image}){
    if(this.relays.has(key))return;
    const keys=kind==='herdr-keys';
    if(keys&&[...this.relays.values()].some(r=>r.keys&&r.target===target&&!r.task))return; // that pane is already being checked
    const since=this.turns?.now()-1500,relay={key,from,keys,target,wait,image,task:null,exit:undefined,watching:false,misses:0,cancel(){}};
    this.relays.set(key,relay);
    const pane=await this.query(image,target);const to=KINDS[pane?.agent];
    if(!to||to===from||this.closed){this.relays.delete(key);return;}
    let turn=null;
    if(keys){
      // Key presses are a task only when they start a turn of the pane's agent: approving a permission, Esc, arrows or
      // text still without Enter do not. The pane's session shows it; without one, the agent going from rest to work.
      let worked=false;
      if(pane.session&&this.turns){const waiting=this.turns.next(t=>t.phase==='start'&&t.file.includes(pane.session),{since,within:this.window});relay.cancel=waiting.cancel;turn=await waiting;}
      else if(['idle','done'].includes(pane.status))for(let waited=0;waited<this.window&&!this.closed;waited+=this.step){
        await new Promise(resolve=>setTimeout(resolve,this.step));
        const now=await this.query(image,target);if(now?.status==='working'||now?.status==='blocked'){worked=true;break;}
      }
      if(!turn&&!worked||this.closed){this.relays.delete(key);return;}
    }
    const task={id:'herdr:'+key.replace('.','_'),from,to};
    if(!this.tracker.consume({...task,phase:'started'}).ok){this.relays.delete(key);return;}
    relay.task=task;relay.since=this.now();relay.worked=keys||pane.status==='working';
    if(turn){
      const ending=this.turns.next(t=>t.phase==='end'&&t.file===turn.file,{since:turn.at,within:this.limit});relay.cancel=ending.cancel;
      const end=await ending;this.relays.delete(key);
      if(!this.closed)this.tracker.consume({...task,phase:end?OUTCOME[end.outcome]??'delivered':'cancelled'});
      return;
    }
    if(keys||relay.exit!==undefined)this.settle(relay); // keys are done; a submission may have ended during the lookup
  }
  exited(key,exitCode){
    const relay=this.relays.get(key);if(!relay)return false;
    relay.exit=exitCode;if(relay.task)this.settle(relay);return true;
  }
  async settle(relay){
    if(relay.watching)return;relay.watching=true;
    // "--wait" returns only after Herdr saw the agent work and come back to rest. A submission without it returns at
    // once, so rest only counts once the agent was seen working, or after a short grace for a task over between looks.
    const from=this.now(),grace=relay.wait?0:15000;
    for(;;){
      if(this.closed)return;
      const pane=await this.query(relay.image,relay.target);
      if(!pane){if(++relay.misses>3)return this.end(relay,'cancelled');}
      else{
        relay.misses=0;
        if(pane.status==='working'||pane.status==='blocked')relay.worked=true;
        else if(['idle','done'].includes(pane.status)){
          if(relay.worked)return this.end(relay,'delivered');
          if(relay.exit!==0)return this.end(relay,'failed'); // rejected or stalled before the agent started
          if(this.now()-from>=grace)return this.end(relay,'delivered');
        }
      }
      if(this.now()-relay.since>this.limit)return this.end(relay,'cancelled');
      await new Promise(resolve=>{const timer=setTimeout(resolve,this.poll);timer.unref?.();});
    }
  }
  end(relay,phase){this.tracker.consume({...relay.task,phase});this.relays.delete(relay.key);}
  close(){this.closed=true;for(const relay of this.relays.values())relay.cancel();this.relays.clear();}
}
