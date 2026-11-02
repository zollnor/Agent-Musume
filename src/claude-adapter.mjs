import {RolloutAdapter} from './rollout-adapter.mjs';
/** Projects only lifecycle tags and tool IDs; never forwards prompt/tool/assistant content. */
export class ClaudeAdapter extends RolloutAdapter {
  constructor(options={}){super({...options,sourceKind:'claude-code'});this.turnCounter=0;}
  ensure(file){if(!this.sessions.has(file))super.consume(file,{type:'session_meta',payload:{source:'cli',originator:'claude-code'}});return this.session(file);}
  event(file,type,fields={},options={},timestamp){super.consume(file,{type:'event_msg',timestamp,payload:{type,...fields}},options);}
  begin(file,options={},timestamp,token){const s=this.ensure(file);if(!s.active)this.event(file,'task_started',{turn_id:token??`claude-turn-${++this.turnCounter}`},options,timestamp);}
  consume(file,r,{replay=false}={}){
    if(!r||r.isSidechain===true||r.agentId||r.isMeta===true||!['user','assistant','system'].includes(r.type))return;
    const options={replay},s=this.ensure(file),content=r.message?.content;
    if(r.type==='user'){
      const results=Array.isArray(content)?content.filter(x=>x?.type==='tool_result'):[];
      if(results.length){this.begin(file,options,r.timestamp);for(const item of results)super.consume(file,{type:'response_item',timestamp:r.timestamp,payload:{type:'function_call_output',call_id:item.tool_use_id}},options);}
      else {s.naturalEnd=false;s.stopBlocked=false;this.event(file,'task_started',{turn_id:r.uuid??`claude-turn-${++this.turnCounter}`},options,r.timestamp);}
    }else if(r.type==='assistant'){
      this.begin(file,options,r.timestamp);
      for(const item of Array.isArray(content)?content:[]){
        if(item?.type==='thinking')this.event(file,'agent_reasoning',{},options,r.timestamp);
        if(item?.type==='tool_use')super.consume(file,{type:'response_item',timestamp:r.timestamp,payload:{type:'function_call',name:['AskUserQuestion','ExitPlanMode'].includes(item.name)?'request_user_input':'local_tool',call_id:item.id}},options);
      }
      if(r.message?.stop_reason==='end_turn')s.naturalEnd=true;
    }else if(r.subtype==='stop_hook_summary'){
      s.stopBlocked=r.preventedContinuation===true;
      if(r.preventedContinuation===false&&s.active)this.event(file,'task_complete',{turn_id:s.turn},options,r.timestamp);
    }else if(r.subtype==='turn_duration'&&s.active&&s.naturalEnd&&!s.stopBlocked)this.event(file,'task_complete',{turn_id:s.turn},options,r.timestamp);
    else if(r.subtype==='stop_failure'&&s.active)this.event(file,'task_failed',{turn_id:s.turn},options,r.timestamp);
  }
  peer(file,status){
    const s=this.ensure(file);
    const previous=s.peerStatus;s.peerStatus=status;
    if(['busy','working','running'].includes(status)){
      if(s.waiting&&!s.waitingCall&&previous!==status){s.waiting=false;this.set(s,'working',false);}
      if(!s.active&&previous!==status){this.begin(file);this.set(s,'working',false);}
      else if(s.published!==s.state)this.publish(s);
    }else if(['waiting','blocked','needs_input','waiting_for_input','permission'].includes(status)){
      this.begin(file);s.waiting=true;this.set(s,'waiting',false);
    }else if(status==='idle'&&s.active)this.event(file,'turn_aborted',{turn_id:s.turn});
    else if(status==='error'&&s.active)this.event(file,'task_failed',{turn_id:s.turn});
  }
}
