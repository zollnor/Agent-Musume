import {RolloutAdapter} from './rollout-adapter.mjs';
/**
 * DeepSeek Harness session events (the stream the original dsh-pet plugin received inside DSH as session/event) mapped
 * onto the shared turn model. Only lifecycle tags and call ids pass; no message, tool, approval or todo content.
 */
export class DshAdapter extends RolloutAdapter {
  constructor(options={}){super({...options,sourceKind:'dsh-desktop'});}
  ensure(file){if(!this.sessions.has(file))super.consume(file,{type:'session_meta',payload:{source:'desktop',originator:'dsh'}});return this.session(file);}
  event(file,type,fields,options,timestamp){super.consume(file,{type:'event_msg',timestamp,payload:{type,...fields}},options);}
  item(file,payload,options,timestamp){super.consume(file,{type:'response_item',timestamp,payload},options);}
  consume(file,ev,{replay=false}={}){
    if(!ev||typeof ev!=='object'||typeof ev.type!=='string')return;
    const d=ev.data&&typeof ev.data==='object'?ev.data:{},options={replay},s=this.ensure(file);
    const timestamp=Number.isFinite(ev.time)?new Date(ev.time).toISOString():undefined;
    const turn=Number.isFinite(d.turn)?`dsh-turn-${d.turn}`:s.turn;
    // A turn already under way when the pet started (or a step without its turn/start in view) still counts.
    const begin=()=>{if(!s.active&&turn)this.event(file,'task_started',{turn_id:turn},options,timestamp);};
    switch(ev.type){
      case 'turn/start':this.event(file,'task_started',{turn_id:turn},options,timestamp);break;
      case 'step/start':begin();this.event(file,'agent_reasoning',{turn_id:turn},options,timestamp);break;
      case 'tool/call':begin();this.item(file,{type:'function_call',name:'local_tool',call_id:String(d.callId??'')},options,timestamp);break;
      case 'tool/result':this.item(file,{type:'function_call_output',call_id:String(d.toolCallId??d.message?.source?.callId??'')},options,timestamp);break;
      case 'approval/asked':begin();this.event(file,'request_user_input',{turn_id:turn,call_id:String(d.callId??'')},options,timestamp);break;
      case 'approval/decided':this.event(file,'user_input_received',{turn_id:turn},options,timestamp);break;
      case 'turn/end':{
        const kind=d.reason?.kind;
        this.event(file,kind==='completed'?'task_complete':kind==='error'?'task_failed':'turn_aborted',{turn_id:turn},options,timestamp);
        break;
      }
    }
  }
}
