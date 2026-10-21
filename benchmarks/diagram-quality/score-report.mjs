import { createHash } from 'node:crypto';

const COMPONENTS = [
 ['content','内容正确','C',45],['layout','布局可读','L',20],
 ['speed','速度效率','T',10],['cost','成本效率','K',10],['human','人工观感','H',15],
];
const RATINGS = [
 ['readability','阅读追踪','文字、节点和连线是否容易阅读与追踪？'],
 ['hierarchy','层级分组','主次关系与分组是否清楚？'],
 ['layout','排版平衡','空间、对齐和疏密是否协调？'],
 ['style','风格一致性','字体、线条、形状与配色是否一致？'],
 ['aesthetics','整体审美','你是否愿意采用这张图？'],
];
const escape = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const score = value => typeof value==='number' && Number.isFinite(value) && value>=0 && value<=100;
const finite = value => typeof value==='number' && Number.isFinite(value) && value>=0;
const number = value => score(value) ? value.toFixed(1) : '未测量';
const rawNumber = (value,digits=0) => finite(value) ? value.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}) : '未测量';
const json = value => JSON.stringify(value).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');

function trackInfo(track) {
 if(!['auto','full'].includes(track)) throw new TypeError('track must be auto or full');
 return track==='auto' ? {key:'automatic',label:'自动分',formula:'(45C + 20L + 10T + 10K) / 85'} : {key:'comprehensive',label:'综合分',formula:'45%C + 20%L + 10%T + 10%K + 15%H'};
}
function componentHeading([key,name,short,weight],track) {
 const displayed=track==='full'?`${weight}%`:key==='human'?'不计':`${(weight/85*100).toFixed(1)}%`;
 return `${name} ${short} ${displayed}`;
}
function methodsOf(scorecard) {
 if(!Array.isArray(scorecard?.methods)) throw new TypeError('scorecard.methods must be an array');
 return scorecard.methods;
}
function orderedMethods(scorecard,track) {
 const {key}=trackInfo(track);
 return [...methodsOf(scorecard)].sort((a,b)=>(score(b[key])?b[key]:-1)-(score(a[key])?a[key]:-1));
}
function relativePath(value) {
 return typeof value==='string' && /^[a-zA-Z0-9_./-]+$/.test(value) && !value.startsWith('/') && !value.split('/').some(part=>!part || part==='..');
}
function digestPath(receipt,base='.') {
 const hash=receipt?.artifactHash,path=receipt?.artifactPath;
 if(typeof hash!=='string' || !/^[a-f0-9]{64}$/i.test(hash) || !relativePath(path) || !new RegExp(`^${hash}\\.(?:html?|svg|png|jpe?g|webp)$`,'i').test(path.split('/').at(-1))) return null;
 if(base==='.') return `./${path.replace(/^\.\//,'')}`;
 if(!relativePath(base)) return null;
 return `${base.replace(/\/$/,'')}/${path.replace(/^\.\//,'')}`;
}
function artifactLink(row,base) {
 const receipt=row?.receipt??row,path=digestPath(receipt,base),hash=receipt?.artifactHash;
 return path ? `<a href="${escape(path)}" target="_blank" rel="noopener noreferrer">查看产物 ${escape(hash.slice(0,10))}…</a>` : typeof hash==='string' ? `<span class="muted">产物摘要 ${escape(hash.slice(0,10))}…（无安全链接）</span>` : '<span class="muted">无产物</span>';
}
function page(title,body,extraStyle='',policy="default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'",script='') {
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escape(policy)}"><title>${escape(title)}</title><style>${STYLE}\n${extraStyle}</style></head><body>${body}${script}</body></html>`;
}
const STYLE = `
:root{color-scheme:light;--ink:#16324a;--muted:#536979;--blue:#125ed4;--blue-soft:#e9f1ff;--line:#d6e0ea;--paper:#fff;--ground:#f2f6fa;--amber:#87520a}
*{box-sizing:border-box}body{margin:0;background:var(--ground);color:var(--ink);font:16px/1.6 system-ui,"PingFang SC","Microsoft YaHei",sans-serif}main{max-width:1440px;margin:auto;padding:46px 44px 72px}h1,h2,h3,p{margin:0}h1{font-size:clamp(26px,3vw,40px);line-height:1.25;letter-spacing:-.04em}h2{font-size:25px;line-height:1.4}h3{font-size:19px}a{color:#0b52b6;text-underline-offset:3px}a:hover{text-decoration-thickness:2px}a:focus-visible,summary:focus-visible,input:focus-visible,textarea:focus-visible,button:focus-visible{outline:3px solid #cb7714;outline-offset:4px}.muted{color:var(--muted)}.metadata{margin-top:12px;color:var(--muted);font-size:14px}.notice{margin-top:20px;padding:13px 18px;background:#fff6d7;border-left:5px solid #b87905;color:#674306;font-weight:650}.hero{margin-top:30px;padding:24px 28px;background:var(--ink);color:#fff;display:flex;justify-content:space-between;align-items:center;gap:24px}.hero h2{font-size:clamp(25px,3.1vw,42px);line-height:1.2}.hero p{color:#d7e6f5;margin-top:7px}.hero .scale{font-size:35px;font-weight:750;white-space:nowrap;font-variant-numeric:tabular-nums}.panel{background:var(--paper);border:1px solid var(--line);padding:22px 26px}.section{margin-top:34px}.section>p{margin:8px 0 18px;max-width:80ch;color:var(--muted)}.chart-panel{margin-top:18px;padding:8px 8px 0;overflow-x:auto}.mobile-chart-hint{display:none}.chart{width:100%;height:auto;display:block;font-family:inherit}.chart text{fill:var(--ink);font-family:inherit}.chart .axis{fill:var(--muted);font-size:17px}.chart .method{font-size:23px;font-weight:700}.chart .model{font-size:16px;fill:var(--muted)}.chart .value{font-size:28px;font-weight:750;font-variant-numeric:tabular-nums}.chart .unmeasured{font-size:19px;fill:var(--amber)}.chart-grid{stroke:var(--line);stroke-width:1}.table-wrap{overflow-x:auto;background:var(--paper);border:1px solid var(--line)}table{width:100%;border-collapse:collapse;text-align:left;font-variant-numeric:tabular-nums}caption{text-align:left;padding:16px 20px;font-weight:700;font-size:19px}th,td{padding:13px 17px;border-bottom:1px solid var(--line);vertical-align:middle}th{background:#edf3f9;font-size:14px;font-weight:650;white-space:nowrap}td{font-size:16px}tbody tr:last-child td{border-bottom:0}.numeric{text-align:right;white-space:nowrap}.method-cell{min-width:150px;font-weight:700;overflow-wrap:anywhere}.method-cell small{display:block;color:var(--muted);font-weight:400;font-size:12px}.total{background:var(--blue-soft);color:#104d9e;font-size:23px;font-weight:800}.missing{color:var(--amber);font-size:14px}.score-note{font-size:13px;color:var(--muted);margin-top:10px;max-width:95ch}.badge{display:inline-block;padding:2px 8px;background:#edf3f9;font-size:12px;font-weight:600;color:var(--muted)}details{border-top:1px solid var(--line);padding:16px 0}summary{font-size:17px;font-weight:650;cursor:pointer}details p{margin-top:10px}pre{font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#edf3f9;padding:16px;margin-top:14px}footer{margin-top:30px;font-size:13px;color:var(--muted)}.empty{padding:25px;color:var(--muted)}
@media(max-width:760px){main{padding:26px 16px 42px}.hero{padding:20px;align-items:flex-start;flex-direction:column;gap:13px}.hero .scale{font-size:25px}.panel{padding:17px}.chart-panel{padding:0}.chart{min-width:1000px}.chart .method{font-size:25px}.chart .model{display:none}.mobile-chart-hint{display:block;font-size:13px;color:var(--muted);margin-top:8px}.table-wrap{margin-inline:0}th,td{padding:11px 13px}.section{margin-top:26px}}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}@media print{body{background:#fff}main{max-width:none;padding:0}.table-wrap{overflow:visible}details{break-inside:avoid}.hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;

function scoreBars(methods,{track,title='总分对比',id='score-chart'}) {
 const {key,label}=trackInfo(track),height=Math.max(240,132+methods.length*94),left=315,width=960;
 const ticks=[0,25,50,75,100].map(value=>{const x=left+width*value/100;return `<line class="chart-grid" x1="${x}" x2="${x}" y1="56" y2="${height-42}"/><text class="axis" x="${x}" y="${height-13}" text-anchor="middle">${value}</text>`;}).join('');
 const bars=methods.map((method,index)=>{
  const y=82+index*94,value=method[key],valid=score(value),name=String(method.arm??'未命名方法'),lines=Array.from(name).reduce((all,char,i)=>{const at=Math.floor(i/18);all[at]=(all[at]??'')+char;return all;},[]);
  const visible=lines.slice(0,2);if(lines.length>2) visible[1]=`${visible[1].slice(0,16)}…`;
  return `<g><title>${escape(name)} / ${escape(method.model)}：${label} ${valid?number(value):'未测量'}</title><text class="method" x="24" y="${y-10}">${visible.map((line,i)=>`<tspan x="24" dy="${i?25:0}">${escape(line)}</tspan>`).join('')}</text><text class="model" x="24" y="${y+32}">${escape(String(method.model??'').slice(0,27))}</text><rect x="${left}" y="${y-20}" width="${width}" height="36" rx="3" fill="#eef3f8"/>${valid?`<rect data-score="${number(value)}" x="${left}" y="${y-20}" width="${width*value/100}" height="36" rx="3" fill="${index===0?'#125ed4':'#5387c6'}"/><text class="value" x="${left+width+25}" y="${y+8}">${number(value)}</text>`:`<text class="unmeasured" x="${left+18}" y="${y+6}">未测量${track==='full'&&score(method.automatic)?' · 人评待完成':''}</text>`}</g>`;
 }).join('');
 return `<svg id="${id}" class="chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 ${height}" role="img" aria-labelledby="${id}-title ${id}-desc"><title id="${id}-title">${escape(title)} · ${label}</title><desc id="${id}-desc">${label}采用从 0 起点到 100 的统一尺度，越高越好。缺测方法不绘制数值柱。</desc><text class="axis" x="${left}" y="29">${label} / 100</text>${ticks}${bars}${methods.length?'':'<text x="315" y="120">暂无参评方法</text>'}</svg>`;
}
function headline(methods,track) {
 const {key,label}=trackInfo(track),measured=methods.filter(method=>score(method[key]));
 if(!measured.length) return {main:`尚无完整${label}`,detail:track==='full'?'人评或测量待完成；已有自动分会在表中单独显示。':'内容与布局的已测分项保留；补齐生成时间和实际费用后可得到自动分。'};
 const winner=measured[0],main=measured.length>1?`${winner.arm} 领先 ${number(winner[key]-measured[1][key])} 分`:`${winner.arm} · ${number(winner[key])} 分`;
 return {main,detail:`${measured.length} / ${methods.length} 个方法已获得${label}；${methods.length-measured.length} 个待完成。`};
}
function totalCell(method,track) {
 const {key}=trackInfo(track);
 if(score(method[key])) return number(method[key]);
 return track==='full'&&score(method.automatic)?`<span class="missing">待完成，已有自动分 ${number(method.automatic)}</span>`:'<span class="missing">未测量</span>';
}

/** Render the canonical scorecard first; raw measurements and evidence follow it. */
export function renderScoreReport(scorecard,{track='auto',title='Archify 绘图 Benchmark',notice='',artifactBase='.',reviewLink=null}={}) {
 const {label,formula}=trackInfo(track),methods=orderedMethods(scorecard,track),lead=headline(methods,track);
 const scoreRows=methods.map(method=>`<tr><td class="method-cell">${escape(method.arm)}<small>${escape(method.model)}</small></td>${COMPONENTS.map(([key])=>`<td class="numeric${score(method.scores?.[key])?'':' missing'}">${score(method.scores?.[key])?number(method.scores[key]):key==='human'?'待评':'未测量'}</td>`).join('')}<td class="numeric total">${totalCell(method,track)}</td></tr>`).join('');
 const rawRows=methods.map(method=>`<tr><td class="method-cell">${escape(method.arm)}<small>${escape(method.model)}</small></td><td class="numeric">${finite(method.raw?.deliveryDurationMs)?rawNumber(method.raw.deliveryDurationMs/1000,1):'未测量'}</td><td class="numeric">${rawNumber(method.raw?.totalTokens)}</td><td class="numeric">${rawNumber(method.raw?.costUsd,4)}</td><td class="numeric">${escape(method.taskCount??'未测量')}</td><td class="numeric">${escape(method.recorded??'未测量')}</td><td>${method.human?.complete?'已完成':`待完成（${escape(method.human?.count??0)} / ${escape(method.human?.required??'—')}）`}</td></tr>`).join('');
 const rows=scorecard.rows??[];
 const evidence=rows.map(row=>`<details><summary>${escape(row.taskId)} · ${escape(row.arm)} · 第 ${escape(row.repeat??1)} 次 <span class="badge">${row.knownFailure?'已知任务失败':row.status==='complete'?'已测量':'待完成'}</span></summary><p>${artifactLink(row,artifactBase)}</p><p>${COMPONENTS.map(([key,name])=>`${name} ${number(row.scores?.[key])}`).join('；')}；自动分 ${number(row.automatic)}；综合分 ${number(row.comprehensive)}。</p><pre>${escape(JSON.stringify({runId:row.runId,taskId:row.taskId,scoreVersion:row.scoreVersion??scorecard.scoreVersion,missing:row.missing??[],layoutDetails:row.layoutDetails??null,raw:row.raw??null,optimization:row.optimization??null},null,2))}</pre></details>`).join('');
 const review=relativePath(reviewLink)?`<p class="metadata"><a href="${escape(reviewLink)}">打开匿名人工评分表</a></p>`:'';
 return page(title,`<main><header><h1>${escape(title)}</h1><p class="metadata">评分版本 ${escape(scorecard.scoreVersion??scorecard.profile?.version??'未声明')} · ${methods.length} 个方法 · ${label}轨道 · 同一预声明任务集内比较</p>${notice?`<p class="notice">${escape(notice)}</p>`:''}</header><section aria-label="主要成绩"><div class="hero"><div><h2>${escape(lead.main)}</h2><p>${escape(lead.detail)}</p></div><div class="scale">${label} 0–100</div></div><div class="panel chart-panel" role="region" tabindex="0" aria-label="总分图表，可横向滚动">${scoreBars(methods,{track})}</div><p class="mobile-chart-hint">左右滑动图表查看完整分数。</p><div class="table-wrap" id="score-table"><table><caption>五项成绩与${label}</caption><thead><tr><th scope="col">方法 / 模型</th>${COMPONENTS.map(component=>`<th scope="col" class="numeric">${escape(componentHeading(component,track))}</th>`).join('')}<th scope="col" class="numeric">总分</th></tr></thead><tbody>${scoreRows||'<tr><td colspan="7" class="empty">暂无成绩，请先运行预声明任务集。</td></tr>'}</tbody></table></div><p class="score-note">所有分项与总分均为 0–100，越高越好，显示一位小数；先使用未舍入值汇总。${label} = ${formula}。人工观感缺失时标为待评；自动分使用固定的四项权重。</p></section><section class="section" id="raw-units"><h2>真实用量与样本</h2><p>下表为每题平均用量；每次运行按完整调用计费。T 使用从任务 dispatch 到最终候选 submittedAt 的最终交付耗时，包含生成、修复和工具等待；后续离线评分耗时不计。完整运行耗时保留在逐题原始记录中。秒数、tokens 和 USD 使用实际记录；未测量不补零。每题先平均重复，再对预声明任务等权平均。已知任务失败保留在分母。</p><div class="table-wrap"><table><thead><tr><th scope="col">方法 / 模型</th><th scope="col" class="numeric">每题平均交付用时（秒）</th><th scope="col" class="numeric">每题平均 tokens</th><th scope="col" class="numeric">每题平均费用（USD）</th><th scope="col" class="numeric">预声明任务</th><th scope="col" class="numeric">已记录运行</th><th scope="col">人工评分覆盖</th></tr></thead><tbody>${rawRows}</tbody></table></div>${review}</section><section class="section"><h2>逐题产物与扣分依据</h2><p>展开查看每次运行的分项、缺测原因、布局观测与产物摘要。</p>${evidence||'<p class="empty">没有逐题记录。</p>'}</section><section class="section"><details><summary>评分规则与完整性</summary><p>内容 45%、布局 20%、速度 10%、成本 10%、人工 15%。自动分将前四项的权重除以 85；综合分包含 15% 人工观感。同一榜单采用固定轨道，不混排。已交付产物每题至少两位独立评审；缺评不等于零分。</p><pre>${escape(JSON.stringify({scoreVersion:scorecard.scoreVersion,profile:scorecard.profile,missing:methods.map(method=>({arm:method.arm,model:method.model,missing:method.missing??[]}))},null,2))}</pre></details></section><footer>评分是可复算的工程政策。比较需保持任务集、模型 / Agent 配置、预算与评分版本一致。</footer></main>`);
}

function csvCell(value) {
 let text=String(value??'');
 // Spreadsheet formula prefixes also count after whitespace/control characters.
 if(/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text=`'${text}`;
 return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;
}
/** CSV has the same rounded score columns as HTML/PNG and blank unmeasured cells. */
export function scoreCSV(scorecard,{track='auto'}={}) {
 const {key,label}=trackInfo(track),methods=orderedMethods(scorecard,track),numeric=value=>score(value)?number(value):'';
 const header=['方法','模型','轨道',...COMPONENTS.map(component=>componentHeading(component,track)),'总分','每题平均交付用时（秒）','每题平均 tokens','每题平均费用（USD）','任务数','已记录运行','状态','评分版本'];
 const rows=methods.map(method=>[method.arm,method.model,label,...COMPONENTS.map(([field])=>numeric(method.scores?.[field])),numeric(method[key]),finite(method.raw?.deliveryDurationMs)?(method.raw.deliveryDurationMs/1000).toFixed(1):'',finite(method.raw?.totalTokens)?String(method.raw.totalTokens):'',finite(method.raw?.costUsd)?method.raw.costUsd.toFixed(4):'',method.taskCount,method.recorded,score(method[key])?'已计分':'待完成',scorecard.scoreVersion??scorecard.profile?.version]);
 return '\uFEFF'+[header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}

/** A self-contained chart page, with a native SVG and a 1440px screenshot canvas. */
export function renderScoreChart(scorecard,{track='auto',title='Benchmark 总分'}={}) {
 const {label}=trackInfo(track),methods=orderedMethods(scorecard,track);
 return page(title,`<main class="chart-page"><h1>${escape(title)}</h1><p class="metadata">${label} · 0–100，越高越好 · ${escape(scorecard.scoreVersion??scorecard.profile?.version??'未声明版本')}</p><div class="chart-panel" role="region" tabindex="0" aria-label="总分图表，可横向滚动">${scoreBars(methods,{track,title})}</div><p class="mobile-chart-hint">左右滑动图表查看完整分数。</p><p class="score-note">缺测显示“未测量”，不绘制零分柱；每个分数先在题内平均重复，再对任务等权平均。</p></main>`,'.chart-page{width:1440px;max-width:100%;padding:38px 44px 32px;background:#fff}.chart-page h1{font-size:32px}.chart-page .chart-panel{margin-top:22px}@media(max-width:760px){.chart-page{padding:24px 14px}}');
}

function shuffled(items,seed) {
 const result=[...items],digest=createHash('sha256').update(String(seed)).digest();
 let state=digest.readUInt32LE(0)||1;
 for(let i=result.length-1;i>0;i--) {state^=state<<13;state^=state>>>17;state^=state<<5;const j=(state>>>0)%(i+1);[result[i],result[j]]=[result[j],result[i]];}
 return result;
}
function taskContext(task) {
 const prompt=task?.prompt??task?.description??'';
 const nodes=(task?.expected?.nodes??[]).map(node=>String(node.label??node.id??''));
 const byId=new Map((task?.expected?.nodes??[]).map(node=>[node.id,node.label??node.id]));
 const edges=(task?.expected?.edges??[]).map(edge=>`${byId.get(edge.from)??edge.from} → ${byId.get(edge.to)??edge.to}${edge.label?`（${edge.label}）`:''}`);
 const requirements=Array.isArray(task?.requirements)?task.requirements:typeof task?.requirements==='string'?[task.requirements]:[];
 return `${prompt?`<p>${escape(prompt)}</p>`:''}${nodes.length?`<p><strong>必需节点：</strong>${nodes.map(escape).join('、')}</p>`:''}${edges.length?`<p><strong>必需关系：</strong>${edges.map(escape).join('；')}</p>`:''}${requirements.length?`<p><strong>要求：</strong>${requirements.map(escape).join('；')}</p>`:''}`;
}

/** Keep all browser-side code in this function so the exact script can be CSP-hashed. */
function reviewClient() {
 const state=JSON.parse(document.getElementById('review-state').textContent);
 const form=document.getElementById('review-form'),status=document.getElementById('download-status');
 form.addEventListener('submit',event=>{
  event.preventDefault();
  if(!form.reportValidity()) return;
  const data=new FormData(form),reviewerId=String(data.get('reviewerId')??'').trim();
  if(!reviewerId) {status.textContent='请填写评审标识。';return;}
  if(data.get('independent')!=='yes') {status.textContent='请确认独立评分。';return;}
  const reviews=state.items.map((item,index)=>{
   const ratings={};
   for(const field of ['readability','hierarchy','layout','style','aesthetics']) {
    const value=Number(data.get(`rating-${index}-${field}`));
    if(!Number.isInteger(value)||value<1||value>5) throw new Error('每题的五个评分都需要填写。');
    ratings[field]=value;
   }
   const review={taskId:item.taskId,artifactHash:item.artifactHash,reviewerId,rubricVersion:state.rubricVersion,status:'completed',independent:true,ratings};
   if(item.taskHash) review.taskHash=item.taskHash;
   if(item.reviewImageHash) review.reviewImageHash=item.reviewImageHash;
   const comment=String(data.get(`comment-${index}`)??'').trim();if(comment) review.comment=comment;
   return review;
  });
  const blob=new Blob([JSON.stringify({reviews},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download='diagram-quality-reviews.json';document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  status.textContent=`已下载 ${reviews.length} 份评分。请将 JSON 交回实验负责人。`;
 });
}

/** A static, local-only blind form. Receipt identities are never serialized wholesale. */
export function renderReviewForm({receipts,tasks,seed='pilot',rubricVersion='diagram-quality-human-v1'}) {
 if(!Array.isArray(receipts)) throw new TypeError('receipts must be an array');
 const taskList=Array.isArray(tasks)?tasks:tasks?.tasks??[],byTask=new Map(taskList.map(task=>[task.id??task.taskId,task]));
 const seen=new Set(),items=[];
 for(const receipt of receipts) {
  if(receipt.delivery?.status && receipt.delivery.status!=='delivered') continue;
  if(!receipt.artifactHash) continue;
  if(typeof receipt.taskId!=='string' || !receipt.taskId || !/^[a-f0-9]{64}$/i.test(receipt.artifactHash)) throw new TypeError('Review receipt requires task identity and artifact digest');
  let previewPath=receipt.artifactPath,reviewImageHash;
  if(receipt.reviewImage!=null) {
   const image=receipt.reviewImage;
   if(typeof image.hash!=='string' || !/^[a-f0-9]{64}$/i.test(image.hash) || image.path!==`artifacts/${image.hash}.png`) throw new TypeError('reviewImage requires a digest-only artifacts/<hash>.png path');
   previewPath=image.path;reviewImageHash=image.hash;
  } else if(!digestPath(receipt)) throw new TypeError('Review receipt requires digest-relative artifactPath');
  const key=JSON.stringify([receipt.taskId,receipt.artifactHash]);if(seen.has(key)) continue;seen.add(key);
  const item={taskId:receipt.taskId,artifactHash:receipt.artifactHash,previewPath,...(reviewImageHash?{reviewImageHash}:{})};
  if(typeof receipt.taskHash==='string'&&/^[a-f0-9]{64}$/i.test(receipt.taskHash)) item.taskHash=receipt.taskHash;
  items.push(item);
 }
 const ordered=shuffled(items,seed),state={rubricVersion,items:ordered.map(({taskId,artifactHash,taskHash,reviewImageHash})=>({taskId,artifactHash,...(taskHash?{taskHash}:{}),...(reviewImageHash?{reviewImageHash}:{})}))};
 const entries=ordered.map((item,index)=>`<article class="review-item"><div class="review-heading"><h2>作品 ${index+1}</h2><span class="muted">匿名顺序 ${index+1} / ${ordered.length}</span></div><details class="task-context" open><summary>题目与要求</summary>${taskContext(byTask.get(item.taskId))||'<p>请根据作品的可读性与观感评分。</p>'}</details>${item.reviewImageHash?`<img class="review-image" src="${escape(item.previewPath)}" alt="匿名作品 ${index+1} 预览">`:`<iframe src="${escape(item.previewPath)}" sandbox="" referrerpolicy="no-referrer" title="匿名作品 ${index+1} 预览"></iframe><p class="artifact-note">内嵌预览已禁用脚本；图内风格或标识仍可能暴露来源。</p>`}<p class="artifact-note"><a href="${escape(item.previewPath)}" target="_blank" rel="noopener noreferrer">单独查看作品</a> · 产物摘要 ${escape(item.artifactHash.slice(0,12))}…</p><div class="rating-grid">${RATINGS.map(([field,label,hint])=>`<fieldset><legend>${label}</legend><p class="rating-hint">${hint}</p><div class="choices">${[1,2,3,4,5].map(value=>`<label><input type="radio" name="rating-${index}-${field}" value="${value}" required><span>${value}</span></label>`).join('')}</div></fieldset>`).join('')}</div><label class="comment-label" for="comment-${index}">评论（选填）</label><textarea id="comment-${index}" name="comment-${index}" rows="2" placeholder="可记录让你加分或扣分的地方"></textarea></article>`).join('');
 const source=`(${reviewClient.toString()})();`,digest=createHash('sha256').update(source).digest('base64'),policy=`default-src 'none'; style-src 'unsafe-inline'; frame-src 'self' file:; img-src 'self'; script-src 'sha256-${digest}'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'`;
 return page('绘图 Benchmark 匿名人工评分',`<main class="review-page"><header><h1>匿名人工评分</h1><p class="metadata">请独立查看每张图，为五个方面各选 1–5 分。1 分最低，3 分一般，5 分最高。评论选填。</p><p class="notice">评分不显示方法、模型、费用或自动成绩。请按当前作品的阅读体验与视觉观感评分。</p></header><form id="review-form"><div class="reviewer panel"><label for="reviewer-id">评审标识 <span class="muted">（使用稳定化名即可）</span></label><input id="reviewer-id" name="reviewerId" type="text" required maxlength="100" autocomplete="off" placeholder="例如 reviewer-01"><label class="independent"><input name="independent" type="checkbox" value="yes" required>我独立完成本次评分，未参考其他评审的答案。</label></div>${entries||'<p class="empty">暂无可评分的已交付作品。</p>'}<div class="download"><button type="submit" ${ordered.length?'':'disabled'}>下载评分 JSON</button><p id="download-status" role="status" aria-live="polite">评分只保存在下载文件中；请在离开页面前下载。</p></div></form><footer>每个已交付作品至少需要两位独立评审。五项平均分换算为 0–100 的人工观感：25 ×（平均分 − 1）。</footer></main>`,'\n.review-page{max-width:1380px}.reviewer{margin-top:26px}.reviewer>label:first-child{font-size:18px;font-weight:650}.reviewer>input{display:block;width:min(100%,440px);margin:8px 0 16px;padding:11px 13px;font:inherit;border:1px solid #8da5b8;border-radius:3px}.independent{display:flex;gap:10px;align-items:flex-start}.independent input{margin-top:7px;min-width:18px;min-height:18px}.review-item{background:#fff;border:1px solid var(--line);padding:26px;margin-top:28px}.review-heading{display:flex;justify-content:space-between;gap:16px;align-items:baseline}.task-context{border:0;padding:14px 0}.task-context p{max-width:90ch;font-size:14px;line-height:1.65}iframe{display:block;width:100%;height:620px;border:1px solid var(--line);background:#fff}.review-image{display:block;width:100%;height:auto;max-height:740px;object-fit:contain;border:1px solid var(--line);background:#fff}.artifact-note{font-size:13px;margin-top:8px;color:var(--muted)}.rating-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;margin-top:22px}fieldset{margin:0;border:1px solid var(--line);padding:14px 14px 16px;min-width:0}legend{font-weight:750;padding:0 6px;font-size:17px}.rating-hint{font-size:13px;min-height:42px;color:var(--muted)}.choices{display:flex;gap:7px;margin-top:14px}.choices label{position:relative;flex:1;cursor:pointer}.choices input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}.choices span{display:block;border:1px solid #9aaebf;text-align:center;border-radius:3px;padding:9px 2px;font-size:18px}.choices input:checked+span{background:var(--blue);color:#fff;border-color:var(--blue);font-weight:750}.choices input:focus-visible+span{outline:3px solid #cb7714;outline-offset:3px}.comment-label{display:block;margin-top:20px;font-weight:650}textarea{display:block;width:100%;padding:10px 12px;margin-top:7px;border:1px solid #8da5b8;border-radius:3px;font:inherit;resize:vertical}.download{margin-top:28px;padding:22px;background:var(--ink);color:#fff;display:flex;align-items:center;gap:22px}.download p{font-size:14px;color:#d7e6f5}button{font:700 17px/1.5 inherit;padding:12px 23px;border:0;background:#fff;color:#104d9e;border-radius:3px;cursor:pointer;white-space:nowrap}button:disabled{opacity:.5;cursor:default}@media(max-width:850px){.rating-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.review-item{padding:17px}.rating-grid{grid-template-columns:1fr}.rating-hint{min-height:0}.review-heading{display:block}iframe{height:440px}.download{display:block}.download p{margin-top:13px}}',policy,`<script type="application/json" id="review-state">${json(state)}</script><script>${source}</script>`);
}
