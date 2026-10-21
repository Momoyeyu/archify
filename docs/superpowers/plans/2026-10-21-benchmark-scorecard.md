# Benchmark scorecard implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Independent scoring, presentation and report units may run under dispatching-parallel-agents; primary integrates and performs whole-change review.

**Goal:** Produce a Chinese, numerical 0–100 benchmark scorecard, optional numerical human reviews, reproducible chart exports and a presentation explaining the full benchmark through its results.

**Architecture:** Keep v2 verification receipts and legacy reports compatible. Add a continuous scoring module, a score-first report/export layer and a static blind review form, integrated through one batch CLI command.

**Tech Stack:** Existing Node ESM and Chrome CDP; no product dependencies or renderer changes. Editable PPTX through bundled presentation tools.

**Spec:** ../specs/2026-10-21-benchmark-scorecard-redesign.md (approved by user: “that is what i mean. give it a try!”).

## Global Constraints

- Fixed comprehensive weights C/L/T/K/H = 45/20/10/10/15; automatic divides first four contributions by 0.85. Speed uses dispatch to final candidate submission, not a first-success guess; deliveryDurationMs and complete-run durationMs remain separate.
- All published components and totals 0–100, higher is better; aggregate unrounded values before display rounding.
- Human ratings are five integers 1–5, comments optional, H=25*(mean-1); two independent raters per delivered task for a comprehensive score.
- Known model failures stay zero in planned denominators; missing measurements stay incomplete. No invented real model costs, timings or human judgments.
- No PR, push, live installation or model-provider spending. Use the existing isolated feature branch feat/benchmark-v2.
- Preserve legacy v1 metrics and old receipt APIs. New scoreVersion/profile binds score interpretation.

## Review Focus

- Missing/failed repeats must not disappear or overweight tasks with more repeats.
- Hidden or deleted mandatory objects, padding and legal containment must not improve layout unfairly.
- Incomplete costs/reviews must not be silently treated as zero or weights silently changed.
- User labels/reviews must not execute HTML, break CSV formulas or leak blind method labels.
- Chart PNG, CSV, JSON, terminal and HTML must reflect the same unrounded underlying scorecard and correct track.

## Interfaces (shared contract)

Scoring exports from benchmarks/diagram-quality/scoring.mjs:

- SCORE_PROFILE: {version,weights:{content:.45,layout:.20,speed:.10,cost:.10,human:.15},minFontPx:12,thresholds:{small|medium|large:{timeMs:{good,bad},costUsd:{good,bad}}}}. Freeze explicit pilot anchors (small time 10000/60000ms, cost .01/.25 USD; medium 30000/180000ms,.03/.75; large 60000/360000ms,.06/1.5). Budget violations independently remove efficiency credit.
- scoreRun({task,receipt,profile=SCORE_PROFILE}) -> {scoreVersion,runId,taskId,arm,model,repeat,taskType,complexity,scores:{content,layout,speed,cost,human},automatic,comprehensive,status:'complete'|'incomplete'|'failed',missing:[],knownFailure,layoutDetails,raw:{deliveryDurationMs,durationMs,totalTokens,costUsd},human:{count,required:2,complete},optimization:{eligible,score,reasons:[]}}. Numbers nullable when unmeasured. receipt.observation supplies geometry; receipt.objective.semantic supplies independently verified content matches. receipt.environment.measurementMode='offline-render' means generation time/cost are unmeasured.
- aggregateScorecards(rows,{plannedRuns,profile=SCORE_PROFILE}) -> {scoreVersion,profile,methods:[{arm,model,taskCount,recorded,scores,automatic,comprehensive,status,missing,raw:{deliveryDurationMs,durationMs,totalTokens,costUsd},human:{count,required,complete},tasks:[]}],rows}. Missing planned receipts -> incomplete, known failures -> zero, first average repeats within task then tasks equally. Never trust caller-provided totals; recompute.
- weightSensitivity(scorecard,{track='auto'}) -> descriptive leave-one-component-out and ±20% weight perturbations with weights normalized. No empirical claim or product-component causal claim.

Report exports from score-report.mjs:

- renderScoreReport(scorecard,{track='auto',title='Archify 绘图 Benchmark',notice='',artifactBase='.',reviewLink=null}={}) -> standalone safe Chinese HTML.
- scoreCSV(scorecard,{track='auto'}={}) -> UTF-8 CSV with component/total and raw-unit columns, formula-safe text cells.
- renderScoreChart(scorecard,{track='auto',title='Benchmark 总分'}={}) -> standalone HTML suitable for actual Chrome screenshot, zero origin and labels, incomplete methods shown as unmeasured.
- renderReviewForm({receipts,tasks,seed='pilot',rubricVersion='diagram-quality-human-v1'}) -> static blind form, five 1–5 scores, reviewer identity, independent checkbox, optional comment; downloads {reviews:[...]} JSON bound to task/artifact hashes. Deterministic randomized order, no method/model/cost/automatic score exposed. iframe previews sandbox without scripts; digest-relative artifacts only.

## Task 1: continuous scoring and numeric aggregation

Files: new scoring.mjs, test/diagram-quality-scoring.test.mjs. Owner: scoring unit.

- [x] RED: approved A/B arithmetic; H anchors; partial facts, near-threshold font continuity, overlap area union, missing/padded objects, zero content and invalid delivery; incomplete usage and two-rater coverage; failed/missing/unequal repeats; budget and unknown measurements.
- [x] Implement all scoring interfaces; strict finite values and identity/version/plan checks. Test real geometric objects rather than mocks of implementation.
- [x] GREEN focused tests; return stable API and exact outcomes, no commits while other units integrate.

## Task 2: Chinese results, chart exports and blind rating form

Files: new score-report.mjs, test/diagram-quality-score-report.test.mjs. Owner: report unit.

- [x] RED: score-first Chinese labels/0–100 values, incomplete measurements, malicious labels/CSV injection, script-safe payload, no identity/cost leak in blind form, five required numerical ratings and optional comment.
- [x] Implement report, chart, CSV and review HTML against shared interface. First screen is score/bar/table; details below. Provide responsive desktop/mobile and reduced-motion support.
- [x] GREEN tests; browser interaction checked by primary after integration.

## Task 3: one-command batch scoring and review import

Files: benchmark.mjs, browser.mjs, records.mjs, verification.mjs, README.md and CLI/E2E tests. Owner: primary.

- [x] RED: batch run verifies all input entries and creates scorecard HTML/JSON/CSV/PNG/review; imported ratings produce comprehensive score without changing automatic; demo no real costs cannot be relabeled as a full real experiment.
- [x] Add text edge binding/rects to observations for required-label layout. Preserve original independent semantic and editing checks.
- [x] Add run --experiment path --output dir [--track auto|full] [--chrome path] [--reviews JSON]; experiment {corpus,entries:[{taskId,source,format,artifact,run}],plannedRuns?}. Resolve relative paths from experiment. Failures without artifacts can produce known-zero receipts from terminal status; absent plan entries stay incomplete. Copy digest artifacts and self-contained exports.
- [x] Add score --results receipts.jsonl --manifest experiment-plan.json --output dir [--corpus --track --chrome --reviews]; report default uses score report and retains old aggregate return fields for compatibility.
- [x] Accept new completed human ratings without mandatory semantic text; preserve optional semantic judgement and legacy validation.
- [x] Add bundled numerical demonstration command with clearly synthetic accounting/ratings, kept separate from two real offline render scores. Add score sensitivity JSON and optional optimizer baseline guard.
- [x] GREEN new and unchanged relevant tests; execute real Chrome E2E and inspect report/form/PNG. Clean task-owned temp data and profiles.

## Task 4: complete benchmark presentation and final review

Files: external deliverables/benchmark-scorecard-20261021/; no binary deck in repository. Owner: presentation unit with final primary facts.

- [x] Build 8–10 main slides + concise method appendix, full benchmark through scorecard: what the number means, five weights, task/model comparison, actual deduction example, rating UX, time/cost anchors, fair workloads, ablations and run commands. Chinese, large visual examples, sources in notes/appendix.
- [x] Label synthetic arithmetic examples prominently; distinguish real C/L evidence from unmeasured generation/human outcomes.
- [x] Render final deck, inspect all slides, validate structure and retain editable source. Remove draft scratch.
- [x] Independent whole-change review; fix material findings, confirm tests and cleanup, update validation notes and commit locally. No PR/push.
