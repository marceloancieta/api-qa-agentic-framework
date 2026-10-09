# Test management and issue trackers

How results and case definitions reach a test-management tool, and how tooling reads and writes
issues. Both sit behind small adapter interfaces (ADR 0004), so the process does not depend on one
vendor.

## Flow

```sh
npm test                 # the run records results in allure-results/, each case with its identity
npm run tm:manifest      # optional: write reports/tm/manifest.json and list what cannot be attributed
npm run tm:publish       # send the definitions of approved, automated and published cases
npm run tm:report        # start a run, report the latest results, close the run
```

The **manifest** joins the registries with the specs (cases) and the latest run of the packs' specs
(results). A case's identity is `<service>-<version>-<TC id>`. A result without an identity, such as
a test with no case id in its title or one that never started, is excluded and named with its reason.
It is never dropped silently. Unit tests of the core are counted apart.

Every line of tool output carries a timestamp and the **run id** (`QA_RUN_ID`). The test run sets
it, each result carries it as a `run` label, and `tm:report` reuses it. One id therefore follows a run
from execution to the tool. `QA_LOG_FORMAT=json` prints JSON lines.

## Test-management providers

The provider is set in `qa-config` `test_management.provider` and configured in `test_management.options`.

| Provider | Model | Status |
|---|---|---|
| `allure-report` (default) | results only: an HTML report generated with Allure 3 (`npm run tm:open` serves it) | implemented |
| `local` | definitions-first, JSON files under `reports/tm/local`; the reference implementation and template | implemented |
| `allure-testops` | results-first: cases are created from results by identity | pending: to be built and validated against a real instance |
| `testrail` | definitions-first | documented only (below) |

Every adapter must pass the **adapter contract** (`scripts/tm/contract.mjs`). The contract checks:

- publishing is scoped and idempotent, and a case keeps its tool id when edited;
- a run is started, receives results and closes idempotently;
- a result for an unknown case is skipped with a reason;
- a closed run accepts nothing more.

A negative control proves that the contract fails a broken adapter.

Every write is read back and compared (L-04). HTTP calls retry `429`, `5xx` and network errors with
`Retry-After` or exponential backoff, and they never log headers (L-46). Credentials come from
environment variables; there is never a token flag (L-43).

### Writing an adapter (TestRail and others)

1. Copy `scripts/tm/adapters/local/index.mjs` to `scripts/tm/adapters/<tool>/index.mjs` and replace
   the JSON store with the tool's API. Use `httpClient` from `scripts/lib/http.mjs`.
2. Declare `capabilities`. A TestRail-style tool has `definitions: true` and `runs: true`. Map the
   case identity to a field you can search by (TestRail: a custom field or the case reference).
3. Implement `readDefinitions` and `readRun` so every write can be read back.
4. Register it in `scripts/tm/adapters/index.mjs` and add the provider to the qa-config schema.
5. Run `describeAdapterContract('<tool>', ...)` against the tool, or against a faithful fake of its
   documented endpoints.

## Issue trackers

The tracker is set in `qa-config` `tracker.provider` (`none`, `local`, `github` or `jira`) and
configured in `tracker.options`.

| Provider | Configuration | Credentials (environment) |
|---|---|---|
| `github` | `options.repo: "owner/name"`; keys are written `#123` | `GITHUB_TOKEN`, or `options.token_env` |
| `jira` | `base_url`, `options.project`, `options.issue_type` | `JIRA_USER` and `JIRA_TOKEN`, or `options.user_env` / `options.token_env` |
| `local` | `options.dir`; keys `LOCAL-n` | none |

`npm run tracker -- get <key>`, `create --title <t> --body-file <f>`, `comment <key> --body-file <f>`
and `move <key> <status>` go through a verified wrapper:

- placeholders are wrapped in code spans before sending;
- every write is read back;
- where the tracker renders HTML, every `<placeholder>` must still be visible (L-47).

The GitHub and Jira adapters pass the tracker contract against in-memory fakes of their documented
endpoints; the first use against a real instance should confirm that the live API agrees.

## Cited status

`npm run cited:status` finds statements that are true only while an issue is open:

- "until `<KEY>` ships" and "waiting on `<KEY>`";
- a workaround citing `<KEY>`;
- a `knownGap('<KEY>')` arm.

It asks the tracker for each key. A done issue makes the statement stale (L-11, L-26). A workaround
that cites no issue and does not say it is permanent is also reported. The check is opt-in: it
needs `tracker.provider` and `tracker.key_pattern`. Run it on a schedule, not in `gates`, because it
calls the tracker.
