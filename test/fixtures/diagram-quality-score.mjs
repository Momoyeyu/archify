import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256,evaluatorHash} from '../../benchmarks/diagram-quality/benchmark.mjs';
import {evaluateRun} from '../../benchmarks/diagram-quality/records.mjs';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const corpusFile=path.join(root,'benchmarks/diagram-quality/corpus.json');
const corpus=JSON.parse(fs.readFileSync(corpusFile));
export function fixture() {
  const task=corpus.tasks.find(t=>t.id==='architecture-02');
  const graph={status:'verified',nodes:task.expected.nodes,edges:task.expected.edges};
  const observation={status:'verified',bounds:{x:0,y:0,width:1280,height:720},nodes:graph.nodes.map((n,i)=>({...n,visible:true,rect:{x:30+i*260,y:100,width:180,height:80},fontSize:14})),texts:graph.nodes.map((n,i)=>({text:n.label,nodeId:n.id,visible:true,rect:{x:40+i*260,y:120,width:150,height:20},fontSize:14})),edges:graph.edges.map(e=>({...e,visible:true,points:[{x:210,y:140},{x:290,y:140}]}))};
  const identity={manifestHash:sha256(fs.readFileSync(corpusFile)),evaluatorHash:evaluatorHash(),profileHash:sha256(JSON.stringify(corpus.profile)),budget:{maxCandidates:1,maxDurationMs:60000,maxCostUsd:.25}};
  const run={runId:'synthetic-cli-test',taskId:task.id,arm:'fixture',model:'fixture-only',repeat:1,identity,artifactHash:'a'.repeat(64),artifactPath:'artifacts/'+ 'a'.repeat(64)+'.html',status:'completed',startedAt:'2026-10-21T00:00:00Z',completedAt:'2026-10-21T00:00:20Z',candidates:[{submittedAt:'2026-10-21T00:00:20Z',artifactHash:'a'.repeat(64)}],usage:{inputTokens:100,outputTokens:50,costUsd:.05}};
  const receipt=evaluateRun({task,run,graph,observation,profile:corpus.profile,editability:{status:'verified',passed:true}});
  receipt.observation=observation;
  return {task,receipt,manifest:{identity,plannedRuns:[{taskId:task.id,arm:run.arm,model:run.model,repeat:1,taskType:task.type,complexity:task.complexity}]}};
}
