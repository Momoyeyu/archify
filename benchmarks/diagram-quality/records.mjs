import { evaluateSemantics, evaluateGeometry } from './metrics.mjs';

const clone = value => structuredClone(value);
function requireValue(ok, message) { if (!ok) throw new TypeError(message); }
function text(value, name) { requireValue(typeof value === 'string' && value.trim().length > 0, `${name} must be a nonempty string`); return value; }
function finiteData(value, path = 'data') {
 if (typeof value === 'number') requireValue(Number.isFinite(value), `${path} must be finite`);
 else if (value && typeof value === 'object') for (const [key,item] of Object.entries(value)) finiteData(item, `${path}.${key}`);
}
function stable(value) {
 if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
 if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
 return JSON.stringify(value);
}
function identityOf(value) {
 const identity=value.identity ?? value;
 for(const key of ['manifestHash','evaluatorHash','profileHash']) text(identity[key],key);
 requireValue(identity.budget && typeof identity.budget === 'object' && !Array.isArray(identity.budget),'budget must be an object');
 finiteData(identity.budget,'budget');
 for(const key of ['maxCandidates','maxDurationMs','maxTokens','maxCostUsd']) if(key in identity.budget) requireValue(typeof identity.budget[key]==='number' && identity.budget[key]>=0 && (key!=='maxCandidates' || Number.isInteger(identity.budget[key])),`budget.${key} must be a nonnegative finite number`);
 for(const [key,n] of Object.entries(identity.budget)) if(typeof n==='number') requireValue(n>=0, `budget.${key} must be nonnegative`);
 return clone({manifestHash:identity.manifestHash,evaluatorHash:identity.evaluatorHash,profileHash:identity.profileHash,budget:identity.budget});
}
function cell(value) {
 for(const key of ['taskId','arm','model']) text(value[key],key);
 requireValue(Number.isInteger(value.repeat) && value.repeat>=1,'repeat must be a positive integer');
 return stable([value.taskId,value.arm,value.model,value.repeat]);
}
function time(value,name) { requireValue(typeof value==='string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)), `${name} time must be ISO timestamp`);return Date.parse(value); }
const usageFields=['inputTokens','outputTokens','cachedInputTokens','reasoningTokens','costUsd'];
function oneUsage(value={}) {
 const out={};
 for(const field of usageFields) {
  const n=value[field] ?? null;
  requireValue(n===null || (typeof n==='number' && Number.isFinite(n) && n>=0 && (field==='costUsd' || Number.isInteger(n))),`${field} must be finite and nonnegative`);
  out[field]=n;
 }
 requireValue(out.cachedInputTokens===null || out.inputTokens===null || value.cachedIncludedInInput===false || out.cachedInputTokens<=out.inputTokens,'cached input exceeds input tokens');
 requireValue(out.reasoningTokens===null || out.outputTokens===null || value.reasoningIncludedInOutput===false || out.reasoningTokens<=out.outputTokens,'reasoning exceeds output tokens');
 // Canonical input/output counts include cached inputs and reasoning, unless the provider explicitly says otherwise.
 if(value.cachedIncludedInInput===false) out.inputTokens=out.inputTokens===null || out.cachedInputTokens===null ? null : out.inputTokens+out.cachedInputTokens;
 if(value.reasoningIncludedInOutput===false) out.outputTokens=out.outputTokens===null || out.reasoningTokens===null ? null : out.outputTokens+out.reasoningTokens;
 out.cachedIncludedInInput=true;out.reasoningIncludedInOutput=true;
 out.totalTokens=out.inputTokens===null || out.outputTokens===null ? null : out.inputTokens+out.outputTokens;
 finiteData(out,'usage');
 out.status=value.complete===false || out.totalTokens===null || out.costUsd===null ? 'partial' : 'complete';
 return out;
}
function usageOf(value) {
 if (!value) return {...oneUsage(),status:'unknown',calls:[]};
 if (!Array.isArray(value.calls)) return {...clone(value),...oneUsage(value)};
 const ids=new Set();
 const calls=value.calls.map(call=>{ text(call.callId,'usage callId');requireValue(!ids.has(call.callId),'duplicate usage callId');ids.add(call.callId);return {...clone(call),...oneUsage(call)}; });
 const totals={};
 for(const field of [...usageFields,'totalTokens']) totals[field]=calls.length && calls.every(call=>call[field]!==null) ? calls.reduce((sum,call)=>sum+call[field],0) : null;
 const observed={};for(const field of [...usageFields,'totalTokens']) observed[field]=calls.reduce((sum,call)=>sum+(call[field]??0),0);
 if(value.complete===false) for(const field of [...usageFields,'totalTokens']) totals[field]=null;
 finiteData(totals,'usage totals');finiteData(observed,'usage observed');
 return {...totals,observed,complete:value.complete!==false,status:calls.length && calls.every(call=>call.status==='complete') && value.complete!==false ? 'complete':'partial',calls};
}
function budgetPass(budget,candidate,index,start,usage) {
 if((budget.maxTokens!==undefined || budget.maxCostUsd!==undefined) && usage.complete===false) return false;
 if(budget.maxCandidates!==undefined && index>budget.maxCandidates) return false;
 if(budget.maxDurationMs!==undefined && time(candidate.submittedAt,'candidate')-start>budget.maxDurationMs) return false;
 if(budget.maxTokens!==undefined && (usage.totalTokens===null || usage.totalTokens>budget.maxTokens)) return false;
 if(budget.maxCostUsd!==undefined && (usage.costUsd===null || usage.costUsd>budget.maxCostUsd)) return false;
 return true;
}
export function evaluateRun({task,run,graph,observation,profile,editability}) {
 finiteData(run,'run'); finiteData(profile,'profile');finiteData(task,'task');finiteData(graph,'graph');finiteData(observation,'observation');finiteData(editability,'editability');
 text(run.runId,'runId'); cell(run);
 requireValue((task.id ?? task.taskId)===run.taskId,'task identity mismatch');
 const identity=identityOf(run);
 const status=run.status ?? 'completed';
 requireValue(['completed','timeout','no_candidate','provider_error'].includes(status),'invalid run status');
 const start=time(run.startedAt,'startedAt');
 const completed=run.completedAt==null ? null : time(run.completedAt,'completedAt');
 requireValue(completed===null || completed>=start,'completed time precedes start');
 const candidates=clone(run.candidates ?? []);
 requireValue(Array.isArray(candidates),'candidates must be an array');
 let previous=start;
 for(const candidate of candidates) {text(candidate.artifactHash,'candidate artifactHash'); const submitted=time(candidate.submittedAt,'candidate');requireValue(submitted>=previous && (completed===null || submitted<=completed),'candidate time out of order');previous=submitted;}
 if(candidates.length) requireValue(candidates.at(-1).artifactHash===run.artifactHash,'final candidate hash must match artifactHash');
 if(status==='completed') {text(run.artifactHash,'artifactHash');requireValue(candidates.length>0,'completed run needs candidates');}
 const usage=usageOf(run.usage);
 const semantic=status==='completed' ? evaluateSemantics(task.expected ?? task,graph,observation) : {status:'unverified',passed:false,violations:[]};
 const geometry=status==='completed' ? evaluateGeometry(observation,profile) : {status:'unverified',passed:false,violations:[]};
 const editableEvidence=editability ?? {status:'unverified',passed:false,method:null,unknownReasons:['independent editability probe missing']};
 const editableVerified=editableEvidence.status==='verified' && typeof editableEvidence.passed==='boolean';
 const verified=status==='completed' && editableVerified && semantic.status!=='unverified' && semantic.status!=='unknown' && geometry.status!=='unverified' && geometry.status!=='unknown';
 const finalPassed=verified && editableEvidence.passed===true && semantic.passed===true && geometry.passed===true;
 let success=null;let earlierUnknown=false;
 for(let index=0;index<candidates.length;index++) {
  const candidate=candidates[index];
  // Earlier candidates require an independent evaluator receipt with all identity bindings.
  const prior=candidate.verifiedReceipt;
  const boundPrior=prior?.schemaVersion===2 && prior.benchmark==='diagram-quality' && prior.artifactHash===candidate.artifactHash && prior.taskId===run.taskId && prior.arm===run.arm && prior.model===run.model && stable(prior.identity)===stable(identity) && prior.editability?.status==='verified' && typeof prior.editability.passed==='boolean' && prior.objective?.status==='verified' && typeof prior.objective?.passed==='boolean';
  const validPrior=boundPrior && prior.objective.passed===true;
  const passed=index===candidates.length-1 ? finalPassed : validPrior;
  if(passed && finalPassed && verified && editableEvidence.passed===true && status==='completed' && budgetPass(identity.budget,candidate,index+1,start,usage)) {success={round:earlierUnknown?null:index+1,time:earlierUnknown?null:time(candidate.submittedAt,'candidate')-start};break;}
  if(index<candidates.length-1 && !boundPrior) earlierUnknown=true;
 }
 const passed=success!==null;
 const optimizationReasons=[];if(profile.calibrated!==true) optimizationReasons.push('uncalibrated profile');if(task.goldStatus!=='independently-confirmed') optimizationReasons.push('gold not independently confirmed');if(!verified) optimizationReasons.push('unverified objective evidence');
 if(semantic.passed!==true) optimizationReasons.push('mandatory semantic guard failed');
 if(geometry.passed!==true) optimizationReasons.push('mandatory geometry guard failed');
 if(editableEvidence.passed!==true) optimizationReasons.push('mandatory editability guard failed');
 if(!passed) optimizationReasons.push('mandatory objective delivery or budget guard failed');
 const optimizationEligible=optimizationReasons.length===0;
 const objective={status:verified?'verified':'unverified',passed,score:passed?1:0,scoreMeaning:'binary objective pass',firstSuccessRound:success?.round ?? null,timeToSuccessMs:success?.time ?? null,reciprocalRank:success?(success.round===null?null:1/success.round):0,finalCandidateLatencyMs:candidates.length?time(candidates.at(-1).submittedAt,'candidate')-start:null,semantic,geometry};
 return {schemaVersion:2,benchmark:'diagram-quality',identity,runId:run.runId,taskId:run.taskId,taskFamily:task.family??null,taskType:task.type??null,goldStatus:task.goldStatus??null,split:task.split??null,complexity:task.complexity??null,arm:run.arm,model:run.model,modelConfiguration:clone(run.modelConfiguration??null),repeat:run.repeat,artifactHash:run.artifactHash??null,sourceHash:run.sourceHash??null,sourceEvidence:clone(run.sourceEvidence??null),environment:clone(run.environment??null),promptHash:run.promptHash??null,tool:clone(run.tool??null),agent:clone(run.agent??null),toolEvents:clone(run.toolEvents??[]),artifactPath:run.artifactPath??null,status,startedAt:run.startedAt,completedAt:run.completedAt??null,candidates,firstDraft:{passed:earlierUnknown?null:success?.round===1},editability:clone(editableEvidence),delivery:{status:status==='completed' && run.artifactHash?'delivered':status,artifactReadyMs:candidates.length?time(candidates.at(-1).submittedAt,'candidate')-start:null},objective,usage,human:{status:'not_requested',reviews:[]},optimization:{eligible:optimizationEligible,score:optimizationEligible?objective.score:null,reason:optimizationReasons.join('; ')||'calibrated objective evidence'},unknownReasons:[...(graph?.unknownReasons??[]),...(observation?.unknownReasons??[]),...(editableEvidence.unknownReasons??[])]};
}
export function attachHumanReview(receipt,review) {
 finiteData(review,'review');
 requireValue(review.artifactHash===receipt.artifactHash && review.artifactHash!=null,'human artifact hash mismatch');
 requireValue(review.taskId===receipt.taskId,'human task mismatch');
 text(review.reviewerId,'reviewerId');text(review.rubricVersion,'rubricVersion');
 requireValue(['requested','in_progress','completed','partial','skipped'].includes(review.status),'invalid human status');
 const fields=['readability','hierarchy','layout','style','aesthetics'];
 for(const [key,value] of Object.entries(review.ratings??{})) requireValue(fields.includes(key) && Number.isInteger(value) && value>=1 && value<=5,'invalid human rating');
 if(review.status==='completed') {
  requireValue(receipt.delivery.status==='delivered','human completion requires delivered artifact');
  requireValue(fields.every(field=>Number.isInteger(review.ratings?.[field])),'completed review needs all five ratings');
  requireValue(['correct','incorrect','unverified'].includes(review.semantic?.judgement),'completed review needs semantic judgement');
 }
 const result=clone(receipt); const reviews=(result.human?.reviews??[]).filter(old=>old.reviewerId!==review.reviewerId || old.rubricVersion!==review.rubricVersion);
 reviews.push(clone(review)); result.human={status:reviews.some(item=>item.status==='completed')?'completed':review.status,reviews};return result;
}
export function aggregateRuns(receipts,{manifest}) {
 finiteData(receipts,'receipts'); finiteData(manifest,'manifest');
 requireValue(Array.isArray(receipts),'receipts must be an array');
 const identity=identityOf(manifest);
 requireValue(Array.isArray(manifest.plannedRuns) && manifest.plannedRuns.length>0,'manifest needs plannedRuns');
 const plannedCells=new Set();for(const planned of manifest.plannedRuns) {const key=cell(planned);requireValue(!plannedCells.has(key),'duplicate planned matrix cell');plannedCells.add(key);}
 const seenIds=new Set(),seenCells=new Set(),configs=new Map();
 for(const receipt of receipts) {
  requireValue(receipt.schemaVersion===2 && receipt.benchmark==='diagram-quality','unsupported receipt schema');
  text(receipt.runId,'runId');requireValue(!seenIds.has(receipt.runId),'duplicate runId');seenIds.add(receipt.runId);
  requireValue(stable(identityOf(receipt))===stable(identity),'mixed identity');
  const key=cell(receipt);requireValue(plannedCells.has(key),'unplanned matrix cell');requireValue(!seenCells.has(key),'duplicate matrix cell');seenCells.add(key);
  const configKey=stable([receipt.arm,receipt.model]),config=stable(receipt.modelConfiguration??null);
  requireValue(!configs.has(configKey) || configs.get(configKey)===config,'mixed model configuration');configs.set(configKey,config);
  requireValue(typeof receipt.objective?.passed==='boolean' && Number.isFinite(receipt.objective.score) && [0,1].includes(receipt.objective.score),'invalid objective receipt');
  requireValue(receipt.objective.passed===(receipt.objective.score===1),'inconsistent objective score');
  requireValue(!receipt.objective.passed || receipt.objective.status==='verified','unverified success');
  requireValue(['verified','unverified'].includes(receipt.objective.status),'invalid objective status');
  if(receipt.objective.passed) {
   if(receipt.objective.firstSuccessRound===null) requireValue(receipt.objective.timeToSuccessMs===null && receipt.objective.reciprocalRank===null,'invalid objective unknown timing');
   else {
    requireValue(Number.isInteger(receipt.objective.firstSuccessRound) && receipt.objective.firstSuccessRound>0 && receipt.objective.firstSuccessRound<=receipt.candidates.length,'invalid objective success round');
    requireValue(Number.isFinite(receipt.objective.timeToSuccessMs) && receipt.objective.timeToSuccessMs>=0,'invalid objective success time');
    requireValue(receipt.objective.reciprocalRank===1/receipt.objective.firstSuccessRound,'invalid objective reciprocal rank');
   }
  } else requireValue(receipt.objective.firstSuccessRound===null && receipt.objective.timeToSuccessMs===null && receipt.objective.reciprocalRank===0,'invalid failed objective');
  if(receipt.objective.status==='verified') requireValue(receipt.status==='completed' && receipt.editability?.status==='verified' && typeof receipt.editability.passed==='boolean','objective verification lacks editability or completed run');
  if(receipt.objective.passed) {
   requireValue(receipt.delivery?.status==='delivered' && receipt.editability.passed===true,'objective success lacks delivered editable artifact');
   requireValue(receipt.objective.semantic?.status==='verified' && receipt.objective.geometry?.status==='verified','objective success lacks independently verified metrics');
   requireValue(receipt.objective.semantic.passed===true && receipt.objective.geometry.passed===true,'objective success contradicts metric evidence');
   requireValue(Array.isArray(receipt.candidates) && receipt.candidates.length>0 && receipt.candidates.at(-1).artifactHash===receipt.artifactHash,'objective success candidate identity mismatch');
   const start=time(receipt.startedAt,'objective startedAt');
   let previous=start;
   for(const candidate of receipt.candidates) {
    const submitted=time(candidate.submittedAt,'objective candidate');
    requireValue(submitted>=previous && (receipt.completedAt==null || submitted<=time(receipt.completedAt,'objective completedAt')),'objective candidate time out of order');
    previous=submitted;
   }
   const round=receipt.objective.firstSuccessRound ?? receipt.candidates.length;
   const candidate=receipt.candidates[round-1];
   requireValue(budgetPass(identity.budget,candidate,round,start,receipt.usage),'objective success exceeds budget');
   if(receipt.objective.firstSuccessRound!==null) requireValue(receipt.objective.timeToSuccessMs===time(candidate.submittedAt,'objective candidate')-start,'objective success time contradicts candidate');
  }
  if(receipt.optimization?.eligible===true) requireValue(receipt.objective.status==='verified' && receipt.objective.passed===true && receipt.objective.semantic?.passed===true && receipt.objective.geometry?.passed===true && receipt.editability?.passed===true && receipt.objective.geometry?.metrics?.calibrated===true && receipt.goldStatus==='independently-confirmed' && receipt.optimization.score===receipt.objective.score,'optimization eligibility contradicts mandatory guards, calibration or gold evidence');
  const normalizedUsage=usageOf(receipt.usage);
  for(const field of [...usageFields,'totalTokens']) requireValue(receipt.usage?.[field]===normalizedUsage[field],`invalid usage ${field}`);
  if(receipt.usage?.observed) requireValue(stable(receipt.usage.observed)===stable(normalizedUsage.observed),'invalid usage observed subtotal');
  requireValue(receipt.human && Array.isArray(receipt.human.reviews),'invalid human evidence');
  for(const review of receipt.human.reviews) attachHumanReview({...receipt,human:{status:'not_requested',reviews:[]}},review);
  requireValue(receipt.human.status!=='completed' || receipt.human.reviews.some(review=>review.status==='completed'),'human completion lacks review');
 }
 const grouped=new Map();
 for(const planned of manifest.plannedRuns) {
  const key=stable([planned.arm,planned.model]);
  if(!grouped.has(key)) grouped.set(key,{arm:planned.arm,model:planned.model,plannedRuns:[],receipts:[]});
  grouped.get(key).plannedRuns.push(planned);
 }
 for(const receipt of receipts) grouped.get(stable([receipt.arm,receipt.model])).receipts.push(receipt);
 const byArm=[...grouped.values()].map(group=>({arm:group.arm,model:group.model,...summarize(group.receipts,group.plannedRuns),breakdowns:{taskType:breakdown(group.receipts,group.plannedRuns,'taskType'),complexity:breakdown(group.receipts,group.plannedRuns,'complexity')}}));
 return {schemaVersion:2,benchmark:'diagram-quality',identity,...summarize(receipts,manifest.plannedRuns),byArm,missing:manifest.plannedRuns.filter(item=>!seenCells.has(cell(item))),receipts:clone(receipts)};
}

function summarize(receipts,plannedRuns) {
 const planned=plannedRuns.length, successful=receipts.filter(r=>r.objective.passed).length;
 const verified=receipts.filter(r=>r.objective.status==='verified').length;
 const humanCount=receipts.filter(r=>r.human?.status==='completed').length;
 const objective={successful,verified,successRate:successful/planned,mrr:receipts.some(r=>r.objective.passed && r.objective.firstSuccessRound===null)?null:receipts.reduce((sum,r)=>sum+(r.objective.passed && Number.isInteger(r.objective.firstSuccessRound) && r.objective.firstSuccessRound>0?1/r.objective.firstSuccessRound:0),0)/planned,scoreMeaning:'all planned runs: binary objective success rate',successTimesMs:receipts.filter(r=>r.objective.passed).map(r=>r.objective.timeToSuccessMs),censoredOrFailed:planned-successful};
 const usage={};for(const field of [...usageFields,'totalTokens']) {const known=receipts.filter(r=>r.usage?.[field]!=null);usage[field]={observed:receipts.reduce((sum,r)=>sum+(r.usage?.observed?.[field]??r.usage?.[field]??0),0),knownRuns:known.length,complete:known.length===planned && receipts.every(r=>r.usage?.complete!==false)};}
 finiteData(usage,'usage totals');
 const coverageComplete=receipts.length===planned;

 const eligible=coverageComplete && verified===planned && receipts.every(r=>r.optimization?.eligible===true && r.objective.passed===true && r.objective.semantic?.passed===true && r.objective.geometry?.passed===true && r.editability?.passed===true);
 return {planned,recorded:receipts.length,coverageComplete,objectiveVerified:coverageComplete && verified===planned,humanReviewed:coverageComplete && humanCount===planned,objective,usage,human:{reviewed:humanCount,coverage:humanCount/planned},optimization:{eligible,score:eligible?objective.successRate:null}};
}

function breakdown(receipts,plannedRuns,field) {
 const groups=new Map();
 const received=new Map(receipts.map(receipt=>[cell(receipt),receipt]));
 // Planned metadata owns every bucket, including cells for which no receipt arrived.
 for(const planned of plannedRuns) {
  const value=planned[field] ?? 'unknown',key=stable(value);
  if(!groups.has(key)) groups.set(key,{value,plannedRuns:[],receipts:[]});
  const group=groups.get(key);group.plannedRuns.push(planned);
  if(received.has(cell(planned))) group.receipts.push(received.get(cell(planned)));
 }
 return [...groups.values()].map(group=>({value:clone(group.value),...summarize(group.receipts,group.plannedRuns)}));
}
