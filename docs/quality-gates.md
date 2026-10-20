# Quality gates

What `npm run gates` checks, the lanes that run outside it, and the conventions they rely on. Every
linter ships fixtures with the defect and with look-alike correct code, and its self-test must report
exactly the marked lines (`expect-finding: <rule>`), no more and no fewer.

## `npm run gates`

Runs before every push (pre-push hook) and needs no API:

| Step | Checks |
|---|---|
| `lint`, `format:check`, `types:check` | ESLint, Prettier (`npm run format` rewrites the files it reports), TypeScript |
| `config:check` | qa-config against its schema, plus cross-field rules |
| `test:hooks`, `test:scripts` | the Claude Code hooks and every script and library |
| `contract:check` | tracked digest, probe matrix, value sets and decision tables are current ([contract tooling](contract-tooling.md)) |
| `lint:qa` | `lint-harness`, `lint-suite`, `lint-docs`, `lint-layers` on the repository, then each linter's self-test (`lint:self-test`) |
| `coverage:status` | every registry row against the specs and the latest run of its spec |
| `test:unit` | offline unit tests of helpers and packs |
| `scan:denylist:self-test` | the denylist scanner itself |

## Linters

| Linter | Reads | Looks for |
|---|---|---|
| `lint-harness` | specs, through the TypeScript syntax tree | harness misuse: known gaps armed too early or untracked, metadata after a skip, assertions that cannot fail, shared fixtures mutated, I/O at module scope, unnormalized comparisons, tags outside the taxonomy, destructive cases sharing a file |
| `lint-suite` | specs, registries and docs | real e-mail addresses, hosts, IPs, phone numbers, JWTs, UUIDs and long ids. Only reserved values are accepted (RFC 2606/6761 names, RFC 5737 ranges, 555-01xx, nil UUID, `<placeholders>`); there is no allow-list |
| `lint-docs` | tracked Markdown; for note ids, the tracked code and data files too | dead links and paths, orphan docs, backlog rows, closing commits missing from the history, numbering, cited contract notes their pack does not define, the ADR index, lesson guards, registry shape, destructive cases without a recovery |
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
| `npm run lanes:destructive` | Every `@destructive` case (L-59), each alone in its own Playwright process in its pack's `api-<pack>` project, followed by the `recovery` command of that pack's entry in the active qa-config environment and a wait until the pack's base URL answers below 500, for up to `recovery.ready_timeout_s` seconds (default 60). Every other run leaves these cases out (each `api-<pack>` project's `grepInvert`), so the known-gap and published lanes skip them too, and so does the flake lane. A failed recovery stops the lane. Before any case runs, it refuses a pack the environment does not configure or whose entry has `allow_writes` false or no recovery. Its results join the latest run in `allure-results/` (same run id, nothing cleared), so `tm:report` reports the shared run and the destructive cases together; `--new-run` starts a run of its own. With `QA_JUNIT_REPORT` or `PLAYWRIGHT_HTML_OUTPUT_DIR` set, each case writes its own JUnit file or HTML folder (`<name>-<project>-<case>`), so no case overwrites another's ([Jenkins](ci.md#jenkins)). |
| `npm run lanes:flake` | A selection repeated N times (`--repeat-each`, default 5) with retries forced to 0. Reports tests whose repeats disagree and what to quarantine or release. The only run that includes `@quarantine` cases ([quarantine](#quarantine)). |
| `npm run lanes:dast -- --service <pack>` | An OWASP ZAP API scan of the pack (FUT-01): the OpenAPI document is fetched from the pack's `spec_url` (at most 16 MiB; a larger one stops the lane with 2), ZAP (the `zap` compose service, pinned by digest, profile `dast`, started with `-silent` so a scan neither downloads add-ons nor calls ZAP's online services, and runs only the rules the image holds) attacks the pack's base URL, injecting into the query, the body and the URL path, and writes `reports/dast/<pack>.json` and `.html` for the quality gate's `dast` check. The pack's policy is `services/<pack>/dast-rules.tsv` (ZAP's IGNORE, WARN and FAIL per rule) and `services/<pack>/dast-exclude.txt` (URLs a scan must not call: ZAP skips them in the spider and the active scan, and the lane removes the matching paths from the definition, because ZAP's import sends every operation once whatever the exclusions say), and `services/<pack>/dast-false-positives.tsv` (alerts the pack has shown to be false, each rule and URL with the evidence: ZAP marks them False Positive, so neither its exit nor the report the quality gate counts includes them, and the lane lists them). Exit 1 means an alert of a FAIL rule. An active scan writes to the API, so the lane scans only where the pack's entry has `allow_writes: true`, with the pack's `workers` (service.json) as ZAP's threads per host when it sets them, and runs the entry's `recovery` after the scan (for the Petstore, a container restart); a recovery that fails ends the lane with 2. The header of `scripts/dast-lane.mjs` has the details. |
| `npm run lanes:perf -- --service <pack>` | A performance smoke of the pack (FUT-02), described [below](#performance-lane). k6 (the `k6` compose service, pinned by digest, profile `perf`) sends the pack's GET operations at a steady rate and writes `reports/perf/<pack>.json` for the quality gate's `p95_latency` check. Exit 1 means a request answered something other than the success status its operation declares. |
| `npm run lanes:diff -- --service <pack> --reference <env>` | A differential comparison of two deployments of the pack (FUT-06), described [below](#differential-lane): the same read-only requests to a reference and a candidate environment, every difference in status, media type, body or contract reported, and those the pack accepted in `services/<pack>/diff.json` told apart. |

Every Playwright lane runs the `api-<pack>` project of every pack by default; `--service <pack>`
scopes it to that pack's project (`npm run lanes:published -- --service petstore`). The DAST and
performance lanes run in a container against one pack, and the differential lane compares one
pack's deployments, so all three need `--service`.

In CI the destructive lane runs after the suite on every pull request and every push to `main`, the
known-gap and published lanes run daily, and the DAST, performance and differential lanes run weekly
and on pull requests that touch them ([continuous integration](ci.md)).

### Credentials in the DAST, performance and differential lanes

The DAST, performance and differential lanes send the credential of one actor of the pack (FUT-10):
`--actor <name>`, by default `default` (the pack entry's `auth`), `anonymous` for none, or any name
in the entry's `actors`. The credential is obtained from the host through
`scripts/lib/auth-tokens.mjs`, the same code the test runner's strategies use, so every `auth` type
works except an API key in the query, which a lane refuses (exit 2): a tool's requests can carry a
fixed header, not a query parameter. A `login` or OAuth 2.0 token is due for renewal a margin before
it expires (10% of its lifetime, at most 30 s), from the `expires_in` of the answer or the `exp`
claim of a JWT. The lanes print the actor, the auth type and the header name, never the value. A
message about a missing variable names it only when the name has the shape of one
(`scripts/lib/env-names.mjs`), so a secret pasted into a `*_env` field by mistake is never printed.

- **DAST.** ZAP's API is published on a loopback port of the host. Once it answers, about a minute
  after the container starts, the lane obtains a fresh credential and sets a replacer rule that
  puts the header on every request ZAP sends, the import included; at each renewal it swaps the
  rule. A rule that was never set, or a renewal that failed, makes the scan untrusted (exit 2): the
  rest of it ran without a valid credential. The usual cause is an attacked operation that changed
  or removed the scan user's credentials, such as a password change of the caller's own account;
  keep it out with `dast-exclude.txt`. The lane also obtains the credential once before the scan,
  so a refused login stops it before ZAP starts.
- **Performance.** The credential reaches k6 through the environment of the `docker compose run`
  call only (`QA_PERF_AUTH_HEADER`, `QA_PERF_AUTH_VALUE`), never the command line or the plan file,
  because `reports/` is uploaded as a CI artifact. k6 cannot renew a token, so the lane refuses
  (exit 2) a run that would outlast it: a token due for renewal before the run and k6's start-up
  are over. The host preflight carries the credential too.

**Liveness.** During every DAST scan, with or without a credential, the lane requests the pack's
base URL from the host every 15 s (10 s timeout; any HTTP status is an answer). After four checks
in a row without an answer it stops the scan container and exits 1: an availability finding, not
an alert of a FAIL rule, whether or not ZAP wrote a report (one that exists may be incomplete). An authenticated payload can hang a fragile API
(VAmPI's vulnerable mode, VN-15), and ZAP would otherwise wait for it indefinitely.

Every Playwright lane refuses a non-zero `QA_RETRIES`: a retry turns an intermittent failure into a
pass.

**Exit codes (L-49).** Every lane and wrapper exits non-zero when what it runs fails. Playwright's
exit code has the last word: a run that exits non-zero while every case looks fine (a global setup
or teardown error, a failed dependency project that skipped the cases, a worker crash) fails the
lane: `errored` in the known-gap lane, `failed` in the destructive lane, a run failure in the
published and flake lanes. A Playwright process killed by a signal, timed out or unable to start is
never read as a pass. Child processes are mapped through `scripts/lib/spawn.mjs` (`exitCodeOf`),
and `scripts/__tests__/package-scripts.test.mjs` keeps every npm script chain on `&&`.

### Quarantine

A test that `lanes:flake` confirms as flaky gets the tag `@quarantine` and a link to the issue that
tracks the fix. Every run leaves it out: the suite, `--grep @smoke` and any other selection, and the
known-gap, published and destructive lanes. The `grepInvert` of each `api-<pack>` project does it,
the same filter that leaves `@destructive` cases out (`projectTagFilter` in `scripts/lib/tags.mjs`),
so a command-line `--grep` cannot bring a quarantined case back. The published lane reports a
quarantined case as `quarantined`; the known-gap and destructive lanes do not select it.

Quarantine is temporary, so the flake lane is the one run that keeps quarantined tests: it sets
`QA_INCLUDE_QUARANTINE=1` for its own Playwright process (an internal variable, never set by hand)
and lists those that passed every repeat as candidates for release. A quarantined `@destructive`
case runs nowhere until its quarantine ends. `scripts/__tests__/quarantine.test.mjs` checks both
sides against the repository's own configuration.

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
| `anonymous` | operations the contract secures but the API answers without credentials, each with the contract note that records it; they are planned even for an actor without a credential |
| `exclude` | operations the lane must not send, each with its reason: one that resets data, one that answers with secrets |

An operation is left out when the pack excludes it, when the contract requires credentials and the
actor sends no credential and the pack does not list it in `anonymous`, when a required
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

### Differential lane

`npm run lanes:diff -- --service <pack> --reference <env>` compares two deployments of one pack:
a release with the one before it, a new build with the running one, two regions. The specs check
what someone wrote a case for; this lane shows every change of behaviour between the two, expected
or not, so each one is reviewed. `scripts/diff-lane.mjs` has the details in its header.

**The two sides** are qa-config environments with an entry for the pack: `--reference <env>`, and
`--candidate <env>` or the active environment. The `QA_<PACK>_BASE_URL` and `QA_<PACK>_SPEC_URL`
overrides apply to the candidate only. Both sides get the credential of the same actor
(`--actor`, as in the other lanes) and `Accept: application/json`. The lane refuses (exit 2) when
the two sides are the same environment or one of them has no `spec_url`. `--out <name>` names the
report (default: the pack).

**What it compares.**

- The contracts: both `spec_url` documents go through the normalizer and are compared by their
  digests, as `contract:digest` compares the tracked one with the live one. Every structural change
  is a difference, named `contract <drift class> <where>`; prose changes are printed only.
- The answers: the performance lane's plan of `GET` requests, from the tracked contract and
  `perf.json`, plus the same request without each required query parameter, since how an API refuses
  a request is behaviour too. Only reads are sent, so the lane may run against a shared
  environment. For each request it compares the status, the media type and the body. A JSON body is
  compared with the bucket model the specs use (`scripts/lib/state-compare.mjs`): every field is
  `business`, unless `diff.json` `models` puts it in another bucket for that operation, such as
  `volatile` for a value each deployment sets when it starts. Arrays are compared item by item,
  other bodies as text (`$body`). The lane prints field paths, never values.

**What it judges.** `diff.json` `accepted` lists the differences the pack has reviewed, keyed as the
lane prints them, each with the contract note that explains it. The lane exits 1 for a difference
not accepted and for an accepted one that no longer shows up (stale: the change it describes is
gone), 0 otherwise, and 2 when it cannot run. The report lands in `reports/diff/<out>.json`.

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
check is `required`; malformed input is a FAIL with the reason. Too few samples count as no
evidence: a latency source with fewer than `min_samples` samples is SKIPPED, or FAIL when the check
is `required`, and the reason gives the count and the minimum (`only 6 timed API case(s) (2 other
result(s) ignored), fewer than min_samples 7 and the check is required`). Exactly `min_samples`
samples are enough to judge. The worst check decides the verdict; SKIPPED checks do not count, and
a run where every check was skipped is SKIPPED. REVIEW writes the artifact
(`reports/quality-gate.json`) and a Markdown summary without failing the build; `--fail-on-review`
makes it fail.

The keys of each check, whose values qa-config holds:

| Key | Checks | Required | Means |
|---|---|---|---|
| `format` | `pass_rate` (`playwright-json`, the default, or `allure-results`), `p95_latency` (`allure-results`, the default, or `k6-summary`) | no | how to read the input |
| `source` | every check | `dast`; `p95_latency` with `format: k6-summary` | where the input is. Defaults: `pass_rate` reads `$QA_JSON_REPORT` (`playwright-json`) or `allure-results`; `p95_latency` reads `allure-results`; `mutation_score` reads `reports/mutation/mutation.json` |
| `required` | every check | no | a missing source, or fewer samples than `min_samples`, is FAIL instead of SKIPPED |
| `fail_below_pct`, `review_below_pct` | `pass_rate`, `mutation_score` | `fail_below_pct` | FAIL or REVIEW when the percentage is strictly below the value |
| `fail_above_ms`, `review_above_ms` | `p95_latency` | `fail_above_ms` | FAIL or REVIEW when the 95th percentile is above the value |
| `min_samples` | `p95_latency` | no | fewest timed samples to judge (default 5): requests for `k6-summary`, API cases for `allure-results`; fewer is SKIPPED, or FAIL when `required` |
| `fail_above`, `review_above` | `dast` | `fail_above` | per risk level (`high`, `medium`, `low`, `informational`), FAIL or REVIEW when the count of alerts is above the value; a risk with no value has no limit |

Exit codes: 0 for PASS, REVIEW and SKIPPED, 1 for FAIL (and for REVIEW with `--fail-on-review`), 2
for a usage or configuration error. `--config <file>`, `--out <file>` and `--summary <file.md>`
change the inputs and outputs (`scripts/quality-gate.mjs` has the details in its header).

## Mutation testing

`npm run mutation` runs Stryker over the framework's shared libraries (`scripts/lib` and
`.claude/hooks/lib`) against the `node:test` suites; [`stryker.config.mjs`](../stryker.config.mjs)
holds the scope and explains how to narrow a run to one file (`--mutate <file>`, with
`MUTATION_TESTS` naming the suites to run instead of all of them). Stryker has no `node:test`
runner, so every mutant reruns the suites as a whole: the run is slow, it is not part of
`npm run gates`, and it is meant before a release or after changing a library. Its JSON report is
the source of the `mutation_score` check above.
