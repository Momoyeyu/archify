# Domain-specific node icons (#506)

Comparison base: `5289f6867f048a7450ec5718f58459613a84cf41`.
The baseline uses [before.workflow.json](before.workflow.json); the candidate uses
[holiday-planning.workflow.json](../../../archify/examples/holiday-planning.workflow.json).
The only authored differences are five `icon` fields and three existing legend-label overrides.
Holiday dates are fixture content supplied with the reported diagram; this change does not validate calendar policy.

| 1440×900, Classic, 100%, still | Before | After |
| --- | --- | --- |
| Dark | ![Before dark](before.1440x900.dark.png) | ![After dark](after.1440x900.dark.png) |
| Light | ![Before light](before.1440x900.light.png) | ![After light](after.1440x900.light.png) |

Automated delivery and browser evidence passed for both artifacts. The condensed
[evidence receipt](evidence.json) retains artifact and screenshot hashes, containment,
readability, and Viewer-chrome results. Perceptual review of the 1440×900 light/dark
captures passed: time markers, holidays, and make-up work now have appropriate
symbols and legend names; node placement and routes are unchanged.

Reproduce the candidate from the repository root:

```sh
node archify/bin/archify.mjs deliver workflow archify/examples/holiday-planning.workflow.json /tmp/holiday-icons.html --quality showcase --json
ARCHIFY_CHROME="/path/to/chrome" node archify/bin/archify.mjs visual-check /tmp/holiday-icons.html --json
```

For the baseline, use the recorded base checkout's CLI with `before.workflow.json`.
All five renderer tests also compare the entire emitted HTML with only the icon
markup removed, including with a brand mark present. The catalog is exercised in
each mode; `none` removes only the symbol and unknown names are rejected.

Validation: `npm test --prefix archify` passed (1,350 tests passed, 53 skipped,
zero failures, including unchanged golden artifacts). Optional browser suites in
that run were skipped; the artifact-bound Chrome visual checks above were run
separately. Validator freshness, Gallery rebuild (no changes), two byte-identical
Node 22 ZIP builds, and the extracted package smoke test on macOS passed.
