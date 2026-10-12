# Backlog

Open work for the framework. This file holds **active work only**: a row that is finished goes to
the **Done** section at the end with its closing commit, and keeps its id forever, so references in
commits and docs stay valid.

- Commits follow the ADR 0008 message convention (`type(scope): ID summary`); from the first push
  on, changes reach `main` through pull requests (DOC-05).
- **Status** is one of `todo` · `in-progress` · `blocked` · `wont-do`.
- **Origin**: `L-NN` = a lesson in [`lessons-learned.md`](lessons-learned.md); `exp` = an established
  practice from field experience; `practice` = an established industry practice (ISTQB, OWASP,
  testing literature); `plan` = the framework's own roadmap; `ADR NNNN` = a recorded decision.
- **Prefixes**: `REPO` repository setup · `CORE` execution core · `CON` contract tooling ·
  `GATE` linters, gates and lanes · `TM` test management and trackers · `PROC` agentic process ·
  `PET` the example pack · `AGT` agents · `CI` continuous integration · `DOC` documentation and
  release · `FUT` later work.

---

## v0.1.0

Released: every item of the first release is in **Done**.

## v0.2.0

A second service pack proves that the core is generic. The rows are in dependency order: the gates
first, so that running one pack at a time keeps `npm run gates` green and a layer break in the new
pack fails a check; then per-pack configuration; then the pack itself.

| Id | Item | Origin | Status |
|---|---|---|---|
| GATE-15 | `lint-docs` checks that every closing commit cited in Done is a commit of the current branch, not only that it is written as a hash: a hash from before the history rewrite slipped into a Done row and only a manual check caught it. The self-test fixtures need a small git history of their own. | exp | todo |
| GATE-14 | `coverage:status` judges every `published` row against the latest run only, so after running one spec or one pack the rows outside it are `not-in-results` and `npm run gates` fails until a full run. Keep the latest result per pack (or per case) instead. | exp | todo |
| GATE-16 | The layer boundaries of ADR 0007 are checked, not only described: the core (`helpers/`, `fixtures/`, `scripts/`) never imports from `services/`, and a spec never sends a request itself (the `request` fixture, `playwright.request`, `fetch`), only through a client. Today both hold by convention and review alone. Fixtures with each break and look-alikes that are allowed. | ADR 0007 | todo |
| FUT-09 | Several packs on different hosts: qa-config holds one `api.auth`, one set of `api.actors` and one `base_url` per environment, and the `api` project and the lanes collect every pack's specs. Move auth, actors and base URL per pack (or per environment and pack) and scope the lanes by pack; until then run one pack folder at a time. | exp | todo |
| FUT-07 | Second service pack: VAmPI (single container, OpenAPI 3, JWT, users owning books) run in both its secure and vulnerable modes, so the same actor-based authorization matrix (OWASP API1 BOLA) passes on one and detects the flaw on the other. Needs a `login` auth strategy (credentials from variables, token minted and refreshed) and the container bound to localhost only. Verify image, tag and spec path before adopting. | plan | todo |

## Later (after v0.2.0)

| Id | Item | Origin | Status |
|---|---|---|---|
| FUT-01 | DAST lane: OWASP ZAP API scan importing the OpenAPI document, rule policy IGNORE / WARN / FAIL, feeding the quality gate. | practice | todo |
| FUT-02 | Performance smoke generated from the OpenAPI model (GET operations), k6 through its Docker image, thresholds feeding the quality gate; latency judged on percentiles across many requests, never on a single timing. | practice, exp | todo |
| FUT-03 | Consumer-driven contract testing (Pact) documented as a complementary extension. | practice | todo |
| FUT-04 | More auth strategies (`basic`, `oauth2-client-credentials`). | practice | todo |
| FUT-06 | Differential testing against a reference implementation, e.g. two versions of an API serving the same requests, using the field-bucket model. | exp | todo |
| FUT-05 | Template repository / `npx create-api-qa` scaffolder. | plan | todo |

---

## Done

| Id | Item | Closed by |
|---|---|---|
| REPO-01 | Scaffold and safety gates: hooks, secret scan, denylist, config schema, Petstore compose, ADRs 0001-0005. | `5ebb5a4` |
| REPO-02 | Relicense under Apache-2.0; ADR 0006 and ADR 0007. | `5ebb5a4` |
| CORE-01 | Service-pack layout `services/<name>/`; Petstore is the first pack (`services/petstore/README.md`). | `db2296d` |
| CORE-02 | `BaseClient` over `APIRequestContext` with redacted request/response evidence on every call; Petstore `pet` and `store` clients. | `db2296d` |
| CORE-03 | Auth strategies `none`, `api_key` (header/query), `bearer` selected by `api.auth`; secrets read by variable name. | `db2296d` |
| CORE-12 | `playwright.config.ts`: `--list` writes no results, extra reporters through `QA_JSON_REPORT`/`QA_JUNIT_REPORT`, `--reporter` refused, retries 0 unless `QA_RETRIES`. | `db2296d` |
| CORE-13 | `preflight` setup project: required variables asserted by name, host reachability, `--no-deps` to skip. | `db2296d` |
| CORE-16 | Petstore smoke spec (inventory read, pet create/read/delete). | `db2296d` |
| CORE-04 | `actor(name)`: the pack's clients bound to `default`, `anonymous` or an `api.actors` credential, one request context per actor. | `bac8f06` |
| CORE-05 | Flows as plain functions over an actor's clients; `step` and `expectStatus` helpers; Petstore `purchasePet`. | `bac8f06` |
| CORE-06 | Builders (`aPet`, `anOrder`) and Object Mother (`PetMother`) on a seeded faker; enum value sets are hand-written constants until CON-08 generates them. | `bac8f06` |
| CORE-07 | Seeded `rng` (root `QA_SEED` printed at start, per-test seed from the title path, replay hint on failure) and `clock` (`QA_CLOCK` pins it). | `bac8f06` |
| CORE-08 | Redaction: built-in secret keys masked; pack identity fields pseudonymized (HMAC with a per-run salt) in bodies, query and route parameters; anonymization helpers `mask`, `hash`, `substitute`, `generalize`. | `72a55f3` |
| CORE-09 | Case metadata: identity `<service>-<version>-<TC id>` from the title, suite labels from `service.json`, `operation()`, `knownGap()` checked against `tracker.key_pattern` with `tracker.issue_url`, placeholders wrapped in code spans; Playwright tags reach Allure natively. | `72a55f3` |
| CORE-11 | Schema validation by spec version (2.0 and 3.0 converted to draft-07, 3.1 with draft 2020-12, OpenAPI formats) and the `toMatchSchema` matcher. | `72a55f3` |
| CORE-17 | Error-envelope catalog per pack and `expectErrorEnvelope` (shape vs meaning, field read from keys with spelling tolerance, never from message text); Petstore catalog. | `72a55f3` |
| CORE-10 | `withResourceGuard`: capture, run, compare, repair only real differences, confirm; never throws over the case; unintended changes and failed repairs reported as attachment, annotation and soft failure, plus stderr when the case is armed with `test.fail`. Petstore `seedPet` guard. | `394bb44` |
| CORE-14 | `skipUnless` and `requireData`: skips warn and annotate; data in the wrong state fails as a precondition. | `394bb44` |
| CORE-15 | Run lock (`allure-results.lock`, pid + age staleness, `QA_ALLOW_CONCURRENT_RUNS=1`), taken in global setup before the results are cleared and released in global teardown. | `394bb44` |
| CORE-18 | State comparison by field bucket (identity, business, provenance, volatile) with normalizers, unclassified-field reporting, `expectOnlyChanged` and inventory comparison; Petstore pet and order models. | `394bb44` |
| CON-01 | `scripts/lib/openapi.mjs`: Swagger 2.0 / OpenAPI 3.0 / 3.1, JSON or YAML, into one model with 2020-12 schemas (`#/schemas/<Name>` refs), operations with merged parameters, bodies and responses by media type, effective security; problems reported, unsupported versions rejected; typed for TS (`openapi.d.mts`). `helpers/schema.ts` now validates every version through it. | `6798d63` |
| CON-02 | Equivalence self-test: the Shelter resource in 2.0 JSON, 3.0 JSON and 3.1 YAML normalizes to the identical model; Petstore v2 and v3 normalize without problems. Floor and probe equivalence is added with those scripts. | `6798d63` |
| CON-03 | `swagger-digest`: sorted, flat digest of parameters, bodies, response codes and content, security and named schemas; operation text in its own low-severity drift class; `--check` fails on structural drift, `--live` compares the deployed spec. Shared `--service/--spec/--live` flags in `scripts/lib/cli.mjs`. | `3f0fd88`, `bc285db` |
| CON-04 | `derive-probe-matrix`: scheduled probes from explicit constraints (body via refs and allOf, path, query, header), exploratory probes from declared types, coverage through `probe:<id>` references in specs; `generated/probe-matrix.json` tracked and checked. | `81ead37` |
| CON-05 | `scripts/lib/pairwise.mjs`: deterministic greedy all-pairs, bounded to 12 factors of 8 values, used for combinations of independent optional parameters. | `81ead37` |
| CON-06 | Service-wide battery on every operation: malformed and truncated JSON, wrong content type, empty required body, invalid path parameters (wrong type, overlong, encoded slash). | `81ead37` |
| CON-07 | `declared-codes`: declared vs observed codes from the latest run evidence, both directions; codes only `default` covers count as undeclared; most specific path template wins. | `dc24fee` |
| CON-08 | `derive-value-sets` (enums, const and literal patterns into `generated/value-sets.json` and `enums.ts`, collision-safe names, Petstore pack switched to them) and `derive-floor` (documented per-operation formula, every term printed). | `dc24fee` |
| CON-09 | Tracked `docs/discovery/petstore-digest.json`, kept current by `npm run contract:check` in the gates. | `bc285db` |
| GATE-01 | `lint-harness` over every pack's specs through the syntax tree: `xfail-armed-early`, `known-gap-untracked`, `metadata-after-skip`, `optional-assertion`, `shared-fixture-mutation`, `module-scope-io`, `unnormalized-comparison`; exact self-test. Shared libraries `registry`, `corpus`, `lint`, `playwright-lane`. | `dac81ae`, `74bf315` |
| GATE-02 | `lint-suite`: real e-mails, hosts, IPs, phones, JWTs, UUIDs and long ids in specs, registries and docs; only built-in reserved values accepted, no allow-list; exact self-test. | `74bf315` |
| GATE-03 | `lint-docs`: dead links and paths, orphan docs, backlog row shape and status enum, computed count claims, ADR index, lesson guards due by completed stage, registry shape; exact self-test. Fixed the two stale guards it found. | `df5d0de`, `6d84a05` |
| GATE-04 | `coverage-status`: registry lifecycle against the specs (AST) and the latest results, orphan tests, untracked known gaps, per-registry counts and floor vs cases. | `30b3698` |
| GATE-05 | `traceability`: requirement -> case -> technique -> spec -> status -> result -> defect, uncovered requirements listed apart; `--write` to `docs/traceability/<pack>.md`. | `30b3698` |
| GATE-06 | `known-gap-lane` (one process per armed case; a passing gap is investigated) and `published-lane` (published cases, optionally only those touching changed operations). Lanes run from worktrees and share helpers in `scripts/lib/playwright-lane.mjs`. | `80c478f`, `53b1926`, `57c7a42` |
| GATE-08 | `quality-gate`: optional `qa-config.quality_gate` checks (pass rate, p95, DAST, mutation score), one strategy each, PASS / REVIEW / FAIL with SKIPPED for missing sources, validated input, JSON artifact and Markdown summary. | `55f7187` |
| GATE-09 | `flake-lane`: `--repeat-each` detection with zero retries, `@quarantine` convention and release candidates; every lane refuses a non-zero `QA_RETRIES`. | `53b1926` |
| GATE-10 | Stryker on `scripts/lib` and `.claude/hooks/lib`, on demand, feeding the quality gate; taken out for a while as FUT-08 and brought back with a pinned `qs` override. | `55f7187` |
| GATE-11 | `npm run gates`: lint, format, types, config, hook and script tests, contract check, `lint:qa` (three linters and their self-tests), coverage status, unit tests, denylist self-test. `docs/quality-gates.md`. | `2d7df05` |
| TM-01 | `scripts/tm/manifest.mjs`: cases from registries joined with specs, latest results of the packs keyed by identity, unattributed results excluded with reasons, unit-test results counted apart; shared `scripts/lib/results.mjs`. | `def84ad` |
| TM-02 | Adapter interface and contract tests (`scripts/tm/contract.mjs`, with a negative control); `local` adapter as reference and template; `tm:publish` / `tm:report`. | `dc5883d` |
| TM-03 | Adapters `allure-report` (default, Allure 3 HTML report read back against its results) and `allure-testops` (results-first: launch per run, uploads keyed by identity without machine labels, polled read-back; contract run live against TestOps 26.3, `npm run tm:contract:live`); `testrail` documented in `docs/test-management.md`. | `49c462c`, `3564ee7` |
| TM-04 | Adapter base: HTTP retries for 429/5xx/network with Retry-After or backoff (`scripts/lib/http.mjs`), idempotent close, scoped operations, read-back after every write. | `dc5883d`, `e239e96` |
| TM-05 | Tracker interface (`scripts/tracker/`): local, GitHub and Jira adapters behind a verified wrapper (read-back, rendered placeholders kept), credentials from the environment only, contract tests over fakes; `npm run tracker`. | `e239e96` |
| TM-06 | Run id and timestamps on tool output (`scripts/lib/log.mjs`); the run id is set by the test run, carried as a result label and reused by `tm:report`. | `3616cd8`, `49c462c` |
| PROC-01 | Rules in `.claude/rules/`: modes, reachability, service packs, registry, generation, tagging, reporting and documentation (fact owners and propagation table). | `9f7bb26` |
| PROC-02 | Phase skills `qa-intake`, `qa-design`, `qa-automate`, `qa-publish`, `qa-run`, `qa-report-bug`; design names one technique per case. | `9f7bb26` |
| PROC-03 | `qa-intake` completes the contract in source order, measures read-only, records gaps with their tracker search and open questions before design. | `9f7bb26` |
| PROC-04 | `qa-design` and `qa-report-bug` ask who else writes a field, arrange non-default values, assert own records and check state after an error on a write. | `9f7bb26` |
| PROC-05 | Every phase skill says what to do when it stops halfway; `qa-publish` lists orphaned cases; `qa-intake` and `qa-run` stop on a feature or selection that does not exist or selects nothing. | `9f7bb26` |
| PROC-06 | `npm run scaffold:service` (plan, then `--write`; `--skill-only` for an existing pack), `docs/templates/service-skill.md`, the Petstore skill; `contract:check` covers every pack. | `7196565` |
| PROC-07 | `AGENTS.md` (tool-neutral guide) and `CLAUDE.md` (imports it; roles, rules, skills, the skill-or-agent rule, hooks); a test keeps the rule and skill lists complete. | `03bfc08` |
| PROC-08 | Decision tables in `services/<pack>/rules/*.yaml`, checked for completeness and consistency and generated into `generated/decision-tables.ts`; Petstore example and data-driven spec. | `034e7c3` |
| PROC-09 | `docs/references/bug-reporting.md`: scope levels by fix location, title format, consolidating and re-scoping, mapping cases to one issue. | `9f7bb26` |
| PROC-10 | `docs/references/defect-rubric.md`: classes and severity as independent axes, classify by effect, worst criterion, tracker labels. | `9f7bb26` |
| PROC-11 | `docs/templates/intake.md` and `docs/templates/feature-contract.md`. | `9f7bb26` |
| PROC-12 | `docs/references/contract-analysis.md`: completion order, drift candidates, value sets versus formats, floor, techniques, security, integrity, priority, evidence. | `9f7bb26` |
| PROC-13 | `.claude/rules/modes.md`: design never writes to the system under test, execution never edits definitions, mixed requests are split. | `9f7bb26` |
| PROC-14 | `docs/templates/registry.md` and the registry header contract (`contract`, `auth`, `test_data`, `beyond_floor`, unknown keys refused); `coverage-status` counts the floor on the contract axis. | `9f7bb26` |
| GATE-07 | `cited-status`: waiting claims, workarounds and `knownGap` arms checked against the tracker; stale, unknown-key and workaround-without-exit findings; opt-in, exact fixture. | `1ca6689` |
| PET-01 | Petstore phases 0-1: feature contracts for PET, STOR and USER from read-only intake plus an execution-mode write run, contract notes PN-07 to PN-25, the first tracked defects LOCAL-1 to LOCAL-4, and 166 approved cases in seven registry files. | `8a16368`, `3d67c3a`, `53bde92` |
| AGT-01 | `spec-author` and `api-spec-reviewer` agents: one author per spec file with its own data range, a read-only reviewer with eight checks (title claim, registry fidelity, oracles, vacuous and coincidental assertions, layering, case shape, data safety) and a verdict per spec; `qa-automate` moves rows to automated only after an `approve`; evaluation fixtures with seeded defects kept in sync by a test. | `e7dd70f` |
| AGT-02 | `contract-investigator` agent: one discrepancy per launch, read-only measurement, a classification (contract drift, defect candidate, test error, undetermined); used by `qa-intake` and `qa-report-bug`. | `b0e6235` |
| GATE-12 | `@destructive` lane: every run leaves those cases out (the `api` project's `grepInvert`); `npm run lanes:destructive` runs each alone, then the environment's `recovery` command from qa-config (for Petstore, a container restart) and waits until the API answers, and adds its results to the run before it. Lints: `destructive-recovery` (a Recovery bullet in the registry) and `destructive-isolation` (a spec file of its own). | `cb15707`, `ce9782d` |
| PET-02 | Petstore phases 2-4 on a representative sample: 25 of the 166 approved cases (every technique, the layer and category tags in use, the `input-error` and `not-found` envelopes, the three decision tables, two actors), authored and reviewed (`api-spec-reviewer` approve), published with the `local` adapter and run and reported as one run with the destructive lane. The other cases stay `approved` as design examples. | `36ede6a`, `cb078ff`, `41b2052`, `6f6fc84` |
| CI-01 | GitHub Actions: `ci.yml` (gates, then the Petstore end-to-end run with docker compose: suite, destructive lane with its container restarts, report, coverage, quality gate) and `drift.yml` (daily: live digest, known-gap lane, the published cases on changed operations through `lanes:published:changed:live`, then every published case; a drift turns the run red). Compose instead of a service container, because the destructive lane's recovery restarts the container.  Each run also carries a single-file Allure report (`npm run report:html`, `allurerc.mjs`). | `672638d`, `19f182d` |
| CI-02 | Supply chain: Dependabot (npm and actions, 14-day cooldown), CodeQL (`security-extended`), gitleaks over the full history with a checksum-verified binary. | `621e0a7` |
| CI-04 | Every wrapper propagates the runner's exit code (`scripts/lib/spawn.mjs`); the lanes fail on an unexplained non-zero Playwright exit; npm chains use only `&&` (`package-scripts.test.mjs`). | `1abf4e5` |
| CI-05 | AI pull-request review (`pr-review.yml`, advisory, `pull_request` only, skipped without `ANTHROPIC_API_KEY`) against `.github/review-rubric.md`, which lists what the gates already enforce and what only a reviewer can judge. | `621e0a7` |
| CI-06 | The workflows run locally with `act` (`.actrc`, `API_SPEC_URL` override): gates, e2e, drift, gitleaks and the review's key check pass; `docs/ci.md` lists what `act` cannot reproduce. | `b3cb208` |
| GATE-13 | `secret-guard` reads code a command hands to an interpreter (a quoted heredoc that does not feed a shell, `node -e`, `python -c`) by code rules: there a file is a string literal or a path, so a member access such as `issue.key` passes; substitutions that the shell runs are still read as shell words. | `0d1db8a` |
| TM-07 | `npm run tracker -- search <words> [--open] [--limit n]` in the tracker interface and the local, GitHub and Jira adapters, with contract tests; `qa-intake`, `qa-report-bug`, the bug-reporting reference and `contract-investigator` use it to look for existing issues. | `5df079b` |
| TM-08 | CI reports to Allure TestOps when it is configured: `QA_TM_PROVIDER` replaces the qa-config provider for one run; `ci.yml` uses it when the `ALLURE_TOKEN` secret exists (endpoint and project as variables), the Jenkinsfile from a secret-text credential. Checked live from GitHub Actions and Jenkins. | `0cea1c5`, `a828ed0` |
| DOC-01 | README (first ten minutes, adoption levels, spec-version compatibility, optional pieces), `docs/onboarding.md`, `CONTRIBUTING.md`, `docs/references/README.md`, and `docs/architecture.md` with Mermaid diagrams of the building blocks, layers, phases and a run, plus the patterns in use; unused files and project-internal wording removed. | `714c39b`, `f96ca81` |
| DOC-02 | Guides: add a test case (with the phase skills or by hand) and add a service pack. | `f96ca81` |
| DOC-03 | `npm run changelog` and `changelog:write` (`scripts/changelog.mjs`): a Keep a Changelog section per version from the Conventional Commits since the last tag, with the backlog ids and short hashes; release steps in CONTRIBUTING. `CHANGELOG.md` starts at 0.1.0, tagged `v0.1.0`. | `d18e7f5`, `61a7336` |
| DOC-04 | Release gate: the first commits squashed into one and every later commit replayed with its tree, author and date, cited closing commits mapped to the new hashes; full-history gitleaks, denylist and wording scans clean; the public repository created and `main` with `v0.1.0` pushed with the owner's approval. | `5ebb5a4`, `87981db` |
| DOC-05 | GitHub Flow from the first push: `main` takes pull requests only, squash merges, linear history, no force push or deletion, and the required checks `title`, `gates` and `e2e (petstore)`; the `title` check (`scripts/commit-title.mjs`) holds pull-request titles to ADR 0008; a pull-request template; the `git-policy` rules for Conventional Commits and a protected `main`; private vulnerability reporting. | `12c3007` |
| CI-07 | The first CodeQL scan of the public repository: eight alerts fixed (`readTextIfExists` for reads with no gap before the write, `escapeRegExp`, Markdown cells that escape backslashes before pipes, HTML tags removed until none is left) and two dismissed as intended (the contract and health URLs come from qa-config). | `4ee7eea` |
| FUT-08 | Mutation testing back in v0.1.0: `npm run mutation` (Stryker over the shared libraries, on demand), with `qs` pinned by an override. | `b2f77cb` |
| CI-03 | `Jenkinsfile` and `Jenkinsfile.drift`: the CI and drift runs as declarative pipelines for Linux (`sh`) and Windows (`bat`) agents, with `PETSTORE_PORT` for a Jenkins that holds 8080; both ran green on a Jenkins with a Windows agent, checked out through SCM.  Empty parameters fall back to Jenkins environment variables, so a scheduled build gets the machine's setup. | `dd69c2e`, `b33f513`, `63a521a`, `3523d6e`, `930fa07` |
