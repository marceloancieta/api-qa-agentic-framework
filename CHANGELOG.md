# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), and each section is generated from the
commit history by `scripts/changelog.mjs`.

## [0.2.0] - 2026-10-12

### Breaking changes

- **feat(config):** configuration per service pack (#11) (FUT-09) `0ced424`
  - BREAKING CHANGE: move api.auth, api.actors and the environment's base_url, spec_url, allow_writes and recovery under api.environments.<env>.packs.<pack>; rename API_BASE_URL / API_SPEC_URL to QA_<PACK>_BASE_URL / QA_<PACK>_SPEC_URL and --project=api to --project=api-*.

### Features

- **coverage:** judge each spec against its own latest run (#7) (GATE-14) `0b06361`
- **gates:** lint-docs checks closing commits against the history (#6) (GATE-15) `1b46c39`
- **gates:** lint-layers checks the ADR 0007 boundaries (#9) (GATE-16) `8ccbcd1`
- **vampi:** second service pack with a login strategy and a BOLA matrix (#13) (FUT-07) `2dc1677`

### Fixes

- **scripts:** resolve the CodeQL findings of the first public scan (#3) (CI-07) `4ee7eea`

### Other

- **chore(vampi):** healthcheck asserts a 200 through http.client (#15) (FUT-07) `cd30696`
- **ci(github):** GitHub Flow: pull-request title check, template and policies (#2) (DOC-05) `12c3007`
- **docs(backlog):** record their closing commits; v0.1.0 complete (#4) (DOC-05, CI-07) `67c9069`
- **docs(backlog):** plan v0.2.0 around a second service pack (#5) (GATE-16) `fff210f`
- **docs(backlog):** record their closing commits (#8) (GATE-14, GATE-15) `e43ebba`
- **docs(backlog):** records its closing commit (#10) (GATE-16) `3dd7e5b`
- **docs(backlog):** records its closing commit (#12) (FUT-09) `7b08310`
- **docs(backlog):** records its closing commit; v0.2.0 complete (#14) (FUT-07) `7ed59dd`

### Not conventional

- ci(deps): Bump anthropics/claude-code-action from 1.0.235 to 1.0.236 in the actions-minor-patch group (#1) `eb9cd5c` (no backlog id after the colon)

A Dependabot update: its titles carry no backlog id, so its pull requests skip the `title` check
([CI](docs/ci.md)). The update is a pinned patch release of the action used by the advisory review.

## [0.1.0] - 2026-10-11

### Features

- **agents:** spec-author and api-spec-reviewer subagents (AGT-01) `e7dd70f`
- **agents:** contract-investigator subagent (AGT-02) `b0e6235`
- **contract:** OpenAPI normalizer and cross-version equivalence test (CON-01, CON-02) `6798d63`
- **contract:** shared CLI conventions for the contract tools (CON-03) `3f0fd88`
- **contract:** contract digest with drift classes and tracked Petstore digest (CON-03, CON-09) `bc285db`
- **contract:** declared codes, value sets, floors and generated enums (CON-07, CON-08) `dc24fee`
- **contract:** probe matrix, pairwise combinations and service-wide battery (CON-04, CON-05, CON-06) `81ead37`
- **core:** execution core skeleton (CORE-01, CORE-02, CORE-03, CORE-12, CORE-13, CORE-16) `db2296d`
- **core:** actors, flows, builders and seeded data (CORE-04, CORE-05, CORE-06, CORE-07) `bac8f06`
- **core:** redaction, case metadata, schemas and error envelopes (CORE-08, CORE-09, CORE-11, CORE-17) `72a55f3`
- **core:** resource guard, visible skips, run lock and state comparison (CORE-10, CORE-14, CORE-15, CORE-18) `394bb44`
- **gates:** shared libraries for linters, registries and lanes (GATE-04) `dac81ae`
- **gates:** coverage status over the registry lifecycle and a generated traceability matrix (GATE-04, GATE-05) `30b3698`
- **gates:** lint-docs for links, paths, orphans, backlog shape, counts, ADRs and guards (GATE-03) `df5d0de`
- **gates:** known-gap, published-case and anti-flake lanes (GATE-06, GATE-09) `53b1926`
- **gates:** lint-harness and lint-suite with exact self-tests (GATE-01, GATE-02) `74bf315`
- **gates:** quality gate with optional checks and Stryker mutation testing (GATE-08, GATE-10) `55f7187`
- **gates:** one gates command with every linter and self-test (GATE-11) `2d7df05`
- **gates:** cited-status against the configured tracker (GATE-07) `1ca6689`
- **lanes:** destructive lane with environment recovery (GATE-12) `cb15707`
- **process:** rules, phase skills, references and templates (PROC-01..05, PROC-09..14) `9f7bb26`
- **process:** service scaffolder and service-skill template (PROC-06) `7196565`
- **process:** decision tables as YAML driving data-driven specs (PROC-08) `034e7c3`
- **process:** CLAUDE.md and AGENTS.md with the skill-or-agent rule (PROC-07) `03bfc08`
- **process:** @destructive tag and lesson L-59 (PET-01) `6864364`
- **scripts:** changelog generator from Conventional Commits (DOC-03) `d18e7f5`
- **tm:** run id and timestamps for tool output (TM-06) `3616cd8`
- **tm:** neutral case manifest (TM-01) `def84ad`
- **tm:** adapter interface, contract tests, local adapter and base (TM-02, TM-04) `dc5883d`
- **tm:** allure-report adapter and run id carried across steps (TM-03) `49c462c`
- **tm:** allure-testops adapter, checked live against a TestOps trial (TM-03) `3564ee7`
- **tm:** report CI runs to Allure TestOps when its secrets exist (TM-08) `0cea1c5`
- **tracker:** tracker interface with local, GitHub and Jira adapters (TM-05) `e239e96`
- **tracker:** search issues in every tracker adapter (TM-07) `5df079b`

### Fixes

- **agents:** grade severity by what slips through; steps optional (AGT-01) `d2e7903`
- **coverage:** the latest run counts designed cases only (GATE-04) `41b2052`
- **gates:** run lanes and unit tests from inside a git worktree (GATE-06) `80c478f`
- **gates:** cited-status reports declared workarounds only (GATE-07) `e347703`
- **gates:** lint-suite does not read probe ids as numeric identifiers (GATE-02) `58eef70`
- **gates:** lesson-guard accepts skill folders and tags as guards (GATE-03) `ea18795`
- **hooks:** read embedded code by its own rules in secret-guard (GATE-13) `0d1db8a`
- **jenkins:** DEFAULT_ fallbacks, tolerant Allure publish, Field flag (CI-03) `1b6d4e1`
- **lanes:** destructive cases join the run before them (GATE-12) `ce9782d`
- **scripts:** every wrapper propagates the runner's exit code (CI-04) `1abf4e5`
- **tm:** publish automated cases only; example uses the local tool (PET-02) `cb078ff`

### Other

- **build(deps):** keep direct dependencies outside the 14-day cooldown (CI-02) `d5cdf44`
- **build(mutation):** take Stryker out of v0.1.0 (FUT-08) `a45e395`
- **build(mutation):** bring Stryker mutation testing back (FUT-08) `b2f77cb`
- **chore(contract):** integrate the contract tools into gates and docs (CON-04) `26f184b`
- **chore(repo):** scaffold, safety gates, decisions, lessons and backlog (REPO-01, REPO-02) `5ebb5a4`
- **chore(repo):** remove unused files and project-internal wording (DOC-01) `714c39b`
- **ci(act):** run the workflows locally with act (CI-06) `b3cb208`
- **ci(deps):** hold TypeScript majors and list the tracker tokens (CI-02) `cca834c`
- **ci(github):** gates, end-to-end and daily drift workflows (CI-01) `672638d`
- **ci(github):** supply chain workflows and the CI-05 AI review (CI-02) `621e0a7`
- **ci(jenkins):** Jenkinsfile and Jenkinsfile.drift (CI-03) `dd69c2e`
- **ci(jenkins):** configurable Petstore port for agents that hold 8080 (CI-03) `b33f513`
- **ci(jenkins):** settings from the Jenkins environment for scheduled builds (CI-03) `3523d6e`
- **ci(reports):** single-file Allure report in every CI run (CI-01) `19f182d`
- **ci(tm):** TestOps endpoint and project id as repository variables (TM-08) `a828ed0`
- **docs:** README, onboarding, architecture, guides and contributing (DOC-01, DOC-02) `f96ca81`
- **docs(backlog):** record the closing commit of E1 slice 1 (CORE-01) `48b282d`
- **docs(backlog):** record the closing commit of E1 slice 2 (CORE-04) `64c5a4a`
- **docs(backlog):** record the closing commit of E1 slice 3 (CORE-08) `769d0a6`
- **docs(backlog):** record the closing commit of E1 slice 4 (CORE-10) `34f4645`
- **docs(backlog):** record the closing commit of E2 phase 1 (CON-01) `1452674`
- **docs(backlog):** record the closing commit of E3 (GATE-11) `b266f1d`
- **docs(backlog):** record its closing commit (GATE-07) `ed241da`
- **docs(backlog):** record its closing commit (TM-03) `ec57afa`
- **docs(backlog):** record its closing commit; E5 complete (PROC-07) `d7480b4`
- **docs(backlog):** record its closing commits; E6 complete (PET-01) `2e884ca`
- **docs(backlog):** record its closing commits; E7 complete (AGT-01) `d509fbc`
- **docs(backlog):** automate a representative sample; CI-03 moves to Later (PET-02) `d80883d`
- **docs(backlog):** and PET-02 record their closing commits (GATE-12) `a0b68be`
- **docs(backlog):** record their closing commits (CI-01, CI-02, CI-04, CI-05, CI-06) `0d2920f`
- **docs(backlog):** record their closing commits (GATE-13, TM-07) `43dc114`
- **docs(backlog):** record their closing commits (DOC-01, DOC-02, FUT-08) `84bb654`
- **docs(backlog):** records its closing commits (CI-03) `8da5f97`
- **docs(backlog):** records the Allure report commit (CI-01) `f9983f0`
- **docs(backlog):** and CI-03 record their closing commits (TM-08) `d57b174`
- **docs(backlog):** open work by release, not by build stage (DOC-04) `87981db`
- **docs(ci):** the Jenkins pipelines in the CI guide and README (CI-03) `63a521a`
- **docs(ci):** neutral schedule example; README links TestOps reporting (CI-03) `930fa07`
- **docs(lessons):** name the helpers that guard L-22 and L-39 (GATE-03) `6d84a05`
- **docs(petstore):** move observed contract departures to pack contract notes (CORE-17) `86dc332`
- **docs(petstore):** intake contracts for PET, STOR and USER (PET-01) `8a16368`
- **docs(petstore):** write measurements and the first tracked defects (PET-01) `3d67c3a`
- **docs(petstore):** approved registries for PET, STOR and USER (PET-01) `53bde92`
- **docs(petstore):** the 25 sample cases are published (PET-02) `6f6fc84`
- **refactor(gates):** move the shared lane helpers into the lane library (GATE-06) `57c7a42`
- **test(gates):** registry-less cases use an empty tree, not the repository (GATE-04) `8a0b859`
- **test(petstore):** automate a representative sample of 25 cases (PET-02) `36ede6a`
