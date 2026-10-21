import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { main, sha256, evaluatorHash } from '../benchmarks/diagram-quality/benchmark.mjs';
import { evaluateRun, attachHumanReview } from '../benchmarks/diagram-quality/records.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const corpusFile=path.join(root,'benchmarks/diagram-quality/corpus.json');
const corpus=JSON.parse(fs.readFileSync(corpusFile));
function fixture() {
  const task=corpus.tasks.find(t=>t.id==='architecture-02');
  const graph={status:'verified',nodes:task.expected.nodes,edges:task.expected.edges};
  const observation={status:'verified',bounds:{x:0,y:0,width:1280,height:720},nodes:graph.nodes.map((n,i)=>({...n,visible:true,rect:{x:30+i*260,y:100,width:180,height:80},fontSize:14})),texts:graph.nodes.map((n,i)=>({text:n.label,nodeId:n.id,visible:true,rect:{x:40+i*260,y:120,width:150,height:20},fontSize:14})),edges:graph.edges.map(e=>({...e,visible:true,points:[{x:210,y:140},{x:290,y:140}]}))};
  const identity={manifestHash:sha256(fs.readFileSync(corpusFile)),evaluatorHash:evaluatorHash(),profileHash:sha256(JSON.stringify(corpus.profile)),budget:{maxCandidates:1,maxDurationMs:60000,maxCostUsd:.25}};
  const run={runId:'synthetic-cli-test',taskId:task.id,arm:'fixture',model:'fixture-only',repeat:1,identity,artifactHash:'a'.repeat(64),artifactPath:'artifacts/'+ 'a'.repeat(64)+'.html',status:'completed',startedAt:'2026-10-21T00:00:00Z',completedAt:'2026-10-21T00:00:20Z',candidates:[{submittedAt:'2026-10-21T00:00:20Z',artifactHash:'a'.repeat(64)}],usage:{inputTokens:100,outputTokens:50,costUsd:.05}};
  const receipt=evaluateRun({task,run,graph,observation,profile:corpus.profile,editability:{status:'verified',passed:true}});
  receipt.observation=observation;
  return {task,receipt,manifest:{identity,plannedRuns:[{taskId:task.id,arm:run.arm,model:run.model,repeat:1,taskType:task.type,complexity:task.complexity}]}};
}
test('five numerical human ratings are sufficient; semantic comments are optional',()=>{
  const {receipt}=fixture();
  const review={taskId:receipt.taskId,artifactHash:receipt.artifactHash,reviewerId:'reviewer-a',rubricVersion:'diagram-quality-human-v1',status:'completed',independent:true,ratings:{readability:4,hierarchy:4,layout:4,style:4,aesthetics:4}};
  const reviewed=attachHumanReview(receipt,review);
  assert.equal(reviewed.human.status,'completed');
  assert.deepEqual(reviewed.objective,receipt.objective);
});
test('one score command exports matching Chinese HTML, CSV and unrounded numeric JSON',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-score-cli-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const {receipt,manifest}=fixture();
  fs.writeFileSync(path.join(dir,'receipts.jsonl'),JSON.stringify(receipt)+'\n');
  fs.writeFileSync(path.join(dir,'plan.json'),JSON.stringify(manifest));
  const output=path.join(dir,'out');
  const result=await main(['score','--results',path.join(dir,'receipts.jsonl'),'--manifest',path.join(dir,'plan.json'),'--output',output,'--corpus',corpusFile]);
  const card=JSON.parse(fs.readFileSync(path.join(output,'scorecard.json')));
  assert.ok(Number.isFinite(card.methods[0].automatic));
  assert.equal(card.methods[0].comprehensive,null);
  assert.match(fs.readFileSync(path.join(output,'index.html'),'utf8'),/自动|总分/);
  assert.match(fs.readFileSync(path.join(output,'scores.csv'),'utf8'),/内容|content/);
  assert.ok(result.scorecard || result.methods);
  const optimizer=await main(['score','--results',path.join(dir,'receipts.jsonl'),'--manifest',path.join(dir,'plan.json'),'--output',path.join(dir,'optimizer'),'--corpus',corpusFile,'--score-only','true']);
  assert.equal(optimizer.optimizerScore,card.methods[0].automatic);
  // A review update changes only the comprehensive score, never automatic scoring.
  const ratings={readability:4,hierarchy:4,layout:4,style:4,aesthetics:4};
  const reviews=['a','b'].map(reviewerId=>({taskId:receipt.taskId,artifactHash:receipt.artifactHash,reviewerId,rubricVersion:'diagram-quality-human-v1',status:'completed',independent:true,ratings}));
  fs.writeFileSync(path.join(dir,'reviews.json'),JSON.stringify({reviews}));
  await main(['score','--results',path.join(dir,'receipts.jsonl'),'--manifest',path.join(dir,'plan.json'),'--output',path.join(dir,'reviewed'),'--corpus',corpusFile,'--reviews',path.join(dir,'reviews.json'),'--track','full']);
  const updated=JSON.parse(fs.readFileSync(path.join(dir,'reviewed','scorecard.json')));
  assert.equal(updated.methods[0].automatic,card.methods[0].automatic);
  assert.equal(updated.methods[0].scores.human,75);
  assert.ok(Number.isFinite(updated.methods[0].comprehensive));
});
test('batch terminal failures cannot overwrite caller identity with a different corpus identity',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-score-identity-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'experiment.json'),JSON.stringify({corpus:corpusFile,entries:[{taskId:'architecture-02',run:{runId:'known-fail',taskId:'architecture-02',arm:'fixture',model:'fixture',repeat:1,status:'no_candidate',startedAt:'2026-10-21T00:00:00Z',completedAt:'2026-10-21T00:00:10Z',identity:{manifestHash:'wrong',budget:{}}}}]}));
  await assert.rejects(main(['run','--experiment',path.join(dir,'experiment.json'),'--output',path.join(dir,'out')]),/identity|digest|manifestHash/i);
});
test('standalone run entry point completes and prints the same score plus raw units',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-score-process-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const run={runId:'process-fixture',taskId:'architecture-02',arm:'fixture',model:'fixture',repeat:1,status:'no_candidate',startedAt:'2026-10-21T00:00:00Z',completedAt:'2026-10-21T00:00:10Z'};
  fs.writeFileSync(path.join(dir,'experiment.json'),JSON.stringify({corpus:corpusFile,entries:[{taskId:run.taskId,run}]}));
  const result=spawnSync(process.execPath,[path.join(root,'benchmarks/diagram-quality/benchmark.mjs'),'run','--experiment',path.join(dir,'experiment.json'),'--output',path.join(dir,'out')],{encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/0\.0 分/);
  assert.match(result.stdout,/秒/);assert.match(result.stdout,/tokens/);assert.match(result.stdout,/费用未测|USD/);
  assert.ok(fs.existsSync(path.join(dir,'out','scorecard.json')));
});
test('invalid generated JSON is a known zero-scoring task failure, not a missing experiment',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-score-invalid-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'bad.json'),'{');
  const run={runId:'invalid-json-fixture',taskId:'architecture-02',arm:'fixture',model:'fixture',repeat:1,status:'completed',startedAt:'2026-10-21T00:00:00Z',completedAt:'2026-10-21T00:00:10Z'};
  fs.writeFileSync(path.join(dir,'experiment.json'),JSON.stringify({corpus:corpusFile,entries:[{taskId:run.taskId,source:'bad.json',format:'archify',run}]}));
  const result=await main(['run','--experiment',path.join(dir,'experiment.json'),'--output',path.join(dir,'out')]);
  assert.equal(result.scorecard.methods[0].automatic,0);
  assert.equal(result.scorecard.rows[0].knownFailure,true);
  fs.writeFileSync(path.join(dir,'existing.html'),'<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  fs.writeFileSync(path.join(dir,'with-artifact.json'),JSON.stringify({corpus:corpusFile,entries:[{taskId:run.taskId,source:'bad.json',format:'archify',artifact:'existing.html',run}]}));
  const withArtifact=await main(['run','--experiment',path.join(dir,'with-artifact.json'),'--output',path.join(dir,'existing-out')]);
  assert.equal(withArtifact.scorecard.methods[0].automatic,0);
});
test('batch rerender preserves recorded generation completion instead of charging offline grader time',async t=>{
  if(!process.env.ARCHIFY_CHROME)return t.skip('Set ARCHIFY_CHROME for actual rerender');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-score-timing-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const {receipt}=fixture();
  const run={runId:'recorded-generation',taskId:receipt.taskId,arm:receipt.arm,model:receipt.model,repeat:1,status:'completed',startedAt:receipt.startedAt,completedAt:receipt.completedAt,usage:{inputTokens:100,outputTokens:50,costUsd:.05},identity:{budget:{maxCandidates:1,maxDurationMs:60000,maxCostUsd:.25}}};
  fs.writeFileSync(path.join(dir,'experiment.json'),JSON.stringify({corpus:corpusFile,entries:[{taskId:run.taskId,source:path.join(root,'benchmarks/diagram-quality/examples/weather.architecture.json'),format:'archify',run}]}));
  const result=await main(['run','--experiment',path.join(dir,'experiment.json'),'--output',path.join(dir,'out'),'--chrome',process.env.ARCHIFY_CHROME]);
  assert.equal(result.scorecard.rows[0].raw.durationMs,20000);
  assert.equal(result.scorecard.rows[0].scores.speed,80);
  const artifactHash=result.scorecard.rows[0].artifactHash;
  const multi={...run,runId:'multiple-candidate-generation',candidates:[{artifactHash:'b'.repeat(64),submittedAt:'2026-10-21T00:00:10Z',objectivePassed:true},{artifactHash,submittedAt:run.completedAt}],identity:{budget:{maxCandidates:2,maxDurationMs:60000,maxCostUsd:.25}}};
  fs.writeFileSync(path.join(dir,'multiple.json'),JSON.stringify({corpus:corpusFile,entries:[{taskId:run.taskId,source:path.join(root,'benchmarks/diagram-quality/examples/weather.architecture.json'),format:'archify',artifact:path.join(dir,'out','artifacts',artifactHash+'.html'),run:multi}]}));
  const repaired=await main(['run','--experiment',path.join(dir,'multiple.json'),'--output',path.join(dir,'repaired'),'--chrome',process.env.ARCHIFY_CHROME]);
  assert.equal(repaired.scorecard.rows[0].scores.speed,80,'unknown earlier drafts cannot block final-delivery timing');
  assert.ok(Number.isFinite(repaired.scorecard.methods[0].automatic));
});
test('real Chrome demo exports a numerical example and separate truthful offline C/L measurements',async t=>{
  if(!process.env.ARCHIFY_CHROME) return t.skip('Set ARCHIFY_CHROME for real browser E2E');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-score-e2e-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  await main(['demo','--output',path.join(dir,'demo'),'--chrome',process.env.ARCHIFY_CHROME]);
  const example=JSON.parse(fs.readFileSync(path.join(dir,'demo','scorecard.json')));
  assert.equal(example.dataKind,'synthetic-arithmetic');
  assert.deepEqual(example.methods.map(m=>+m.comprehensive.toFixed(1)),[90.2,82.5]);
  assert.ok(example.rows.every(r=>r.artifactHash==null),'fictional arithmetic cannot inherit a real diagram identity');
  const actual=JSON.parse(fs.readFileSync(path.join(dir,'demo','offline','scorecard.json')));
  assert.equal(actual.rows.length,2);
  assert.ok(actual.rows.every(r=>r.scores.content===100 && r.scores.layout>0 && r.scores.layout<=100));
  assert.ok(actual.rows.every(r=>r.automatic===null && r.scores.cost===null));
  const receipts=fs.readFileSync(path.join(dir,'demo','offline','receipts.jsonl'),'utf8').trim().split('\n').map(s=>JSON.parse(s));
  assert.equal(receipts[0].sourceHash,sha256(fs.readFileSync(path.join(root,'benchmarks/diagram-quality/examples/weather.architecture.json'))));
  for(const file of ['index.html','scores.csv','scorecard.json','scores.png','review.html','offline/index.html','offline/scores.png']) assert.ok(fs.existsSync(path.join(dir,'demo',file)),file);
  if(process.env.ARCHIFY_SCORE_EXPORT) {fs.mkdirSync(process.env.ARCHIFY_SCORE_EXPORT,{recursive:true});fs.cpSync(path.join(dir,'demo'),process.env.ARCHIFY_SCORE_EXPORT,{recursive:true});}
});
