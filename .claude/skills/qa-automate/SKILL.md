---
name: qa-automate
description: >-
  Phase 2 of API test work. Turns the approved cases of a registry into Playwright specs in
  services/<pack>/specs/, building or extending the pack's clients, builders and flows first, then
  checks them (types, lint, harness and suite linters), runs them to prove they behave as designed
  and has each spec reviewed by the api-spec-reviewer agent. Use when the user asks to automate,
  implement or codify approved test cases, or to write the specs for a feature. Updates registry
  rows to automated. Does not publish definitions or report runs.
---

# qa-automate: write and prove the specs

**Mode: design** (`.claude/rules/modes.md`). Running the specs being written is allowed. Their writes
go to data they create, or to shared data under a resource guard, in an environment whose entry for
the pack has `allow_writes` true.

## Inputs

- The registry `services/<pack>/registry/<feature>.md`, approved rows only.
- `.claude/rules/generation.md` (layers, case shape, data), `.claude/rules/tagging.md`.
- `services/petstore/specs/` as worked examples, and the pack's existing clients, builders and flows.

## Steps

1. **Build what the cases need first**, in the conversation: client methods, builders, flows, error
   envelopes, state models. They are shared files, so no spec author edits them. A spec never
   contains a URL, a header or hand-built JSON for a contract type.
2. **Write the specs**, one test per approved case, titled `TC-<FEATURE>-NN <title> <tags>`. Group
   them by feature and category in `services/<pack>/specs/` and follow the case shape in the
   generation rule. Write a small feature in the conversation. Otherwise split the cases by spec file
   and launch one `spec-author` agent per file, in parallel when neither the files nor the data
   ranges overlap. Its launch prompt names the pack, the environment, the registry file, the case
   ids, the spec files it owns, the data range it may create (an id range or a name prefix no other
   author uses). Authors write `@destructive` cases but never run them; step 5 runs the lane. When
   an author reports **Needs**, build those blocks here (step 1) and resume the same author. Its
   candidate findings go to `qa-report-bug`.
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
   npx playwright test services/<pack>/specs/<file> --list
   ```
   Every designed case of the file appears exactly once in the listing; `lint:qa` (the harness
   linter's tag taxonomy) already holds each title to exactly one layer tag. `@destructive` cases
   are left out of every run and listing; add `QA_DESTRUCTIVE=1` to list them.
5. **Run** the new specs together against the environment
   (`npx playwright test services/<pack>/specs/<file> ...`), then the `@destructive` ones with
   `npm run lanes:destructive -- --service <pack>`, which runs each alone and follows it with the
   pack's `recovery` in the environment. Authors' runs replace each other's results, so this run is
   the one step 7 reads. Data-backed cases pass, or fail as armed known gaps. Data-gated cases skip
   with a reason. Anything else is a test error to fix, or a finding for `qa-report-bug`.
6. **Review**: launch the `api-spec-reviewer` agent on every new or changed spec, as a fresh agent
   and never the author, whose context carries its own assumptions. Fix every `blocker` and `major`
   (resume the author with the report, or fix here), run again and re-review until the verdict is
   `approve`. A `minor` may be accepted with a reason that goes into the gate summary.
7. **Record**: covered probes with `npm run contract:probes:write -- --service <pack>`, then each
   automated row moves to `automated` with its Spec column filled. `npm run coverage:status` must
   not report the feature.
8. **Review gate.** Show the spec files with their reviewer verdicts and accepted minors, the run
   summary (passed, failed as armed, skipped with reasons), data left behind and the registry diff.
   Wait for approval. Agents never hold this gate (`CLAUDE.md`, Skill or agent).
9. **Hand off** to `qa-publish`.

## If it stops halfway

- Rows move to `automated` only for specs that exist, ran and were approved by the reviewer. Never
  mark ahead of the code.
- A spec that cannot be finished is removed before the gate, and its row stays `approved`. A
  `test.fixme` park is a working state between an author's report and the next step, never a
  commit: `coverage:status` reports a test of an `approved` row as `stale-status` and
  `npm run gates` fails until the test is removed or the row moves to `automated` with the test
  enabled.
- Data the run created that it could not clean up is listed in the summary, with how to remove it.

## Do not

- Automate `draft` cases or change a case's meaning while coding it. Send it back to `qa-design`.
- Let two authors share a spec file, a data range or a building block they would both edit (L-60).
- Publish, report runs, or edit case definitions in the test-management tool.
- Commit real identifiers or personal data. Use builders and placeholders.
