import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRun, aggregateRuns, attachHumanReview } from '../benchmarks/diagram-quality/records.mjs';
import { renderReport } from '../benchmarks/diagram-quality/report.mjs';
const identity = {manifestHash:'manifest',evaluatorHash:'evaluator',profileHash:'profile',budget:{maxCandidates:3,maxDurationMs:10000}};
const editability={status:'verified',passed:true,method:'independent-edit-reload-render'};
const profile={minFontPx:12,epsilonPx:0.5,calibrated:false};
const task={id:'one',expected:{nodes:[{id:'a',label:'Alpha'}],edges:[]}};
const graph={status:'verified',nodes:[{id:'a',label:'Alpha'}],edges:[],unknownReasons:[]};
const observation={status:'verified',nodes:[{id:'a',label:'Alpha',visible:true,rect:{x:10,y:10,width:60,height:30},fontSize:14}],edges:[],texts:[{text:'Alpha',nodeId:'a',visible:true,rect:{x:15,y:15,width:45,height:18},fontSize:14}],bounds:{x:0,y:0,width:100,height:100}};
function run(overrides={}) {return {runId:'r1',taskId:'one',arm:'archify',model:'offline',repeat:1,identity,artifactHash:'abc',status:'completed',startedAt:'2026-10-21T00:00:00Z',completedAt:'2026-10-21T00:00:03Z',candidates:[{artifactHash:'abc',submittedAt:'2026-10-21T00:00:02Z'}],...overrides};}
function receipt(overrides={}) {return evaluateRun({editability,task:{...task,id:overrides.taskId??task.id},run:run(overrides),graph,observation,profile});}
const manifest={...identity,plannedRuns:[{taskId:'one',arm:'archify',model:'offline',repeat:1},{taskId:'two',arm:'archify',model:'offline',repeat:1}]};
test('planned missing runs and unsuccessful runs stay in objective denominator',()=>{
 const r=receipt(); const report=aggregateRuns([r],{manifest});
 assert.equal(r.objective.passed,true); assert.equal(r.optimization.eligible,false);
 assert.equal(report.planned,2); assert.equal(report.objective.successRate,0.5); assert.equal(report.coverageComplete,false);
 for(const status of ['timeout','no_candidate','provider_error']) {
  const failed=receipt({runId:'r2',taskId:'two',status,artifactHash:null,candidates:[]});
  const result=aggregateRuns([r,failed],{manifest}); assert.equal(result.objective.successRate,0.5); assert.equal(result.coverageComplete,true);
 }
});
test('aggregation rejects duplicate cells/run ids, mixed identities, and unplanned cells',()=>{
 const r=receipt();
 assert.throws(()=>aggregateRuns([r,r],{manifest}),/duplicate/i);
 assert.throws(()=>aggregateRuns([r,{...r,runId:'other'}],{manifest}),/duplicate/i);
 assert.throws(()=>aggregateRuns([{...r,identity:{...identity,evaluatorHash:'other'}}],{manifest}),/identity/i);
 assert.throws(()=>aggregateRuns([receipt({taskId:'unknown'})],{manifest}),/planned/i);
});
test('usage preserves absent fields and never adds cached or reasoning subsets twice',()=>{
 assert.equal(receipt().usage.totalTokens,null);
 const r=receipt({usage:{inputTokens:100,outputTokens:30,cachedInputTokens:50,reasoningTokens:20}});
 assert.equal(r.usage.totalTokens,130); assert.equal(r.usage.costUsd,null);
 assert.equal(receipt({usage:{inputTokens:100}}).usage.totalTokens,null);
 assert.throws(()=>receipt({usage:{inputTokens:NaN}}),/finite/i);
 assert.throws(()=>receipt({usage:{inputTokens:3,cachedInputTokens:5}}),/cached/i);
});
test('self-reported passing candidate cannot establish earlier success',()=>{
 const r=receipt({candidates:[{artifactHash:'earlier',submittedAt:'2026-10-21T00:00:01Z',objectivePassed:true},{artifactHash:'abc',submittedAt:'2026-10-21T00:00:02Z'}]});
 assert.equal(r.objective.firstSuccessRound,null); assert.equal(r.objective.timeToSuccessMs,null); assert.equal(r.objective.reciprocalRank,null); assert.equal(r.objective.finalCandidateLatencyMs,2000);
 assert.equal(r.objective.score,1); assert.equal(r.objective.scoreMeaning,'binary objective pass');
});
test('human completion requires bound artifact, identity, all ratings and semantic judgement',()=>{
 const r=receipt(); const review={status:'completed',taskId:'one',artifactHash:'abc',rubricVersion:'v1',reviewerId:'reviewer-7',ratings:{readability:4,hierarchy:3,layout:4,style:4,aesthetics:5},semantic:{judgement:'correct'}};
 assert.throws(()=>attachHumanReview(r,{...review,artifactHash:'changed'}),/artifact/i);
 assert.throws(()=>attachHumanReview(r,{...review,ratings:{readability:4}}),/rating/i);
 assert.throws(()=>attachHumanReview(r,{...review,reviewerId:''}),/reviewer/i);
 assert.throws(()=>attachHumanReview(r,{...review,semantic:null}),/semantic/i);
 const reviewed=attachHumanReview(r,review); assert.deepEqual(reviewed.objective,r.objective); assert.equal(r.human.status,'not_requested'); assert.equal(reviewed.human.status,'completed');
});
test('static report escapes malicious data and permits only digest-bound safe local links',()=>{
 const r=receipt({arm:'<script>alert(1)</script>',artifactPath:'javascript:alert(1)'});
 const html=renderReport({planned:1,coverageComplete:true,objectiveVerified:true,humanReviewed:false,objective:{successRate:1,mrr:1},receipts:[r]});
 assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>')); assert.ok(!html.includes('href="javascript:'));
 const safe=renderReport({receipts:[receipt({artifactPath:'artifacts/abc.svg'})]}); assert.ok(safe.includes('href="artifacts/abc.svg"'));
});
test('strict times, candidate final hash and budget prevent invalid success',()=>{
 assert.throws(()=>receipt({candidates:[{artifactHash:'wrong',submittedAt:'2026-10-21T00:00:02Z'}]}),/final.*hash/i);
 assert.throws(()=>receipt({startedAt:'yesterday'}),/time/i);
 const late=receipt({identity:{...identity,budget:{maxDurationMs:1000,maxCandidates:3}}}); assert.equal(late.objective.passed,false);
});
test('receipt aggregation rejects forged success rounds, usage and human completion',()=>{
 const r=receipt();
 for(const objective of [{...r.objective,firstSuccessRound:0},{...r.objective,timeToSuccessMs:-1},{...r.objective,reciprocalRank:5}]) assert.throws(()=>aggregateRuns([{...r,objective}],{manifest}),/objective/i);
 assert.throws(()=>aggregateRuns([{...r,usage:{inputTokens:'100',totalTokens:'100'}}],{manifest}),/usage|Tokens/i);
 assert.throws(()=>aggregateRuns([{...r,human:{status:'completed',reviews:[]}}],{manifest}),/human/i);
});
test('multiple calls count retries and preserve partial usage, rejecting duplicate call identities',()=>{
 const calls=[{callId:'first',inputTokens:10,outputTokens:5,cachedInputTokens:6,reasoningTokens:3,costUsd:0.01},{callId:'retry',inputTokens:20,outputTokens:7,reasoningTokens:4,costUsd:0.02}];
 const r=receipt({usage:{calls}});assert.equal(r.usage.totalTokens,42);assert.equal(r.usage.costUsd,0.03);assert.equal(r.usage.cachedInputTokens,null);
 assert.throws(()=>receipt({usage:{calls:[calls[0],calls[0]]}}),/duplicate/i);
 const partial=receipt({usage:{calls:[calls[0],{callId:'failed'}]}});assert.equal(partial.usage.totalTokens,null);assert.equal(partial.usage.status,'partial');
});
test('prior receipt must match candidate identity and model and cannot be a self assertion',()=>{
 const prior=receipt({runId:'independent',artifactHash:'early',candidates:[{artifactHash:'early',submittedAt:'2026-10-21T00:00:01Z'}]});
 const candidates=[{artifactHash:'early',submittedAt:'2026-10-21T00:00:01Z',verifiedReceipt:prior},{artifactHash:'abc',submittedAt:'2026-10-21T00:00:02Z'}];
 assert.equal(receipt({candidates}).objective.firstSuccessRound,1);
 const wrong=structuredClone(candidates);wrong[0].verifiedReceipt.identity.evaluatorHash='other';assert.equal(receipt({candidates:wrong}).objective.firstSuccessRound,null);
});
test('unknown observation cannot establish objective success or optimization eligibility',()=>{
 const result=evaluateRun({editability,task,run:run(),graph,observation:{...observation,status:'unverified'},profile:{...profile,calibrated:true}});
 assert.equal(result.objective.status,'unverified');assert.equal(result.objective.passed,false);assert.equal(result.optimization.eligible,false);
});

test('task facts must be bound to the evaluated run',()=>{assert.throws(()=>evaluateRun({editability,task,run:run({taskId:'different'}),graph,observation,profile}),/task/i);});

test('provisional gold and partial known usage stay explicitly ineligible and observable',()=>{
 const r=evaluateRun({editability,task:{...task,goldStatus:'authored-provisional'},run:run({usage:{calls:[{callId:'known',inputTokens:10,outputTokens:5,costUsd:0.01},{callId:'unknown'}]}}),graph,observation,profile:{...profile,calibrated:true}});
 assert.equal(r.optimization.eligible,false);assert.match(r.optimization.reason,/gold/i);
 assert.equal(r.usage.totalTokens,null);assert.equal(r.usage.observed.totalTokens,15);
 const report=aggregateRuns([r],{manifest});assert.equal(report.usage.totalTokens.observed,15);assert.equal(report.usage.costUsd.observed,0.01);assert.equal(report.usage.totalTokens.complete,false);
});
test('audit metadata survives evaluation and incomplete candidate history leaves first draft unknown',()=>{
 const r=receipt({environment:{browserVersion:'Chrome test'},sourceEvidence:{method:'independent-browser'},promptHash:'prompt',toolEvents:[{kind:'compile'}],candidates:[{artifactHash:'early',submittedAt:'2026-10-21T00:00:01Z'},{artifactHash:'abc',submittedAt:'2026-10-21T00:00:02Z'}]});
 assert.equal(r.environment.browserVersion,'Chrome test');assert.equal(r.sourceEvidence.method,'independent-browser');assert.equal(r.promptHash,'prompt');assert.equal(r.toolEvents.length,1);assert.equal(r.firstDraft.passed,null);
});
test('invalid budget strings cannot bypass limits',()=>{
 assert.throws(()=>receipt({identity:{...identity,budget:{maxCandidates:'three',maxDurationMs:'unlimited'}}}),/budget/i);
});
test('nonfinite input evidence and arithmetic overflow cannot escape as numeric scores or costs',()=>{
 assert.throws(()=>evaluateRun({editability,task,run:run(),graph,observation:{...observation,bounds:{...observation.bounds,width:Infinity}},profile}),/finite/i);
 assert.throws(()=>receipt({usage:{calls:[{callId:'a',costUsd:1e308},{callId:'b',costUsd:1e308}]}}),/finite/i);
});

test('independent editability is required and run selfclaims never authorize objective success',()=>{
 for(const evidence of [undefined,{status:'unverified',passed:true},{status:'unverified',passed:false}]) {
  const r=evaluateRun({task,run:run({editability:{status:'verified',passed:true}}),graph,observation,profile,editability:evidence});
  assert.equal(r.objective.status,'unverified');assert.equal(r.objective.passed,false);assert.equal(r.optimization.eligible,false);
 }
 const failed=evaluateRun({task,run:run(),graph,observation,profile,editability:{status:'verified',passed:false,method:'independent-probe'}});
 assert.equal(failed.objective.status,'verified');assert.equal(failed.objective.passed,false);assert.equal(failed.objective.score,0);assert.equal(failed.editability.passed,false);
 const passed=receipt();assert.deepEqual(passed.editability,editability);assert.equal(passed.objective.passed,true);
});
test('separately billed cached inputs may exceed uncached input without double counting',()=>{
 const r=receipt({usage:{inputTokens:10,cachedInputTokens:100,cachedIncludedInInput:false,outputTokens:30}});
 assert.equal(r.usage.inputTokens,110);assert.equal(r.usage.totalTokens,140);
 const report=aggregateRuns([r],{manifest});assert.equal(report.usage.totalTokens.observed,140);
});
test('arm and model summaries retain each planned denominator including an entirely missing arm',()=>{
 const comparison={...identity,plannedRuns:[
  {taskId:'one',arm:'archify',model:'offline',repeat:1},
  {taskId:'two',arm:'archify',model:'offline',repeat:1},
  {taskId:'one',arm:'mermaid',model:'offline',repeat:1}
 ]};
 const report=aggregateRuns([receipt()],{manifest:comparison});
 assert.equal(report.objective.successRate,1/3);
 assert.equal(report.byArm.length,2);
 const archify=report.byArm.find(group=>group.arm==='archify');
 assert.equal(archify.model,'offline');assert.equal(archify.planned,2);assert.equal(archify.recorded,1);assert.equal(archify.objective.successRate,0.5);assert.equal(archify.objective.mrr,0.5);
 const mermaid=report.byArm.find(group=>group.arm==='mermaid');
 assert.equal(mermaid.planned,1);assert.equal(mermaid.recorded,0);assert.equal(mermaid.objective.successRate,0);assert.equal(mermaid.objective.mrr,0);assert.equal(mermaid.coverageComplete,false);
 const html=renderReport(report);assert.ok(html.includes('Results by arm and model'));assert.ok(html.includes('<td>mermaid</td>'));assert.ok(html.includes('<td>0.5</td>'));
});
test('contradictory imported success receipts cannot bypass delivery editability or candidate budgets',()=>{
 const r=receipt();
 for(const altered of [{...r,status:'timeout'},{...r,editability:{status:'unverified',passed:true}},{...r,editability:{status:'verified',passed:false}},{...r,objective:{...r.objective,semantic:{status:'verified',passed:false}}},{...r,candidates:[{...r.candidates[0],submittedAt:'2026-10-21T00:00:20Z'}]}]) assert.throws(()=>aggregateRuns([altered],{manifest}),/objective|budget|candidate|editability/i);
});
test('unobserved model calls cannot claim a complete token budget',()=>{
 const r=receipt({identity:{...identity,budget:{maxTokens:100}},usage:{complete:false,calls:[{callId:'known',inputTokens:10,outputTokens:5,costUsd:0.01}]}});
 assert.equal(r.objective.passed,false);assert.equal(r.usage.totalTokens,null);assert.equal(r.usage.observed.totalTokens,15);
});
test('prior verified success informs timing but cannot rescue a failing final artifact',()=>{
 const prior=receipt({artifactHash:'early',candidates:[{artifactHash:'early',submittedAt:'2026-10-21T00:00:01Z'}]});
 const result=evaluateRun({task,run:run({candidates:[{artifactHash:'early',submittedAt:'2026-10-21T00:00:01Z',verifiedReceipt:prior},{artifactHash:'abc',submittedAt:'2026-10-21T00:00:02Z'}]}),graph,observation:{...observation,texts:[{...observation.texts[0],fontSize:5}]},profile,editability});
 assert.equal(result.objective.status,'verified');assert.equal(result.objective.passed,false);assert.equal(result.objective.score,0);
});
test('explicitly partial flat usage cannot authorize a token budget',()=>{
 const r=receipt({identity:{...identity,budget:{maxTokens:100}},usage:{complete:false,inputTokens:10,outputTokens:5,costUsd:0.01}});
 assert.equal(r.objective.passed,false);assert.equal(r.usage.status,'partial');
});
test('imported optimization keep eligibility must agree with calibration and independent gold',()=>{
 const r=receipt();
 assert.throws(()=>aggregateRuns([{...r,optimization:{eligible:true,score:1}}],{manifest}),/optimization/i);
 const qualified=evaluateRun({task:{...task,goldStatus:'independently-confirmed'},run:run(),graph,observation,profile:{...profile,calibrated:true},editability});
 assert.equal(qualified.optimization.eligible,true);assert.equal(aggregateRuns([qualified],{manifest:{...manifest,plannedRuns:manifest.plannedRuns.slice(0,1)}}).optimization.score,1);
});
test('failed mandatory guards invalidate optimization instead of emitting a keepable penalty score',()=>{
 const confirmedTask={...task,goldStatus:'independently-confirmed'},calibratedProfile={...profile,calibrated:true};
 const cases=[
  {graph:{...graph,nodes:[{id:'a',label:'Wrong'}]},observation,editability,reason:/semantic/i},
  {graph,observation:{...observation,texts:[{...observation.texts[0],fontSize:5}]},editability,reason:/geometry/i},
  {graph,observation,editability:{status:'verified',passed:false,method:'independent-probe'},reason:/editability/i}
 ];
 for(const evidence of cases) {
  const r=evaluateRun({task:confirmedTask,run:run(),profile:calibratedProfile,...evidence});
  assert.equal(r.objective.status,'verified');assert.equal(r.objective.passed,false);assert.equal(r.objective.score,0);
  assert.equal(r.optimization.eligible,false);assert.equal(r.optimization.score,null);assert.match(r.optimization.reason,evidence.reason);
  const singleManifest={...manifest,plannedRuns:manifest.plannedRuns.slice(0,1)};
  const report=aggregateRuns([r],{manifest:singleManifest});assert.equal(report.objective.successRate,0);assert.equal(report.optimization.eligible,false);assert.equal(report.optimization.score,null);
  assert.throws(()=>aggregateRuns([{...r,optimization:{eligible:true,score:0}}],{manifest:singleManifest}),/optimization/i);
 }
});
test('type and complexity breakdowns derive denominators exclusively from planned cell metadata',()=>{
 const planned={...identity,plannedRuns:[
  {taskId:'one',arm:'archify',model:'offline',repeat:1,taskType:'architecture',complexity:'small'},
  {taskId:'two',arm:'archify',model:'offline',repeat:1,taskType:'workflow',complexity:'large'}
 ]};
 const r=evaluateRun({task:{...task,type:'architecture',complexity:'small'},run:run(),graph,observation,profile,editability});
 assert.equal(r.taskType,'architecture');
 const report=aggregateRuns([r],{manifest:planned}),breakdowns=report.byArm[0].breakdowns;
 assert.equal(breakdowns.taskType.find(row=>row.value==='architecture').objective.successRate,1);
 const missingType=breakdowns.taskType.find(row=>row.value==='workflow');assert.equal(missingType.planned,1);assert.equal(missingType.recorded,0);assert.equal(missingType.objective.successRate,0);
 const missingComplexity=breakdowns.complexity.find(row=>row.value==='large');assert.equal(missingComplexity.planned,1);assert.equal(missingComplexity.recorded,0);assert.equal(missingComplexity.objective.successRate,0);
 const unknown=aggregateRuns([r],{manifest}).byArm[0].breakdowns;
 assert.equal(unknown.taskType.length,1);assert.equal(unknown.taskType[0].value,'unknown');assert.equal(unknown.taskType[0].planned,2);assert.equal(unknown.taskType[0].objective.successRate,0.5);
 assert.equal(unknown.complexity[0].value,'unknown');
 const html=renderReport(report);assert.ok(html.includes('Task type and complexity'));assert.ok(html.includes('workflow'));assert.ok(html.includes('large'));
});
