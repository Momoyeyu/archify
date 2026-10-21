import { SaxesParser } from 'saxes';
import { parseFragment } from 'parse5';

const graph = () => ({nodes:[],edges:[],status:'verified',unknownReasons:[]});
const unknown = (g, reason) => {g.status='unverified';g.unknownReasons.push(reason);return g;};
const plainText = value => {
 const fragment=parseFragment(String(value ?? ''));
 const text = n => n.nodeName==='#text' ? n.value : (n.childNodes ?? []).map(text).join(n.tagName==='br'?'\n':'');
 return text(fragment).trim();
};
function validate(g) {
 const ids=new Set();
 for(const n of g.nodes){if(typeof n.id!=='string'||!n.id||typeof n.label!=='string'||ids.has(n.id))unknown(g,'Missing or duplicate native node identity');ids.add(n.id);}
 for(const e of g.edges)if(!ids.has(e.from)||!ids.has(e.to))unknown(g,'Edge endpoints cannot be bound to native nodes');
 if(!g.nodes.length)unknown(g,'No native semantic nodes extracted');
 return g;
}
function archify(data,{type}) {
 const g=graph(); const kind=data.diagram_type ?? type;
 if(type && data.diagram_type && type!==data.diagram_type)return unknown(g,'Requested type differs from source');
 const collections={architecture:['components','connections'],workflow:['nodes','edges'],dataflow:['nodes','flows'],lifecycle:['states','transitions'],sequence:['participants','messages'],erd:['entities','relationships'],class:['types','relationships'],tree:['nodes',null],timeline:['events',null],waterfall:['spans',null]};
 if(!collections[kind])return unknown(g,'Unsupported Archify diagram type');
 const [nk,ek]=collections[kind];
 if(!Array.isArray(data[nk]) || (ek && data[ek]!==undefined&&!Array.isArray(data[ek])))return unknown(g,'Missing or invalid native collections');
 g.nodes=data[nk].map(n=>({...n,id:n.id,label:n.label ?? n.name ?? '',type:n.type}));
 g.edges=(data[ek]??[]).map((e,i)=>({...e,id:e.id??`edge-${i}`,from:e.from,to:e.to,label:e.label??''}));
 if(kind==='tree')for(const n of g.nodes)if(n.parent)g.edges.push({from:n.parent,to:n.id,label:''});
 if(['erd','class','tree','timeline','waterfall'].includes(kind))unknown(g,'Extension collection extracted; typed attributes, quantities or hierarchy are not fully verified');
 // Sequence message order is preserved as native y, but not reduced to unordered graph credit.
 if(kind==='sequence')g.edges.forEach((e,i)=>{e.order=i;e.y=data[ek][i].y;});
 return validate(g);
}
function mermaid(source) {
 const g=graph();const lines=source.split(/[\n;]/).map(l=>l.trim()).filter(l=>l&&!l.startsWith('%%'));
 if(!/^(flowchart|graph)\s+(LR|RL|TD|TB|BT)$/.test(lines.shift()??''))return unknown(g,'Only explicit flowchart/graph direction is supported');
 const nodes=new Map();
 const token='([A-Za-z_][\\w-]*)(?:\\[([^\\]\\n]*)\\]|\\(([^)\\n]*)\\)|\\{([^}\\n]*)\\})?';
 const nodeRe=new RegExp(`^${token}$`);const edgeRe=new RegExp(`^${token}\\s*-->\\s*(?:\\|([^|\\n]*)\\|\\s*)?${token}$`);
 const put=(id,label)=>{if(label!==undefined){const clean=label.replace(/^"(.*)"$/,'$1');if(nodes.has(id)&&nodes.get(id).explicit&&nodes.get(id).label!==clean)unknown(g,'Conflicting Mermaid labels');nodes.set(id,{id,label:clean,explicit:true});}else if(!nodes.has(id))nodes.set(id,{id,label:id,explicit:false});};
 for(const line of lines){const e=line.match(edgeRe);if(e){put(e[1],e[2]??e[3]??e[4]);put(e[6],e[7]??e[8]??e[9]);g.edges.push({from:e[1],to:e[6],label:e[5]??''});continue;}const n=line.match(nodeRe);if(n){put(n[1],n[2]??n[3]??n[4]);continue;}unknown(g,`Unsupported Mermaid statement: ${line}`);}
 g.nodes=[...nodes.values()].map(({explicit,...n})=>n);return validate(g);
}
function drawio(source) {
 const g=graph();const cells=[];const parser=new SaxesParser();let modelCount=0, diagramCount=0, hasDoctype=false;
 parser.on('doctype',()=>{hasDoctype=true;});
 parser.on('opentag',node=>{if(node.name==='mxGraphModel')modelCount++;if(node.name==='diagram')diagramCount++;if(node.name==='mxCell')cells.push(node.attributes);});
 parser.write(source).close();
 if(hasDoctype)return unknown(g,'XML doctypes are unsupported');
 if(modelCount!==1||diagramCount>1)return unknown(g,'Only one uncompressed mxGraphModel is supported');
 for(const c of cells){if(c.vertex==='1')g.nodes.push({id:c.id,label:plainText(c.value)});if(c.edge==='1'){const style=c.style??'';if(/startArrow=(?!none)[^;]+/.test(style)||/endArrow=none/.test(style))unknown(g,'Unsupported drawio arrow direction');g.edges.push({id:c.id,from:c.source,to:c.target,label:plainText(c.value)});}}
 return validate(g);
}
function excalidraw(data) {
 const g=graph();if(!Array.isArray(data.elements))return unknown(g,'Missing Excalidraw elements');
 const elements=data.elements.filter(e=>!e.isDeleted);const labels=id=>elements.filter(e=>e.type==='text'&&e.containerId===id).map(e=>e.text??'').join('\n');
 for(const e of elements){
  if(['rectangle','ellipse','diamond'].includes(e.type))g.nodes.push({id:e.id,label:labels(e.id)});
  else if(e.type==='text'&&!e.containerId)g.nodes.push({id:e.id,label:e.text??''});
  else if(e.type==='arrow'){
   let from=e.startBinding?.elementId,to=e.endBinding?.elementId;
   if(e.startArrowhead&&!e.endArrowhead)[from,to]=[to,from];
   if((e.startArrowhead&&e.endArrowhead)||(!e.startArrowhead&&!e.endArrowhead))unknown(g,'Excalidraw arrow direction is not uniquely established');
   g.edges.push({id:e.id,from,to,label:labels(e.id)});
  }else if(e.type!=='text')unknown(g,`Unsupported Excalidraw element: ${e.type}`);
 }
 return validate(g);
}
/** Parse native source only. Final browser visibility is assessed independently. */
export function parseSource(format, source, options={}) {
 try {
  if(['svg','html'].includes(format))return unknown(graph(),'Free SVG/HTML topology requires independent correspondence; source metadata is insufficient');
  if(format==='mermaid')return mermaid(String(source));
  if(format==='drawio')return drawio(String(source));
  const data=typeof source==='string'?JSON.parse(source):source;
  if(!data||typeof data!=='object')throw new Error('Expected structured source');
  if(format==='archify')return archify(data,options);
  if(format==='excalidraw')return excalidraw(data);
  return unknown(graph(),`Unsupported source format: ${format}`);
 }catch(error){return {...graph(),status:'invalid',unknownReasons:[error.message]};}
}
