# Onboarding

A guided tour for a new contributor or adopter. It assumes you have run the
[first 10 minutes](../README.md#first-10-minutes) once, so the Petstore pack is green on your
machine, and it shows where things are rather than repeating them: each section links to the file
that owns the detail.

## The repository at a glance

| Path | Holds | Changes when |
|---|---|---|
| `helpers/` | The execution core: the base client every pack client extends, the authentication strategies, evidence and redaction, schema validation, error envelopes, state comparison, resource guards, known gaps, seeded random data and clock, case metadata. | rarely; it never imports from a pack |
| `fixtures/` | The core Playwright fixtures, the global setup and teardown, and the preflight that each pack's `preflight-<pack>` project runs. | rarely |
| `playwright.config.ts` | The `unit` project, one `preflight-<pack>` and one `api-<pack>` project per pack, the `auth-live` project under `npm run auth:live` only, the reporters, and the switches read from the environment. | rarely |
| `scripts/` | Every command behind `package.json`: contract tooling, linters, lanes, the quality gate, the pack scaffolder and remover, the `create-api-qa` package builder, the test-management (`scripts/tm/`) and tracker (`scripts/tracker/`) adapters. Shared code is in `scripts/lib/`, tests in `scripts/__tests__/`, linter and contract fixtures in `scripts/__fixtures__/`, and the fixed k6 script of the performance lane in `scripts/k6/`. | when a check or a tool changes |
| `packages/create-api-qa/` | The `npm create api-qa` package, which creates a project from a framework release; its release files are written by `npm run create:build` and never tracked. | at a release |
| `services/<pack>/` | One API under test: its contract, clients, builders, flows, decision tables, registries, feature contracts, contract notes and specs, and optionally its DAST, performance and differential-lane files. The pack's `README.md` is its map. | with every feature you test |
| `docker-compose.yml` | The local APIs (the Petstore, VAmPI in its secure and vulnerable modes, Keycloak with the realm `services/keycloak/realm/` imports), the earlier Petstore release the differential lane compares with (behind the profile `diff`) and the tools of the DAST and performance lanes (ZAP and k6, behind the profiles `dast` and `perf`), each pinned ([ADR 0010](adr/0010-container-lanes.md)). | when an image or a pack changes |
| `reports/` | Untracked outputs: the lanes' reports (`dast/`, `perf/`, `diff/`), the mutation report (`mutation/`), the quality gate's verdict, test-management runs (`tm/`), the single-file Allure report. | every run; never committed |
| `schemas/` | The JSON schema of qa-config. | when a configuration key is added |
| `qa-config.example.json` | The example configuration: environments with one entry per pack (base URL, contract URL, auth, actors), test-management and tracker providers, policies, quality gate. A per-machine `qa-config.json` overrides it. | when a key is added |
| `.claude/` | The agentic process: `rules/`, `skills/`, `agents/`, `hooks/` and their registration in `settings.json`. | when the process changes |
| `.githooks/` | The git hooks: secret scan before a commit, gates before a push. | rarely |
| `.github/` | The CI workflows, Dependabot and the review rubric. | when CI changes |
| `docs/` | Reference pages, ADRs, lessons learned, the backlog, the templates the phases fill in, the tracked contract digests (`docs/discovery/`) and the example's local tracker (`docs/tracker/local/`). | with the change it documents |

The core never imports from a pack. That boundary and the layers
inside a pack (specs over flows over actors over clients) are explained in
[ADR 0007](adr/0007-layered-test-architecture.md). What a pack holds, path by path, is in
[the service-pack rule](../.claude/rules/service-packs.md) and in
[the Petstore pack's README](../services/petstore/README.md). The second pack,
[VAmPI](../services/vampi/README.md), shows what changes for an API with login, several actors and
a known vulnerability, and it is the example for the DAST rule and exclusion files. The Petstore is
the example for the differential lane's `diff.json`.

## The phases, on the Petstore pack

Work on an API moves through phases, and each one ends with an artifact a person reviews before the
next starts. [`AGENTS.md`](../AGENTS.md#the-process) owns the list. Here is what each one produced
for the Petstore pets feature, so you can open the real files:

1. **Intake** (`qa-intake`). The OpenAPI document says what the API declares; intake completes it
   from other sources and from read-only measurements, and records gaps and open questions. Result:
   the feature contract `services/petstore/docs/features/pet.md`. Departures from the contract that
   intake or a later run found are kept in `services/petstore/docs/contract-notes.md`.
2. **Design** (`qa-design`). Cases, each with a technique and a priority, written to the registry
   `services/petstore/registry/pet.md`. Its header ties it to the endpoints and to the contract doc.
3. **Automate** (`qa-automate`). Approved cases become specs such as
   `services/petstore/specs/pet.spec.ts`, each one run and then reviewed by the `api-spec-reviewer`
   subagent against its registry row.
4. **Publish** (`qa-publish`). Automated cases are sent to the test-management tool as definitions
   and read back. The example's `local` tool keeps them in untracked files under `reports/`.
5. **Run** (`qa-run`). The suite or a lane runs, and its results are reported to the same tool as
   one run (`npm run tm:report`).

Defects found in any phase are triaged and filed separately (`qa-report-bug`), with the class and
severity from the [defect rubric](references/defect-rubric.md). Each skill lives in
`.claude/skills/<name>/SKILL.md`, and [`CLAUDE.md`](../CLAUDE.md) lists them with the subagents.

Without an agent you follow the same phases by hand: the skills are readable instructions, and the
[references](references/README.md) and templates they apply are plain documents.

## Design versus execution

The phases fall into two modes that never mix. Design (intake to publish) calls the API read-only,
apart from running the specs it is writing and the credential exchange of the pack's auth strategy;
execution (run) never edits a spec, a registry or a definition because of what a run showed. A
request that needs both is split, and each half stops at its own gate. The table and the reasons are
in [the modes rule](../.claude/rules/modes.md).

## Where each fact lives

Every shared fact has one owner, and other files link to it instead of copying it. The owner table,
the working rules and the list of files to check when a policy changes are in
[the documentation rule](../.claude/rules/documentation.md); read it before you edit any Markdown.
[`AGENTS.md`](../AGENTS.md#where-to-look) maps the remaining questions to the rule or reference that
answers them.

Two consequences you will meet early:

- Numbers come from scripts. The case floor of an operation comes from `npm run contract:floor`, the
  coverage of a registry from `npm run coverage:status`; nobody types them into a document.
- Generated files are never edited. Everything under `services/<pack>/generated/` and the tracked
  digest in `docs/discovery/` are rewritten by the `contract:*` scripts, and `npm run gates` fails
  when the digest, the probe matrix, the value sets or the decision tables are stale
  ([contract tooling](contract-tooling.md)).

## A suggested reading order

1. [`README.md`](../README.md): what the framework is, adoption levels, the commands.
2. This page.
3. [`AGENTS.md`](../AGENTS.md): the process and the rules that apply to every change.
4. [The Petstore pack's README](../services/petstore/README.md), then one spec next to its registry,
   for example `services/petstore/specs/store.spec.ts` with `services/petstore/registry/store.md`.
5. [ADR 0007](adr/0007-layered-test-architecture.md) and
   [the generation rule](../.claude/rules/generation.md): where each concern lives in a pack.
6. [Quality gates](quality-gates.md) and [contract tooling](contract-tooling.md): what the checks
   do and which command answers which question.
7. The guides: [add a test case](guides/add-a-test-case.md) and
   [add a service pack](guides/add-a-service-pack.md).
8. [Lessons learned](lessons-learned.md): the failure modes behind the checks. Lesson ids such as
   `L-24` appear throughout the code and the rules.
9. When you need them: the [references](references/README.md), [test management](test-management.md),
   [continuous integration](ci.md), [CI security](ci-security.md) and the [ADRs](adr/README.md).

## Common gotchas

**Setup**

- **`API_KEY` must not be blank.** The preflight treats an empty variable as missing and stops the
  pack's run before any of its API cases. The Petstore accepts any value; a real API needs a real
  key, read from your local `.env` or the real environment, never from a file in the repository.
- **An agent cannot create or read the env file for you.** In Claude Code, the project settings deny
  reading and editing it, and the `secret-guard` hook refuses any shell command that names it, even
  a copy. Create and edit it yourself. Work with the hook rather than around it
  ([hooks README](../.claude/hooks/README.md)).
- **The pre-commit hook needs gitleaks.** Once the git hooks are installed, a commit fails when
  gitleaks is missing, on purpose: a scan that did not run must not look like a clean one.
- **Line endings are LF.** `.gitattributes` forces LF, because the generators compare files byte for
  byte. An editor that rewrites files with CRLF makes `contract:check` report stale files that
  nothing changed.

**Runs and results**

- **Every Playwright run clears `allure-results/` first**, and `npm run gates` starts one (the unit
  tests). Run the commands that read results (`npm run contract:codes`, `npm run tm:report`,
  `npm run coverage:status` against a run) right after the run they describe, before the gates.
- **Two local runs cannot share the results folder.** A second run refuses to start while another
  holds the lock; wait for the first one instead of forcing it.
- **Do not pass `--reporter` to Playwright.** It replaces the configured reporters, so the run would
  record nothing; global setup refuses it. Use `QA_JSON_REPORT` or `QA_JUNIT_REPORT` for an extra
  report.
- **Retries are off.** A retry turns an intermittent failure into a pass, so the lanes refuse a
  non-zero `QA_RETRIES`. Use `npm run lanes:flake` to find a flaky case instead.
- **A preflight failure means the API did not answer, not that cases failed.** Check that the
  container runs (`npm run petstore:up`), then `QA_ENV` and the pack's URLs in that environment
  (`api.environments.<env>.packs.<pack>`, or a `QA_<PACK>_BASE_URL` override). Any HTTP status,
  even an error, counts as an answer ([the reachability rule](../.claude/rules/reachability.md)).

**The Petstore**

- **Its state lives in the running service.** Records a run creates stay until the service
  restarts, and some writes break reads for every caller: after the `POST /user` defect recorded
  as PN-19 in the [contract notes](../services/petstore/docs/contract-notes.md), unknown usernames
  answer `500` until the service restarts. Those cases are `@destructive`, left out of normal runs
  and run by `npm run lanes:destructive`, which restarts the container after each one. If you
  reproduce such a defect by hand, `npm run petstore:down` and `npm run petstore:up` give you a
  fresh service.
- **The `public` environment is read-only.** The `petstore` entry there has `allow_writes` false,
  so cases that write skip with their reason there. Write cases run against the local container.
- **Known gaps fail on purpose.** A case tagged `@known-gap` is armed to fail while its issue is
  open, and reported as passing while it does. When one starts passing, `npm run lanes:known-gap`
  reports it for investigation before anyone removes the arm.

**VAmPI and the container lanes**

- **A fresh VAmPI container has no tables.** `npm run vampi:up` starts both modes and creates their
  databases; started any other way, every read that touches storage answers `500` (VN-01 in the
  [contract notes](../services/vampi/docs/contract-notes.md)).
- **A DAST scan writes to the API.** ZAP's active scan sends attacks, so run it only against the
  local containers. Run `npm run vampi:up` again before the VAmPI specs; the lane restarts the
  Petstore itself through its `recovery`.
- **The lanes log in without Playwright.** Against a fresh VAmPI, run `npm run vampi:users` before
  `lanes:dast` or `lanes:perf`; the specs register their users themselves
  ([VAmPI README](../services/vampi/README.md)).
- **Inside a container, `localhost` is the container.** The DAST and performance lanes rewrite a
  loopback base URL to the compose service that publishes its port, or to `host.docker.internal`,
  and print the rewrite. When a lane cannot reach the API, read that line first.
- **The performance lane leaves operations out on purpose.** It prints each one with its reason
  (secured, excluded, no value for a parameter); that list tells you what the pack's `perf.json`
  needs ([performance lane](quality-gates.md#performance-lane)).

**Writing**

- **Facts have one home.** A count, a rule or a list copied into a second file drifts; link to the
  owner. `npm run lint:docs` reports dead links and paths, unlinked docs and some counts, but not
  every copy.
- **No real data.** Specs, registries and docs use placeholders and builders; `npm run lint:suite`
  rejects real-looking e-mail addresses, hosts, phone numbers and long ids, and accepts only
  reserved values.

When something here is wrong or missing, fix it in the same change that taught you, following
[CONTRIBUTING](../CONTRIBUTING.md).
