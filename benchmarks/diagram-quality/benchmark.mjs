#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSource } from './adapters.mjs';
import { aggregateRuns, attachHumanReview } from './records.mjs';
import { renderReport } from './report.mjs';
import { sha256, evaluatorHash, checkCorpus, verifyFiles, ablate } from './verification.mjs';
export { sha256, evaluatorHash, checkCorpus, verifyFiles, probeEditability, ablate } from './verification.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const hashFile = file => sha256(fs.readFileSync(file));
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function save(file, value) { fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); }

const allowed = { check: ['manifest'], verify: ['manifest', 'task', 'source', 'format', 'type', 'artifact', 'run', 'chrome', 'observation', 'screenshot', 'output'], report: ['manifest', 'results', 'output','corpus','track','legacy'], review: ['receipt', 'review', 'output'], ablate: ['receipt', 'manifest', 'source', 'format', 'output'],
  run:['experiment','output','track','chrome','reviews','score-only','baseline','machine'],
  score:['results','manifest','output','corpus','track','chrome','reviews','score-only','baseline','machine'],
  demo:['output','chrome','machine'],
};
export async function main(argv) {
  const [command, ...args] = argv, options = {};
  if (!allowed[command]) throw Object.assign(new Error('Usage: benchmark.mjs run|score|demo|check|verify|report|review|ablate --option value'), { code: 'USAGE' });
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.slice(2);
    if (!args[i]?.startsWith('--') || !allowed[command].includes(key) || options[key] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw Object.assign(new Error('Unknown, duplicate or missing option: ' + args[i]), { code: 'USAGE' });
    options[key] = args[i + 1];
  }
  const required = { check: [], verify: ['task', 'source', 'format', 'artifact', 'run'], report: ['manifest', 'results', 'output'], review: ['receipt', 'review', 'output'], ablate: ['receipt', 'source', 'format', 'output'],run:['experiment','output'],score:['results','manifest','output'],demo:['output'] };
  for (const field of required[command]) if (!options[field]) throw Object.assign(new Error('Missing --' + field), { code: 'USAGE' });
  if(['run','score','demo'].includes(command)) {
    const module=await import('./score-command.mjs');
    const result=await (command==='run'?module.runExperiment:command==='score'?module.scoreFromFiles:module.createDemo)(options);
    if(options['score-only']==='true')return {optimizerScore:module.optimizerScore(result,options.baseline),scorecard:result.scorecard};
    return result;
  }
  if (command === 'check') return checkCorpus(read(options.manifest || path.join(here, 'corpus.json')));
  if (command === 'verify') return verifyFiles(options);
  if (command === 'review') { const result = attachHumanReview(read(options.receipt), read(options.review)); save(options.output, result); return result; }
  if (command === 'report') {
    const manifest = read(options.manifest), receipts = fs.readFileSync(options.results, 'utf8').split('\n').filter(s => s.trim()).map(s => JSON.parse(s));
    const result = aggregateRuns(receipts, { manifest });
    if(options.legacy==='true')save(options.output,renderReport(result));
    else {
      const {scoreRun,aggregateScorecards}=await import('./scoring.mjs'),{renderScoreReport}=await import('./score-report.mjs');
      const corpus=read(options.corpus||path.join(here,'corpus.json'));
      const rows=receipts.map(receipt=>{const task=corpus.tasks.find(t=>t.id===receipt.taskId);requireValue(task,'Unknown score task');return scoreRun({task,receipt});});
      result.scorecard=aggregateScorecards(rows,{plannedRuns:manifest.plannedRuns});
      save(options.output,renderScoreReport(result.scorecard,{track:options.track||'auto'}));
    }
    return result;
  }
  const corpus = read(options.manifest || path.join(here, 'corpus.json')), receipt = read(options.receipt), task = corpus.tasks.find(t => t.id === receipt.taskId);
  requireValue(task, 'Unknown receipt task');
  requireValue(receipt.sourceHash === hashFile(options.source), 'Ablation source digest mismatch');
  requireValue(receipt.identity.manifestHash === hashFile(options.manifest || path.join(here, 'corpus.json')) && receipt.identity.profileHash === sha256(JSON.stringify(corpus.profile)) && receipt.identity.evaluatorHash === evaluatorHash(), 'Ablation identity mismatch');
  const result = ablate(receipt, task, parseSource(options.format, fs.readFileSync(options.source, 'utf8'), { type: task.type }), corpus.profile); save(options.output, result); return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result=await main(process.argv.slice(2)),command=process.argv[2];
    if(result.optimizerScore!==undefined)console.log(result.optimizerScore);
    else if(['run','score','demo'].includes(command) && !process.argv.includes('--machine')) {
      const track=process.argv.includes('full')||command==='demo'?'comprehensive':'automatic';
      console.log(track==='comprehensive'?'综合评分（0–100）':'自动评分（0–100）');
      for(const method of result.scorecard.methods) {
        const value=method[track];
        console.log(method.arm+' / '+method.model+': '+(value==null?'待完成':value.toFixed(1))+' 分');
        console.log('  内容 '+(method.scores.content?.toFixed(1)??'未测')+' · 布局 '+(method.scores.layout?.toFixed(1)??'未测')+' · 速度 '+(method.scores.speed?.toFixed(1)??'未测')+' · 成本 '+(method.scores.cost?.toFixed(1)??'未测')+' · 人评 '+(method.scores.human?.toFixed(1)??'待评'));
        console.log('  每题均值：'+(method.raw.deliveryDurationMs==null?'交付耗时未测':'交付 '+(method.raw.deliveryDurationMs/1000).toFixed(2)+' 秒')+' · '+(method.raw.durationMs==null?'完整运行耗时未测':'完整运行 '+(method.raw.durationMs/1000).toFixed(2)+' 秒')+' · '+(method.raw.totalTokens==null?'tokens 未测':method.raw.totalTokens.toFixed(1)+' tokens')+' · '+(method.raw.costUsd==null?'费用未测':'USD '+method.raw.costUsd.toFixed(4)));
      }
      console.log('成绩单：'+result.outputDir+'/index.html');
    } else console.log(JSON.stringify(result));
  }
  catch (error) { console.log(JSON.stringify({ error: { code: error.code === 'USAGE' ? 'USAGE' : 'INVALID_MEASUREMENT', message: error.message } })); process.exitCode = 2; }
}
