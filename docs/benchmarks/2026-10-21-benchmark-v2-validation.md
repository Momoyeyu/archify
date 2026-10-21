# Benchmark v2 implementation validation — 2026-10-21

This is engineering validation of the first implementation slice in the approved [design](../superpowers/specs/2026-10-21-benchmark-v2-design.md), not evidence of an Archify advantage over another tool.

## Executed checks

| Check | Result |
| --- | --- |
| New metric, record, CLI and actual Chrome E2E tests | 47 passed, 0 failed, 0 skipped |
| Existing `npm test` core suite | 19 passed |
| Existing `test/repair-rounds.test.mjs` | 14 passed |
| Independent code review | Material findings fixed and reproduced against actual Chrome |

```sh
ARCHIFY_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node --test test/diagram-quality-cli.test.mjs test/diagram-quality-e2e.test.mjs \
  test/diagram-quality-metrics.test.mjs test/diagram-quality-records.test.mjs
npm test
node --test test/repair-rounds.test.mjs
```

The Chrome executable is environment specific; set it to the installed Chrome path. No provider credentials or model calls are needed. The E2E uses hand-authored fixtures, including a public pilot case labeled holdout; it is therefore not an isolated held-out evaluation.

## Actual task outcomes

| Offline fixture | Source + final-visible semantics | Reload / rename / render | Pilot geometry | Objective |
| --- | --- | --- | --- | --- |
| architecture-02 | passed | passed | 10 tiny-font findings | failed |
| workflow-01 | passed | passed | 6 tiny-font findings | failed |

Geometry was independently observed in Chrome at the declared viewport and normalized display scale. Under the provisional 12px floor, architecture relation labels were about 8.7px and node labels 11.9px; workflow relation labels were about 10.9px and some legend text 10.2px. Tiny-font counts refer to distinct observed text records, with node font used only when no separate glyph record exists. Neither count is a universal readability or aesthetic score. The profile remains uncalibrated; these results motivate calibration rather than a formal product-quality verdict.

The E2E checks semantic rejection of removed nodes, reversed relations, hidden nodes and truncated required labels; geometric sensitivity to tiny text and node overlap; and invariance to equivalent translation. It also checks imported observations cannot authorize verified evidence, real editing preserves visible relations, optional review import does not change objective/optimization, and static report aggregation works. Synthetic review records exist only inside the test and are deleted before exporting the demonstration. The retained report contains no human ratings or measured model usage.

## Review repairs

- Transparent, hidden, clipped and occluded labels cannot establish required visible facts. Unsupported masks/filters conservatively remain unverified; drop shadows preserve source glyph paint.
- Directed routes require an actual visible local native triangular marker. Missing, empty, transparent, hidden, zero-size and double-ended markers cannot authorize a single directed edge.
- Explicit consistent node identities disambiguate duplicate labels. Remaining ambiguous correspondence is unverified, rather than arbitrarily declared incorrect.
- A failed mandatory semantic, geometric, editing, delivery or budget guard makes optimization invalid (`eligible:false`, `score:null`). Raw objective failures still remain in planned denominators.
- Arm/model, type and complexity denominators come from the predeclared matrix; missing runs and unknown metadata are retained.

## Limits and cleanup

All 40 tasks remain authored-provisional and `calibrated:false`; none authorizes optimization keep or formal tool ranking. Sequence order and extension typed requirements remain explicitly unverified. Third-party parsers do not imply complete third-party rendering/editability support. Human support is optional raw review import and display; blind review UI, agreement statistics and actual judgments are not claimed. Runtime/cost metadata must come from a trusted external runner; hash binding is not a cryptographic signature or independent authentication of arbitrary imported JSON.

The actual browser checks are conservative DOM/paint observations, not a complete pixel-level proof for arbitrary HTML/CSS. The sensitivity CLI replays controlled fact/observation interventions; it does not rerun an agent or estimate the causal benefit of a tool component. No renderer, validator, existing v1 score or installation behavior was changed.

Test directories, edited copies, synthetic review imports and task-owned Chrome profiles are removed in cleanup/finally blocks. Only explicitly exported review artifacts and the full-design presentation are retained outside the checkout. No PR, push, model experiment or human-review request was made.
