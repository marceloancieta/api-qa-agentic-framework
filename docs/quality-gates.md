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
| `lint:qa` | `lint-harness`, `lint-suite`, `lint-docs`, `lint-layers` on the repository, then each linter's self-test |
| `coverage:status` | every registry row against the specs and the latest run of its spec |
| `test:unit` | offline unit tests of helpers and packs |
| `scan:denylist:self-test` | the denylist scanner itself |

## Linters

| Linter | Reads | Looks for |
|---|---|---|
| `lint-harness` | specs, through the TypeScript syntax tree | harness misuse: known gaps armed too early or untracked, metadata after a skip, assertions that cannot fail, shared fixtures mutated, I/O at module scope, unnormalized comparisons, tags outside the taxonomy, destructive cases sharing a file |
| `lint-suite` | specs, registries and docs | real e-mail addresses, hosts, IPs, phone numbers, JWTs, UUIDs and long ids. Only reserved values are accepted (RFC 2606/6761 names, RFC 5737 ranges, 555-01xx, nil UUID, `<placeholders>`); there is no allow-list |
| `lint-docs` | tracked Markdown | dead links and paths, orphan docs, backlog rows, closing commits missing from the history, numbering, the ADR index, lesson guards, registry shape, destructive cases without a recovery |
| `lint-layers` | the core and the specs, through the TypeScript syntax tree | the layer boundaries of [ADR 0007](adr/0007-layered-test-architecture.md): a core file that imports from `services/`, a spec that sends a request without a client |

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
| `npm run lanes:published` | Registry cases with status `published`, zero retries. `lanes:published:changed` runs only those whose endpoints changed against the tracked digest (`:live` compares with the pack's `spec_url` in the environment). |
| `npm run lanes:destructive` | Every `@destructive` case (L-59), each alone in its own Playwright process in its pack's `api-<pack>` project, followed by the `recovery` command of that pack's entry in the active qa-config environment and a wait until the pack's base URL answers again. Every other run leaves these cases out (each `api-<pack>` project's `grepInvert`), so the known-gap and published lanes skip them too. A failed recovery stops the lane. Before any case runs, it refuses a pack the environment does not configure or whose entry has `allow_writes` false or no recovery. Its results join the latest run in `allure-results/` (same run id, nothing cleared), so `tm:report` reports the shared run and the destructive cases together; `--new-run` starts a run of its own. |
| `npm run lanes:flake` | A selection repeated N times (`--repeat-each`, default 5) with retries forced to 0. Reports tests whose repeats disagree and what to quarantine or release. |
| `npm run lanes:dast -- --service <pack>` | An OWASP ZAP API scan of the pack (FUT-01): the OpenAPI document is fetched from the pack's `spec_url`, ZAP (the `zap` compose service, pinned by digest, profile `dast`) attacks the pack's base URL, injecting into the query, the body and the URL path, and writes `reports/dast/<pack>.json` and `.html` for the quality gate's `dast` check. The pack's policy is `services/<pack>/dast-rules.tsv` (ZAP's IGNORE, WARN and FAIL per rule) and `services/<pack>/dast-exclude.txt` (URLs a scan must not call). Exit 1 means an alert of a FAIL rule. An active scan writes to the API: run it only against a disposable environment. The header of `scripts/dast-lane.mjs` has the details. |
| `npm run lanes:perf -- --service <pack>` | A performance smoke of the pack (FUT-02), described [below](#performance-lane). k6 (the `k6` compose service, pinned by digest, profile `perf`) sends the pack's GET operations at a steady rate and writes `reports/perf/<pack>.json` for the quality gate's `p95_latency` check. Exit 1 means a request answered something other than the success status its operation declares. |

Every Playwright lane runs the `api-<pack>` project of every pack by default; `--service <pack>`
scopes it to that pack's project (`npm run lanes:published -- --service petstore`). The DAST and
performance lanes run in a container against one pack, so they need `--service`.

In CI the destructive lane runs after the suite on every pull request, and the known-gap and
published lanes run daily ([continuous integration](ci.md)).

Every Playwright lane refuses a non-zero `QA_RETRIES`: a retry turns an intermittent failure into a
pass.

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

### Performance lane

`npm run lanes:perf -- --service <pack>` measures latency on many requests under a steady load,
because one timing is noise. A spec's duration is no measure either, since a case that sends three
requests counts once. `scripts/perf-lane.mjs` has the details in its header.

**What it sends.** The plan comes from the pack's tracked contract, read through the OpenAPI
normalizer: every `GET` operation, with the lowest 2xx status the contract declares as its expected
answer. A required path or query parameter takes the pack's value first, then the schema's example,
its default, its first enum value. The pack's `services/<pack>/perf.json` is optional and has three
parts:

| Key | Holds |
|---|---|
| `params` | values by parameter name, for parameters the contract gives no value for (seed ids, a seed user) |
| `anonymous` | operations the contract secures but the API answers without credentials, each with the contract note that records it |
| `exclude` | operations the lane must not send, each with its reason: one that resets data, one that answers with secrets |

An operation is left out when the pack excludes it, when the contract requires credentials and the
pack does not list it in `anonymous` (authenticated runs come with FUT-10), when a required
parameter has no value or is a header or cookie, or when the contract declares no 2xx answer. The
lane prints every operation it leaves out with its reason, and refuses a `perf.json` that names an
operation the contract does not have. The plan is written to `reports/perf/<pack>-plan.json`.

**How it sends.** k6 runs `scripts/k6/smoke.js`, a fixed script that reads the plan. It uses an open
model (`constant-arrival-rate`): `--rate` requests a second (default 20) for `--duration` (default
`30s`), whatever the latency, so a slow answer cannot slow the load down and hide itself. Each
request is the next operation in turn, so every operation gets the same share. `--vus` (default 10)
caps the virtual users; when they cannot keep the rate, k6 drops iterations and the lane reports
it. Response bodies are discarded. Before k6 starts, the lane sends the first planned request from
the host, and an API that does not answer stops it (exit 2).

**What it judges.** The lane fails (exit 1) when a request answers something other than its expected
status, and names the operations. Latency is judged once, by the quality gate's `p95_latency`
check with `format: k6-summary`, on the p95 of every request in `reports/perf/<pack>.json`. Its
detail names the slowest operation. The lane prints the p95 of each operation too.

The lane sends only reads, but it is still a load: point it at local containers or an environment
meant for it, never at a shared or production one.

## Quality gate

`npm run quality:gate` evaluates the checks configured in `qa-config.quality_gate`. Every check is
optional, and each one is a separate strategy:

- `pass_rate`, from the Playwright JSON report or Allure results;
- `p95_latency`, from the requests of the performance lane (`format: k6-summary`; the example
  reads the Petstore run, so it is SKIPPED wherever that run did not happen), or from the duration
  of API cases (`format: allure-results`, per test case rather than per request);
- `dast`, from a ZAP JSON report (`npm run lanes:dast`; the example reads the VAmPI secure-mode
  scan, so it is SKIPPED wherever that scan did not run);
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
