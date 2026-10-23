# Changelog

All notable changes to this project are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), and each section is generated from the
commit history by `scripts/changelog.mjs`.

## [0.7.0] - 2026-10-23

### Upgrading from 0.6.0

- **Taking this release.** `npm run framework:update -- --to v0.7.0` takes it from the release
  `.framework-release` records. Its lockfile takes `dompurify` 3.4.17, the patch for a critical
  advisory that `allure` brings in: run `npm ci` afterwards, and `npm audit` reports it fixed.
- **A pack skill's pending facts name their phase.** `lint-docs` (pending-skill-fact) reports a
  `_pending until <phase>_` marker in a pack's skill once the pack has passed that phase, and a bare
  `_pending_` counts as `_pending until intake_`. A skill scaffolded on 0.6.0 or earlier carries bare
  markers: fill each fact, or write `_pending until design_` or `_pending until automate_` for one
  a later phase fills. A phase other than `intake`, `design` and `automate` is reported too.
- **No `wont-do` status.** An open backlog row with the status `wont-do` fails `lint-docs`. Move it
  to **Done**, its item starting with `**Won't do.**` and the reason, closed by the commit that
  recorded the decision. Your `docs/backlog.md` is your own and the update leaves it alone: change
  the Status line of its header too (`todo`, `in-progress`, `blocked`).
- **`test:scripts` runs every suite under a decoy repository.** It is now
  `node scripts/test-scripts.mjs`, which points `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` at a
  throwaway repository and fails when a test's git command changed it. A test of your own that runs
  git on a repository of its own passes `env: gitEnv()` (`scripts/lib/git.mjs`). The runner makes
  its repository with `git init --initial-branch`, which needs git 2.28 or later.
- **Removed example packs come back in CI.** This release adds Keycloak and VAmPI jobs and stages to
  shared files: `dast (keycloak)` in `dast.yml` (on every pull request, not a required check), the
  `keycloak` entry of the `perf.yml` matrix, `drift (vampi)` and `drift (keycloak)` in `drift.yml`,
  the `e2e (keycloak)` stage of `Jenkinsfile` and the per-pack stages of `Jenkinsfile.drift`. A copy
  that removed one of these packs gets its jobs back with the update: delete them by hand, since
  `remove:service` refuses a pack that is no longer there.
- **Jenkins.** The drift pipeline runs one stage per pack and names its reports
  `reports/drift/<pack>-<step>.txt`. The Node stage of both pipelines also checks that npm runs its
  scripts with the agent's Node on the same platform, and an agent needs Java on its `PATH` for the
  Allure plugin when `PUBLISH_ALLURE` is on. `docs/ci.md` describes a Linux agent in WSL.
- **The gates are required before a push.** `AGENTS.md`, `CLAUDE.md` and `CONTRIBUTING.md` say so,
  and the `pre-push` hook runs them. They are faster: the git suites run once, and `format:check`
  keeps a content cache under `node_modules/.cache`.
- **A pack's DAST values and performance tokens.** An optional `services/<pack>/dast-params.json`
  (`{ "params": { "<name>": <value> } }`) gives ZAP the values to send for parameters; a name no
  parameter has, another key or a non-scalar value stops the lane with exit 2. The performance lane
  stops before k6 when `--duration` would outlive a token. Keycloak's compose service pins
  `KC_HOSTNAME`.
- **A query parameter given as an array.** `QueryParams` accepts a `readonly string[]`, and
  `BaseClient` sends the parameter once per element; an empty array throws.
- **The skill template.** `docs/templates/service-skill.md` uses `{{APINAME}}`, which the scaffolder
  fills; a customised copy of the template takes the placeholder too.

### Features

- **gates:** a pack's skill keeps no fact pending past the phase that fills it (#103) (GATE-27) `d8aa0d1`

### Fixes

- **ci:** wait longer for the published version and tell a failed read-back from a failed publish (#106) (CI-13) `ace2bc8`
- **deps:** take the patched dompurify into the lockfile (#120) (CI-18) `c954deb`
- **gates:** a row that will not be done moves to Done with the deciding commit (#100) (GATE-28) `78a16fd`
- **scaffold:** a pack title that ends in API reads once in its skill (#101) (PROC-16) `dca8336`

### Performance

- **gates:** run the git suites once and cache the format check (#115) (GATE-31) `7392609`

### Other

- **ci(dast):** scan Keycloak too, with the values its paths need (#109) (GATE-30) `bd583e9`
- **ci(drift):** check the contract drift of VAmPI and Keycloak too (#104) (CI-17) `3bacd24`
- **ci(jenkins):** run the Keycloak pack in the Jenkins pipeline too (#111) (CI-15) `6a08ed8`
- **ci(jenkins):** check npm in the Node stage and document a Linux agent in WSL (#117) (CI-16) `17e09b3`
- **ci(perf):** run the performance lane on Keycloak too (#108) (GATE-29) `11f58c8`
- **docs(backlog):** plan v0.7.0 (#98) (DOC-13) `5ac4fc2`
- **docs(backlog):** record their closing commits (#107) (CI-14, GATE-28, PROC-16, DOC-13, GATE-27, CI-17, TM-10, CI-13) `f2d2e03`
- **docs(backlog):** record their closing commits (#110) (GATE-29, GATE-30) `0c2c262`
- **docs(backlog):** record their closing commits (#113) (PET-06, CI-15) `7cb460c`
- **docs(backlog):** record their closing commits (#116) (PROC-17, GATE-31) `d063b9d`
- **docs(backlog):** record its closing commit (#118) (CI-16) `c332e90`
- **docs(ci):** name npm's allowed actions in the trusted-publisher setup (#102) (DOC-13) `d572f19`
- **docs(process):** require the gates before a push, not before each commit (#114) (PROC-17) `885534d`
- **docs(registry):** publish the Keycloak and VAmPI cases (#105) (TM-10) `487a869`
- **docs(review):** fix what the v0.7.0 pre-release review found (#119) (DOC-14) `58a391b`
- **test(petstore):** automate the pet-search cases (#112) (PET-06) `c2ff869`

### Not conventional

- build(deps-dev): Bump markdown-it from 14.3.2 to 14.3.3 (#99) `6346e05` (no backlog id after the colon)

A Dependabot update: its titles carry no backlog id, so its pull requests skip the `title` check
([CI](docs/ci.md)). It moves `markdown-it`, a development dependency, to `14.3.3`, which fixes two
advisories (backlog CI-14).

## [0.6.0] - 2026-10-20

### Upgrading from 0.5.0

- **Taking this release.** A copy on `v0.5.0` or earlier has no `framework:update` yet, so it takes
  this release by hand, as step 5 of the adopt guide shows ("A copy on `v0.5.0` or earlier"), and
  writes `v0.6.0` into `.framework-release`. From then on `npm run framework:update -- --to
  v<x.y.z>` takes each later release, starting from that file.
- **More required checks.** `.github/rulesets/main.json` now requires `e2e (vampi)`,
  `dast (vampi secure)`, `dast (vampi vulnerable)` and `dast (petstore)` as well, and `dast.yml`
  runs on every pull request so that they always report. The file changes nothing on GitHub:
  update the ruleset there yourself (adopt guide, step 2), or leave it as it is. A private
  repository on a free account has no rulesets at all.
- **A third example pack, Keycloak** (`services/keycloak/`, `oauth2_client_credentials`). The
  release adds the pack, its skill, the `keycloak` compose service, its qa-config entries, the
  `KEYCLOAK_*` variables in `.env.example` and the `e2e (keycloak)` job in `ci.yml`, which is not a
  required check and generates its credentials per run. Copy the new variables into your `.env` to
  run it locally, or remove the pack with `npm run remove:service -- --name keycloak`
  (`--dry-run` first).
- **A credential the caller set is never renewed.** A request sent with `bearer` or its own
  `Authorization` header that answers `401` is returned as it is, even when the token was one the
  auth strategy issued earlier; only a request the strategy decorated is sent again with a renewed
  token. A spec that passed a token it kept and counted on the renewal now sees the `401`.
- **The DAST lane starts ZAP with `-silent`.** A scan downloads no add-on and calls none of ZAP's
  online services, so it runs only the rules the pinned image holds: the beta passive rules (such as
  90004, Cross-Origin-Resource-Policy, and 10049, cacheability) no longer appear in the reports,
  and a quality-gate count of low alerts can drop.
- **New scripts.** `npm run release:check` runs the checks before a release tag (clean tree,
  versions, the backlog section, `npm audit` for critical advisories, the history scans) and stops at
  the first failure; for your own releases, its backlog check wants a `## v<x.y.z>` section with no
  row left in it and "Released as `v<x.y.z>`". `npm run framework:update` is above.
- **Publishing workflow.** `.github/workflows/publish.yml` publishes `create-api-qa` from a release
  tag, only in the framework's repository; in a copy its job is skipped. Delete it together with
  `packages/create-api-qa/`, as the adopt guide says.

### Features

- **adoption:** take a later framework release with one command (#83) (FUT-14) `bc3b585`
- **keycloak:** a third example pack with OAuth 2.0 client credentials (#74) (FUT-15) `81bf0c9`
- **release:** one release check before the tag (#70) (GATE-24) `76070f2`

### Fixes

- **core:** a credential the caller set is never renewed (#81) (CORE-19) `7e4909b`
- **dast:** start ZAP silent so a scan does not depend on ZAP's online services (#93) (GATE-26) `226c3ac`
- **deps:** take the patched handlebars and audit the lockfile before a release (#91) (CI-12) `6fd928b`
- **scripts:** git run by scripts and tests ignores a calling hook's repository (#72) (GATE-25) `0f9b0b1`

### Other

- **ci(release):** publish create-api-qa from the release tag with npm trusted publishing (#87) (CI-10) `fd0098c`
- **ci(ruleset):** require the VAmPI end-to-end and the DAST checks (#68) (CI-11) `be9453e`
- **docs(adoption):** fix the adoption guide from a walk on real repositories (#89) (FUT-13) `d53e6cb`
- **docs(backlog):** plan v0.6.0 (#66) (DOC-11) `1f8354c`
- **docs(backlog):** record their closing commits (#69) (DOC-11, CI-11) `ab1a8c9`
- **docs(backlog):** records its closing commit and opens GATE-25 (#71) (GATE-24) `cbc0f8f`
- **docs(backlog):** records its closing commit (#73) (GATE-25) `ec0fd34`
- **docs(backlog):** records its closing commit (#80) (FUT-15) `5ea3d06`
- **docs(backlog):** records its closing commit (#82) (CORE-19) `97f20d6`
- **docs(backlog):** records its closing commit (#84) (FUT-14) `b8b6f8b`
- **docs(backlog):** publishes its cases and records its closing commit (#86) (PET-05) `ae977e1`
- **docs(backlog):** records its closing commit (#88) (CI-10) `72be7bc`
- **docs(backlog):** records its closing commit (#90) (FUT-13) `c36ee50`
- **docs(backlog):** records its closing commit (#92) (CI-12) `a4117d6`
- **docs(backlog):** records its closing commit (#94) (GATE-26) `58d0c7a`
- **docs(contributing):** read the published package back outside the repository (#67) (DOC-11) `1d7598b`
- **docs(guides):** pre-release review of v0.6.0 (#95) (DOC-12) `3eaa723`
- **docs(guides):** second pass of the pre-release review of v0.6.0 (#97) (DOC-12) `538b005`
- **docs(keycloak):** intake of the Users feature (#75) (FUT-15) `b74b6fc`
- **docs(keycloak):** design of the Users cases (#76) (FUT-15) `e03112d`
- **test(keycloak):** specs of the Users cases (#79) (FUT-15) `da83a73`
- **test(petstore):** specs of the pet update, form update and image cases (#85) (PET-05) `cc6bca2`

### Not conventional

- build(deps-dev): Bump the npm-minor-patch group with 4 updates (#77) `dd5d8fe` (no backlog id after the colon)
- ci(deps): Bump anthropics/claude-code-action from 1.0.236 to 1.0.242 in the actions-minor-patch group (#78) `adedaa4` (no backlog id after the colon)

## [0.5.0] - 2026-10-16

### Upgrading from 0.4.0

- **`@quarantine` cases run only in the flake lane.** They are left out of `npm test`,
  `--grep @smoke` and any other selection, and of the known-gap, published and destructive lanes;
  a command-line `--grep` cannot bring one back. Pass rates and case counts change, a quarantined
  known gap is no longer checked by `lanes:known-gap`, and a quarantined `@destructive` case runs
  nowhere. Run one by hand with `npm run lanes:flake`; `QA_INCLUDE_QUARANTINE` is internal, never
  set it. `coverage:status` does not report a published quarantined case as missing from the run.
- **A `required` quality-gate check with too few samples fails.** `p95_latency` below its
  `min_samples` is now FAIL (exit 1) when the check says `required: true`, and stays SKIPPED
  otherwise. The detail reads
  `only N timed API case(s) (M other result(s) ignored), fewer than min_samples K`, with
  `and the check is required` at the end when it fails.
- **`lint-docs` checks contract-note citations** (`note-citation`), so `npm run gates` can newly
  fail: every cited id of a prefix some pack defines must exist in that pack's
  `services/<pack>/docs/contract-notes.md` `Id` table, in Markdown, the changelog, the ADRs and
  tracked code and data files; ids compare exactly (a number without its leading zero is another
  id) and two packs may not share a prefix.
  Choose prefixes that are not id families of the repository (`L`, `TC`, `REQ`, the backlog
  prefixes).
- **Jenkins writes one JUnit file and HTML folder per step.** `QA_JUNIT_REPORT` is no longer set for
  the whole build: `reports/junit.xml` is gone, the `junit` step reads `reports/junit-*.xml` and
  `playwright-report/` holds one folder per step. A Playwright stage of your own needs
  `withEnv(reportsOf('<step>')) { ... }`, and anything that read `reports/junit.xml` must change.
  With `QA_JUNIT_REPORT` or `PLAYWRIGHT_HTML_OUTPUT_DIR` set, `lanes:destructive` writes one file or
  folder per case, locally too.
- **Tracker adapters can update issues.** `npm run tracker -- update <key>` changes the title and
  the labels, and promoting an unconfirmed finding or re-scoping an issue now uses it. An adapter of
  your own needs `updateIssue(key, { title, labels })` and `labels` from `getIssue`; without them
  `update` refuses and the other commands are unchanged.
- **New scripts.** `remove:service` removes a service pack (try `--dry-run` first); after removing
  one, leave its paths out of later release patches (adopt guide, "Remove an example pack").
  `create:build` and `packages/create-api-qa/` publish the framework itself and are not for a copy:
  keep or delete them as the adopt guide says. The scaffolder writes the contract-notes `Id` table.
- **Taking this release.** The patch adds `scripts/lib/tags.d.mts`, `.gitignore` lines and an
  import of `scripts/lib/tags.mjs` in `playwright.config.ts`, which conflicts if you edited that
  file. A new project can also start with `npm create api-qa <directory>` instead of the template.

### Features

- **create:** npm create api-qa from a framework release (#63) (FUT-11) `337ec1f`
- **gates:** lint-docs checks every cited contract-note id (#57) (GATE-22) `e62c9db`
- **scripts:** remove a service pack with one command (#61) (FUT-12) `493527a`
- **tracker:** update an issue's title and labels with a read-back (#59) (TM-09) `b5a10d6`

### Fixes

- **ci:** one JUnit and HTML report per Jenkins step (#60) (CI-09) `bf0f6be`
- **gates:** a required check with too few samples fails (#56) (GATE-21) `a8fc159`
- **gates:** leave @quarantine out of every run but the flake lane (#58) (GATE-23) `1ba469e`

### Other

- **docs(backlog):** record their closing commits (#62) (GATE-21, GATE-22, GATE-23, TM-09, CI-09, FUT-12) `da1d63c`
- **docs(guides):** pre-release review of v0.5.0 (#64) (DOC-10) `e86d2c6`

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
