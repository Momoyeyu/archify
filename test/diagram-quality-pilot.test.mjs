import test from 'node:test';
import assert from 'node:assert/strict';
import {deepseekUsage,extractCandidate,editPortableSource} from '../benchmarks/diagram-quality/pilot.mjs';

test('DeepSeek charge uses measured cache/miss counts and never double-counts reasoning tokens',()=>{
 const raw={prompt_tokens:120,prompt_cache_hit_tokens:20,prompt_cache_miss_tokens:100,completion_tokens:50,total_tokens:170,completion_tokens_details:{reasoning_tokens:10}};
 const usage=deepseekUsage(raw);
 assert.equal(usage.inputTokens,120);assert.equal(usage.outputTokens,50);assert.equal(usage.cachedInputTokens,20);assert.equal(usage.reasoningTokens,10);
 assert.ok(Math.abs(usage.costUsd-.00004506)<1e-12);assert.equal(usage.complete,true);
});
test('missing real cache accounting never becomes a guessed cost or a free request',()=>{
 const u=deepseekUsage({prompt_tokens:120,completion_tokens:50,total_tokens:170});
 assert.equal(u.costUsd,null);assert.equal(u.complete,false);
 assert.throws(()=>deepseekUsage({prompt_tokens:120,prompt_cache_hit_tokens:20,prompt_cache_miss_tokens:110,completion_tokens:50,total_tokens:170}),/cache|account/i);
});
test('candidate extraction only removes a complete outer markdown fence, without repairing contents',()=>{
 assert.throws(()=>extractCandidate(''),{code:'PILOT_SOURCE_INVALID'});
 assert.deepEqual(extractCandidate('```json\n{"bad":}\n```'),{text:'{"bad":}',outerFenceRemoved:true});
 assert.deepEqual(extractCandidate('Here is a result:\n{}'),{text:'Here is a result:\n{}',outerFenceRemoved:false});
 assert.throws(()=>extractCandidate('```svg\n<a/>\n```\n```svg\n<b/>\n```'),/multiple|fence/i);
});
test('editable probe changes a visible label, preserving matching IDs and other source text',()=>{
 assert.equal(editPortableSource('<g id="Browser"><text>Browser</text></g>','svg','Browser','Browser EDIT'),'<g id="Browser"><text>Browser EDIT</text></g>');
 assert.equal(editPortableSource('flowchart LR\nBrowser["Browser"]\nBrowser --> A','mermaid','Browser','Browser EDIT'),'flowchart LR\nBrowser["Browser EDIT"]\nBrowser --> A');
 assert.equal(editPortableSource('<div>Browser</div><div>Browser</div>','html','Browser','Browser EDIT'),null);
});
