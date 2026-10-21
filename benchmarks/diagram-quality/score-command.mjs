import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyFiles, sha256, evaluatorHash } from './verification.mjs';
import { evaluateRun, aggregateRuns, attachHumanReview } from './records.mjs';
import { SCORE_PROFILE, scoreRun, aggregateScorecards, weightSensitivity } from './scoring.mjs';
import { renderScoreReport, renderScoreChart, renderReviewForm, scoreCSV } from './score-report.mjs';
import { parseSource } from './adapters.mjs';
import { ChromeVisualBrowser, findChrome } from '../../archify/bin/visual-check.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(here,'../..');
const defaultCorpus=path.join(here,'corpus.json');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>fs.writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx'});
function requireValue(ok,message){if(!ok)throw new Error(message);}
function outputDirectory(directory) {
 const out=path.resolve(directory);
 if(fs.existsSync(out)) requireValue(!fs.lstatSync(out).isSymbolicLink() && fs.statSync(out).isDirectory() && fs.readdirSync(out).length===0,'Output directory must be new or empty');
 else fs.mkdirSync(out,{recursive:true});
 return out;
}
function corpusTask(corpus,id){const task=corpus.tasks.find(t=>t.id===id);requireValue(task,'Unknown corpus task: '+id);return task;}
function applyReviews(receipts,reviewFile) {
 if(!reviewFile)return receipts;
 const input=read(reviewFile),reviews=Array.isArray(input)?input:input.reviews;
 requireValue(Array.isArray(reviews),'Review import needs {reviews:[]}');
 const used=new Set();
 const result=receipts.map(receipt=>{
  let updated=receipt;
  reviews.forEach((review,index)=>{if(review.taskId===receipt.taskId && review.artifactHash===receipt.artifactHash){updated=attachHumanReview(updated,review);used.add(index);}});
  return updated;
 });
 requireValue(used.size===reviews.length,'Review refers to an unknown task/artifact; old ratings cannot follow changed artifacts');
 return result;
}
export async function capturePage(file,output,{chromePath,board=false}={}) {
 const browser=new ChromeVisualBrowser(chromePath||findChrome());
 try {
  const session=await browser.sessionPromise,send=(method,params={})=>browser.cdp.send(method,params,session);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*','ws://*','wss://*']});
  const loaded=browser.cdp.waitFor('Page.loadEventFired',session);loaded.catch(()=>{});
  await send('Page.navigate',{url:pathToFileURL(path.resolve(file)).href});await loaded;
  const result=await send('Runtime.evaluate',{expression:`(async()=>{await document.fonts.ready;const e=${board?"document.querySelector('.diagram-container > svg') || document.querySelector('svg')":"document.querySelector('main') || document.body"};if(!e)throw Error('Missing screenshot surface');const r=e.getBoundingClientRect();return {x:Math.max(0,r.x+scrollX),y:Math.max(0,r.y+scrollY),width:r.width,height:r.height,scale:1};})()`,awaitPromise:true,returnByValue:true});
  requireValue(!result.exceptionDetails,'Screenshot surface failed');
  const clip=result.result.value;
  requireValue(clip.width>0 && clip.height>0 && clip.width<=20000 && clip.height<=20000,'Invalid screenshot bounds');
  const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});
  fs.writeFileSync(output,Buffer.from(screenshot.data,'base64'),{flag:'wx'});
 } finally {await browser.close();}
}
export async function exportScorecard({receipts,manifest,corpus,outputDir,track='auto',chromePath,notice='',reviewsFile,copyFrom}) {
 requireValue(['auto','full'].includes(track),'track must be auto or full');
 const out=outputDirectory(outputDir),reviewed=applyReviews(receipts,reviewsFile);
 const legacy=aggregateRuns(reviewed,{manifest});
 const rows=reviewed.map(receipt=>{
  const row=scoreRun({task:corpusTask(corpus,receipt.taskId),receipt});
  row.semanticDefects=receipt.objective?.semantic?.violations??[];
  return row;
 });
 const scorecard=aggregateScorecards(rows,{plannedRuns:manifest.plannedRuns});
 fs.mkdirSync(path.join(out,'artifacts'));
 for(const receipt of reviewed) {
  if(!receipt.artifactHash || !receipt.artifactPath || !copyFrom)continue;
  const source=copyFrom(receipt);
  if(source && fs.existsSync(source)) {
   requireValue(sha256(fs.readFileSync(source))===receipt.artifactHash,'Artifact digest changed after verification');
   const target=path.join(out,'artifacts',receipt.artifactHash+'.html');
   if(!fs.existsSync(target))fs.copyFileSync(source,target);
   receipt.artifactPath='artifacts/'+receipt.artifactHash+'.html';
   if(chromePath||findChrome()) {
    const shot=path.join(out,'artifacts','preview-'+receipt.artifactHash+'.png');
    await capturePage(target,shot,{chromePath,board:true});
    const hash=sha256(fs.readFileSync(shot)),imagePath='artifacts/'+hash+'.png';
    if(!fs.existsSync(path.join(out,imagePath)))fs.renameSync(shot,path.join(out,imagePath));else fs.rmSync(shot);
    receipt.reviewImage={hash,path:imagePath};
   }
  } else {
   receipt.artifactPath=null;
   const row=scorecard.rows.find(r=>r.runId===receipt.runId);if(row)row.artifactPath=null;
  }
 }
 write(path.join(out,'receipts.jsonl'),reviewed.map(r=>JSON.stringify(r)).join('\n')+'\n');
 write(path.join(out,'experiment-plan.json'),manifest);
 write(path.join(out,'scorecard.json'),scorecard);
 write(path.join(out,'scores.csv'),scoreCSV(scorecard,{track}));
 write(path.join(out,'index.html'),renderScoreReport(scorecard,{track,notice,reviewLink:'review.html'}));
 write(path.join(out,'chart.html'),renderScoreChart(scorecard,{track,title:'绘图 Benchmark 总分'}));
 write(path.join(out,'review.html'),renderReviewForm({receipts:reviewed.filter(r=>r.artifactPath),tasks:corpus.tasks,seed:manifest.identity.manifestHash}));
 write(path.join(out,'weight-sensitivity.json'),weightSensitivity(scorecard,{track}));
 if(chromePath||findChrome())await capturePage(path.join(out,'chart.html'),path.join(out,'scores.png'),{chromePath});
 return {...legacy,scorecard,outputDir:out};
}
export async function scoreFromFiles(options) {
 const corpus=read(options.corpus||defaultCorpus),manifest=read(options.manifest),base=path.dirname(path.resolve(options.results));
 const receipts=fs.readFileSync(options.results,'utf8').split('\n').filter(s=>s.trim()).map(s=>JSON.parse(s));
 requireValue(manifest.identity?.manifestHash===sha256(fs.readFileSync(options.corpus||defaultCorpus)),'Score corpus digest mismatch');
 return exportScorecard({receipts,manifest,corpus,outputDir:options.output,track:options.track||'auto',chromePath:options.chrome,reviewsFile:options.reviews,copyFrom:receipt=>{
  const relative=receipt.artifactPath;
  if(!relative || !/^[a-zA-Z0-9_./-]+$/.test(relative) || path.isAbsolute(relative) || relative.split('/').includes('..'))return null;
  return path.resolve(base,relative);
 }});
}
export async function runExperiment(options) {
 const experimentFile=path.resolve(options.experiment),experiment=read(experimentFile),base=path.dirname(experimentFile);
 requireValue(Array.isArray(experiment.entries)&&experiment.entries.length>0,'Experiment requires entries');
 const corpusFile=path.resolve(base,experiment.corpus||path.relative(base,defaultCorpus)),corpus=read(corpusFile);
 const out=path.resolve(options.output);
 requireValue(!fs.existsSync(out)||(!fs.lstatSync(out).isSymbolicLink()&&fs.statSync(out).isDirectory()&&fs.readdirSync(out).length===0),'Output directory must be new or empty');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'archify-score-run-')),receipts=[],artifacts=new Map();
 try {
  for(let i=0;i<experiment.entries.length;i++) {
   const entry=experiment.entries[i],task=corpusTask(corpus,entry.taskId),raw=typeof entry.run==='string'?read(path.resolve(base,entry.run)):structuredClone(entry.run);
   requireValue(raw && raw.taskId===task.id,'Entry requires matching run taskId');
   const identity={manifestHash:sha256(fs.readFileSync(corpusFile)),evaluatorHash:evaluatorHash(),profileHash:sha256(JSON.stringify(corpus.profile)),budget:raw.identity?.budget||experiment.budget||{}};
   for(const field of ['manifestHash','evaluatorHash','profileHash'])if(raw.identity?.[field])requireValue(raw.identity[field]===identity[field],'Run identity '+field+' differs from current inputs');
   if(raw.status && raw.status!=='completed') {
    requireValue(['timeout','no_candidate','provider_error'].includes(raw.status),'Unknown terminal failure');
    const receipt=evaluateRun({task,run:{...raw,identity,candidates:raw.candidates||[]},profile:corpus.profile,graph:{status:'unverified'},observation:{status:'unverified'}});
    receipts.push(receipt);continue;
   }
   requireValue(entry.source && entry.format,'Completed entries require source and format');
   let source=path.resolve(base,entry.source),artifact=entry.artifact?path.resolve(base,entry.artifact):path.join(temp,'artifact-'+i+'.html');
   const sourceText=fs.readFileSync(source,'utf8'),parsed=parseSource(entry.format,sourceText,{type:task.type});
   if(parsed.status==='invalid') {
    const receipt=evaluateRun({task,run:{...raw,identity,status:'no_candidate',artifactHash:undefined,candidates:[]},profile:corpus.profile,graph:parsed,observation:{status:'unverified'}});
    receipt.sourceHash=sha256(fs.readFileSync(source));
    receipt.failureReason='源码无法解析：'+parsed.unknownReasons.join(', ');
    receipts.push(receipt);continue;
   }
   if(!entry.artifact) {
    requireValue(entry.format==='archify','Other formats require the externally rendered artifact');
    const render=spawnSync(process.execPath,[path.join(root,'archify/bin/archify.mjs'),'render',task.type,source,artifact],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
    if(render.status!==0 || !fs.existsSync(artifact)) {
     const validation=spawnSync(process.execPath,[path.join(root,'archify/bin/archify.mjs'),'validate',task.type,source,'--json'],{cwd:temp,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
     let diagnosis;try{diagnosis=JSON.parse(validation.stdout);}catch{}
     const inputFailure=validation.status===1 && diagnosis?.command==='validate' && diagnosis.ok===false && diagnosis.diagnostics?.length>0 && !diagnosis.diagnostics.some(d=>/input\/(?:read|not-found)|internal|spawn|dependency/.test(d.code));
     requireValue(inputFailure,'Render/evaluation infrastructure failed: '+(render.stderr||render.stdout));
     const receipt=evaluateRun({task,run:{...raw,identity,status:'no_candidate',artifactHash:undefined,candidates:[]},profile:corpus.profile,graph:{status:'invalid'},observation:{status:'unverified'}});
     receipt.failureReason='源码未通过验证：'+diagnosis.diagnostics.map(d=>d.code).join(', ');
     receipt.validation=diagnosis;receipts.push(receipt);continue;
    }
   }
   const artifactHash=sha256(fs.readFileSync(artifact));
   requireValue(!raw.artifactHash || raw.artifactHash===artifactHash,'Artifact digest mismatch');
   const run={...raw,identity,artifactHash,artifactPath:'artifacts/'+artifactHash+'.html'};
   if(!run.candidates?.length) {
    requireValue(raw.completedAt || raw.environment?.measurementMode==='offline-render','Generation runs require recorded completion/submission timestamp');
    const submittedAt=raw.completedAt || new Date().toISOString();
    run.candidates=[{submittedAt,artifactHash}];run.completedAt=submittedAt;
   }
   const runFile=path.join(temp,'run-'+i+'.json');write(runFile,run);
   const receipt=await verifyFiles({manifest:corpusFile,task:task.id,source,format:entry.format,artifact,run:runFile,chrome:options.chrome});
   receipts.push(receipt);artifacts.set(receipt.artifactHash,artifact);
  }
  const plannedRuns=experiment.plannedRuns||receipts.map(({taskId,arm,model,repeat,taskType,complexity})=>({taskId,arm,model,repeat,taskType,complexity}));
  const manifest={identity:receipts[0].identity,plannedRuns};
  return await exportScorecard({receipts,manifest,corpus,outputDir:out,track:options.track||'auto',chromePath:options.chrome,reviewsFile:options.reviews,notice:experiment.notice||'',copyFrom:r=>artifacts.get(r.artifactHash)});
 } finally {fs.rmSync(temp,{recursive:true,force:true});}
}
export async function createDemo(options) {
 const out=outputDirectory(options.output),temp=fs.mkdtempSync(path.join(os.tmpdir(),'archify-score-demo-'));
 try {
  const corpus=read(defaultCorpus),entries=[
   {taskId:'architecture-02',source:path.join(here,'examples/weather.architecture.json'),format:'archify'},
   {taskId:'workflow-01',source:path.join(here,'examples/access.workflow.json'),format:'archify'},
  ].map((entry,i)=>({...entry,run:{runId:'offline-render-'+i,taskId:entry.taskId,arm:'Archify 离线样图',model:'无模型调用',repeat:1,status:'completed',startedAt:new Date().toISOString(),environment:{measurementMode:'offline-render'},sourceEvidence:'Hand-authored render fixture; generation timing, provider usage and human judgments unmeasured',identity:{budget:{maxCandidates:1,maxDurationMs:60000}}}}));
  const experiment=path.join(temp,'experiment.json');
  write(experiment,{corpus:defaultCorpus,entries,notice:'真实离线渲染：只测内容和布局；生成时间、实际模型费用与人工观感未测量。'});
  const offline=await runExperiment({experiment,output:path.join(out,'offline'),chrome:options.chrome,track:'auto'});
  const row=offline.scorecard.rows[0],synthetic=[{arm:'方案 A（示例）',scores:{content:100,layout:85,speed:70,cost:80,human:88}},{arm:'方案 B（示例）',scores:{content:100,layout:65,speed:80,cost:75,human:60}}].map((item,i)=>({
   ...structuredClone(row),...item,runId:'synthetic-arithmetic-'+i,model:'虚构算术示例，非实测',taskId:'arithmetic-example',repeat:1,status:'complete',knownFailure:false,missing:[],human:{count:2,required:2,complete:true},raw:{deliveryDurationMs:null,durationMs:null,totalTokens:null,costUsd:null},automatic:null,comprehensive:null,artifactHash:null,artifactPath:null,layoutDetails:{notice:'虚构算术分项，不对应真实图的几何测量'},
  }));
  const manifest={identity:row.identity,plannedRuns:synthetic.map(({taskId,arm,model,repeat})=>({taskId,arm,model,repeat}))};
  const fake=aggregateScorecards(synthetic,{plannedRuns:manifest.plannedRuns});fake.dataKind='synthetic-arithmetic';
  write(path.join(out,'scorecard.json'),fake);
  write(path.join(out,'scores.csv'),scoreCSV(fake,{track:'full'}));
  let html=renderScoreReport(fake,{track:'full',title:'Benchmark 计分演示',notice:'示意数据，非工具实测。方案 A/B 只演示固定权重的算术和成绩单；不能作为 Archify 的性能结论。'});
  html=html.replace('<section aria-label="主要成绩">','<p class="metadata"><a href="offline/index.html">查看两张真实离线样图的内容 / 布局分</a> · <a href="review.html">打开真实样图的匿名人工评分表</a></p><section aria-label="主要成绩">');
  write(path.join(out,'index.html'),html);
  write(path.join(out,'chart.html'),renderScoreChart(fake,{track:'full',title:'计分演示 · 示意，非实测'}));
  write(path.join(out,'weight-sensitivity.json'),weightSensitivity(fake,{track:'full'}));
  fs.mkdirSync(path.join(out,'artifacts'));fs.cpSync(path.join(out,'offline','artifacts'),path.join(out,'artifacts'),{recursive:true});
  fs.copyFileSync(path.join(out,'offline','review.html'),path.join(out,'review.html'));
  if(options.chrome||findChrome())await capturePage(path.join(out,'chart.html'),path.join(out,'scores.png'),{chromePath:options.chrome});
  return {scorecard:fake,offline:offline.scorecard,outputDir:out};
 } finally {fs.rmSync(temp,{recursive:true,force:true});}
}
export function optimizerScore(result,baselineFile) {
 const card=result.scorecard||result,methods=card.methods;
 requireValue(methods.length===1 && Number.isFinite(methods[0].automatic),'Optimizer needs one complete automatic score');
 if(!baselineFile)requireValue(card.rows.every(r=>r.scores.content===100&&!r.knownFailure),'Optimizer requires complete correct content, or an explicit baseline');
 else {
  const baseline=read(baselineFile);
  requireValue(baseline.scoreVersion===card.scoreVersion,'Optimizer baseline score version differs');
  const key=r=>JSON.stringify([r.taskId,r.arm,r.model,r.repeat]),old=new Map(baseline.rows.map(r=>[key(r),r]));
  requireValue(old.size===card.rows.length,'Optimizer baseline workload differs');
  for(const row of card.rows) {
   const previous=old.get(key(row));requireValue(previous && JSON.stringify(previous.identity)===JSON.stringify(row.identity),'Optimizer baseline identity differs');
   requireValue(Array.isArray(previous.semanticDefects)&&Array.isArray(row.semanticDefects),'Baseline must contain semantic retention evidence');
   const defects=new Set(previous.semanticDefects.map(v=>JSON.stringify(v)));
   requireValue(row.scores.content>=previous.scores.content && row.semanticDefects.every(v=>defects.has(JSON.stringify(v))),'Optimizer would lose previously correct facts');
  }
 }
 return methods[0].automatic;
}
