# Recommended-workflow peer benchmark rerun implementation plan

> **For agentic workers:** Use executing-plans for orchestration, with dispatching-parallel-agents for independent native renderer feasibility, peer SVG observation and session-loop ownership. The user explicitly requested execution; no new approval gate or PR.

**Goal:** Produce new real scores and diagrams for corrected Archify, direct Mermaid/SVG/HTML, Next AI Draw.io MCP and official Excalidraw MCP under one model and common generation/repair budget.

**Architecture:** Reuse frozen scoring and existing core/portable observers. Run actual native peer MCP/rendering entrypoints locally, with independent observation of visible SVG paint. A common source-submission harness preloads real tool instructions, executes native rendering, returns real native plus uniform independent diagnostics, and permits at most two model repairs. Save first-candidate and final-delivery tracks separately.

**Tech Stack:** Node ESM, actual Chrome, fixed Mermaid12.2.0, native Next MCP0.4.6/draw.io32.0.2, official Excalidraw MCP pinned SHA/native Excalidraw0.18.0. Remote SSH provider reads only the user-selected `/Users/sujunjie/.env` on mac-studio; key stays remote.

**Spec:** Previously approved benchmark v2/scorecard specs, user 2026-10-22 instruction to rerun and include popular peer AI tools, and the recorded legacy-workflow configuration correction.

## Global constraints

- Four fixed existing public tasks: architecture-01, workflow-01, architecture-04, workflow-04; one independent trial per task/arm. Existing development/calibration labels remain disclosed.
- Six arms, same official deepseek-flash, temperature0.2, thinking disabled, max output8192 tokens per call. Rotate arm order by task before generation.
- Each cell: max3 source submissions (initial +2 repairs), max600000ms, max200000 actual input/output tokens, maxUSD0.25 tariff-based cost. No unrecorded model calls, hand-repaired artifacts or selective reruns.
- Full real Archify Skill/defaults/relevant schemas/example/delivery refs preloaded; Architecture schema1 and fresh Workflow schema2. Peer arms receive actual MCP tool instructions/schema. Documentation tokens count; instruction sizes legitimately differ and are disclosed.
- Same source-only submit/diagnose/repair agent harness for every arm; it is not the tools' independent default hosted AI app. No host-model substitutions.
- Native tool-specific validation retained. Independent semantic/geometry feedback identical in fields and stopping criterion; benchmark totals/rankings never fed back. Final offline edit-probe time excluded after final candidate submission, all waits/feedback used for repairs counted in elapsed workflow.
- First-candidate scores use only first-call usage/time. Final scores include all calls/failures, original docs and repair messages. Preserve every attempt. Retain most recent native-accepted candidate if a subsequent repair fails; choosing that fallback is final submission time, not its original render time.
- Existing scoring weights/anchors unchanged. T/K saturation remains visible, raw seconds/tokens/USD shown alongside scores. Human scores absent, not zero.
- No live Archify install, external diagram upload, changes to user configs, push or PR. Temporary renderer profiles/remote helper cleaned; experiment artifacts and isolated pinned runtime retained.

## Tasks and ownership

- [x] Native feasibility: actual unrelated fixtures for corrected Archify finalize and both peer MCP/renderers, upstream versions/SHAs and >=1k-star snapshots; no model spending.
- [x] Peer observer: `peer-svg-browser.mjs`, real Chrome tests for native box/text/route/arrowhead paint, independent direction/label matching, ambiguity and cleanup. Unknown cannot become fake zero or success.
- [x] Source session: `peer-session.mjs`, bounded generation/repair with actual usage and immutable attempt evidence; TDD budget/failure/infrastructure/retention contracts.
- [x] Root orchestration: preflight all six formats and edit probes; freeze protocol/docs/evaluator identities before remote API calls; execute24 cells; save first/final receipts and actual native source/render outputs.
- [x] Chinese report: final/first scores and component tables, raw usage, real per-task gallery, peer provenance and clear limitations; human form optional. Browser/score/hash verification, cleanup and local commit.

## Review focus

- Native renderer asset/transport failure is infrastructure, never authored-source failure or fabricated benchmark zero.
- Renderer SVG labels may use foreignObject/fallback text, rough paths and masks; measure actual visible paint without trusting source metadata.
- Rejected sources and repair calls must remain in provider usage and source-submission counts.
- Legacy delivery-candidate metrics cannot mislabel repaired success as first-draft success; explicit per-attempt first track owns that claim.
- Corrected configurations and peer tools must be exercised for real; no styling approximation or synthetic competitor output.

## Rulings

- Official draw.io Skill has no available Desktop export here. Include actual Next AI Draw.io MCP and official Excalidraw MCP instead; do not disguise one renderer as another product.
- Native Excalidraw server is genuinely invoked through its MCP SDK; its actual AppCore renders locally, with native fonts embedded and no external scene upload. This tests the tool with a common host harness.
- A fixed documentation-preload harness removes omitted-reference accidents while keeping full original source text and counted token cost. It does not claim to reproduce an unmodified OpenCode/Codex agent's discretionary file access.

## Execution outcome

actual-05 completed24cells/48calls. Automatic coverage21/24, missing measurements explicitly retained. Results and limitations: [Chinese readout](../../benchmarks/2026-10-22-peer-rerun.md). Native shape coverage and stale draw.io canvas invalidated earlier trials; original evidence preserved. Per-dispatch tariff schedule replaced fixed-window guards. Fresh browser audit and165focused+19core checks passed. No earlier-candidate fallback occurred; future harness selection timing corrected without changing frozen actual-05.

## Completion correction

User rejected incomplete handoff. Same48calls now fully offline regraded with corrected multiline/known-occlusion/route-label observer; all24automaticcells complete, firstandfinal. Sixworker regrade35.762seconds, zeroadditionalinference. Native light/full-bounds previews preserve original hashes. Persistent live humanreview server on127.0.0.1:6388,23anonymousimages,5numericratings, autosave andpersonalweightedresults. Existing two-reviewer policy kept; singleuserprovisionalclearlylabelled.171focusedchecks+19corepass. Originalactual-05preserved, newregraded-01boundtonewevaluatorhash.
