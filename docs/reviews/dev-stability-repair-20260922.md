# Dev stability repair, 2026-09-22

This candidate targets `dev`. It includes the current `main` changes so the
combined behavior and both CI contracts can be tested before any later stable
promotion. It does not authorize a release or install a live Skill.

## Comparison and scope

- Tested development base: `5bddcba29e2a38d8b7326e1d625ac955d042ff13`.
- Integrated stable base: `5289f6867f048a7450ec5718f58459613a84cf41`.
- Actual integration merge: `564c2e5293f441f1846467f5f6630669f0c79b2d`.
- Validation runtime: official Node 22.23.2; real Chrome where specified.

The prior comparison covered the full suites, repeated concurrency-sensitive
checks, five diagram types, package extraction and installation, and real browser
interactions. This repair preserves existing renderer geometry and the portable
authored-output rule. It addresses the observed opener and test lifecycle
failures, legacy migration dead end, and branch integration conflicts.

## Repairs

| Trigger | Result |
| --- | --- |
| PowerShell cold start crosses the old five-second deadline | Windows gets a bounded fifteen-second deadline. Failed launches retain a machine-readable reason and a human-readable warning; a successful delivery remains successful when only opening fails. |
| Legacy workflow lacks a valid `meta.output` | `migrate workflow old.json new.json --to-schema 2 --output reports/diagram.html` repairs only the candidate's durable output value. Source bytes and unrelated validation failures are preserved. |
| Preview build remains `checking` under concurrent test load | Test polling allows a bounded active-build extension and records the state transitions on timeout. |
| Alias race test depends on a fixed 500ms scheduling window | A two-way handshake confirms the alias change before the renderer continues. The close listener is registered before it can be missed. |
| Chrome exits while helpers retain inherited pipes | Browser shutdown is idempotent, closes owned pipes, and removes its timer/listener. Route Probe exits naturally on Node 22 and Node 26. |
| A process dies after retiring the old public output | An identity/digest-bound record permits explicit `node bin/recover-output.mjs <private-recovery-directory> --json` recovery. The directory, backup and destination are checked; an existing public claimant is preserved. |
| Main and dev diverge in website and runtime CI | The merge retains the Astro build/artifact, shared browser tests, Windows Node 22/24 paths, Hermes, and delivery-lock checks. Pages remains main-only and depends on both website and Windows gates. |

The combined canonical recipe source has twelve recipes, including dev's
`layout-repair`. Astro Guide and Start were reconciled with the combined source;
the migration parity assertions were retained.

The workflow migration command remains workflow-only. For the other diagram
types, the schema documentation gives the explicit portable `meta.output`
repair and validation step. Direct render/validate do not silently rewrite old
documents or relax the existing path contract.

Recovery is explicit for one specified private directory; it neither scans
directories nor deletes delivery locks. Real subprocess tests kill the publisher
at retirement and after publication, and kill recovery after its link. A
completed recovery is repeatable; an interrupted recovery that already restored
the public name preserves both the public file and retained evidence on retry.
It does not promise power-loss durability or an atomic compare-and-swap against
a process actively replacing the directory namespace. A detected post-link
identity change is reported for inspection; cleanup removes only a positively
identified new alias. Windows runs the portable consumer fixture; actual POSIX
SIGKILL tests are marked as such.

## Corrections to the initial audit

The initial main alias-test failure did **not** prove an input overwrite or a
security vulnerability. Its fixed sleep allowed the parent to change the alias
after a safe commit. The failure log lacked ordering and final-file evidence.
The repaired test establishes ordering and retains the input-preservation
assertion; no corruption claim is made from the previous flaky result.

The initial local ZIP mismatch was also environmental. Rebuilding unchanged dev
with the official Node 22.23.2 binary reproduces the committed SHA-256 exactly:
`e3bdf376f0b00ab144451f78ab7e681f058bb50e5a4978f38d66f5aff0af070e`.
The current CI used Node 22.23.2 as well. A different local Node build is not
evidence of stale package contents.

## Verification

Focused repair checks completed before integration:

- Workflow migration: 30 passing; meta-output contract: 13 passing.
- Opener/CLI: 125 passing and one native-Windows skip on macOS.
- Preview plus visual-check: 104 passing and one native-Windows skip.
- Deterministic alias test: ten repeated passes; output-path suite: 40 passing.
- Chrome transport and visual-check: 77 passing. Route Probe: 9/9 with natural
  exit on both Node 22.23.2 and Node 26.8.1.
- Combined website: Astro check/build and 7/7 migration/public-staging tests.
- Combined generated validators, viewer, brand marks, release identity and all
  golden render/schema checks passed.
- Recovery and existing atomic-write suite: 52 passing, including malformed or
  moved records, new claimants, parent swaps and interrupted recovery.

Final combined-suite, archive, recovery and remote CI results are recorded below
when those gates complete. Counts above overlap and must not be summed as unique
coverage. Native Windows behavior is established by Windows CI, not macOS skips.
