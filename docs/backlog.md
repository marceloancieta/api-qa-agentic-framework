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

| Id | Item | Origin | Status |
|---|---|---|---|
| CORE-01 | Service-pack layout `services/<name>/` (config, clients, flows, builders, rules, registry, docs, specs); core never imports from a pack. Petstore is the first pack. | ADR 0007 | todo |
| CORE-02 | `BaseClient` over Playwright `APIRequestContext`: evidence attach, redaction, no domain assumptions. Clients per resource (Service Object). | ADR 0007 | todo |
| CORE-03 | Auth strategies selected by `qa-config` `api.auth`: `none`, `api_key` (header/query), `bearer`; extensible (`basic`, `oauth2-client-credentials` later). | practice | todo |
| CORE-04 | `actor(name)` fixture: the same clients bound to a named credential (`owner`, `user`, `anonymous`), enabling authorization matrices (OWASP API1 BOLA). | practice, ADR 0007 | todo |
| CORE-05 | `flows/` convention: plain functions over an actor's clients for repeated multi-step business sequences. | practice, ADR 0007 | todo |
| CORE-06 | Test Data Builders + Object Mother derived from the normalized OpenAPI model (enums from value sets); Faker with a fixed seed printed on failure. | practice, L-36 | todo |
| CORE-07 | Seeded RNG and controllable clock fixtures; no global randomness or fixed sleeps in specs. | practice, L-27 | todo |
| CORE-08 | `redact` with key-based masking plus a configurable list of identity fields; anonymization helpers (mask, hash, substitute, generalize) for captured data. | practice, L-42 | todo |
| CORE-09 | `allureMeta`: stable identity `<service>-<version>-<TC id>`, tags mirrored from the title, `knownGap(key, why)` emitting the issue link; `<PLACEHOLDER>` in prose wrapped in code spans. | L-14, L-22, L-47 | todo |
| CORE-10 | `resourceGuard` protocol (compare before repairing, fix only real differences, report instead of throwing, flag intended vs unintended changes); verdict reported outside an armed expected-failure. | L-15, L-39 | todo |
| CORE-11 | Schema validation helper picking the ajv draft by spec version (3.0 converted, 3.1 via `ajv/dist/2020`). | ADR 0003 | todo |
| CORE-12 | `playwright.config.ts` guards: `--list` writes no results; extra JSON/JUnit reporters via env, never via `--reporter`; `retries: 0` in gate lanes. | L-23 | todo |
| CORE-13 | Global setup: stop early when the API host is unreachable, explaining why, with a switch to skip the check; required env vars asserted by name. | exp, L-43 | todo |
| CORE-14 | Data-gated cases skip loudly (warning), never silently; fixture state promises verified, not only existence. | L-40 | todo |
| CORE-15 | Run lock against concurrent local runs sharing `allure-results/`. | L-46 | todo |
| CORE-17 | Error-envelope catalog per service pack and a helper asserting the envelope by failure kind (shape vs meaning), keyed on the field, never on message text. | L-50 | todo |
| CORE-18 | State-comparison helper with field buckets (identity, business, provenance, volatile), volatile-id policy and dependent-resource inventory, over API round-trips. | L-53 | todo |
| CORE-16 | Smoke spec against Docker Petstore proving the core end to end. | roadmap | todo |

## E2 - Contract tooling

| Id | Item | Origin | Status |
|---|---|---|---|
| CON-01 | `scripts/lib/openapi.mjs` normalizer for Swagger 2.0 / OpenAPI 3.0 / 3.1 (JSON or YAML); any other version fails loudly; invalid content (e.g. a non-compiling `pattern`) is reported, not fatal. | ADR 0003, L-32 | todo |
| CON-02 | Cross-version equivalence self-test: the same resource in 2.0 and 3.0 yields the same model, floor and probes. Fixtures: Petstore v2, petstore3, hand-written 3.1. | ADR 0003 | todo |
| CON-03 | `swagger-digest` over the normalized model: properties, **parameters** and **response codes**; description changes on operations reported as a separate low-severity drift class; `--live` compares against the real spec URL. | L-02, L-29, L-30 | todo |
| CON-04 | `derive-probe-matrix` covering body, path and query parameters; report covered/gap for both scheduled and exploratory probes. | L-29, exp | todo |
| CON-05 | Pairwise reduction for parameter combinations in the probe matrix (bounded, deterministic). | practice | todo |
| CON-06 | Service-wide probe battery: malformed and truncated JSON bodies, wrong content type, path-parameter validation, applied to every operation. | L-34, exp | todo |
| CON-07 | `declared-codes`: declared vs reachable codes in both directions, flagging unreachable declared codes and undeclared answers. | L-33, exp | todo |
| CON-08 | `derive-value-sets` and `derive-floor` reading the model; generated TypeScript types for enums instead of hand-written unions. | L-36, exp | todo |
| CON-09 | Tracked Petstore digest under `docs/discovery/`. | roadmap | todo |

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

---

## Done

| Id | Item | Closed by |
|---|---|---|
| E0 | Scaffold and safety gates: hooks, secret scan, denylist, config schema, Petstore compose, ADRs 0001-0005. | `c43f951`, `ead268c` |
| E0.5-a | Relicense under Apache-2.0; ADR 0006 and ADR 0007. | `8d6128a` |
