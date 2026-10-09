# Backlog

Open work for the framework, grouped by build stage (see the roadmap in
[`docs/adr/`](adr/README.md) and the stage list below). This file holds **active work only**: a row
that is finished goes to the **Done** section at the end with its closing commit, and keeps its id
forever, so references in commits and docs stay valid.

- Until the first push, commits go straight to `main` using the ADR 0008 message convention
  (`type(scope): ID summary`); branches and pull requests start with DOC-05.
- **Status** is one of `todo` · `in-progress` · `blocked` · `wont-do`.
- **Origin**: `L-NN` = a lesson in [`lessons-learned.md`](lessons-learned.md); `exp` = an established practice from
  field experience; `practice` = an established industry
  practice (ISTQB, OWASP, testing literature); `ADR NNNN` = a recorded decision.

**Stages:** E1 execution core · E2 contract tooling · E3 linters and gates · E4 test management ·
E5 agentic process · E6 Petstore phases 0-1 · E7 agents · E8 Petstore phases 2-4 and CI ·
E9 docs and release · Later (after v0.1.0).

---

## E1 - Execution core

Complete: CORE-01 to CORE-18 are in **Done**.

## E2 - Contract tooling

Complete: CON-01 to CON-09 are in **Done**.

## E3 - Linters and gates

| Id | Item | Origin | Status |
|---|---|---|---|
| GATE-01 | `lint-harness`: `xfail-armed-early`, `known-gap-untracked`, `metadata-after-skip`, `optional-assertion`, `shared-fixture-mutation`, module-scope I/O in specs, unnormalized comparisons. Each with an exact-set self-test and negative controls. | L-03, L-13..L-19, L-24 | todo |
| GATE-02 | `lint-suite`: no real identifiers/PII in designs and specs; reserved fictional values built in, so no allow-list is needed. | L-41 | todo |
| GATE-03 | `lint-docs`: fact-ownership checks, orphan rules/references, dead paths, count claims, backlog row shape and status enum, derived tag tables in registries. | L-07..L-12, exp | todo |
| GATE-04 | `coverage-status` over the full registry lifecycle (`draft` → `approved` → `automated` → `published`, `blocked`), every column checked. | exp | todo |
| GATE-05 | Requirements traceability matrix generated from registry + results (requirement → case → technique → file → status → defect). | practice | todo |
| GATE-06 | `known-gap-lane` (one Playwright process per known-gap case) and a published-case lane; a passing known-gap is reported for investigation. | L-14, L-31 | todo |
| GATE-07 | `cited-status`: re-read "until X ships" / "waiting on X" claims against the configured tracker (opt-in). | L-11, L-26 | todo |
| GATE-08 | Quality gate (`scripts/quality-gate.mjs`): optional metric sources (pass rate, p95, DAST findings, mutation score), thresholds in `qa-config.quality_gate`, one Strategy per check, verdict PASS / REVIEW / FAIL; validates its own input. | practice, ADR 0007 | todo |
| GATE-09 | Anti-flake lane: `--repeat-each` detection run, quarantine tag, gate lanes run with zero retries. | practice, L-27 | todo |
| GATE-10 | Mutation testing (Stryker) over `scripts/lib` and hook libraries, feeding the quality gate. | practice | todo |
| GATE-11 | Single `npm run gates` composite including every self-test. | roadmap | todo |

## E4 - Test management

| Id | Item | Origin | Status |
|---|---|---|---|
| TM-01 | Neutral case manifest (spec titles + registry; results from `allure-results`); results without identity dropped and named. | ADR 0004, L-05, L-17 | todo |
| TM-02 | Adapter interface + contract tests; the `local` adapter (definitions-first) as reference and template. | ADR 0004 | todo |
| TM-03 | Adapters `allure-report` (default) and `allure-testops` (optional); `testrail` documented only. | ADR 0004 | todo |
| TM-04 | Adapter base: retries with backoff for `429`/`5xx`, idempotent close, structured ids, scoped operations (by keys or run), read-back equality after every write. | L-04, L-46 | todo |
| TM-05 | Tracker scripts (read, create, transition, comment) in Node behind a tracker interface; tokens never on the command line; read-back of rendered content. | exp, L-43, L-47 | todo |
| TM-06 | Correlation id and timestamps in all tooling output. | exp, L-48 | todo |

## E5 - Agentic process

| Id | Item | Origin | Status |
|---|---|---|---|
| PROC-01 | Rules rewritten generic: reporting protocol, generation, registry grain, service registry, tagging, doc-coherence (with fact-ownership and propagation tables), reachability. | roadmap, L-07, L-10 | todo |
| PROC-02 | Phase skills rewritten generic: intake, design, automate, publish, run, report-bug. Design names a technique per case (EP, BVA, decision table, pairwise). | roadmap, practice | todo |
| PROC-03 | Intake completes the contract before design and records open questions. | L-38 | todo |
| PROC-04 | Design and report-bug ask "who else writes this field?" before filing or closing; arrange non-default values for preserve-on-omit cases; assert own rows, not shared counters; verify state after an error on a write. | L-20, L-25, L-35, L-37 | todo |
| PROC-05 | Skill gaps: rollback when a phase fails midway, orphaned-case cleanup, a requested feature that does not exist or selects no cases. | exp | todo |
| PROC-06 | Service-skill template + scaffolder that creates a service pack. | roadmap, ADR 0007 | todo |
| PROC-07 | `CLAUDE.md` + `AGENTS.md`; the "skill vs agent" rule. | roadmap | todo |
| PROC-09 | Bug-reporting reference: scope levels by fix location, title format, operation list, consolidate and re-scope before filing. | L-51 | todo |
| PROC-10 | Defect class and severity rubric reference (independent axes, classify by effect, worst-criterion severity), used by report-bug and mapped to tracker labels. | L-52 | todo |
| PROC-11 | Intake template and feature contract doc template (metadata, endpoint contract, business rules, acceptance criteria, auth and IDOR expectations, edge and negative cases, test data, state transitions, out of scope, assumptions, gaps). | exp | todo |
| PROC-12 | Contract-analysis reference: contract completion protocol and source order, drift candidates, required/optional, value sets vs formats, floor formula (the script owns the number), technique catalogue, API security and resilience (authn, BOLA, injection, schema drift, mass assignment declared-vs-honored), priority and evidence standards. | exp, L-54..L-56 | todo |
| PROC-13 | Mode rule: design and execution never mix; design never writes to the system under test; runs never edit definitions. | exp, L-58 | todo |
| PROC-14 | Registry template with header contract (feature code, endpoints, derived floor with provenance, coverage and gap, axis note, report path, auth, test-data placeholders) and the status lifecycle (`blocked` only with a key and only when the case cannot run). | exp, L-55, L-57 | todo |
| PROC-08 | Decision tables as YAML in the service pack, driving data-driven specs. | practice | todo |

## E6 / E7 / E8 - Petstore, agents, CI

| Id | Item | Origin | Status |
|---|---|---|---|
| PET-01 | Petstore phases 0-1 through the pipeline: contract docs, registries PET / STOR / USER, review gate. | roadmap | todo |
| AGT-01 | `spec-author` and `api-spec-reviewer` agents; the reviewer checks title claim against assertion, vacuous assertions and layering. | roadmap, L-20, L-21 | todo |
| AGT-02 | Optional `contract-investigator` agent. | roadmap | todo |
| PET-02 | Petstore phases 2-4: specs authored and reviewed, published and run with the `local` adapter; authorization matrix with two actors. | roadmap, CORE-04 | todo |
| CI-01 | GitHub Actions: gates → Petstore e2e with service container → daily drift (live digest, known-gap lane, published-case lane), re-running affected cases when the digest moves. | roadmap, L-28, L-31 | todo |
| CI-02 | Supply chain: Dependabot, CodeQL, gitleaks in Actions. | plan | todo |
| CI-04 | Every wrapper propagates the test runner exit code; CI fails on any gate or spec failure. | L-49 | todo |
| CI-05 | AI pull-request review workflow with a project rubric that lists what the gates already cover, so the review spends itself on what no gate checks. | exp | todo |
| CI-03 | Jenkinsfile and Jenkinsfile.drift as placeholder examples. | roadmap | todo |
| CI-06 | Run the GitHub Actions workflows locally with `act` (Docker) before the first push, so CI-01, CI-02 and CI-05 are exercised while the repository is still local; document the command and the jobs `act` cannot reproduce (e.g. CodeQL, hosted secrets). | plan | todo |

## E9 - Docs and release

| Id | Item | Origin | Status |
|---|---|---|---|
| DOC-01 | README (with spec-version compatibility table), ONBOARDING, CONTRIBUTING, `docs/references`. | roadmap | todo |
| DOC-02 | Guides: add a test case, add a service pack. | practice | todo |
| DOC-03 | CHANGELOG built from Conventional Commits and semantic versioning; tag `v0.1.0`. | plan, ADR 0008 | todo |
| DOC-04 | Release gate, before the first push: (1) rewrite the local history into clean commits (one per stage, neutral messages) so no earlier wording or file version reaches the public history; (2) full-history gitleaks + denylist scan and a wording review of every commit message; (3) create the GitHub repository and push only with explicit approval. | roadmap, ADR 0001 | todo |
| DOC-05 | Right after the first push, switch to GitHub Flow: protect `main` (required CI checks, pull requests only, squash merge, linear history), add a pull-request template linking the backlog item, and enable the matching `git-policy` rules (backlog-id key pattern, Conventional Commits, protected `main`). | ADR 0008 | todo |

## Later (after v0.1.0)

| Id | Item | Origin | Status |
|---|---|---|---|
| FUT-01 | DAST lane: OWASP ZAP API scan importing the OpenAPI document, rule policy IGNORE / WARN / FAIL, feeding the quality gate. | practice | todo |
| FUT-02 | Performance smoke generated from the OpenAPI model (GET operations), k6 through its Docker image, thresholds feeding the quality gate; latency judged on percentiles across many requests, never on a single timing. | practice, exp | todo |
| FUT-03 | Consumer-driven contract testing (Pact) documented as a complementary extension. | practice | todo |
| FUT-04 | More auth strategies (`basic`, `oauth2-client-credentials`). | practice | todo |
| FUT-06 | Differential testing against a reference implementation, e.g. two versions of an API serving the same requests, using the field-bucket model. | exp | todo |
| FUT-05 | Template repository / `npx create-api-qa` scaffolder. | plan | todo |
| FUT-07 | Second service pack: VAmPI (single container, OpenAPI 3, JWT, users owning books) run in both its secure and vulnerable modes, so the same actor-based authorization matrix (OWASP API1 BOLA) passes on one and detects the flaw on the other. Needs a `login` auth strategy (credentials from variables, token minted and refreshed) and the container bound to localhost only. Verify image, tag and spec path before adopting. | plan | todo |

---

## Done

| Id | Item | Closed by |
|---|---|---|
| E0 | Scaffold and safety gates: hooks, secret scan, denylist, config schema, Petstore compose, ADRs 0001-0005. | `5ebb5a4`, `5ebb5a4` |
| E0.5-a | Relicense under Apache-2.0; ADR 0006 and ADR 0007. | `5ebb5a4` |
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
