import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {startReviewServer,validateRating,humanResults,DIMENSIONS} from '../benchmarks/diagram-quality/review-server.mjs';
const artifactHash='a'.repeat(64),imageHash='b'.repeat(64),item={taskId:'task',artifactHash,reviewImageHash:imageHash};
const rating={...item,reviewerId:'owner',independent:true,ratings:Object.fromEntries(DIMENSIONS.map(k=>[k,4]))};
test('human ratings require exact artifact and preview binding; partial rating is an honest resumable draft',()=>{
 assert.equal(validateRating(rating,item).status,'completed');
 assert.equal(validateRating({...rating,ratings:{readability:4}},item).status,'draft');
 assert.equal(validateRating({...rating,independent:false},item).status,'draft');
 assert.throws(()=>validateRating({...rating,ratings:{...rating.ratings,style:6}},item),/1–5/);
 assert.throws(()=>validateRating({...rating,reviewImageHash:'c'.repeat(64)},item),/版本/);
});
test('one real human produces explicitly provisional weighted total; unreviewed works never become zero',()=>{
 const receipt={taskId:'task',arm:'method',model:'model',artifactHash,reviewImage:{hash:imageHash},delivery:{status:'delivered'}};
 const scorecard={methods:[{arm:'method',model:'model',taskCount:1,automatic:80,scores:{}}]};
 assert.equal(humanResults(scorecard,[receipt],[],'owner')[0].comprehensive,null);
 const completed=validateRating(rating,item),result=humanResults(scorecard,[receipt],[completed],'owner')[0];
 assert.equal(result.human,75);assert.equal(result.comprehensive,79.25);assert.equal(result.consensus,false);
 assert.equal(humanResults(scorecard,[receipt],[completed,{...completed,reviewerId:'other'}],'owner')[0].consensus,true);
});
test('local review server saves, restores, imports and exports scores without touching source receipts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'archify-review-server-'));let server;
 try{
  const data=join(dir,'data'),storage=join(dir,'saved'),corpus=join(dir,'corpus.json');await mkdir(data);
  const receipt={taskId:'task',arm:'method',model:'model',artifactHash,reviewImage:{hash:imageHash,path:`artifacts/${imageHash}.png`},delivery:{status:'delivered'}};
  await writeFile(join(data,'scorecard.json'),JSON.stringify({methods:[{arm:'method',model:'model',taskCount:1,automatic:80,scores:{}}]}));
  const original=JSON.stringify(receipt)+'\n';await writeFile(join(data,'receipts.jsonl'),original);await writeFile(corpus,JSON.stringify({tasks:[{id:'task',prompt:'Actual task'}]}));
  server=await startReviewServer({dataDir:data,storageDir:storage,corpusPath:corpus,port:0});const url=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await(await fetch(url+'/api/state')).json()).items.length,1);
  const post=value=>fetch(url+'/api/rating',{method:'POST',body:JSON.stringify(value)});
  assert.equal((await post({...rating,ratings:{readability:3}})).status,200);
  assert.equal((await(await fetch(url+'/api/state')).json()).reviews[0].status,'draft');
  assert.equal((await post(rating)).status,200);
  const state=await(await fetch(url+'/api/state?reviewer=owner')).json();assert.equal(state.methods[0].comprehensive,79.25);
  const exported=await(await fetch(url+'/api/export')).json();assert.equal(exported.reviews[0].ratings.style,4);
  assert.equal((await fetch(url+'/api/import',{method:'POST',body:JSON.stringify(exported)})).status,200);
  assert.equal((await post({...rating,artifactHash:'z'.repeat(64)})).status,400);
  assert.equal((await fetch(url+'/api/rating',{method:'POST',headers:{Origin:'https://evil.example'},body:JSON.stringify(rating)})).status,403);
  assert.equal(await readFile(join(data,'receipts.jsonl'),'utf8'),original);
  assert.equal(JSON.parse(await readFile(join(storage,'reviews.json'),'utf8')).reviews.length,1);
  assert.equal(JSON.parse(await readFile(join(storage,'live-results.json'),'utf8')).singleReviewerProvisional,true);
 }finally{if(server)await new Promise(ok=>server.close(ok));await rm(dir,{recursive:true,force:true});}
});
