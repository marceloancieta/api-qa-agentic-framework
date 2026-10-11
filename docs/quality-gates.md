# Quality gates

What `npm run gates` checks, the lanes that run outside it, and the conventions they rely on. Every
linter ships fixtures with the defect and with look-alike correct code, and its self-test must report
exactly the marked lines (`expect-finding: <rule>`), no more and no fewer.

## `npm run gates`

Runs before every push (pre-push hook) and needs no API:

| Step | Checks |
|---|---|
| `lint`, `format:check`, `types:check` | ESLint, Prettier, TypeScript |
| `config:check` | qa-config against its schema, plus cross-field rules |
| `test:hooks`, `test:scripts` | the Claude Code hooks and every script and library |
| `contract:check` | tracked digest, probe matrix and value sets are current ([contract tooling](contract-tooling.md)) |
| `lint:qa` | `lint-harness`, `lint-suite`, `lint-docs` on the repository, then each linter's self-test |
| `coverage:status` | every registry row against the specs and the latest results |
| `test:unit` | offline unit tests of helpers and packs |
| `scan:denylist:self-test` | the denylist scanner itself |

## Linters

| Linter | Reads | Looks for |
|---|---|---|
| `lint-harness` | specs, through the TypeScript syntax tree | harness misuse: known gaps armed too early or untracked, metadata after a skip, assertions that cannot fail, shared fixtures mutated, I/O at module scope, unnormalized comparisons, tags outside the taxonomy, destructive cases sharing a file |
| `lint-suite` | specs, registries and docs | real e-mail addresses, hosts, IPs, phone numbers, JWTs, UUIDs and long ids. Only reserved values are accepted (RFC 2606/6761 names, RFC 5737 ranges, 555-01xx, nil UUID, `<placeholders>`); there is no allow-list |
| `lint-docs` | tracked Markdown | dead links and paths, orphan docs, backlog rows, numbering, the ADR index, lesson guards, registry shape, destructive cases without a recovery |

Each linter's header lists its rule names and documents each one; `--self-test` proves them
against the fixtures in `scripts/__fixtures__/`.

## Registries, coverage and traceability

Designed cases live in `services/<pack>/registry/<feature>.md`. The format and the status lifecycle
are defined in `scripts/lib/registry.mjs` and explained in
[the registry rule](../.claude/rules/registry.md). `npm run coverage:status` enforces the lifecycle
against the specs and the latest results, and compares each registry with the floor of its endpoints.
`npm run traceability` prints the requirement → case → technique → spec → status → result → defect
matrix, and `traceability:write` writes it to `docs/traceability/<pack>.md`.

## Lanes

| Command | Runs |
|---|---|
| `npm run lanes:known-gap` | Every case armed with `test.fail(true, await knownGap(...))`, each in its own Playwright process. A gap that starts passing is reported for investigation before the arm is removed. |
| `npm run lanes:published` | Registry cases with status `published`, zero retries. `lanes:published:changed` runs only those whose endpoints changed against the tracked digest (`:live` compares with the environment's `spec_url`). |
| `npm run lanes:destructive` | Every `@destructive` case (L-59), each alone in its own Playwright process, followed by the environment's `recovery` command from qa-config and a wait until the API answers again. Every other run leaves these cases out (the `api` project's `grepInvert`), so the known-gap and published lanes skip them too. A failed recovery stops the lane. Refuses an environment with `allow_writes` false or no recovery. Its results join the latest run in `allure-results/` (same run id, nothing cleared), so `tm:report` reports the shared run and the destructive cases together; `--new-run` starts a run of its own. |
| `npm run lanes:flake` | A selection repeated N times (`--repeat-each`, default 5) with retries forced to 0. Reports tests whose repeats disagree and what to quarantine or release. |

In CI the destructive lane runs after the suite on every pull request, and the known-gap and
published lanes run daily ([continuous integration](ci.md)).

Every lane refuses a non-zero `QA_RETRIES`: a retry turns an intermittent failure into a pass.

**Exit codes (L-49).** Every lane and wrapper exits non-zero when what it runs fails. Playwright's
exit code has the last word: a run that exits non-zero while every case looks fine (a global setup
or teardown error, a failed dependency project that skipped the cases, a worker crash) fails the
lane: `errored` in the known-gap lane, `failed` in the destructive lane, a run failure in the
published and flake lanes. A Playwright process killed by a signal, timed out or unable to start is
never read as a pass. Child processes are mapped through `scripts/lib/spawn.mjs` (`exitCodeOf`),
and `scripts/__tests__/package-scripts.test.mjs` keeps every npm script chain on `&&`.

**Quarantine.** A test that `lanes:flake` confirms as flaky gets the tag `@quarantine` and a link to
the issue that tracks the fix. Gate lanes run with `--grep-invert @quarantine`, so a quarantined test
cannot turn a gate red. Quarantine is temporary: the flake lane keeps running quarantined tests and
lists those that passed every repeat as candidates for release.

## Quality gate

`npm run quality:gate` evaluates the checks configured in `qa-config.quality_gate`. Every check is
optional, and each one is a separate strategy:

- `pass_rate`, from the Playwright JSON report or Allure results;
- `p95_latency`, from the duration of API cases;
- `dast`, from a ZAP JSON report;
- `mutation_score`, from Stryker's JSON report (`npm run mutation`, below).

Each check is PASS, REVIEW or FAIL. A missing source is SKIPPED with its reason, or FAIL when the
check is `required`; malformed input is a FAIL with the reason. The worst check decides the verdict.
REVIEW writes the artifact (`reports/quality-gate.json`) and a Markdown summary without failing the
build; `--fail-on-review` makes it fail.

## Mutation testing

`npm run mutation` runs Stryker over the framework's shared libraries (`scripts/lib` and
`.claude/hooks/lib`) against the `node:test` suites; [`stryker.config.mjs`](../stryker.config.mjs)
holds the scope and explains how to narrow a run to one file. Stryker has no `node:test` runner, so
every mutant reruns the suites as a whole: the run is slow, it is not part of `npm run gates`, and
it is meant before a release or after changing a library. Its JSON report is the source of the
`mutation_score` check above.
