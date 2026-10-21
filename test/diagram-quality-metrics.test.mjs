import test from 'node:test';
import assert from 'node:assert/strict';
import * as adapters from '../benchmarks/diagram-quality/adapters.mjs';
import * as metrics from '../benchmarks/diagram-quality/metrics.mjs';
const parse = (...args) => { assert.equal(typeof adapters.parseSource, 'function'); return adapters.parseSource(...args); };
const sem = (...args) => { assert.equal(typeof metrics.evaluateSemantics, 'function'); return metrics.evaluateSemantics(...args); };
const geo = (...args) => { assert.equal(typeof metrics.evaluateGeometry, 'function'); return metrics.evaluateGeometry(...args); };
const rect = (x,y,width=30,height=20) => ({x,y,width,height});
const graph = () => ({status:'verified', nodes:[{id:'a',label:'Alpha'},{id:'b',label:'Beta'}],edges:[{from:'a',to:'b',label:'yes'}]});
const expected = () => ({nodes:[{key:'first',label:'Alpha',aliases:['A']},{key:'second',label:'Beta'}],edges:[{from:'first',to:'second',label:'yes'}],requiredLabels:['Alpha','Beta','yes']});
const observation = () => ({status:'verified',bounds:rect(0,0,300,200),nodes:graph().nodes.map((n,i)=>({...n,visible:true,rect:rect(10+i*100,20),fontSize:14})),edges:[{from:'a',to:'b',label:'yes',visible:true,points:[{x:40,y:30},{x:110,y:30}]}],texts:[{text:'Alpha',visible:true,nodeId:'a',rect:rect(12,22,24,12),fontSize:14},{text:'Beta',visible:true,nodeId:'b',rect:rect(112,22,24,12),fontSize:14},{text:'yes',visible:true,rect:rect(65,40,20,12),fontSize:14}]});

test('one tiny node label is counted once when node and glyph observations describe the same text',()=>{
 const o=observation();o.nodes[0].fontSize=8;o.texts[0].fontSize=8;
 assert.equal(geo(o,{}).metrics.counts.tiny_font,1);
 o.texts=o.texts.filter(t=>t.nodeId!=='a');
 assert.equal(geo(o,{}).metrics.counts.tiny_font,1);
});

test('semantic graph requires visible nodes, labels and directed labeled edges',()=>{
 assert.equal(sem(expected(),graph(),observation()).passed,true);
 for (const mutate of [g=>g.nodes.pop(),g=>g.edges[0]={from:'b',to:'a',label:'yes'},g=>g.edges[0].label='no']) { const g=graph();mutate(g); assert.equal(sem(expected(),g,observation()).passed,false); }
 const o=observation();o.nodes[0].visible=false;assert.equal(sem(expected(),graph(),o).passed,false);
 const o2=observation();o2.texts.pop();o2.edges[0].label='';assert.equal(sem(expected(),graph(),o2).passed,false);
 assert.equal(sem(expected(),graph(),null).status,'unverified');
});
test('one-to-one alias matching cannot award duplicate nodes or parallel edges twice',()=>{
 const e={nodes:[{key:'one',aliases:['Same','Alternate']},{key:'two',aliases:['Same']}],edges:[]};
 const g={status:'verified',nodes:[{id:'a',label:'Same'},{id:'b',label:'Alternate'}],edges:[]};
 const o={...observation(),nodes:g.nodes.map(n=>({...n,visible:true})),edges:[]};
 assert.equal(sem(e,g,o).nodes.matched,2);
 g.nodes.pop();o.nodes.pop();assert.equal(sem(e,g,o).nodes.matched,1);
 const g2=graph();g2.edges.push({...g2.edges[0]});assert.equal(sem(expected(),g2,observation()).edges.precision,0.5);
});
test('unsupported fact types and graph extraction remain unverified',()=>{
 assert.equal(sem({...expected(),constraints:[{kind:'cardinality'}]},graph(),observation()).status,'unverified');
 assert.equal(sem(expected(),{...graph(),status:'unverified'},observation()).passed,false);
});
test('geometry checks overlap, clipping, fonts, text bounds and unrelated edge intrusion',()=>{
 assert.equal(geo(observation(),{calibrated:false}).passed,true);
 for(const mutate of [o=>o.nodes[1].rect=rect(20,20),o=>o.nodes[0].rect.x=-10,o=>o.texts[0].fontSize=8,o=>o.texts[0].rect.x=45,o=>o.edges.push({from:'x',to:'y',visible:true,points:[{x:0,y:30},{x:80,y:30}]})]){const o=observation();mutate(o);assert.equal(geo(o,{}).passed,false);}
 assert.equal(geo(null,{}).status,'unverified');
 const o=observation();delete o.nodes[0].rect;assert.equal(geo(o,{}).status,'unverified');
});
test('containment is legal only with an explicit legitimate parent-child relation',()=>{
 const o=observation();o.nodes[0].rect=rect(0,0,180,90);o.edges=[];o.texts=[];
 assert.equal(geo(o,{}).passed,false);
 o.containments=[{parent:'a',child:'b'}];assert.equal(geo(o,{}).passed,true);
 o.nodes[1].rect=rect(170,20);assert.equal(geo(o,{}).passed,false);
});
test('Archify core collection mapping preserves native semantic facts',()=>{
 for(const [type,nodes,edges] of [['architecture','components','connections'],['workflow','nodes','edges'],['dataflow','nodes','flows'],['lifecycle','states','transitions'],['sequence','participants','messages']]){
 const g=parse('archify',{diagram_type:type,[nodes]:graph().nodes,[edges]:graph().edges});assert.equal(g.status,'verified');assert.deepEqual(g.edges.map(({from,to,label})=>({from,to,label})),graph().edges);assert.equal(g.nodes.length,2);
 }
});
test('Mermaid explicit flowchart subset parses declarations and directed labeled edges, unsupported syntax fails closed',()=>{
 const g=parse('mermaid','flowchart LR\n a[Alpha] -->|yes| b[Beta]');assert.equal(g.status,'verified');assert.deepEqual(g.nodes.map(n=>n.label),['Alpha','Beta']);assert.equal(g.edges[0].label,'yes');
 for(const source of ['sequenceDiagram\nA->>B: hello','flowchart LR\nA & B --> C','flowchart LR\nsubgraph S\nA-->B\nend','flowchart LR\nA-->B-->C'])assert.equal(parse('mermaid',source).status,'unverified');
});
test('drawio XML and Excalidraw bindings extract native graph, not metadata claims',()=>{
 const xml='<mxfile><diagram><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="A &amp; B" vertex="1"/><mxCell id="b" value="Beta" vertex="1"/><mxCell id="e" edge="1" source="a" target="b" value="yes"/></root></mxGraphModel></diagram></mxfile>';
 const d=parse('drawio',xml);assert.equal(d.status,'verified');assert.equal(d.nodes[0].label,'A & B');assert.equal(d.edges.length,1);
 const scene={elements:[{id:'a',type:'rectangle'},{id:'at',type:'text',text:'Alpha',containerId:'a'},{id:'b',type:'ellipse'},{id:'bt',type:'text',text:'Beta',containerId:'b'},{id:'e',type:'arrow',startBinding:{elementId:'a'},endBinding:{elementId:'b'},endArrowhead:'arrow'}]};
 const g=parse('excalidraw',scene);assert.equal(g.status,'verified');assert.equal(g.nodes[0].label,'Alpha');assert.deepEqual(g.edges[0],{id:'e',from:'a',to:'b',label:''});
 assert.equal(parse('drawio','<mxfile><diagram>compressed</diagram></mxfile>').status,'unverified');
});
test('extension collections are extracted but typed unsupported requirements stay explicit',()=>{
 for(const [type,key] of [['erd','entities'],['class','types'],['tree','nodes'],['timeline','events'],['waterfall','spans']]){const g=parse('archify',{diagram_type:type,[key]:[{id:'a',label:'Alpha'}]});assert.equal(g.nodes.length,1);assert.equal(g.status,'unverified');}
});
test('free SVG/HTML and malformed inputs cannot establish topology',()=>{
 for(const format of ['svg','html'])assert.equal(parse(format,'<svg><text data-node-id="a">Alpha</text></svg>').status,'unverified');
 assert.equal(parse('archify','{').status,'invalid');assert.equal(parse('drawio','<mxfile>').status,'invalid');
});
test('unsupported typed facts cannot silently pass as an unlabeled graph',()=>{
 const e=expected();e.nodes[0].columns=[{name:'id',primaryKey:true}];assert.equal(sem(e,graph(),observation()).status,'unverified');
 const e2=expected();e2.edges[0].order=2;assert.equal(sem(e2,graph(),observation()).status,'unverified');
});
test('empty evidence and invalid profile cannot claim geometry success',()=>{
 const o={status:'verified',nodes:[],texts:[],edges:[],bounds:rect(0,0,300,200)};
 assert.equal(geo(o,{}).passed,false);
 assert.equal(geo(observation(),{epsilonPx:NaN}).passed,false);
});
test('native parser rejects unmatched custom relationships rather than silently dropping facts',()=>{
 assert.equal(parse('archify',{diagram_type:'workflow',nodes:graph().nodes,edges:[{from:'a',to:'z'}]}).status,'unverified');
 assert.equal(parse('excalidraw',{elements:[{id:'a',type:'rectangle'},{id:'b',type:'rectangle'},{id:'e',type:'arrow',startBinding:{elementId:'a'},endBinding:{elementId:'b'}}]}).status,'unverified');
});
test('duplicate node labels preserve explicit matching identities and directed relations',()=>{
 const nodes=[{id:'a',label:'Service'},{id:'b',label:'Service'}];
 const edges=[{from:'a',to:'b',label:'call'}];
 const g={status:'verified',nodes,edges};
 const o={status:'verified',nodes:nodes.map(n=>({...n,visible:true})),edges:edges.map(e=>({...e,visible:true})),texts:[]};
 const result=sem({nodes,edges},g,o);
 assert.equal(result.status,'verified');
 assert.equal(result.passed,true);
 assert.equal(result.edges.f1,1);
 const reversed={...g,edges:[{from:'b',to:'a',label:'call'}]};
 const reversedObservation={...o,edges:reversed.edges.map(e=>({...e,visible:true}))};
 assert.equal(sem({nodes,edges},reversed,reversedObservation).passed,false);
});
test('duplicate labels without a unique identity mapping remain unverified rather than arbitrarily incorrect',()=>{
 const nodes=[{id:'a',label:'Service'},{id:'b',label:'Service'}];
 const edges=[{from:'a',to:'b',label:'call'}];
 const g={status:'verified',nodes:[{id:'x',label:'Service'},{id:'y',label:'Service'}],edges:[{from:'x',to:'y',label:'call'}]};
 const o={status:'verified',nodes:g.nodes.map(n=>({...n,visible:true})),edges:g.edges.map(e=>({...e,visible:true})),texts:[]};
 const result=sem({nodes,edges},g,o);
 assert.equal(result.status,'unverified');
 assert.equal(result.passed,false);
 assert.ok(result.violations.some(v=>v.code==='ambiguous_node_mapping'));
 assert.ok(!result.violations.some(v=>v.code==='missing_edge'));
 assert.equal(result.edges.f1,null);
});
