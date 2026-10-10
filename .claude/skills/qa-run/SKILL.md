---
name: qa-run
description: >-
  Phase 4 of API test work. Runs a pack's suite, or one lane of it, against the configured environment
  and reports the results to the test-management tool (npm test, then npm run tm:report). Use when the
  user asks to run, execute or re-run tests, run a lane such as smoke or known gaps, or report results.
  Includes a data gate before the run and a report of every pass, failure and skip with its reason.
  Execution mode: never edits specs, registries or case definitions.
---

# qa-run: run and report

**Mode: execution** (`.claude/rules/modes.md`). Run what exists; change nothing that defines it.

## Steps

1. **Pick the selection**: a pack (`services/<pack>/specs/`), a lane (`--grep @smoke`,
   `npm run lanes:known-gap`, `npm run lanes:published`), or named cases (`--grep TC-PET-0[1-3]`).
   If the selection matches no test (`--list` shows none), say so and stop; never widen it on your
   own.
2. **Check the environment**: `QA_ENV`, its `base_url` and `allow_writes` (`.claude/rules/service-packs.md`)
   and reachability (`.claude/rules/reachability.md`). Never run against an environment the user did
   not choose.
3. **Data gate.** State what data the selection needs and which cases will skip without it (the
   registry `test_data`, `skipUnless` reasons). For a write-heavy selection, show the environment and
   wait for "go".
4. **Run**: `npx playwright test <selection>`, never with `--reporter` (L-23). The preflight project
   checks configuration and the host first. Note the printed `QA_SEED` and run id.
5. **Report to the tool**: `npm run tm:report -- --service <pack>`. It reuses the run id, lists the
   results it could not attribute, and closes the run even if reporting fails.
6. **Summarize** in the user's language:
   - per case: passed, failed (with the assertion), failed as an armed known gap, or skipped with its
     reason;
   - the run link from `reports/tm/report-<provider>.json`, and the seed;
   - definitions in the tool with no matching spec, and specs with no definition;
   - data the run created and did not remove.
7. **Follow-ups** are proposals, not actions: a design change (`qa-design`), a defect
   (`qa-report-bug`), a flaky case (`npm run lanes:flake`), or a known gap that started passing
   (check whether its issue is fixed before removing the arm, L-14).

## If it stops halfway

An interrupted run leaves `allure-results/` and its lock. The next run takes over a stale lock by
itself. Report what ran, and do not report a partial run to the tool as if it were complete: name it
as partial with `--name`.

## Do not

- Edit a spec, a registry or a definition because of what the run showed.
- Run lanes in parallel against the same results directory, or open a second report for the same run.
- Print tokens or attach unredacted bodies.
