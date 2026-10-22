import {deepseekUsage,extractCandidate} from './pilot.mjs';

const LIMITS={maxCandidates:3,maxDurationMs:600000,maxTokens:200000,maxCostUsd:.25};
const clone=value=>structuredClone(value);

/** Run a bounded source-generation session; adapters alone render and verify source. */
export async function runSourceSession({messages,modelConfiguration,budget={},generate,submit,onEvent=()=>{},tariff,tariffForCall,now=()=>new Date()}) {
 const limits={};
 for(const [name,maximum] of Object.entries(LIMITS)) {
  const value=budget[name]??maximum;
  if(!Number.isFinite(value)||value<0||(name==='maxCandidates'&&!Number.isInteger(value)))throw new Error(`Invalid ${name}`);
  limits[name]=Math.min(value,maximum);
 }
 const stamp=()=>new Date(now()).toISOString();
 const startedAt=stamp(),attempts=[],calls=[],conversation=clone(messages);
 let selectedIndex=null,stopReason=null;
 const snapshot=()=>({selectedIndex,stopReason,startedAt,completedAt:stamp(),attempts:clone(attempts),usage:{calls:clone(calls),complete:calls.every(call=>call.complete)}});
 const exhausted=()=>{
  if(Date.parse(stamp())-Date.parse(startedAt)>=limits.maxDurationMs)return 'max_duration';
  if(attempts.length>=limits.maxCandidates)return 'max_candidates';
  if(calls.reduce((sum,call)=>sum+(call.inputTokens??0)+(call.outputTokens??0),0)>=limits.maxTokens)return 'max_tokens';
  if(calls.reduce((sum,call)=>sum+(call.costUsd??0),0)>=limits.maxCostUsd)return 'max_cost';
  return null;
 };
 const emit=async(type,attempt)=>onEvent({type,attempt:clone(attempt),checkpoint:snapshot()});
 try {
  while(!(stopReason=exhausted())) {
   const index=attempts.length+1;
   const attempt={index,startedAt:stamp(),request:{...clone(modelConfiguration),messages:clone(conversation)}};
   const callTariff=tariffForCall?tariffForCall(attempt.startedAt):tariff;if(callTariff)attempt.tariff=clone(callTariff);
   attempts.push(attempt);
   await emit('dispatch',attempt);
   const timeoutMs=Math.max(0,limits.maxDurationMs-(Date.parse(stamp())-Date.parse(startedAt)));
   if(timeoutMs===0){stopReason='max_duration';break;}
   let generated;
   try {generated=await generate(clone(attempt.request),{timeoutMs});}
   catch(error) {
    attempt.modelCompletedAt=stamp();
    attempt.generationError={message:error?.message??String(error)};
    attempt.usage=deepseekUsage({},callTariff);
    calls.push({callId:`candidate-${index}`,...clone(attempt.usage)});
    throw error;
   }
   attempt.modelCompletedAt=stamp();attempt.ok=generated.ok;attempt.status=generated.status;
   attempt.response=clone(generated.response);
   try {attempt.usage=deepseekUsage(generated.response?.usage,callTariff);}
   catch(error) {attempt.usage={...deepseekUsage({},callTariff),accountingError:{message:error.message}};}
   calls.push({callId:`candidate-${index}`,...clone(attempt.usage)});
   await emit('generated',attempt);
   if(!generated.ok){stopReason='provider_error';break;}
   if(!attempt.usage.complete||!Number.isFinite(attempt.usage.costUsd)){stopReason='usage_incomplete';break;}
   // Candidate-count exhaustion is checked only before a dispatch; the current
   // final allowed candidate must still be submitted when its other budgets fit.
   const overage=Date.parse(stamp())-Date.parse(startedAt)>=limits.maxDurationMs?'max_duration':
    calls.reduce((sum,c)=>sum+c.inputTokens+c.outputTokens,0)>limits.maxTokens?'max_tokens':
    calls.reduce((sum,c)=>sum+c.costUsd,0)>limits.maxCostUsd?'max_cost':null;
   if(overage){stopReason=overage;break;}
   try {attempt.extraction=extractCandidate(generated.response?.choices?.[0]?.message?.content);}
   catch(error) {
    if(error.code!=='PILOT_SOURCE_INVALID')throw error;
    attempt.extraction={error:{code:error.code,message:error.message}};
    attempt.submit={accepted:false,verified:false,feedback:error.message,payload:{kind:'source_extraction_error'}};
   }
   if(!attempt.submit)attempt.submit=await submit({source:attempt.extraction.text,index,startedAt:attempt.startedAt,modelCompletedAt:attempt.modelCompletedAt,usage:clone(attempt.usage),response:clone(attempt.response)});
   attempt.submittedAt=stamp();
   if(attempt.submit.accepted)selectedIndex=index;
   await emit('submitted',attempt);
   if(attempt.submit.accepted&&attempt.submit.verified){stopReason='verified';break;}
   const assistant=generated.response?.choices?.[0]?.message;
   conversation.push({role:'assistant',content:assistant?.content??''});
   conversation.push({role:'user',content:`The submitted source did not pass verification. Return a complete corrected source using the same format and instructions. Do not explain or rewrite the task.\nFeedback: ${attempt.submit.feedback??''}`});
  }
  return snapshot();
 }catch(error){
  if(error&&typeof error==='object'){error.checkpoint=snapshot();throw error;}
  const failure=new Error(String(error));failure.checkpoint=snapshot();throw failure;
 }
}
