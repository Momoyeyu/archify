# Real comparison pilot implementation plan

> **For agentic workers:** Use executing-plans or subagent-driven-development. Independent portable observation and rendering units use dispatching-parallel-agents; primary owns experiment execution and accounting.

**Goal:** Run two fixed shared tasks through one configured model with Archify, Mermaid, direct SVG and direct HTML, retaining real automatic scores, components and images; no human scores or PR.

**Architecture:** Freeze protocol before model generation. Add bounded independent visible-structure support and real source rendering for portable formats. Keep scoring weights/profile unchanged, record API usage and actual fee evidence without substituting guessed prices.

**Tech Stack:** Existing Node ESM/Chrome CDP, pinned Mermaid 12.2.0 in external runtime, user-supplied DeepSeek official API deepseek-flash (DeepSeek-V4.1-Flash-1017), non-thinking mode. BUPT was an excluded setup probe only.

**Spec:** User request 2026-10-21 plus approved scorecard-redesign specification. Implementation choices stated in commentary: architecture-01/workflow-01, four arms, one independent first candidate per task/arm, no manual repairs.

## Constraints

- Same task prompts, model alias, temperature0.2, max output8192 tokens and one candidate; arm-specific format instructions retained and counted.
- Time starts before API request, includes deterministic rendering until final artifact is ready; independent grading time excluded. One trial per cell; no significance or general ranking claim.
- Preflight all formats on unrelated fixtures before spending model quota. Unsupported measurement remains incomplete, never an artificial model failure.
- Extract visible topology from actual shapes, labels, routes and arrowheads; no gold-guided graph filling or generator metadata proof. Independent local edit/reload checks on temporary copies.
- Freeze all eight planned cells, retain errors/omissions, no hand repair or post-hoc selective rerun.
- Real provider tokens retained. The user selected the official DeepSeek endpoint; USD cost uses actual cache/input/output usage times the verified official tariff. CNY wallet delta is separate and does not establish per-request cash settlement. Missing accounting stays missing, never zero.
- Credentials used only in authenticated requests to configured gateway, never logged, embedded in outputs or sent to model.
- No model spending by helper agents; primary sends bounded requests. No live Archify install, push, PR or real human ratings.

## Tasks

- [x] Portable observer: new portable-browser.mjs + real Chrome fixtures. RED/GREEN visible nodes, branches/reversed routes, hidden metadata, clipping/overlap, incomplete ambiguity, cleanup.
- [x] Renderers: new pilot-render.mjs + tests. Pin actual Mermaid runtime, render preserved native source, static SVG/HTML checks and no-overwrite/cleanup.
- [x] Pilot harness: predeclared order/task/arm/model config; request/response/usage hashes, accounting and model source extraction; independent edit probe; reuse evaluateRun/scoring/report exports. Tests for missing fees, token inclusion and invalid source/failure retention.
- [x] Actual eight-run experiment: save raw model text, exact requests/response usage, generated source, rendered graph, screenshots, independent receipts. One candidate, no tune/retry based on scores.
- [x] Validate actual scorecard + image gallery in Chrome, expose per-task values and raw usage/cost basis, clean test-only scratch; review changes, save local commit only.
