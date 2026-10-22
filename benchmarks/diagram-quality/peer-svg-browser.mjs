import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ChromeVisualBrowser,findChrome} from '../../archify/bin/visual-check.mjs';

// Bounded native-export paint adapters. Source XML/scene IDs are never facts.
export async function observePeerArtifact({artifactPath,format,chromePath,screenshotPath}) {
 if(!['drawio','excalidraw'].includes(format)) throw new Error('Unsupported peer SVG format');
 const artifact=path.resolve(artifactPath);
 if(!fs.statSync(artifact).isFile()) throw new Error('artifact must be a regular file');
 const chrome=chromePath||findChrome();if(!chrome)throw new Error('Chrome is required for independent rendered observations');
 const browser=new ChromeVisualBrowser(chrome);
 try {
  const session=await browser.sessionPromise,send=(method,params={})=>browser.cdp.send(method,params,session);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send('Emulation.setScriptExecutionDisabled',{value:true});
  await send('Network.enable');await send('Network.setBlockedURLs',{urls:['http://*','https://*','ws://*','wss://*']});
  const loaded=browser.cdp.waitFor('Page.loadEventFired',session);loaded.catch(()=>{});
  await send('Page.navigate',{url:pathToFileURL(artifact).href});await loaded;
  const value=await send('Runtime.evaluate',{expression:`(${inspectPeer.toString()})(${JSON.stringify(format)})`,awaitPromise:true,returnByValue:true});
  if(value.exceptionDetails)throw new Error(value.exceptionDetails.exception?.description||'Peer SVG inspection failed');
  if(screenshotPath){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(screenshotPath,Buffer.from(shot.data,'base64'),{flag:'wx'});}
  return {graph:value.result.value.graph,observation:{...value.result.value.observation,method:'chrome-dom-native-peer-independent',browserProfile:browser.profileRoot}};
 }finally{await browser.close();}
}

async function inspectPeer(format) {
 await document.fonts.ready;
 const unknownReasons=[],bad=message=>unknownReasons.push(message),norm=s=>String(s||'').replace(/\s+/g,' ').trim();
 const svg=document.querySelector('svg');if(!svg)throw new Error('No SVG artifact');
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
 const contains=(r,p,t=0)=>p.x>=r.x-t&&p.x<=r.x+r.width+t&&p.y>=r.y-t&&p.y<=r.y+r.height+t;
 const color=s=>s&&!['none','transparent'].includes(s)&&!/rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(s);
 const painted=e=>{const s=getComputedStyle(e);return color(s.fill)&&+s.fillOpacity>0||color(s.stroke)&&+s.strokeOpacity>0&&parseFloat(s.strokeWidth)>0;};
 // SVG switch exposes inactive fallback geometry in some DOM APIs. Honor the
 // browser-supported first branch, rather than counting duplicate fallback text.
 const active=e=>{for(let p=e;p&&p!==svg;p=p.parentElement){if(p.parentElement?.localName==='switch'&&p!==p.parentElement.firstElementChild)return false;}return true;};
 const localRef=value=>{const match=value.match(/^url\(["']?([^"')]+)["']?\)$/);if(!match)return null;const u=new URL(match[1],location.href);return u.href.split('#')[0]===location.href.split('#')[0]?document.getElementById(decodeURIComponent(u.hash.slice(1))):null;};
 const rawTexts=[...svg.querySelectorAll('text,foreignObject div')].filter(e=>active(e)&&!e.closest('defs,mask,marker')&&(e.localName==='text'||![...e.children].some(c=>norm(c.textContent))));
 const labelMask=(p,value)=>{
  if(format!=='excalidraw')return false;
  const mask=localRef(value);if(mask?.localName!=='mask'||mask.children.length!==2||[...mask.children].some(e=>e.localName!=='rect'))return false;
  const [white,black]=mask.children;
  if(!['rgb(255, 255, 255)','#fff','white'].includes(getComputedStyle(white).fill)||!['rgb(0, 0, 0)','#000','black'].includes(getComputedStyle(black).fill))return false;
  const m=svg.getScreenCTM(),box=r=>{const a=new DOMPoint(+r.getAttribute('x'),+r.getAttribute('y')).matrixTransform(m),b=new DOMPoint(+r.getAttribute('x')+(+r.getAttribute('width')),+r.getAttribute('y')+(+r.getAttribute('height'))).matrixTransform(m);return{x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y};};
  const outer=box(white),hole=box(black),bounds=rect(p);
  if(!contains(outer,{x:bounds.x,y:bounds.y},2)||!contains(outer,{x:bounds.x+bounds.width,y:bounds.y+bounds.height},2))return false;
  return rawTexts.some(t=>{const r=rect(t);return contains(hole,center(r),3)&&Math.abs(r.width-hole.width)<8&&Math.abs(r.height-hole.height)<12;});
 };
 const visible=e=>{
  if(!active(e)||e.closest('defs,mask,marker,metadata'))return false;
  for(let p=e;p;p=p.parentElement){const s=getComputedStyle(p);if(s.display==='none'||s.visibility!=='visible'||+s.opacity<=0)return false;
   if(s.clipPath!=='none'||s.filter!=='none'||s.maskImage!=='none'&&!labelMask(p,s.maskImage)){bad('Clipped, masked or filtered native paint requires independent review');return false;}}
  const r=rect(e);return r.width>0||r.height>0;
 };
 const pathParts=e=> (e.getAttribute('d')||'').trim().split(/(?=[Mm])/).filter(Boolean);
 const sample=(e,first=false)=>{
  let shape=e;if(first&&e.localName==='path'){shape=document.createElementNS(svg.namespaceURI,'path');shape.setAttribute('d',pathParts(e)[0]||'');}
  const length=shape.getTotalLength(),count=Math.min(512,Math.max(2,Math.ceil(length/4))),m=e.getScreenCTM();
  return Array.from({length:count+1},(_,i)=>{const q=shape.getPointAtLength(length*i/count),p=new DOMPoint(q.x,q.y).matrixTransform(m);return{x:p.x,y:p.y};});
 };
 const primitives=[...svg.querySelectorAll('rect,path,polygon,ellipse,circle,line,polyline,image,use')].filter(e=>visible(e)&&painted(e));
 const textVisible=e=>{
  if(!visible(e))return false;
  const style=getComputedStyle(e);if(e.localName==='text'?!painted(e):!color(style.color))return false;
  const r=rect(e);
  for(const f of [.25,.5,.75]){const p={x:r.x+r.width*f,y:r.y+r.height/2};
   for(const overlay of primitives){if(!(e.compareDocumentPosition(overlay)&Node.DOCUMENT_POSITION_FOLLOWING)||!color(getComputedStyle(overlay).fill)||typeof overlay.isPointInFill!=='function')continue;
    const m=overlay.getScreenCTM();if(m&&overlay.isPointInFill(new DOMPoint(p.x,p.y).matrixTransform(m.inverse()))){bad('Rendered text is covered by later paint: '+norm(e.textContent));return false;}}
  }return true;
 };
 const textElements=rawTexts.filter(textVisible),used=new Set(),owners=new Map(),nodes=[];
 const rectangleAnchors=new Map();
 const roughBox=e=>{
  if(e.localName!=='path')return false;
  const style=getComputedStyle(e);if(!color(style.stroke)||parseFloat(style.strokeWidth)<=0)return false;
  // Native Rough.js outlines repeat each side/corner as two M/C strokes.
  // Match their actual endpoint cycle, rather than accepting a loose bbox
  // (an ellipse also has a rectangular bbox). No scene/source IDs are read.
  const parts=pathParts(e);if(![8,16].includes(parts.length))return false;
  const strokes=parts.map(d=>{
   if(!/^M\s*[-+\d.eE ,]+C\s*[-+\d.eE ,]+$/.test(d))return null;
   const n=d.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)?.map(Number);
   return n?.length===8?{start:{x:n[0],y:n[1]},c1:{x:n[2],y:n[3]},c2:{x:n[4],y:n[5]},end:{x:n[6],y:n[7]}}:null;
  });
  if(strokes.some(x=>!x))return false;
  for(let i=0;i<strokes.length;i+=2)if(dist(strokes[i].start,strokes[i+1].start)>.01||dist(strokes[i].end,strokes[i+1].end)>.01)return false;
  const segments=strokes.filter((_,i)=>i%2===0),anchors=segments.map(x=>x.start);
  if(segments.some((x,i)=>dist(x.end,anchors[(i+1)%anchors.length])>.01))return false;
  const xs=anchors.map(p=>p.x),ys=anchors.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
  if(w<30||h<20)return false;
  let expected;
  if(anchors.length===4)expected=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  else {
   const rx=anchors[0].x-x,ry=anchors[2].y-y;
   if(!(rx>0&&rx<w/2&&ry>0&&ry<h/2))return false;
   expected=[[x+rx,y],[x+w-rx,y],[x+w,y+ry],[x+w,y+h-ry],[x+w-rx,y+h],[x+rx,y+h],[x,y+h-ry],[x,y+ry]];
  }
  if(anchors.some((p,i)=>dist(p,{x:expected[i][0],y:expected[i][1]})>.01))return false;
  const tolerance=Math.max(3,Math.min(w,h)*.06);
  for(let i=0;i<strokes.length;i++){
   const q=strokes[i],corner=anchors.length===8&&Math.floor(i/2)%2===1;
   const bounds={x:Math.min(q.start.x,q.end.x),y:Math.min(q.start.y,q.end.y),width:Math.abs(q.end.x-q.start.x),height:Math.abs(q.end.y-q.start.y)};
   if(![q.c1,q.c2].every(p=>contains(bounds,p,tolerance)))return false;
   if(!corner&&q.start.x!==q.end.x&&q.start.y!==q.end.y)return false;
  }
  rectangleAnchors.set(e,{x,y,width:w,height:h});return true;
 };
 // Native draw.io edge labels carry a borderless text-sized backplate.
 // Require actual sibling text and a tight measured fit, never cell metadata.
 for(const e of primitives.filter(e=>e.localName==='rect')){
  const style=getComputedStyle(e),r=rect(e);
  if(color(style.stroke)&&parseFloat(style.strokeWidth)>0)continue;
  if(textElements.some(t=>t.parentElement===e.parentElement&&contains(r,center(rect(t)),2)&&r.width<=rect(t).width+10&&r.height<=rect(t).height+8))used.add(e);
 }
 const boxes=primitives.filter(e=>!used.has(e)&&(e.localName==='rect'||format==='excalidraw'&&roughBox(e)));
 for(const shape of boxes){let box=rect(shape);
  // Solid native fills are a separate path in the very same shape group.
  // Consume only a coincident fill next to a proven rectangular outline.
  const anchor=rectangleAnchors.get(shape);
  if(anchor){const fills=primitives.filter(e=>e!==shape&&e.localName==='path'&&e.parentElement===shape.parentElement&&color(getComputedStyle(e).fill)&&(!color(getComputedStyle(e).stroke)||parseFloat(getComputedStyle(e).strokeWidth)===0));
   for(const fill of fills){const r=fill.getBBox(),margin=Math.min(anchor.width,anchor.height)*.1;
    if(Math.abs(r.x-anchor.x)>margin||Math.abs(r.y-anchor.y)>margin||Math.abs(r.width-anchor.width)>margin*2||Math.abs(r.height-anchor.height)>margin*2)continue;
    used.add(fill);const b=rect(fill),x=Math.min(box.x,b.x),y=Math.min(box.y,b.y);box={x,y,width:Math.max(box.x+box.width,b.x+b.width)-x,height:Math.max(box.y+box.height,b.y+b.height)-y};
   }
  }
  const texts=textElements.filter(t=>contains(box,center(rect(t))));
  if(!texts.length){bad('Visible node box has no observable label');used.add(shape);continue;}
  // Native filled rough rectangles can have separate fill/outline paths.
  const duplicate=nodes.find(n=>dist(center(n.rect),center(box))<2&&Math.abs(n.rect.width-box.width)<4&&Math.abs(n.rect.height-box.height)<4);
  if(duplicate){used.add(shape);continue;}
  const id='observed-node-'+(nodes.length+1);for(const t of texts){if(owners.has(t))bad('Text belongs to multiple native node boxes');owners.set(t,id);}
  const font=t=>{const m=t.getScreenCTM?.()||t.closest('foreignObject')?.getScreenCTM();return parseFloat(getComputedStyle(t).fontSize)*(m?Math.hypot(m.a,m.b):1);};
  nodes.push({id,label:norm(texts.map(t=>t.textContent).join(' ')),visible:true,rect:box,fontSize:Math.min(...texts.map(font))});used.add(shape);
 }
 const endpointDistance=(p,r)=>contains(r,p)?Math.min(p.x-r.x,r.x+r.width-p.x,p.y-r.y,r.y+r.height-p.y):Math.hypot(Math.max(r.x-p.x,0,p.x-r.x-r.width),Math.max(r.y-p.y,0,p.y-r.y-r.height));
 const bind=p=>{
  const a=nodes.map(n=>({id:n.id,d:endpointDistance(p,n.rect)})).filter(n=>n.d<=10).sort((a,b)=>a.d-b.d);
  if(!a.length)return{status:'none',id:null};
  return a.length===1||a[1].d-a[0].d>2?{status:'unique',id:a[0].id}:{status:'ambiguous',id:null};
 };
 const edges=[],edgeGroups=new Map();
 const addEdge=(points,directed,owner)=>{
  const start=bind(points[0]),end=bind(points.at(-1)),from=start.id,to=end.id;
  // A visibly dangling tip is a measured missing relation. Only competing
  // possible owners make the measurement uncertain; thresholds stay unchanged.
  if(start.status==='ambiguous'||end.status==='ambiguous'||from&&from===to)bad('Native route endpoint binding is ambiguous');
  if(!directed)bad('Native arrowhead paint cannot establish direction');
  const edge={id:'observed-edge-'+(edges.length+1),from,to,label:'',visible:!!from&&!!to&&from!==to&&directed,points};edges.push(edge);if(owner)edgeGroups.set(edge,owner);
 };
 const direction=(tip,base,start,end)=>{const v={x:tip.x-base.x,y:tip.y-base.y},w={x:end.x-start.x,y:end.y-start.y};return(v.x*w.x+v.y*w.y)/(Math.hypot(v.x,v.y)*Math.hypot(w.x,w.y))>.6;};
 if(format==='drawio'){
  const arrowHead=e=>{
   if(e.localName!=='path')return null;
   const d=e.getAttribute('d')||'';
   if(!/^\s*M\s*[-+\d.eE ,]+(?:L\s*[-+\d.eE ,]+){2,3}\s*[zZ]\s*$/.test(d))return null;
   const nums=d.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)?.map(Number);
   if(![6,8].includes(nums?.length))return null;
   const m=e.getScreenCTM(),vertices=Array.from({length:nums.length/2},(_,i)=>{const p=new DOMPoint(nums[i*2],nums[i*2+1]).matrixTransform(m);return{x:p.x,y:p.y};});
   let tip,base;
   if(vertices.length===3){const pairs=[[0,1,2],[0,2,1],[1,2,0]].sort((a,b)=>dist(vertices[a[0]],vertices[a[1]])-dist(vertices[b[0]],vertices[b[1]]));
    const [a,b,c]=pairs[0];tip=vertices[c];base={x:(vertices[a].x+vertices[b].x)/2,y:(vertices[a].y+vertices[b].y)/2};
   }else {
    // Default draw.io classic: a concave quadrilateral, not a triangle.
    // The one vertex strictly inside the other three is the rear notch;
    // its opposite vertex is the actual painted tip. Reject convex diamonds,
    // bow ties and off-axis notches instead of guessing their direction.
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const inside=(p,[a,b,c])=>{const signs=[cross(a,b,p),cross(b,c,p),cross(c,a,p)];return signs.every(x=>x>.001)||signs.every(x=>x<-.001);};
    const notches=vertices.map((p,i)=>inside(p,vertices.filter((_,j)=>i!==j))?i:-1).filter(i=>i>=0);
    if(notches.length!==1)return null;
    const i=notches[0],notch=vertices[i],a=vertices[(i+1)%4],b=vertices[(i+3)%4];
    tip=vertices[(i+2)%4];base={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const axis={x:tip.x-base.x,y:tip.y-base.y},length=Math.hypot(axis.x,axis.y),width=dist(a,b);
    const projection=((notch.x-base.x)*axis.x+(notch.y-base.y)*axis.y)/(length*length);
    if(!(length>0&&width>0&&projection>0&&projection<1)||Math.abs(cross(base,tip,notch))/length>width*.1||Math.abs((a.x-b.x)*axis.x+(a.y-b.y)*axis.y)>width*length*.1)return null;
   }
   return{tip,base};
  };
  const heads=primitives.filter(e=>!used.has(e)&&color(getComputedStyle(e).fill)).map(e=>({e,head:arrowHead(e)})).filter(h=>h.head);
  for(const route of primitives.filter(e=>!used.has(e)&&['path','line','polyline'].includes(e.localName)&&!heads.some(h=>h.e===e))){
   const points=sample(route),start=points[0],end=points.at(-1),candidates=heads.filter(h=>h.e.parentElement===route.parentElement);
   let directed=false;
   if(candidates.length===1){const h=candidates[0],{tip,base}=h.head;
    if(Math.min(dist(end,tip),dist(end,base))<20&&direction(tip,base,points.at(-Math.min(5,points.length)),end)){points.push(tip);directed=true;}
    else if(Math.min(dist(start,tip),dist(start,base))<20&&direction(tip,base,points[Math.min(4,points.length-1)],start)){points.reverse();points.push(tip);directed=true;}
    used.add(h.e);
   }used.add(route);addEdge(points,directed,route.parentElement.parentElement);
  }
 }else{
  const paths=primitives.filter(e=>e.localName==='path'&&!used.has(e));
  const groups=[...new Set(paths.map(e=>e.parentElement?.parentElement))];
  for(const group of groups){const members=paths.filter(e=>e.parentElement?.parentElement===group);if(!members.length)continue;
   // Official native arrows contain a rough shaft plus two rough open wings.
   if(members.length!==3){bad('Native open arrow requires shaft and two visible wings');for(const e of members)used.add(e);continue;}
   const shaft=members[0],wings=members.slice(1).map(e=>sample(e,true));
   // Rough.js repeats each segment. Retain one painted subpath per segment,
   // joining only geometrically continuous segments (not the return stroke).
   const parts=pathParts(shaft),points=[];
   for(let i=0;i<parts.length;i+=2){const shape=document.createElementNS(svg.namespaceURI,'path');shape.setAttribute('d',parts[i]);const length=shape.getTotalLength(),m=shaft.getScreenCTM(),count=Math.max(2,Math.ceil(length/4));for(let j=0;j<=count;j++){const q=shape.getPointAtLength(length*j/count),p=new DOMPoint(q.x,q.y).matrixTransform(m);points.push({x:p.x,y:p.y});}}
   const pairs=[];for(const a of [0,wings[0].length-1])for(const b of [0,wings[1].length-1])pairs.push({a,b,d:dist(wings[0][a],wings[1][b])});pairs.sort((a,b)=>a.d-b.d);
   const match=pairs[0],tip=wings[0][match.a],base={x:(wings[0][match.a?0:wings[0].length-1].x+wings[1][match.b?0:wings[1].length-1].x)/2,y:(wings[0][match.a?0:wings[0].length-1].y+wings[1][match.b?0:wings[1].length-1].y)/2};
   let directed=match.d<3;
   if(directed&&dist(tip,points[0])<3){points.reverse();}
   directed=directed&&dist(tip,points.at(-1))<3&&direction(tip,base,points.at(-Math.min(5,points.length)),points.at(-1));
   for(const e of members)used.add(e);addEdge(points,directed);
  }
 }
 for(const e of primitives)if(!used.has(e))bad('Unsupported or ambiguous visible native SVG paint: '+e.localName);
 if(!nodes.length)bad('No independently observable native node boxes');
 const texts=textElements.map(e=>{const m=e.getScreenCTM?.()||e.closest('foreignObject')?.getScreenCTM();return{element:e,text:norm(e.textContent),rect:rect(e),fontSize:parseFloat(getComputedStyle(e).fontSize)*(m?Math.hypot(m.a,m.b):1),visible:true,nodeId:owners.get(e)||null,edgeFrom:null,edgeTo:null};});
 for(const t of texts.filter(t=>!t.nodeId&&t.text)){
  const p=center(t.rect),grouped=edges.filter(e=>edgeGroups.get(e)?.contains(t.element));
  const candidates=grouped.length===1?grouped:edges;
  const rank=candidates.map(e=>({i:edges.indexOf(e),d:Math.min(...e.points.map(q=>dist(p,q)))})).sort((a,b)=>a.d-b.d);
  if(!rank.length||rank[0].d>60||rank[1]&&rank[1].d-rank[0].d<3){bad('Visible text cannot be uniquely associated with node or route: '+t.text);continue;}
  const edge=edges[rank[0].i];edge.label=norm(edge.label+' '+t.text);t.edgeFrom=edge.from;t.edgeTo=edge.to;
 }
 const board=rect(svg),scale=Math.min(1280/(board.width||1280),720/(board.height||720));
 const offset={x:80+(1280-board.width*scale)/2,y:90+(720-board.height*scale)/2};
 const point=p=>({x:offset.x+(p.x-board.x)*scale,y:offset.y+(p.y-board.y)*scale});
 const normalizedRect=r=>({...point(r),width:r.width*scale,height:r.height*scale});
 const reasons=[...new Set(unknownReasons)],status=reasons.length?'unverified':'verified';
 return{graph:{status,unknownReasons:reasons,nodes:nodes.map(({id,label})=>({id,label})),edges:edges.filter(e=>e.visible).map(({id,from,to,label})=>({id,from,to,label}))},observation:{status,unknownReasons:reasons,nodes:nodes.map(n=>({...n,rect:normalizedRect(n.rect),fontSize:n.fontSize*scale})),edges:edges.map(e=>({...e,points:e.points.map(point)})),texts:texts.map(({element,...t})=>({...t,rect:normalizedRect(t.rect),fontSize:t.fontSize*scale})),bounds:{x:80,y:90,width:1280,height:720},profile:'desktop-single-page-v1',scale}};
}
