# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), and each section is generated from the
commit history by `scripts/changelog.mjs`.

## [0.4.0] - 2026-10-15

### Upgrading from 0.3.0

- **The DAST lane writes only where it may.** It refuses an environment whose pack entry does not
  set `allow_writes: true` (exit 2), and runs the entry's `recovery` after the scan, so a local
  Petstore is restarted and its data reset. It scans with the pack's `workers` (`service.json`) as
  ZAP's threads per host; the Petstore's `1` makes its scan slower.
- **The DAST and performance lanes authenticate** as the pack's `default` actor (FUT-10). They need
  the variables of the entry's `auth` (`API_KEY` for the Petstore, `VAMPI_USER_*` and
  `npm run vampi:users` for VAmPI), and stop with exit 2 when the credential cannot be obtained or
  would expire during the run. `--actor anonymous` sends none, as 0.3.0 did. The performance lane
  now plans the operations the contract secures, so its plan and p95 change, and it refuses an API
  key sent in the query.
- **The example performance plans changed**: the Petstore's `perf.json` adds `tags`, so
  `GET /pet/findByTags` is planned; VAmPI's leaves out `GET /books/v1/{book_title}` (VN-09).
- **`@quarantine` was documented wrongly.** 0.3.0 said the gate lanes leave it out; only the
  published lane does, and the suite, known-gap and destructive lanes run quarantined tests until
  GATE-23.
- **The drift workflow and `Jenkinsfile.drift`** run the known-gap and published lanes with
  `--service petstore`; a repository with packs of its own adds them there.
- **The DAST, performance and differential workflows** also run on pull requests that change
  `scripts/lib/**`, `qa-config.example.json`, a pack's contract or `service.json`.
- **New and optional**: the `basic` and `oauth2_client_credentials` auth strategies; the scripts
  `lanes:diff`, `petstore:reference:up` and `down`, `vampi:users` and `auth:live`; the pack files
  `dast-false-positives.tsv` and `diff.json`; a `reference` environment in
  `qa-config.example.json`. A `qa-config.json` of your own needs its own reference environment for
  `lanes:diff`.
- **`.claude/settings.json`** also denies `Edit` for `~/.ssh/**`, `**/credentials*`,
  `**/.env.*.local`, `*.pfx` and `*.p12`, as it already denied reading them.
- **A new gate test**, `scripts/__tests__/ruleset.test.mjs`, requires
  `.github/rulesets/main.json` whose required checks are `title`, `gates` and `e2e (petstore)`,
  each a job of `ci.yml`. A copy that renamed those jobs updates both.
- **Messages that name a credential variable** print a redaction marker instead of a name that is
  not shaped like an environment variable (GATE-18).
- **The `petstore` compose image is pinned by digest** (PET-04), so a re-pushed `1.0.28` tag is no
  longer picked up.

### Features

- **auth:** basic and OAuth 2.0 client credentials strategies (#34) (FUT-04) `e43cc17`
- **gates:** authenticated DAST and performance lanes (#37) (FUT-10) `741aad0`
- **gates:** scan the Petstore in the DAST lane (#38) (FUT-10) `708dae7`
- **gates:** differential lane between two deployments (#40) (FUT-06) `a7ecb5c`

### Fixes

- **compose:** pin the Petstore image by digest (#49) (PET-04) `3181e28`
- **gates:** keep excluded operations out of ZAP's import (#36) (FUT-01) `4cc7ec6`
- **hooks:** hook tests ignore inherited git environment (#44) (GATE-19) `5a5da42`
- **security:** messages print only names shaped like variables (#43) (GATE-18) `120973e`
- **security:** cap the DAST definition and explain its write (#48) (GATE-20) `764f467`

### Other

- **docs(backlog):** plan v0.4.0 (#33) (DOC-07) `1b3694d`
- **docs(backlog):** records its closing commit (#35) (FUT-04) `144c4f8`
- **docs(backlog):** records its closing commits (#39) (FUT-10) `677b090`
- **docs(backlog):** record their closing commits (#42) (FUT-03, FUT-06) `a535680`
- **docs(backlog):** record their closing commits (#45) (GATE-18, GATE-19) `ebd3198`
- **docs(backlog):** records its closing commit (#47) (DOC-07) `9b6aa50`
- **docs(backlog):** record their closing commits (#50) (GATE-20, PET-04) `8022051`
- **docs(backlog):** record their closing commits (#53) (FUT-05, DOC-08) `c93e500`
- **docs(guides):** consumer-driven contracts as an extension (#41) (FUT-03) `fa06a96`
- **docs(guides):** adopt the framework from its GitHub template (#51) (FUT-05) `4a516ee`
- **docs(guides):** pre-release review of v0.4.0 (#54) (DOC-09) `d234f8c`
- **docs(review):** documentation read against the code, ADR 0010 (#46) (DOC-07) `342a0ad`
- **docs(review):** second documentation review against the code (#52) (DOC-08) `ce9b9a2`

## [0.3.0] - 2026-10-13

### Features

- **gates:** DAST lane with OWASP ZAP feeding the quality gate (#26) (FUT-01) `b941e14`
- **gates:** k6 performance lane feeding the quality gate's p95 check (#29) (FUT-02) `6c84b0f`

### Fixes

- **hooks:** session-probe reads the coverage totals again (#19) (GATE-17) `a9217fe`
- **petstore:** file the Petstore concurrency defect and run the pack on one worker (#22) (PET-03) `9ff3667`
- **scripts:** scaffolder never names its source, lists and skips smoke GETs, reads YAML (#20) (PROC-15) `8422299`
- **vampi:** retry the database seed when its random book titles collide (#28) (FUT-07) `8e983ed`

### Other

- **ci(github):** the VAmPI pack runs in CI and Jenkins, with a BOLA detection check (#24) (CI-08) `df116e5`
- **docs(backlog):** plan v0.3.0 and v0.4.0 (#18) (GATE-17) `fc34e7b`
- **docs(backlog):** record their closing commits (#21) (GATE-17, PROC-15) `9313fb0`
- **docs(backlog):** records its closing commit (#23) (PET-03) `3ce0d3f`
- **docs(backlog):** records its closing commit (#25) (CI-08) `89494cd`
- **docs(backlog):** records its closing commit (#27) (FUT-01) `9f3e255`
- **docs(backlog):** records its closing commit (#30) (FUT-02) `a228bfe`
- **docs(readme):** overview pages cover VAmPI, the DAST and performance lanes and login (#31) (DOC-06) `d713660`

### Not conventional

- build(deps-dev): Bump the npm-minor-patch group with 4 updates (#17) `688ac94` (no backlog id after the colon)

A Dependabot update: its titles carry no backlog id, so its pull requests skip the `title` check
([CI](docs/ci.md)). It moves four development dependencies to their next minor release: `allure`,
`allure-js-commons`, `allure-playwright` and `typescript-eslint`.

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
