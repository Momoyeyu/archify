import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256,evaluatorHash,verifyFiles} from './verification.mjs';
import {evaluateRun} from './records.mjs';
import {evaluateSemantics} from './metrics.mjs';
import {parseSource} from './adapters.mjs';
import {observePortableArtifact} from './portable-browser.mjs';
import {renderPilotSource} from './pilot-render.mjs';
import {exportScorecard} from './score-command.mjs';
import {renderScoreReport} from './score-report.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const requireValue=(ok,message)=>{if(!ok)throw new Error(message);};
const write=(p,v)=>fs.writeFileSync(p,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n',{flag:'wx'});
const integer=v=>Number.isInteger(v)&&v>=0;
export const DEEPSEEK_TARIFF={currency:'USD',model:'deepseek-flash',modelVersion:'DeepSeek-V4.1-Flash-1017',window:'off-peak',perMillion:{cachedInput:.003,input:.15,output:.6},source:'https://api-docs.deepseek.com/quick_start/pricing/',retrieved:'2026-10-21'};
export function deepseekUsage(raw={},tariff=DEEPSEEK_TARIFF) {
 const input=raw.prompt_tokens,output=raw.completion_tokens,hit=raw.prompt_cache_hit_tokens??raw.prompt_tokens_details?.cached_tokens;
 const miss=raw.prompt_cache_miss_tokens??(integer(input)&&integer(hit)?input-hit:null);
 requireValue(input==null||integer(input),'Invalid input accounting');requireValue(output==null||integer(output),'Invalid output accounting');
 if(integer(input)&&integer(hit)&&integer(miss))requireValue(hit+miss===input,'Cache accounting does not equal prompt tokens');
 if(raw.total_tokens!=null&&integer(input)&&integer(output))requireValue(raw.total_tokens===input+output,'Total token accounting mismatch');
 const complete=[input,output,hit,miss].every(integer);
 const costUsd=complete?(hit*tariff.perMillion.cachedInput+miss*tariff.perMillion.input+output*tariff.perMillion.output)/1e6:null;
 return {inputTokens:input??null,outputTokens:output??null,cachedInputTokens:hit??null,reasoningTokens:raw.completion_tokens_details?.reasoning_tokens??null,cachedIncludedInInput:true,reasoningIncludedInOutput:true,costUsd,complete,costBasis:{kind:'provider-usage-times-official-tariff',tariff,cacheMissTokens:miss,providerUsage:raw}};
}
export function extractCandidate(raw) {
 try {
 requireValue(typeof raw==='string'&&raw.trim(),'Model returned no source');
 const text=raw.trim();if(!text.startsWith('```'))return {text,outerFenceRemoved:false};
 requireValue((text.match(/^```/gm)||[]).length===2,'Multiple or incomplete source fences');
 const match=text.match(/^```[\w-]*\s*\n([\s\S]*?)\n```$/);requireValue(match,'Invalid outer source fence');
 return {text:match[1],outerFenceRemoved:true};
 }catch(error){error.code='PILOT_SOURCE_INVALID';throw error;}
}
const escapeRegex=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function editPortableSource(source,format,label,replacement) {
 const name=escapeRegex(label),pattern=format==='mermaid'?new RegExp('(\\[\\s*"?)'+name+'("?\\s*\\])','g'):new RegExp('(>\\s*)'+name+'(\\s*<)','g');
 const matches=[...source.matchAll(pattern)];if(matches.length!==1)return null;
 return source.replace(pattern,(_all,left,right)=>left+replacement+right);
}
const facts=g=>({nodes:g.nodes.map(({id,label})=>({id,label})),edges:g.edges.map(({from,to,label})=>({from,to,label}))});
export async function probePilotEditability({source,format,type,measured,chromePath,runtimeRoot}) {
 const first=measured.graph.nodes[0];if(!first)return {status:'unverified',passed:false,method:'portable-reload-edit-render',unknownReasons:['No visible editable node']};
 const sentinel=first.label+' EDIT',edited=editPortableSource(fs.readFileSync(source,'utf8'),format,first.label,sentinel);
 if(edited===null)return {status:'unverified',passed:false,method:'portable-reload-edit-render',unknownReasons:['No unique supported visible source label for editing']};
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'archify-pilot-edit-'));
 try {
  const input=path.join(temp,'source.'+({mermaid:'mmd',svg:'svg',html:'html'}[format])),output=path.join(temp,'edited.html');write(input,edited);
  await renderPilotSource({format,type,source:input,output,chromePath,runtimeRoot});
  const after=await observePortableArtifact({artifactPath:output,chromePath}),expected=facts(measured.graph);expected.nodes[0].label=sentinel;
  const semantic=evaluateSemantics(expected,after.graph,after.observation);
  return {status:semantic.status,passed:semantic.status==='verified'&&semantic.passed,method:'portable-reload-edit-render',editedNode:first.id,unknownReasons:[...after.graph.unknownReasons,...after.observation.unknownReasons],semantic};
 } finally {fs.rmSync(temp,{recursive:true,force:true});}
}
export async function gradePilotRun({task,source,format,artifact,run,corpusFile,chromePath,runtimeRoot,output}) {
 if(format==='archify') {
  const runFile=path.join(path.dirname(source),'run-for-verification.json');write(runFile,run);
  const receipt=await verifyFiles({task:task.id,manifest:corpusFile,source,format,artifact,run:runFile,chrome:chromePath});
  if(output)write(output,receipt);return receipt;
 }
 const corpus=JSON.parse(fs.readFileSync(corpusFile,'utf8')),measured=await observePortableArtifact({artifactPath:artifact,chromePath});
 if(format==='mermaid') {
  const native=parseSource('mermaid',fs.readFileSync(source,'utf8'));
  const correspondence=evaluateSemantics(facts(native),measured.graph,measured.observation);
  if(native.status!=='verified'||correspondence.status!=='verified'||!correspondence.passed){measured.graph.status='unverified';measured.graph.unknownReasons.push('Native Mermaid facts differ from independently visible topology');}
 }
 const editability=await probePilotEditability({source,format,type:task.type,measured,chromePath,runtimeRoot});
 const receipt=evaluateRun({task,run,graph:measured.graph,observation:measured.observation,profile:corpus.profile,editability});
 receipt.observation=measured.observation;receipt.visibleGraph=measured.graph;receipt.grader={method:'portable-visible-topology-and-independent-edit',browserProfileCleaned:true};
 if(output)write(output,receipt);return receipt;
}

function guide(task,format) {
 const common='Deliver a clean, readable diagram. Preserve all required node names and edge labels exactly. No explanatory prose, title/legend decoration, icons or extra nodes. Return only the raw source, no Markdown fence. Do not add hidden topology metadata to rendered SVG/HTML. The display board is 1280 by 720. Use readable text and avoid overlaps. This is one candidate: there is no feedback or repair round.';
 if(format==='archify')return common+'\nUse native Archify JSON, schema_version:1, diagram_type:'+task.type+'. meta:{title:"Diagram",output:"diagram.html",animation:"none"}. Components/nodes have id,type,label; supported types frontend/backend/database/cloud/security/messagebus/external. '+(task.type==='architecture'?'Use components:[{id,type,label,pos:[x,y],size:[width,height]}] and connections:[{from,to,label}]. Optional connection fromSide/toSide are left/right/top/bottom; via:[[x,y],...] is supported. Node coordinates are top-left.':'Use lanes:[{id,label}] and nodes:[{id,lane,col,type,label}], edges:[{from,to,label}]. All lane IDs must exist, col is an integer>=0. Optional edge route: drop/outside-right; fromSide/toSide:left/right/top/bottom. Arrange columns/lanes to keep the branch readable.');
 if(format==='mermaid')return common+'\nUse Mermaid flowchart LR or TD. Declare each rectangular node separately with ID["label"]. Put each directed edge on a separate line: ID -->|label| ID. No subgraphs, chains, style directives, frontmatter, HTML labels or click handlers. The pinned Mermaid renderer uses native default styling and htmlLabels:false.';
 const constraints=' Every connector is a visible SVG path/line/polyline with fill="none", stroke, and a local marker-end; no marker-start. Marker is one right-pointing triangle in its own coordinates, orient="auto". Endpoints touch the appropriate node border within 10px. Each edge label is plain SVG text close to its own route. No scripts/events, external refs, transforms on marker children, clipping/masks/filters, animations, legends or grouping boxes. Avoid duplicate routes and ambiguous label placement.';
 if(format==='svg')return common+'\nReturn standalone SVG xmlns="http://www.w3.org/2000/svg", width="1280", height="720", viewBox="0 0 1280 720". Each node is one visible axis-aligned rect and one plain text label contained inside one g. Use only rectangular nodes.'+constraints;
 return common+'\nReturn a full static HTML document. Use one positioned board div of1280x720. Each node is one positioned leaf div with a visible border and plain text; do not use SVG nodes. Use one board-sized SVG overlay for connectors and edge labels. No other bordered divs or visible text. CSS may style the boxes and text. SVG arrowheads must be triangular.'+constraints;
}
export function pilotProtocol({model='deepseek-flash',corpusFile=path.join(here,'corpus.json')}={}) {
 const corpus=JSON.parse(fs.readFileSync(corpusFile,'utf8')),tasks=['architecture-01','workflow-01'].map(id=>corpus.tasks.find(t=>t.id===id));
 const order=['archify','mermaid','svg','html'],names={archify:'Archify',mermaid:'直接 Mermaid',svg:'直接 SVG',html:'直接 HTML'};
 const entries=tasks.flatMap((task,i)=>(i?[...order].reverse():order).map(format=>({taskId:task.id,taskType:task.type,complexity:task.complexity,arm:names[format],model,repeat:1,format,messages:[{role:'system',content:'You create editable diagrams from requirements. Follow the requested source format precisely.'},{role:'user',content:task.prompt+'\n\n'+guide(task,format)}]})));
 return {kind:'real-single-candidate-shared-task-pilot',model,configuration:{temperature:.2,thinking:{type:'disabled'},max_tokens:8192,stream:false},budget:{maxCandidates:1,maxDurationMs:180000,maxTokens:16384,maxCostUsd:.10},tasks:tasks.map(t=>t.id),entries,pricing:DEEPSEEK_TARIFF,scope:'2 public development tasks, one trial each, simple static rectangle/arrow contract; no manual repair, no significance or general tool ranking claim',corpusFile};
}
function offPeak(date) {const d=new Date(date),weekday=d.getUTCDay(),hour=d.getUTCHours();return weekday===0||weekday===6||!(hour>=1&&hour<4||hour>=6&&hour<10);}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function executePilot({apiKey,baseURL='https://api.deepseek.com',model='deepseek-flash',outputDir,chromePath,runtimeRoot,onProgress=()=>{}}) {
 requireValue(new URL(baseURL).origin==='https://api.deepseek.com','Pilot credentials may only go to configured DeepSeek official origin');
 requireValue(model==='deepseek-flash','Use the explicitly requested fixed model');
 const out=path.resolve(outputDir);requireValue(!fs.existsSync(out),'Pilot output must be new; refuses rerun/overwrite');fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'runs'));
 const protocol=pilotProtocol({model});write(path.join(out,'protocol.json'),protocol);
 const corpus=JSON.parse(fs.readFileSync(protocol.corpusFile,'utf8')),identity={manifestHash:sha256(fs.readFileSync(protocol.corpusFile)),evaluatorHash:sha256(evaluatorHash()+fs.readFileSync(fileURLToPath(import.meta.url))+fs.readFileSync(path.join(here,'portable-browser.mjs'))+fs.readFileSync(path.join(here,'pilot-render.mjs'))),profileHash:sha256(JSON.stringify(corpus.profile)),budget:protocol.budget};
 const manifest={identity,plannedRuns:protocol.entries.map(({taskId,arm,model,repeat,taskType,complexity})=>({taskId,arm,model,repeat,taskType,complexity}))};write(path.join(out,'experiment-plan.json'),manifest);
 const receipts=[],cells=[];
 for(let i=0;i<protocol.entries.length;i++) {
  const entry=protocol.entries[i],task=corpus.tasks.find(t=>t.id===entry.taskId),dir=path.join(out,'runs',String(i+1).padStart(2,'0')+'-'+entry.taskId+'-'+entry.format);fs.mkdirSync(dir);
  const request={model,...protocol.configuration,messages:entry.messages};write(path.join(dir,'request.json'),request);
  const startedAt=new Date().toISOString();requireValue(offPeak(startedAt),'Frozen tariff window changed before dispatch');
  onProgress({index:i+1,total:8,taskId:entry.taskId,arm:entry.arm,status:'dispatch'});
  let response,raw;
  try {response=await fetch(baseURL.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(protocol.budget.maxDurationMs)});raw=await response.json();}
  catch(error){response={ok:false,status:0};raw={error:{type:error.name,message:'Provider transport failed or timed out'}};}
  const modelCompletedAt=new Date().toISOString();write(path.join(dir,'response.json'),raw);
  const usage=deepseekUsage(raw.usage),run={runId:path.basename(dir),taskId:task.id,arm:entry.arm,model,repeat:1,status:'completed',identity,startedAt,modelConfiguration:{...protocol.configuration,endpoint:new URL(baseURL).origin,declaredVersion:DEEPSEEK_TARIFF.modelVersion},sourceEvidence:{kind:'real-provider-response',requestHash:sha256(JSON.stringify(request)),responseHash:sha256(JSON.stringify(raw)),responseId:raw.id??null,reportedModel:raw.model??null,systemFingerprint:raw.system_fingerprint??null,modelCompletedAt},usage,promptHash:sha256(JSON.stringify(entry.messages)),environment:{measurementMode:'real-model-generation',viewport:'1440x900',displayBoard:'1280x720'},candidates:[]};
  const source=path.join(dir,'source.'+({archify:'json',mermaid:'mmd',svg:'svg',html:'html'}[entry.format])),artifact=path.join(dir,'artifact.html');let receipt,renderer,failure;
  if(!response.ok){run.status=raw.error?.type==='TimeoutError'?'timeout':'provider_error';failure='Provider HTTP '+response.status;}
  else {
   try {
    const candidate=extractCandidate(raw.choices?.[0]?.message?.content);write(source,candidate.text);run.sourceHash=sha256(fs.readFileSync(source));run.sourceEvidence.outerFenceRemoved=candidate.outerFenceRemoved;
    renderer=await renderPilotSource({format:entry.format,type:task.type,source,output:artifact,chromePath,runtimeRoot});
    run.artifactHash=sha256(fs.readFileSync(artifact));run.artifactPath='artifacts/'+run.artifactHash+'.html';run.completedAt=new Date().toISOString();run.candidates=[{submittedAt:run.completedAt,artifactHash:run.artifactHash}];
   } catch(error){
    if(error.code!=='PILOT_SOURCE_INVALID'){write(path.join(dir,'harness-error.json'),{stage:'render',run,error:String(error.message).replaceAll(apiKey,'[redacted]')});throw error;}
    run.status='no_candidate';failure=String(error.message).replaceAll(apiKey,'[redacted]');
   }
  }
  if(failure)run.completedAt=new Date().toISOString();write(path.join(dir,'run.json'),run);
  if(failure){receipt=evaluateRun({task,run,graph:{status:'invalid'},observation:{status:'unverified'},profile:corpus.profile});receipt.failureReason=failure;}
  else {
   try {receipt=await gradePilotRun({task,source,format:entry.format,artifact,run:{...run,identity:{...identity,evaluatorHash:entry.format==='archify'?evaluatorHash():identity.evaluatorHash}},corpusFile:protocol.corpusFile,chromePath,runtimeRoot});}
   catch(error){write(path.join(dir,'harness-error.json'),{stage:'grade',error:String(error.message).replaceAll(apiKey,'[redacted]')});throw error;}
  }
  // Every cell shares the pilot evaluator identity after independent verification.
  receipt.grader={...receipt.grader,baseVerifierHash:evaluatorHash(),pilotEvaluatorHash:identity.evaluatorHash};receipt.identity=structuredClone(identity);write(path.join(dir,'receipt.json'),receipt);receipts.push(receipt);cells.push({entry,dir,source,artifact,renderer,failure,receipt});
  write(path.join(dir,'progress.json'),{modelCompletedAt,completedAt:run.completedAt,graderCompletedAt:new Date().toISOString(),status:run.status});
  onProgress({index:i+1,total:8,taskId:entry.taskId,arm:entry.arm,status:run.status,inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,costUsd:usage.costUsd,failure:failure?.slice(0,200)});
 }
 const result=await exportScorecard({receipts,manifest,corpus,outputDir:path.join(out,'report'),track:'auto',chromePath,notice:'真实小样本：DeepSeek Flash 非思考模式，同一2题×4种方式，每格1次首稿。无人评；未人工修图。成本按实际usage与官方非高峰USD费率核算。',copyFrom:r=>cells.find(c=>c.receipt.runId===r.runId)?.artifact});
 const gallery='<section class="section"><h2>真实生成图 · 同题对比</h2><p>点击查看原图或下载原始源码。失败和缺测也保留。</p><div class="pilot-gallery">'+protocol.tasks.map(taskId=>'<h3>'+esc(taskId)+'</h3>'+cells.filter(c=>c.entry.taskId===taskId).map(c=>{const row=result.scorecard.rows.find(r=>r.runId===c.receipt.runId),image=c.receipt.reviewImage;return '<article><h3>'+esc(c.entry.arm)+'</h3><p>自动 '+(row.automatic?.toFixed(1)??'未完成')+' · C '+(row.scores.content?.toFixed(1)??'未测')+' · L '+(row.scores.layout?.toFixed(1)??'未测')+' · T '+(row.scores.speed?.toFixed(1)??'未测')+' · K '+(row.scores.cost?.toFixed(1)??'未测')+'</p>'+(image?'<a href="report/'+esc(c.receipt.artifactPath)+'"><img loading="lazy" src="report/'+esc(image.path)+'" alt="'+esc(taskId+' '+c.entry.arm)+'"></a>':'<p>'+esc(c.failure||row.missing.join(', '))+'</p>')+(fs.existsSync(c.source)?'<a download href="'+esc(path.relative(out,c.source))+'">原始源码</a>':'')+'</article>';}).join('')).join('')+'</div></section>';
 let html=renderScoreReport(result.scorecard,{track:'auto',title:'Archify 与直接绘图 · 真实试跑',notice:'真实API生成；同模型、同2题、每方式首稿1次。保留全部8格，无人工修图。人评未做。费用=实际缓存/输入/输出tokens×2026-10-21官方USD费率，不是账户余额或充值金额。',artifactBase:'report',reviewLink:'report/review.html'});
 html=html.replace('</style>', '.pilot-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.pilot-gallery>h3{grid-column:1/-1}.pilot-gallery article{background:white;border:1px solid #d6e0ea;padding:16px}.pilot-gallery img{width:100%;height:auto}.pilot-gallery p{font-size:14px;margin:8px 0}@media(max-width:760px){.pilot-gallery{grid-template-columns:1fr}}</style>').replace('<section class="section" id="raw-units">',gallery+'<section class="section" id="raw-units">');
 write(path.join(out,'index.html'),html);write(path.join(out,'pilot-summary.json'),{scorecard:result.scorecard,protocol,realModelRequests:8,failedRuns:cells.filter(c=>c.failure).length});
 return {outputDir:out,scorecard:result.scorecard,cells:cells.map(c=>({taskId:c.entry.taskId,arm:c.entry.arm,runId:c.receipt.runId,status:c.receipt.status}))};
}
