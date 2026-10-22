import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {peerProtocol,repairFeedback,deepseekTariffAt} from '../benchmarks/diagram-quality/peer-experiment.mjs';

test('peer protocol plans the same four tasks for six methods with actual untruncated Archify documentation',()=>{
 const p=peerProtocol({peerInstructions:{drawio:'native drawio guide',excalidraw:'native excalidraw guide'}});
 assert.equal(p.entries.length,24);assert.equal(new Set(p.entries.map(e=>e.arm)).size,6);
 for(const arm of p.arms)assert.deepEqual(p.entries.filter(e=>e.arm===arm.arm).map(e=>e.taskId).sort(),['architecture-01','architecture-04','workflow-01','workflow-04']);
 const workflow=p.entries.find(e=>e.format==='archify'&&e.taskId==='workflow-01').messages[1].content;
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const references=[...workflow.matchAll(/<actual-reference path="([^"]+)">\n([\s\S]*?)\n<\/actual-reference>/g)];
 for(const required of ['archify/SKILL.md','archify/references/delivery-contract.md','archify/schemas/workflow.schema.json'])
  assert.ok(references.some(([,file])=>file===required),`${required} must reach the workflow arm`);
 for(const [,file,text] of references){
  const actual=fs.readFileSync(path.join(root,file),'utf8');
  assert.equal(text,actual,`${file} must be supplied without truncation`);
  const record=p.documents.find(d=>d.path===file);assert.ok(record,file);
  assert.equal(record.bytes,Buffer.byteLength(actual));
  assert.equal(record.sha256,createHash('sha256').update(actual).digest('hex'));
 }
 const example=references.find(([,file])=>file==='archify/examples/agent-tool-call.workflow.json');
 assert.ok(example,'the workflow arm receives its native example');
 assert.equal(JSON.parse(example[2]).schema_version,2);
 assert.equal(p.budget.maxCandidates,3);assert.equal(p.configuration.thinking.type,'disabled');
});
test('repair feedback exposes real diagnostic facts without feeding weighted scores or rankings',()=>{
 const text=repairFeedback({native:{ok:false,diagnostics:[{code:'workflow/column-capacity',evidence:{overlap:12}}]},semantic:{status:'verified',passed:false,violations:[{code:'missing_edge',from:'n1',to:'n2'}]},geometry:{status:'verified',passed:false,violations:[{code:'tiny_font',fontSize:8}]},unknownReasons:[]});
 const value=JSON.parse(text);assert.equal(value.native.diagnostics[0].evidence.overlap,12);assert.equal(value.semantic.violations[0].code,'missing_edge');assert.equal(value.geometry.violations[0].fontSize,8);
 assert.ok(!/automatic|leader|ranking|weighted|scoreVersion/.test(text));
});

test('repair feedback makes independent IDs actionable using measured visible labels and rectangles',()=>{
 const value=JSON.parse(repairFeedback({native:{ok:true},observedGraph:{nodes:[{id:'observed-node-1',label:'Browser'}],edges:[]},observation:{scale:.8,nodes:[{id:'observed-node-1',label:'Browser',rect:{x:10,y:20,width:100,height:50},fontSize:11}],edges:[],texts:[]},expected:{nodes:[{id:'n1',label:'Browser'}],edges:[]}}));
 assert.equal(value.visibleMeasurements.nodes[0].label,'Browser');assert.equal(value.visibleMeasurements.nodes[0].rect.width,100);assert.equal(value.visibleMeasurements.scale,.8);assert.equal(value.requiredNodeNames.n1,'Browser');
});

test('verified tariff schedule follows each actual dispatch across the peak boundary',()=>{
 assert.equal(deepseekTariffAt('2026-10-22T03:59:59Z').perMillion.output,1.2);
 assert.equal(deepseekTariffAt('2026-10-22T04:00:00Z').perMillion.output,.6);
 assert.equal(deepseekTariffAt('2026-10-24T03:00:00Z').perMillion.output,.6);
});
