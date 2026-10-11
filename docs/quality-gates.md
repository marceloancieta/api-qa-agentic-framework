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

| Linter | Reads | Rules |
|---|---|---|
| `lint-harness` | specs, through the TypeScript syntax tree | `xfail-armed-early`, `known-gap-untracked`, `metadata-after-skip`, `optional-assertion`, `shared-fixture-mutation`, `module-scope-io`, `unnormalized-comparison` |
| `lint-suite` | specs, registries and docs | real e-mail addresses, hosts, IPs, phone numbers, JWTs, UUIDs and long ids. Only reserved values are accepted (RFC 2606/6761 names, RFC 5737 ranges, 555-01xx, nil UUID, `<placeholders>`); there is no allow-list |
| `lint-docs` | tracked Markdown | `dead-link`, `dead-path`, `orphan-doc`, `backlog-row-shape`, `count-claim`, `adr-index`, `lesson-guard`, `registry-shape` |

Each linter's header documents its rules in detail.

## Registries, coverage and traceability

Designed cases live in `services/<pack>/registry/<FEATURE>.md`: YAML front matter (`feature`, `title`,
`endpoints` as a block list, optional `requirements`) and a `## Cases` table with the columns
`ID | Title | Requirement | Technique | Priority | Status | Spec | Defect`. The format is defined in
`scripts/lib/registry.mjs`.

The status lifecycle is `draft` → `approved` → `automated` → `published`, and `blocked` (with a
defect key) when a case cannot run. `npm run coverage:status` enforces the lifecycle against the specs
and the latest results, and compares each registry with the floor of its endpoints.
`npm run traceability` prints the requirement → case → technique → spec → status → result → defect
matrix, and `traceability:write` writes it to `docs/traceability/<pack>.md`.

## Lanes

| Command | Runs |
|---|---|
| `npm run lanes:known-gap` | Every case armed with `test.fail(true, await knownGap(...))`, each in its own Playwright process. A gap that starts passing is reported for investigation before the arm is removed. |
| `npm run lanes:published` | Registry cases with status `published`, zero retries. `lanes:published:changed` runs only those whose endpoints changed against the tracked digest. |
| `npm run lanes:destructive` | Every `@destructive` case (L-59), each alone in its own Playwright process, followed by the environment's `recovery` command from qa-config and a wait until the API answers again. Every other run leaves these cases out (the `api` project's `grepInvert`), so the known-gap and published lanes skip them too. A failed recovery stops the lane. Refuses an environment with `allow_writes` false or no recovery. |
| `npm run lanes:flake` | A selection repeated N times (`--repeat-each`, default 5) with retries forced to 0. Reports tests whose repeats disagree and what to quarantine or release. |

Every lane refuses a non-zero `QA_RETRIES`: a retry turns an intermittent failure into a pass.

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
- `mutation_score`, from a Stryker JSON report, for packs or libraries that run Stryker.

Each check is PASS, REVIEW or FAIL. A missing source is SKIPPED with its reason, or FAIL when the
check is `required`; malformed input is a FAIL with the reason. The worst check decides the verdict.
REVIEW writes the artifact (`reports/quality-gate.json`) and a Markdown summary without failing the
build; `--fail-on-review` makes it fail.

