---
name: qa-automate
description: >-
  Phase 2 of API test work. Turns the approved cases of a registry into Playwright specs in
  services/<pack>/specs/, building or extending the pack's clients, builders and flows first, then
  checks them (types, lint, harness and suite linters) and runs them to prove they behave as designed.
  Use when the user asks to automate, implement or codify approved test cases, or to write the specs
  for a feature. Updates registry rows to automated. Does not publish definitions or report runs.
---

# qa-automate: write and prove the specs

**Mode: design** (`.claude/rules/modes.md`). Running the specs being written is allowed. Their writes
go to data they create, or to shared data under a resource guard, in an environment whose
`allow_writes` is true.

## Inputs

- The registry `services/<pack>/registry/<feature>.md`, approved rows only.
- `.claude/rules/generation.md` (layers, case shape, data), `.claude/rules/tagging.md`.
- `services/petstore/specs/` as worked examples, and the pack's existing clients, builders and flows.

## Steps

1. **Build what the cases need first**: client methods, builders, flows, error envelopes, state
   models. A spec never contains a URL, a header or hand-built JSON for a contract type.
2. **Write the specs**, one test per approved case, titled `TC-<FEATURE>-NN <title> <tags>`. Group
   them by feature and category in `services/<pack>/specs/`. Follow the case shape in the
   generation rule: metadata, preconditions, named steps, unconditional assertions.
3. **Known defects**: a case the registry maps to an open issue arms
   `test.fail(true, await knownGap('<KEY>', why))` right before the action and carries `@known-gap`.
   Finding a new defect while automating goes through `qa-report-bug`; the case keeps its status.
   A `@destructive` case goes in its own spec file, ends with the recovery its details name, and is
   run alone, never in the same run as other specs (L-59).
4. **Check offline**:
   ```sh
   npm run types:check
   npm run lint
   npm run lint:qa
   npx playwright test services/<pack>/specs/<file> --list --grep @regression
   ```
   Every designed case appears exactly once across the layer tags.
5. **Run** the new specs against the environment
   (`npx playwright test services/<pack>/specs/<file>`). Data-backed cases pass, or fail as armed
   known gaps. Data-gated cases skip with a reason. Anything else is a test error to fix, or a finding
   for `qa-report-bug`.
6. **Record**: covered probes with `npm run contract:probes:write`, then each automated row moves to
   `automated` with its Spec column filled. `npm run coverage:status` must not report the feature.
7. **Review gate.** Show the spec files, the run summary (passed, failed as armed, skipped with
   reasons) and the registry diff. Wait for approval.
8. **Hand off** to `qa-publish`.

## If it stops halfway

- Rows move to `automated` only for specs that exist and ran. Never mark ahead of the code.
- A spec that cannot be finished is removed, or parked with `test.fixme` and its row left `approved`.
  `coverage:status` reports a parked case, so nothing hides.
- Data the run created that it could not clean up is listed in the summary, with how to remove it.

## Do not

- Automate `draft` cases or change a case's meaning while coding it. Send it back to `qa-design`.
- Publish, report runs, or edit case definitions in the test-management tool.
- Commit real identifiers or personal data. Use builders and placeholders.
