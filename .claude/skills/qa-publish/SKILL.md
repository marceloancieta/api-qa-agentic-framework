---
name: qa-publish
description: >-
  Phase 3 of API test work. Publishes the automated cases of one or more packs to the configured
  test-management tool through its adapter (npm run tm:manifest, tm:publish), verifies the published
  definitions by read-back, and moves registry rows to published. Use when the user asks to publish,
  sync or push test cases to the test-management tool. Assumes the specs exist and ran in phase 2.
  Does not design, edit specs, or report a run's results.
---

# qa-publish: publish the definitions

**Mode: design** (`.claude/rules/modes.md`). It writes case definitions to the test-management tool,
not results.

## Inputs

- `test_management.provider` in qa-config and the credentials it names (`docs/test-management.md`).
- The registries' `automated` rows, and the latest run of their specs.

## Steps

1. **Check reachability** of the tool (`.claude/rules/reachability.md`).
2. **Build the manifest**: `npm run tm:manifest -- --service <pack>`. Read its exclusions: every
   result without an identity is listed with its reason (L-05, L-17). Fix a missing identity in the
   spec, never by editing the manifest.
3. **Dry run**: `npm run tm:publish -- --service <pack> --dry-run` lists what would be published and
   what is held back (drafts, blocked cases).
4. **Gate.** Show the dry run and wait for approval. Confirm that no case id changed since the last
   publish: a changed id creates a duplicate (`.claude/rules/registry.md`).
5. **Publish**: `npm run tm:publish -- --service <pack>`. The adapter reads every write back (L-04).
   A results-first tool (Allure TestOps, an Allure report) has no definitions step. Its cases are
   created from the next reported run, so continue with `qa-run` and publish the rows after that run.
6. **Record**: published rows move to `published`. From now on their feature code is frozen.
7. **Hand off** to `qa-run`, with the list of published identities and their links from
   `reports/tm/publish-<provider>.json`.

## If it stops halfway

Publishing is idempotent per identity: run it again, and cases that were already published come back
as unchanged. Update registry rows only for identities the read-back confirmed.

**Orphaned cases** (a definition whose identity no registry row has any more) are not deleted by this
skill. List them, and ask whether to delete them in the tool or to bring the row back.

## Do not

- Publish drafts or blocked cases, or publish to a tool or project other than the configured one.
- Print tokens. Edit definitions by hand in the tool: the next publish overwrites them from the specs.
