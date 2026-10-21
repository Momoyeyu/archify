import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { parse } from 'parse5';
import { renderScoreReport, scoreCSV, renderScoreChart, renderReviewForm } from '../benchmarks/diagram-quality/score-report.mjs';

const hash = letter => letter.repeat(64);
const fixture = () => ({
 scoreVersion:'diagram-quality-score-v1',
 profile:{version:'diagram-quality-score-v1',weights:{content:.45,layout:.20,speed:.10,cost:.10,human:.15}},
 methods:[
  {arm:'方案 A',model:'同一模型',taskCount:2,recorded:2,status:'complete',missing:[],scores:{content:100,layout:85,speed:70,cost:80,human:88},automatic:77/.85,comprehensive:90.2,raw:{durationMs:31000,deliveryDurationMs:23000,totalTokens:1200,costUsd:.03},human:{count:4,required:4,complete:true},tasks:[]},
  {arm:'方案 B',model:'同一模型',taskCount:2,recorded:2,status:'complete',missing:[],scores:{content:100,layout:65,speed:80,cost:75,human:60},automatic:73.5/.85,comprehensive:82.5,raw:{durationMs:25000,deliveryDurationMs:18000,totalTokens:950,costUsd:.04},human:{count:4,required:4,complete:true},tasks:[]},
 ],
 rows:[{runId:'run-one',taskId:'task-one',arm:'方案 A',model:'同一模型',repeat:1,status:'complete',scores:{content:100,layout:85,speed:70,cost:80,human:88},automatic:77/.85,comprehensive:90.2,raw:{durationMs:31000,deliveryDurationMs:23000,totalTokens:1200,costUsd:.03},artifactHash:hash('a'),artifactPath:`artifacts/${hash('a')}.html`,layoutDetails:{font:99.2},missing:[]}]
});
function nodes(html, tag) {
 const all=[];
 const visit=node=>{if(node.tagName===tag) all.push(node);for(const child of node.childNodes??[]) visit(child);};
 visit(parse(html));return all;
}
const attr=(node,name)=>node.attrs?.find(item=>item.name===name)?.value;
const textOf=node=>(node.value??'')+(node.childNodes??[]).map(textOf).join('');
const bodyText=html=>textOf(nodes(html,'body')[0]);
const scripts=html=>nodes(html,'script').filter(node=>attr(node,'type')!=='application/json').map(textOf);

test('Chinese report puts the primary 0–100 score bars and five components before raw evidence',()=>{
 const html=renderScoreReport(fixture(),{notice:'算术示意，非实测'}),body=bodyText(html);
 assert.equal(attr(nodes(html,'html')[0],'lang'),'zh-CN');
 for(const label of ['自动分','内容正确','布局可读','速度效率','成本效率','人工观感','总分','90.6','86.5','4.1','算术示意，非实测']) assert.ok(body.includes(label),label);
 assert.ok(html.indexOf('id="score-chart"')<html.indexOf('id="score-table"'));
 assert.ok(html.indexOf('id="score-table"')<html.indexOf('id="raw-units"'));
 assert.ok(html.indexOf('id="raw-units"')<html.indexOf('<pre>'));
 assert.ok(body.includes('23.0'));assert.ok(body.includes('1,200'));assert.ok(body.includes('0.0300'));
 assert.ok(nodes(html,'a').some(node=>attr(node,'href')===`./artifacts/${hash('a')}.html`));
 assert.equal(scripts(html).length,0);
});

test('full track uses comprehensive values everywhere while retaining existing automatic scores',()=>{
 const card=fixture(),html=renderScoreReport(card,{track:'full'}),chart=renderScoreChart(card,{track:'full'}),csv=scoreCSV(card,{track:'full'});
 assert.ok(bodyText(html).includes('综合分'));assert.ok(bodyText(html).includes('90.2'));assert.ok(bodyText(chart).includes('90.2'));
 assert.ok(bodyText(chart).includes('82.5'));assert.ok(csv.includes(',90.2,'));assert.ok(!csv.includes(',90.6,'));
 assert.ok(nodes(html,'rect').some(node=>attr(node,'data-score')==='90.2'));
 assert.ok(nodes(chart,'rect').some(node=>attr(node,'data-score')==='90.2'));
 assert.throws(()=>renderScoreReport(card,{track:'mixed'}),/track/i);
 assert.throws(()=>scoreCSV(card,{track:'mixed'}),/track/i);
 assert.throws(()=>renderScoreChart(card,{track:'mixed'}),/track/i);
});

test('component headings display the effective fixed weights for the selected track',()=>{
 const auto=nodes(renderScoreReport(fixture()),'th').map(textOf),full=nodes(renderScoreReport(fixture(),{track:'full'}),'th').map(textOf);
 for(const heading of ['内容正确 C 52.9%','布局可读 L 23.5%','速度效率 T 11.8%','成本效率 K 11.8%','人工观感 H 不计']) assert.ok(auto.includes(heading),heading);
 for(const heading of ['内容正确 C 45%','布局可读 L 20%','速度效率 T 10%','成本效率 K 10%','人工观感 H 15%']) assert.ok(full.includes(heading),heading);
});

test('aggregate raw units are labelled per-task averages while run evidence preserves the complete single-run usage',()=>{
 const card=fixture();card.rows[0].raw={durationMs:31000,deliveryDurationMs:23000,totalTokens:1601,costUsd:.07};
 const html=renderScoreReport(card),headings=nodes(html,'th').map(textOf),csv=scoreCSV(card);
 for(const heading of ['每题平均交付用时（秒）','每题平均 tokens','每题平均费用（USD）']) {assert.ok(headings.includes(heading),heading);assert.ok(csv.includes(heading),heading);}
 assert.ok(!headings.includes('总 tokens'));assert.ok(!csv.split('\r\n')[0].includes('总 tokens'));
 const rawSummary=textOf(nodes(html,'table')[1]);assert.ok(rawSummary.includes('23.0'));assert.ok(rawSummary.includes('1,200'));assert.ok(rawSummary.includes('0.0300'));
 const evidence=nodes(html,'pre').map(node=>JSON.parse(textOf(node))).find(item=>item.runId==='run-one');assert.deepEqual(evidence.raw,card.rows[0].raw);
});

test('delivery time never falls back to complete-run duration and explains the dispatch-to-final-candidate boundary',()=>{
 const card=fixture(),html=renderScoreReport(card),rawSummary=textOf(nodes(html,'table')[1]),csv=scoreCSV(card);
 assert.ok(rawSummary.includes('23.0'));assert.ok(!rawSummary.includes('31.0'));assert.ok(csv.includes(',23.0,'));assert.ok(!csv.includes(',31.0,'));
 for(const label of ['最终交付','生成','修复','工具等待','离线评分']) assert.ok(bodyText(html).includes(label),label);
 delete card.methods[0].raw.deliveryDurationMs;
 const missingHtml=renderScoreReport(card),table=nodes(missingHtml,'table')[1],rows=table.childNodes.find(node=>node.tagName==='tbody').childNodes.filter(node=>node.tagName==='tr');
 assert.equal(textOf(rows[0].childNodes.filter(node=>node.tagName==='td')[1]),'未测量');
 const missingCSV=scoreCSV(card);assert.ok(!missingCSV.includes(',31.0,'));assert.ok(missingCSV.split('\r\n')[1].includes(',90.6,,1200,'));
});

test('partial C/L measurements remain visible and cannot become a fabricated total or zero cost',()=>{
 const card=fixture();card.methods=[{...card.methods[0],status:'incomplete',scores:{content:100,layout:99.2,speed:null,cost:null,human:null},automatic:null,comprehensive:null,raw:{durationMs:null,totalTokens:null,costUsd:null},missing:['generation time unmeasured','actual cost unmeasured']}];
 const html=renderScoreReport(card),chart=renderScoreChart(card),csv=scoreCSV(card),body=bodyText(html);
 assert.ok(body.includes('未测量'));assert.ok(body.includes('99.2'));assert.ok(body.includes('100.0'));assert.ok(body.includes('尚无完整自动分'));
 assert.equal(nodes(chart,'rect').filter(node=>attr(node,'data-score')!==undefined).length,0);
 assert.ok(bodyText(chart).includes('未测量'));
 assert.ok(!csv.includes('null'));assert.ok(!csv.includes('NaN'));assert.ok(!csv.includes('Infinity'));
 assert.ok(!body.includes('$0.0000'));
 card.methods[0].automatic=90.5;
 assert.ok(bodyText(renderScoreReport(card,{track:'full'})).includes('待完成，已有自动分 90.5'));
});

test('chart is a standalone labelled zero-origin 0–100 native SVG with a wide screenshot canvas',()=>{
 const html=renderScoreChart(fixture(),{title:'两种方法对比'}),svg=nodes(html,'svg')[0],text=bodyText(html);
 assert.ok(svg);assert.match(attr(svg,'viewBox'),/^0 0 1440 /);
 for(const label of ['0','25','50','75','100','两种方法对比','90.6','86.5','自动分']) assert.ok(text.includes(label),label);
 assert.equal(attr(svg,'role'),'img');assert.ok(nodes(html,'title').length>=2);
 assert.ok(!html.includes('https://'));assert.equal(scripts(html).length,0);
 assert.ok(html.includes('prefers-reduced-motion'));
});

test('mobile score charts provide keyboard scrolling and retain a minimum readable canvas instead of shrinking to the viewport',()=>{
 for(const html of [renderScoreChart(fixture()),renderScoreReport(fixture())]) {
  const region=nodes(html,'div').find(node=>(attr(node,'class')??'').split(' ').includes('chart-panel'));
  assert.equal(attr(region,'role'),'region');assert.equal(attr(region,'tabindex'),'0');assert.ok(attr(region,'aria-label').includes('横向滚动'));
  const style=textOf(nodes(html,'style')[0]);assert.match(style,/\.chart-panel\{[^}]*overflow-x:auto/);assert.match(style,/\.chart\{[^}]*min-width:1000px/);
  assert.ok(bodyText(html).includes('左右滑动图表'));
 }
});

test('untrusted labels and notices stay text, digest links reject traversal or executable URLs',()=>{
 const attack='</script><img src=x onerror=alert(1)>',card=fixture();card.methods[0].arm=attack;card.rows[0].artifactPath=`../${hash('a')}.html`;
 const html=renderScoreReport(card,{title:attack,notice:attack,reviewLink:'javascript:alert(1)',artifactBase:'https://evil.invalid'}),chart=renderScoreChart(card,{title:attack});
 assert.equal(nodes(html,'img').length,0);assert.equal(nodes(chart,'img').length,0);assert.equal(nodes(html,'script').length,0);
 assert.ok(bodyText(html).includes(attack));assert.ok(bodyText(chart).includes(attack));
 assert.ok(nodes(html,'a').every(node=>!/(?:javascript:|\.\.)/i.test(attr(node,'href')??'')));
 assert.ok(!html.includes('onerror="'));
});

test('CSV preserves numeric columns, quote escaping and formula-safe method/model text',()=>{
 const card=fixture();card.methods=[...['=HYPERLINK("x")','+SUM(1,2)','-cmd','@SUM(1)','\t=cmd','\r=cmd','  =cmd','"quoted",name'].map(arm=>({...card.methods[0],arm,model:'=model'}))];
 const csv=scoreCSV(card);
 assert.ok(csv.startsWith('\uFEFF'));
 for(const marker of ['\'=HYPERLINK','\'+SUM','\'-cmd','\'@SUM','\'\t=cmd','\'\r=cmd',"'  =cmd",'""quoted"",name']) assert.ok(csv.includes(marker),marker);
 assert.ok(csv.includes("'=model"));assert.ok(csv.includes('90.6'));assert.ok(csv.includes('23.0'));assert.ok(csv.includes('0.0300'));
});

const reviewFixture=()=>({
 receipts:[0,1,2,3].map((value)=>({taskId:value%2?'task-two':'task-one',artifactHash:hash(String(value+1)),artifactPath:`artifacts/${hash(String(value+1))}.html`,delivery:{status:'delivered'},arm:'SECRET_METHOD',model:'SECRET_MODEL',usage:{costUsd:666},objective:{automatic:98.123},sourceHash:'SECRET_SOURCE',runId:'SECRET_RUN'})),
 tasks:[{id:'task-one',prompt:'题目一：保留 Browser → API 的关系。',expected:{nodes:[{id:'b',label:'Browser'},{id:'a',label:'API'}],edges:[{from:'b',to:'a',label:'request'}]}},{id:'task-two',prompt:'题目二：展示三个阶段。',requirements:['名称应完整可见']}]
});

test('blind form has deterministic shuffled digest-only previews, task context and no method or cost state',()=>{
 const input=reviewFixture(),html=renderReviewForm({...input,seed:'repeatable'}),other=renderReviewForm({...input,seed:'repeatable'}),srcs=value=>nodes(value,'iframe').map(node=>attr(node,'src'));
 assert.deepEqual(srcs(html),srcs(other));assert.equal(new Set(srcs(html)).size,4);
 assert.notDeepEqual(srcs(html),input.receipts.map(row=>row.artifactPath));
 for(const node of nodes(html,'iframe')) {assert.equal(attr(node,'sandbox'),'');assert.match(attr(node,'src'),/^artifacts\/[1-4]{64}\.html$/);assert.ok(attr(node,'title'));}
 for(const secret of ['SECRET_METHOD','SECRET_MODEL','SECRET_SOURCE','SECRET_RUN','98.123','666','"usage"','"objective"','"arm"','"model"']) assert.ok(!html.includes(secret),secret);
 assert.ok(bodyText(html).includes('题目一'));assert.ok(bodyText(html).includes('request'));assert.ok(bodyText(html).includes('名称应完整可见'));
 assert.ok(!html.includes('https://'));
});

test('blind form requires independent reviewer identity and five 1–5 ratings per item with optional comments',()=>{
 const html=renderReviewForm(reviewFixture()),inputs=nodes(html,'input'),ratings=inputs.filter(node=>attr(node,'type')==='radio');
 assert.equal(ratings.length,4*5*5);
 const names=[...new Set(ratings.map(node=>attr(node,'name')))];assert.equal(names.length,20);
 for(const name of names) {const group=ratings.filter(node=>attr(node,'name')===name);assert.deepEqual(group.map(node=>attr(node,'value')),['1','2','3','4','5']);assert.ok(group.some(node=>attr(node,'required')!==undefined));}
 const reviewer=inputs.find(node=>attr(node,'name')==='reviewerId');assert.ok(reviewer);assert.ok(attr(reviewer,'required')!==undefined);
 const independent=inputs.find(node=>attr(node,'name')==='independent');assert.equal(attr(independent,'type'),'checkbox');assert.ok(attr(independent,'required')!==undefined);
 assert.equal(nodes(html,'textarea').length,4);assert.ok(nodes(html,'textarea').every(node=>attr(node,'required')===undefined));
 assert.ok(bodyText(html).includes('下载评分 JSON'));assert.ok(bodyText(html).includes('评论（选填）'));
 assert.ok(!bodyText(html).includes('语义判断'));
});

test('review JSON and scripts remain safe when task prompts and rubric strings contain closing tags',()=>{
 const input=reviewFixture(),attack='</script><img src=x onerror=alert(1)>';
 input.tasks[0].prompt=attack;
 const html=renderReviewForm({...input,rubricVersion:attack}),allScripts=nodes(html,'script');
 assert.equal(nodes(html,'img').length,0);assert.equal(allScripts.length,2);
 const payload=allScripts.find(node=>attr(node,'type')==='application/json');assert.ok(payload);
 assert.ok(!textOf(payload).includes('</script>'));assert.ok(!textOf(payload).includes('<'));
 const state=JSON.parse(textOf(payload));assert.equal(state.rubricVersion,attack);assert.equal(state.items.length,4);
 const [script]=scripts(html);assert.doesNotThrow(()=>new Script(script));
 const digest=createHash('sha256').update(script).digest('base64'),policy=nodes(html,'meta').find(node=>attr(node,'http-equiv')==='Content-Security-Policy');assert.ok(attr(policy,'content').includes(`script-src 'sha256-${digest}'`));
});

test('blind form rejects unsafe artifact paths and deduplicates identical task/artifact bindings',()=>{
 const input=reviewFixture();input.receipts.push({...input.receipts[0],arm:'another method'});
 assert.equal(nodes(renderReviewForm(input),'iframe').length,4);
 for(const artifactPath of [`../${hash('1')}.html`,`artifacts/${hash('1')}-method.html`,`https://x/${hash('1')}.html`,`artifacts/%2e%2e/${hash('1')}.html`]) {
  assert.throws(()=>renderReviewForm({...input,receipts:[{...input.receipts[0],artifactPath}]}),/digest|artifact/i);
 }
});

test('blind review projects digest PNGs without exposing the original HTML viewer and binds the original artifact',()=>{
 const input=reviewFixture(),receipt={...input.receipts[0],reviewImage:{hash:hash('f'),path:`artifacts/${hash('f')}.png`}};
 const html=renderReviewForm({...input,receipts:[receipt]}),images=nodes(html,'img'),state=JSON.parse(textOf(nodes(html,'script').find(node=>attr(node,'type')==='application/json')));
 assert.equal(images.length,1);assert.equal(attr(images[0],'src'),receipt.reviewImage.path);assert.ok(attr(images[0],'alt'));
 assert.equal(nodes(html,'iframe').length,0);assert.ok(!html.includes(receipt.artifactPath));
 assert.equal(state.items[0].artifactHash,receipt.artifactHash);assert.equal(state.items[0].reviewImageHash,receipt.reviewImage.hash);
 assert.ok(!html.includes('SECRET_METHOD'));assert.ok(!html.includes('SECRET_MODEL'));
 assert.ok(bodyText(renderReviewForm(input)).includes('图内风格'));
});

test('blind review rejects non-PNG and noncanonical image paths rather than falling back to a revealing viewer',()=>{
 const input=reviewFixture(),receipt=input.receipts[0];
 for(const reviewImage of [
  {hash:hash('f'),path:`../${hash('f')}.png`},
  {hash:hash('f'),path:`artifacts/${hash('e')}.png`},
  {hash:hash('f'),path:`artifacts/${hash('f')}.html`},
  {hash:hash('f'),path:`artifacts/${hash('f')}-Archify.png`},
  {hash:hash('f'),path:`https://example.com/${hash('f')}.png`},
  {hash:'not-a-sha256',path:'artifacts/not-a-sha256.png'},
 ]) assert.throws(()=>renderReviewForm({...input,receipts:[{...receipt,reviewImage}]}),/reviewImage|image|PNG/i);
});

test('equal leaders are labelled tied rather than claiming a zero-point lead',()=>{
 const card=fixture();card.methods[1].automatic=card.methods[0].automatic;
 const body=bodyText(renderScoreReport(card));assert.ok(body.includes('并列'));assert.ok(!body.includes('领先 0.0'));
});
