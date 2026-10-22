import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../benchmarks/diagram-quality/benchmark.mjs';
import { attachHumanReview } from '../benchmarks/diagram-quality/records.mjs';

import {corpusFile,fixture} from './fixtures/diagram-quality-score.mjs';

test('five numerical human ratings are sufficient; semantic comments are optional',()=>{
  const {receipt}=fixture();
  const review={taskId:receipt.taskId,artifactHash:receipt.artifactHash,reviewerId:'reviewer-a',rubricVersion:'diagram-quality-human-v1',status:'completed',independent:true,ratings:{readability:4,hierarchy:4,layout:4,style:4,aesthetics:4}};
  const reviewed=attachHumanReview(receipt,review);
  assert.equal(reviewed.human.status,'completed');
  assert.deepEqual(reviewed.objective,receipt.objective);
});
test('batch terminal failures cannot overwrite caller identity with a different corpus identity',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archify-score-identity-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'experiment.json'),JSON.stringify({corpus:corpusFile,entries:[{taskId:'architecture-02',run:{runId:'known-fail',taskId:'architecture-02',arm:'fixture',model:'fixture',repeat:1,status:'no_candidate',startedAt:'2026-10-21T00:00:00Z',completedAt:'2026-10-21T00:00:10Z',identity:{manifestHash:'wrong',budget:{}}}}]}));
  await assert.rejects(main(['run','--experiment',path.join(dir,'experiment.json'),'--output',path.join(dir,'out')]),/identity|digest|manifestHash/i);
});
