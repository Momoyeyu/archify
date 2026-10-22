import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from './verification.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const PEER_BUDGET={maxCandidates:3,maxDurationMs:600000,maxTokens:200000,maxCostUsd:.25};
export function deepseekTariffAt(time,{publicHoliday=false}={}){
 const date=new Date(time);if(!Number.isFinite(+date))throw new Error('Invalid dispatch timestamp');
 const day=date.getUTCDay(),hour=date.getUTCHours(),peak=!publicHoliday&&day>0&&day<6&&(hour>=1&&hour<4||hour>=6&&hour<10);
 return {currency:'USD',model:'deepseek-flash',modelVersion:'DeepSeek-V4.1-Flash-1017',window:peak?'peak':'off-peak',perMillion:peak?{cachedInput:.006,input:.3,output:1.2}:{cachedInput:.003,input:.15,output:.6},source:'https://api-docs.deepseek.com/quick_start/pricing/',retrieved:'2026-10-22',publicHoliday};
}
const shared='Create the requested complete editable diagram, preserving all node names, directed relations and labels exactly. Use rectangular semantic nodes and single-headed directed arrows; do not add unrelated diagram nodes, titles or decorative containers. Native tool styling and automatic layout are welcome. Return only the raw source required by this arm, without prose or Markdown fences. The common host submits it through the actual native renderer/tool and returns native plus independent visible-content/layout diagnostics. You may submit at most three candidates, including this first draft. Fix measured problems without deleting required facts. Do not embed a bitmap or hidden topology claims. You may choose a suitable canvas; the evaluator fits the actual board within a1280x720 display for common readability measurement.';
const direct={
 mermaid:'Use Mermaid flowchart LR or TD. Declare each rectangular node separately as ID["label"]. Each directed edge is on its own line: ID -->|label| ID. No subgraphs, chained declarations, config/style directives, HTML labels or click handlers. Actual Mermaid12.2.0 renders the source with htmlLabels:false and default styling.',
 svg:'Return a standalone SVG with xmlns="http://www.w3.org/2000/svg", explicit width/height and viewBox. Each node is one axis-aligned rect and its plain SVG text in a g. Each connector is a path/line/polyline with fill="none", visible stroke and local marker-end only. Marker contains one right-pointing triangle, orient="auto". Connectors touch node borders. Plain edge-label text stays close to its route. Static self-contained source only: no scripts, events, external references, masks, filters, clip paths, animation, legends or extra grouping boxes.',
 html:'Return a complete static <!doctype html> document. Use a positioned board div; each node is a positioned leaf div with a visible border and plain text. Use a board-sized SVG overlay for arrow connectors and their plain labels. No other bordered divs or visible text. Each connector is a path/line/polyline with fill="none", visible stroke and local marker-end only; the marker is one right-pointing triangle with orient="auto". Connectors touch node borders. No scripts/events, external references, masks, filters, animations, legends or topology metadata.'
};
function archifyDocs(type){
 return ['archify/SKILL.md','archify/references/authoring-defaults.md','archify/references/delivery-contract.md','archify/schemas/common.schema.json',type==='architecture'?'archify/examples/web-app.architecture.json':'archify/examples/agent-tool-call.workflow.json',`archify/schemas/${type}.schema.json`,'archify/references/authoring-contract.md',type==='architecture'?'archify/references/architecture-layout-repair.md':'archify/renderers/workflow/README.md'];
}
export function peerProtocol({peerInstructions,sourceIdentities={}}={}){
 if(!peerInstructions?.drawio||!peerInstructions?.excalidraw)throw new Error('Both real peer tool instruction texts are required');
 const corpus=JSON.parse(fs.readFileSync(path.join(root,'benchmarks/diagram-quality/corpus.json'),'utf8'));
 const tasks=['architecture-01','workflow-01','architecture-04','workflow-04'];
 const arms=[{arm:'Archify Skill',format:'archify'},{arm:'直接 Mermaid',format:'mermaid'},{arm:'直接 SVG',format:'svg'},{arm:'直接 HTML',format:'html'},{arm:'Next AI Draw.io MCP',format:'drawio'},{arm:'Excalidraw MCP',format:'excalidraw'}];
 const documents=new Map();
 const docText=type=>archifyDocs(type).map(file=>{
  const text=fs.readFileSync(path.join(root,file),'utf8');documents.set(file,{path:file,sha256:sha256(text),bytes:Buffer.byteLength(text)});return `\n<actual-reference path="${file}">\n${text}\n</actual-reference>\n`;
 }).join('');
 const entries=tasks.flatMap((id,i)=>{
  const task=corpus.tasks.find(t=>t.id===id),order=arms.slice(i%arms.length).concat(arms.slice(0,i%arms.length));
  return order.map(({arm,format})=>{
   let instruction=direct[format];
   if(format==='archify')instruction='Use the actual Archify Skill and references below. The common host executes finalize '+task.type+' candidate.json diagram.html --quality showcase --json in the candidate directory. Use meta.output="diagram.html" and recommended fresh-source contracts. Native diagnostics/advisory placement feedback can consume the common two-repair allowance. Full references are preloaded without truncation, not replaced by this host description.\n'+docText(task.type);
   if(format==='drawio')instruction=peerInstructions.drawio+'\nHost submission interface: your raw output is the xml argument sent unchanged to actual create_new_diagram, followed by actual export_diagram. Return XML only, not a JSON argument wrapper. Each repair replaces the complete candidate; no manual XML repair is done by the host. Use ordinary rectangular nodes and label-bearing directed edges.';
   if(format==='excalidraw')instruction=peerInstructions.excalidraw+'\nHost submission interface: return the complete JSON elements array for the actual create_view call. The actual Excalidraw App renders it and preserves its editable scene. Use labeled rectangles and labeled single-headed arrows, native styles; assign explicit integer seeds for repeatable geometry. Each repair is a new complete candidate with a fresh checkpoint.';
   return {taskId:id,taskType:task.type,complexity:task.complexity,split:task.split,arm,format,model:'deepseek-flash',repeat:1,messages:[{role:'system',content:'You author editable diagrams using the supplied real tool documentation and a common bounded submission host. Treat source examples as syntax examples, never as task facts.'},{role:'user',content:task.prompt+'\n\n'+shared+'\n\n'+instruction}]};
  });
 });
 return {kind:'real-recommended-workflow-peer-rerun',createdDate:'2026-10-22',model:'deepseek-flash',configuration:{temperature:.2,thinking:{type:'disabled'},max_tokens:8192,stream:false},budget:structuredClone(PEER_BUDGET),tasks,arms,entries,documents:[...documents.values()],peerInstructionHashes:{drawio:sha256(peerInstructions.drawio),excalidraw:sha256(peerInstructions.excalidraw)},sourceIdentities,selection:'four public provisional development/calibration tasks; one trial each; not a statistical or general ranking',host:'actual full-document preload + native source submission/diagnosis, same two-repair allowance; not an unmodified vendor AI application',stop:'native accepted AND independent semantic/geometry/editability pass, absent native required placement advice; otherwise budget/candidate bound',firstTrack:'first generation only, first native delivery time and first-call usage',finalTrack:'all generation/repair usage, retained final native-accepted candidate; final selection/delivery time includes failed repairs and intermediate feedback waiting'};
}

export function repairFeedback({native,semantic,geometry,unknownReasons=[],editability,observedGraph,observation,expected}){
 const names=new Map((observedGraph?.nodes??[]).map(n=>[n.id,n.label]));
 const visibleMeasurements=observation?{scale:observation.scale??null,minimumFontPx:12,bounds:observation.bounds,nodes:observation.nodes?.map(n=>({id:n.id,label:n.label??names.get(n.id),rect:n.rect,fontSize:n.fontSize})),edges:observation.edges?.map(e=>({from:e.from,to:e.to,fromLabel:names.get(e.from),toLabel:names.get(e.to),label:e.label,points:(e.points??[]).filter((_p,i,a)=>i===0||i===a.length-1||i%Math.max(1,Math.ceil(a.length/16))===0)}))}:null;
 return JSON.stringify({native,semantic:semantic?{status:semantic.status,passed:semantic.passed,violations:semantic.violations}:null,geometry:geometry?{status:geometry.status,passed:geometry.passed,violations:geometry.violations}:null,editability:editability?{status:editability.status,passed:editability.passed,unknownReasons:editability.unknownReasons}:null,requiredNodeNames:expected?Object.fromEntries(expected.nodes.map(n=>[n.key??n.id,n.label])):null,visibleMeasurements,unknownReasons,action:'Submit a complete replacement source fixing the measured issues, preserving all required facts. If the previous candidate already passed, no changes are necessary.'});
}
