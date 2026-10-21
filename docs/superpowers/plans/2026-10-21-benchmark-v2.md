# Diagram benchmark v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. The user approved implementation on 2026-10-21; proceed without another approval round. Independent ownership boundaries may run concurrently under dispatching-parallel-agents.

**Goal:** Deliver a runnable offline v2 benchmark with independently measured semantics/geometry, honest run aggregation, optional human review, controlled ablations, an end-to-end demo, and a maintainer presentation.

**Architecture:** Native sources are converted to a common graph. A browser observation independently supplies actual visible geometry. Pure evaluators compare these against task facts. CLI commands verify, aggregate, import human reviews and report, without launching providers. Existing v1 suites remain unchanged.

**Tech Stack:** Node.js >=18, built-in node:test, existing Chrome CDP transport, JSON/JSONL, standalone HTML. Local PPTX via bundled presentation runtime.

**Spec:** docs/superpowers/specs/2026-10-21-benchmark-v2-design.md

## Global Constraints

- Do not modify renderer, validator, schema-v1, installations or existing benchmark outcomes.
- Human scores never enter objective score; missing usage/reviews remain unknown, never fabricated.
- Browser, evaluator, manifest, artifact and source identities remain auditable. Pilot thresholds do not authorize formal rankings or optimization keep.
- No PR or publication. Remove only task-owned temporary tests/browser profiles after testing; retain inspectable demo evidence and final deck.

## Review Focus

- Duplicate labels and parallel directed edges must not yield duplicate semantic credit.
- Hidden native facts must not pass final-visible semantics; unknown extraction must remain unverified.
- Missing runs/timeouts and incompatible evaluator/manifest/budget identities must not inflate success.
- Partial provider usage, cached inputs and reasoning included in outputs must not be double counted.
- User-provided labels, URLs and reviews must not execute HTML/script in the static report.

### Task 1: Source adapters and independent metrics

**Files:** `benchmarks/diagram-quality/adapters.mjs`, `metrics.mjs`; `test/diagram-quality-metrics.test.mjs`.

**Interfaces:** `parseSource(format, source, {type}) -> {nodes:[{id,label,type?}],edges:[{from,to,label?}],status,unknownReasons}`. Formats: archify, mermaid (explicit supported flowchart grammar), drawio, excalidraw, svg/html (conservative unknown topology unless independently observable). `evaluateSemantics(expected, graph, observation) -> {status,passed,nodes,edges,violations}`; `evaluateGeometry(observation, profile) -> {status,passed,violations,metrics}`. Observation uses `{nodes:[{id,label,visible,rect,fontSize}],edges:[{from,to,visible,points}],texts:[{text,rect,fontSize,visible,nodeId?}],bounds:{x,y,width,height},status}`; profile includes `minFontPx:12,epsilonPx:0.5,calibrated:false`.

- [x] Write tests for missing/reversed/duplicate facts, required labels, hidden nodes, overlap vs legal containment, clipping, tiny font; run RED.
- [x] Implement parsers and metric functions; unknown unsupported syntax must fail closed. Match expected semantic keys/aliases one-to-one; count unsupported relationships separately.
- [x] Run focused tests GREEN, report API/edge cases. Do not edit other owned modules.

### Task 2: Run validation, aggregation and human review

**Files:** `benchmarks/diagram-quality/records.mjs`, `report.mjs`; `test/diagram-quality-records.test.mjs`.

**Interfaces:** `evaluateRun({task,run,graph,observation,profile}) -> receipt` consumes Task 1 functions. `aggregateRuns(receipts,{manifest}) -> report`; `attachHumanReview(receipt,review) -> receipt`; `renderReport(report) -> standalone HTML`. Receipt schemaVersion=2, benchmark='diagram-quality', identity contains manifestHash/evaluatorHash/profileHash/budget, runId/taskId/arm/model, artifactHash; outcome uses objective.{status,passed,score}, delivery, usage, human. Run candidates are ordered `{submittedAt,artifactHash,objectivePassed?}` but self-reported objectivePassed cannot establish success. Main CLI verifies the actual final candidate, and records first success only if prior candidates have independent receipts.

- [x] Write RED tests for failure denominators, repeated/mixed identities, absent/double counted usage, human hash mismatch and score invariance, malicious report strings.
- [x] Implement strict validation and objective success/MRR/latency aggregation; missing evidence stays unverified. Human profile is five 1–5 fields plus semantic judgement; reject forged completion.
- [x] Run focused tests GREEN. HTML shows coverage vs verified vs human separately and only safe local artifact links.

### Task 3: Browser observer, CLI and public example corpus

**Files:** `browser.mjs`, `benchmark.mjs`, `corpus.json`, `README.md`, `test/diagram-quality-cli.test.mjs` in the same ownership areas.

**Interfaces:** `observeArtifact({artifactPath,graph,chromePath,screenshotPath?}) -> observation` runs local Chrome through existing CDP, measures actual SVG/DOM, and always closes. CLI `check`, `verify --task --source --format --artifact --run [--observation]`, `report --results --manifest --output`, `review --receipt --review --output`, `ablate --task --source --format --artifact --run --output`. Static observation import is explicitly external evidence, not trusted provider assertion. Format limitations and evidence methods must be visible.

- [x] Write RED CLI tests against real positive/negative artifacts; use task-owned temp directories and finally cleanup.
- [x] Add independent browser observation, bind source/visible labels/relations conservatively, version/hash evaluator inputs, reject unsupported commands/options, capture immutable artifact/source identities.
- [x] Create 30 core + 10 extension task definitions with family/split/complexity/prompt/expected facts. Clearly label authored gold as provisional until independent human confirmation; no leaderboard or holdout secrecy claims for a public corpus.
- [x] Add controlled artifact/semantic interventions and sensitivity results; no optimization rankings on uncalibrated profiles.
- [x] Run real Archify CLI → v2 verification → review import → report E2E on two representative diagrams. Preserve a demo report and screenshots externally; remove ephemeral render/test directories.

### Task 4: Integration review and complete presentation

**Files:** README, final validation notes; presentation outside repository build directories.

- [x] Run all new focused tests, unchanged v1 benchmark tests, and `npm test`; inspect failures, fix verified regressions.
- [x] Independent whole-branch review, fix material issues with reproductions; verify no native product changes.
- [x] Make a Chinese editable PPTX covering the entire benchmark: problem, prior art, four tracks, corpus, fair comparison, metrics, cost accounting, human protocol, ablations, autodev, architecture, CLI, actual demo results and limitations. Sources in notes, full design not just delta.
- [x] Validate PPTX structure; render and inspect every slide, revise issues. Retain final PPTX, previews and demo report; clean temporary browser/test/build artifacts.
- [x] Commit only implementation/tests/docs using repository identity convention. Leave branch for user review; no PR, push or publication.

## Completion evidence

2026-10-21: 47 new tests, 19 existing core tests and 14 v1 repair-rounds tests passed. Actual two-task E2E verified semantics and editing; provisional geometry rejected tiny text (10 and 6 findings). Complete validation and remaining limits are recorded in `docs/benchmarks/2026-10-21-benchmark-v2-validation.md`. The 22-slide editable deck was finalized, re-imported and visually checked outside the checkout. No PR or push.
