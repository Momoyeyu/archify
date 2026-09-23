---
name: archify
description: Create polished, validated architecture, workflow, sequence, data-flow, and lifecycle/state diagrams as explorable standalone HTML with inline SVG, dark/light themes, optional trace motion, and PNG/JPEG/WebP/SVG/WebM export. Accept plain-language requirements or pasted Mermaid flowchart, sequenceDiagram, and stateDiagram input; inspect repository evidence when the diagram must reflect real code. Use when the user asks to visualize system architecture, infrastructure, cloud/security/network topology, technical workflows, API call sequences, request lifecycles, data pipelines, ETL/ELT, data lineage, state machines, or to convert/beautify Mermaid.
license: MIT
metadata:
  version: "2.17"
  author: tt-a1i
  based_on: Cocoon-AI/architecture-diagram-generator (MIT, v1.0)
---

# Archify

Create an interactive HTML diagram from typed JSON. Static output is the default; enable motion only when requested.

Run commands from your working directory, keeping candidate JSON and output artifacts there. Replace `bin/archify.mjs` in the commands below with the installed package's absolute path, or its path relative to your working directory; input and output paths resolve from that working directory.

For a real codebase, read [Repository authoring](references/repository-authoring.md) for exploration and example selection. A system description uses the steps below; an existing JSON uses the handoff path.

## Existing candidate handoff

When the user supplies a frozen candidate, run `finalize` first as one CLI invocation. Its passing receipt completes the automated gates; follow any visual review recommendation under Delivery before claiming visual quality. For repair, follow step 5.

The update check is outside the delivery critical path. A harness may start it concurrently with `finalize`; if it cannot, omit it for this task. Never add a foreground tool turn or delay a required gate for update information.

## Fast authoring path

Use this bounded path for ordinary generation. Do not read the optional Viewer Runtime reference unless the user asks about those features.

1. Choose `architecture`, `workflow`, `sequence`, `dataflow`, or `lifecycle` from the question.
2. Use the exact paths in the Type router; do not list `schemas/` or `examples/` first. For Architecture, select the matching showcase example in the Type router before loading it with `references/authoring-defaults.md` in one parallel batch; it includes boundaries, guided views, and conclusion cards. For Workflow, read defaults and its starter together. Read the relevant schema definition for any new field, enum choice, or constrained text; an example shows shape, not every allowed value or length. Boundary kinds and guided-view notes need their schema constraints before writing. For Sequence, Dataflow, and Lifecycle, read defaults, schema, common schema, and example together. Fresh authorship means new IDs, domain wording, and layout; examples provide shape, not facts. Do not run help, doctor, validate a starter, create a temporary diagram, pre-create/list output paths, or query brands. Only for explicitly requested branded marks may you query `node bin/archify.mjs brands "<name>" --json`; read `references/brand-marks.md` only for an unknown brand with a user-provided URL.
3. Artifact first: once requested scope and source evidence are covered, write the candidate directly; do not plan coordinates in prose. For Architecture, default to a system overview: one clear main path, short side branches, and sparse labels. Choose abstraction for the reader's question using [Composition and meaning](references/authoring-defaults.md#composition-and-meaning). Split an overview node only when combining it would mislead the reader about a requested interaction or important boundary; expand internals when the user asks for that mechanism. Keep source evidence for every claim. Never use node, relationship, source-reference, view, card, or boundary counts as an authoring target, ceiling, or performance lever. Add guided views and conclusion cards only when they answer an additional reader question. Set `meta.quality_profile` to `"showcase"` unless the user requests dense `standard`. Place nodes by their actual connections using Layout and routing in the defaults: main-path neighbors stay adjacent, branches sit beside their owner, and return paths have an outside corridor. Check every relationship against that placement before writing positions; automatic routing cannot rearrange nodes. Leave clear gaps for actual relationship labels. Start with automatic routes; use simple endpoint sides when the composition needs a main rail and a distinct branch. Do not guess `via`, `channelX`, `channelY`, or label coordinates before measured geometry. Use the smallest control that expresses the intended route.
4. Once the complete first candidate is written, run `finalize` directly. Its first gate is showcase validation; successful first drafts need no separate pre-validation. Keep the candidate unchanged while the command runs:

   ```bash
   node bin/archify.mjs finalize <type> <candidate.json> <output.html> --quality showcase --json
   ```

   For a repository-backed candidate, include evidence on the first draft and use the complete first command: `node bin/archify.mjs finalize <type> <candidate.json> <output.html> --repo-root <repo-root> --quality showcase --json`.

   A passing receipt proves that the included `validate`, `deliver`, strict `check`, and deterministic real-browser `browser-check` gates passed. Do not read its full sidecar or rerun individual commands afterward; use a standalone command only for an explicitly separate execution or focused failure diagnosis.

5. A non-zero exit is never success. Use its compact stdout or `evidence.summaryReceipt`; read the full receipt only if the summary is truncated and lacks enough evidence for a coherent repair. After a validation failure, edit the connected neighborhood named by the evidence in one coherent change. When several affected routes share nodes, reposition those nodes and their neighbors together before adjusting individual lines; reserve isolated side or label controls for an isolated remaining defect. Keep unrelated geometry intact. Do not run validate, layout, render, or finalize first; edit the existing JSON in place. Geometry never authorizes deleting or merging a source-backed component, relationship, reference, view, card, boundary, or semantic label; reroute, reposition, or add readable canvas space instead. After the edit, rerun the complete `finalize` command from step 4 once, retaining `--quality showcase` and `--repo-root <repo-root>` for repository-backed candidates. After editing, omit any earlier `--candidate-sha256`: it binds the previous candidate. Use `--layout-json` before the edit only when compact evidence lacks needed geometry. A receipt with only 4 artifact checks is basic validation: require all 9 checks with 0 composition errors and 0 warnings. Fix `meta.quality_profile` before geometry. For workflow v2, use the stable compiler receipt; solver internals are not authoring controls. Use standalone `validate` only for focused diagnosis, with `--repo-root <repo-root>` for a repository. A passing validation returns `candidateFrozen: true`; do not edit, revalidate, or reread it. Run its `nextAction.arguments`, replacing only `<output.html>`. Retry later environment or evidence failures against the frozen candidate. If measured evidence requires a source edit, treat it as a new candidate and rerun the complete `finalize` command without the old hash. If one issue survives two focused repairs, inspect measured geometry or the relevant contract; after one evidence-based retry, stop truthfully. A lower error count never justifies changing meaning.

## Update awareness

After the first candidate exists, a harness with true parallel tool calls may run the packaged checker `scripts/check-update.mjs` once alongside validation or `finalize`. Otherwise skip it; do not serialize it into the user's delivery path. If the checker cannot run, continue without mentioning it.

- For `silent`, continue without mentioning the update check.
- For `update_available`, read `references/update-awareness.md`, follow it, then continue the requested task.

Do not read `bin/` implementation, renderer or validator source, tests, or benchmarks before the first candidate; the commands above are sufficient. Inspect implementation only for a diagnostic without actionable evidence or after two focused repairs fail.

## Type router

| Type | Use for | Schema | Example |
|---|---|---|---|
| `architecture` | Components, services, cloud/security boundaries, infrastructure | `schemas/architecture.schema.json` | System descriptions, services, libraries, and CLI repos: `examples/web-app.architecture.json`; deployment repos: `examples/production-deployment.architecture.json` |
| `workflow` | Processes, approval gates, tool calls, runbooks, CI/CD | `schemas/workflow.schema.json` | `examples/agent-tool-call.workflow.json` |
| `sequence` | API call chains, request lifecycles, async traces, returns | `schemas/sequence.schema.json` | `examples/cache-miss-request.sequence.json` |
| `dataflow` | Pipelines, ETL/ELT, lineage, governance, consumers | `schemas/dataflow.schema.json` | `examples/product-analytics.dataflow.json` |
| `lifecycle` | State/status transitions, retries, waiting and terminal states | `schemas/lifecycle.schema.json` | `examples/deployment-release.lifecycle.json` |

When ambiguous, run `node bin/archify.mjs guide "<scenario>" --json`. Scenario proof examples are structural references, not facts to copy.

## Mermaid input

Read Mermaid for topology and meaning, then author fresh Archify JSON; do not mechanically render Mermaid styling.

- `flowchart` / `graph` → `workflow`, or `architecture` for a component map.
- `sequenceDiagram` → `sequence`; participants become semantic participants and arrows become messages.
- `stateDiagram` → `lifecycle`; states and transitions retain meaning, not Mermaid style.

## Delivery

Use the `finalize` command above for the first candidate and after a repair.

`finalize` stops at the first non-passing gate. Its compact stdout and `<output-stem>.finalize-summary.json` are the normal evidence; `<output-stem>.finalize.json` is full audit detail, not ordinary repair context. A passing `finalize` receipt reports `visualReview: "not-requested"` and creates no screenshots; report the subsequent perceptual review separately.

For every newly authored or repositioned Architecture, run `visual-check` and inspect its desktop captures before handoff. Check that the main interaction and each secondary chain read in order, branches stay near their owner, and labels visibly belong to their lines. A low crossing count does not establish this. For other artifacts, escalate to perceptual review when the summary includes `visualReviewRecommendation`, the user requests an aesthetic review, a template/renderer/viewer change needs visual regression evidence, a novel layout or browser diagnostic leaves low confidence, or the run is a sampled audit. Run `visual-check` on the finalized artifact, open its HTML contact sheet in a browser or inspect the viewport PNGs with a capable image reader, and trace the affected routes at the common desktop viewport. Each arrow must remain distinct and each relationship traceable through crossings and bends. Repair unreadable placement or routes while preserving semantic coverage, then finalize the new candidate. The recommendation's counts trigger inspection; they are not content budgets or proof of a defect. If perceptual review is unavailable, report that quality remains unverified rather than treating automated success as visual approval.

For recovery, the required order stays `deliver` → strict provenance `check` → `browser-check`. Run `visual-check` only against a strict-provenance artifact. Read `references/delivery-contract.md` for standalone syntax, any failed gate, stale provenance, recovery metadata, repeated delivery to one path, export evidence, or post-delivery opening.

For workflow viewport overflow, read [Workflow viewport repair](references/authoring-contract.md#workflow-viewport-repair) before the next layout edit.

`browser-check` collects machine-readable browser evidence from the exact delivered HTML without modifying, rerendering, or capturing it. `visual-check` is the capture-producing command for an escalated perceptual review.

Keep the claims separate: `deliver` proves deterministic artifact checks, `browser-check` proves bounded behavior in a real browser, `visual-check` adds artifact-bound captures, and perceptual review requires an actual human or image-capable reviewer. Report optional perceptual review only when it was requested or triggered by the escalation rules above.

For a standalone `deliver` invocation, add `--open` only when the user wants an immediate local preview; `finalize` does not accept that flag. For an active desktop authoring loop, the optional command is:

```bash
node bin/archify.mjs preview <type> <input>.json <output>.html --quality showcase
```

Never start preview by default.

## Optional viewer capabilities

`meta.animation: "trace"` is opt-in. Use optional `meta.views` for distinct reader questions, with no numeric target.

Read `references/viewer-runtime.md` only when the user explicitly asks for Share Cards, Route/Reach cards, motion, guided stories, deep links, presentation, search/focus, or another Viewer Runtime feature.

## Setup and fallback

No install is required inside the skill package. Verify with:

```bash
node bin/archify.mjs doctor
node bin/archify.mjs demo <output-directory>
```

When shell access is unavailable, hand-place architecture SVG into `assets/template.html`, use CSS semantic classes rather than inline colors, and follow the visual review contract in `references/delivery-contract.md`.

## Output

Return the checked HTML path, diagram type, validation summary, specification/artifact receipt, browser-evidence status, and truthful visual-review status. Do not claim success for a non-zero command or claim visual inspection you did not perform.
