---
paths:
  - 'services/**/specs/**'
  - 'helpers/case-meta.ts'
  - 'helpers/evidence.ts'
  - 'scripts/tm/**'
  - 'docs/test-management.md'
---

# Reporting

What every result carries, whichever test-management tool receives it. The tool is reached through
an adapter (`docs/test-management.md`), so nothing here names a vendor.

## Identity first

- A designed case's title starts with its id. The pack fixture gives the result the identity
  `<service>-<version>-<TC id>`, which is the only key adapters match on (L-22). Never join results
  to cases by title, file or line.
- Metadata written in the body (`operation`, `caseDescription`) comes before any skip (L-16).
- Results without an identity (a test with no case id, or a test that never started) are listed
  with a reason at every upload, never dropped quietly (L-05, L-17).

## What a result holds

| Part | Comes from |
|---|---|
| Suite tree | the pack's title and version, set automatically |
| Feature and story | `operation({ method, path, area })` |
| Severity | `operation({ severity })` |
| Tags | the title and `{ tag }` (`.claude/rules/tagging.md`) |
| Description | `caseDescription(markdown)`: objective, preconditions, a manual reproduction with placeholders, expected result |
| Steps | named `Arrange`, `Act`, `Assert`, `Record` (`.claude/rules/generation.md`) |
| Evidence | every request and response, attached by the clients, redacted (L-42) |
| Issue link | `knownGap(key, why)` for a known gap |
| Run id | the `run` label (`QA_RUN_ID`), shared with tool logs and `tm:report` (L-48) |

A result whose only evidence is a status code is incomplete. Placeholders in descriptions are
wrapped in code spans so renderers keep them (L-47).

## Runs

- One test run is reported as one run in the tool: `npm run tm:report` starts it, reports the latest
  results of the packs, and closes it even when reporting failed.
- Do not pass `--reporter` to Playwright; it replaces the configured reporters, and global setup
  refuses the run (L-23). Add reporters through `QA_JSON_REPORT` and `QA_JUNIT_REPORT`.
- Two local runs never share `allure-results/`: a second one refuses to start unless
  `QA_ALLOW_CONCURRENT_RUNS=1`.
- Every write to the tool is read back by the adapter (L-04). A publish or report that says it worked
  without a read-back is not trusted.
