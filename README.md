# API QA Agentic Framework

A framework for testing HTTP APIs from their contract. It reads an OpenAPI or Swagger document,
helps you design reviewable test cases from it, runs them as Playwright specs written in TypeScript,
and reports results to a test-management tool and defects to an issue tracker. On top of that it
adds an agentic process: rules, skills, subagents and hooks that let a coding agent (Claude Code
first, others through [`AGENTS.md`](AGENTS.md)) move work on an API through phases with a human
review gate after each one.

It is for QA engineers and developers who test HTTP APIs and want coverage they can trace from the
contract to a result, and for teams that want an agent to do part of that work inside guardrails.
You can adopt it in layers: the execution core alone, the contract tooling and gates on top, and the
agentic process last ([adoption levels](#adoption-levels)).

Each API under test is a **service pack** in `services/<name>/`.
[`services/petstore/`](services/petstore/README.md) is the worked example, run against Swagger
Petstore v3 in Docker. [`services/vampi/`](services/vampi/README.md) is a second pack, against the
deliberately vulnerable VAmPI in a secure and a vulnerable mode: it shows login authentication,
actors and an authorization matrix that detects the vulnerable mode's flaw. Test only environments
you are authorized to test, as named in qa-config; never production.

Beyond the functional suite, two lanes run tools in containers against a pack: an OWASP ZAP security
scan driven by the pack's OpenAPI document, and a k6 performance smoke of its `GET` operations.
Their reports feed the quality gate next to the test results. A third lane sends the same read-only
requests to two deployments of a pack and reports every difference ([lanes](docs/quality-gates.md#lanes)).

The project is before 1.0: names and formats can still change between minor versions. Architecture
decisions are recorded in [`docs/adr/`](docs/adr/README.md).

## First 10 minutes

From a fresh clone to a green run against the example Petstore pack. To test your own APIs in a
repository of your own, create it from the template first
([adopt the template](docs/guides/adopt-the-template.md)), then follow these steps in it.

**You need:**

- Node.js at the major version in `.nvmrc` (with nvm, `nvm use` reads it);
- Docker with Compose v2, for the local Petstore container (and later for VAmPI, ZAP and k6);
- git. [gitleaks](https://github.com/gitleaks/gitleaks) is needed only once you install the git
  hooks ([CONTRIBUTING](CONTRIBUTING.md#git-hooks)).

**1. Install.**

```sh
git clone <repository-url> api-qa-agentic-framework
cd api-qa-agentic-framework
npm ci
```

The suite uses Playwright's API client only, so no browser download is needed.

**2. Configure.** Create a local `.env` copied from `.env.example`, and set `API_KEY` in it to any
non-empty value. The Petstore accepts any key; the preflight refuses an empty one. The file is
ignored by git and read only on your machine.

You do not need a `qa-config.json` yet. Without one, `qa-config.example.json` applies: it targets the
local Petstore and VAmPI, allows writes there, and keeps test-management and tracker data in local
files.
Copy it to `qa-config.json` when you want per-machine changes.

**3. Run the gates.** They need no API, so they work before anything is started:

```sh
npm run gates
```

**4. Start the Petstore and run the suite.**

```sh
npm run petstore:up      # http://localhost:8080/api/v3; waits for the container's healthcheck
npx playwright test --project=unit --project=api-petstore   # unit tests, the Petstore's preflight, its specs
```

`npm test` runs every pack. The example configuration also has VAmPI, whose preflight fails until
`npm run vampi:up` has started it and the `VAMPI_USER_*` variables of `.env.example` are set.

**5. Read the results.** The terminal lists every case. `playwright-report/` holds the HTML report,
and `allure-results/` holds the raw results with the redacted request and response of every call.

**6. Stop the Petstore** when you are done: `npm run petstore:down`.

What "green" means here:

- Cases tagged `@known-gap` reproduce a recorded departure from the contract. They are expected to
  fail, and a run counts them as passed while they still do.
- Cases tagged `@destructive` are left out of every normal run, because they leave the service
  broken for other callers. `npm run lanes:destructive` runs each one alone and restarts the
  container after it.
- If a pack's `preflight-<pack>` project fails, none of that pack's API cases ran. Its message
  names the missing variable or the host that did not answer.

Next: the [onboarding tour](docs/onboarding.md), then the guides to
[add a test case](docs/guides/add-a-test-case.md) and
[add a service pack](docs/guides/add-a-service-pack.md).

## Running tests

| Command | Runs |
|---|---|
| `npm test` | Every Playwright project: `unit`, and for each pack in `services/` `preflight-<pack>` then `api-<pack>`. |
| `npx playwright test --project=api-<pack>` | One pack's specs, after its preflight. `--project=api-*` runs every pack. |
| `npm run test:unit` | Core and pack unit tests only. No network; part of `npm run gates`. |
| `npm run test:smoke` | Cases tagged `@smoke`, after the preflight. |
| `npm run report:html` | The Allure report of the last run, as one `reports/allure-report/index.html` that opens from disk. |

Each pack runs in the entry the active environment gives it in qa-config
(`api.environments.<env>.packs.<pack>`: its base URL, contract URL, credentials and actors). The
`preflight-<pack>` project checks the variables that entry's `auth` and `actors` name and that the
pack's base URL answers, then `api-<pack>` runs. When it fails, none of that pack's cases run; a
pack you did not select never blocks the run. Add `--no-deps` to skip it. `QA_ENV` picks the
environment, and `QA_<PACK>_BASE_URL` and `QA_<PACK>_SPEC_URL` (for example
`QA_PETSTORE_BASE_URL`) override one pack's URLs for a run. Each API call is attached to its test
as redacted evidence. Results go to `allure-results/` and
`playwright-report/`. A Playwright run clears `allure-results/` when it starts (the destructive lane
adds to the run before it instead). The optional runner switches (retries, extra reports, a fixed
seed or clock, traces) are listed in `.env.example`.

Lanes run outside a normal run. The quality gate judges the test results and the DAST and
performance reports together; the other lanes fail on their own. Both are described in
[quality gates](docs/quality-gates.md#lanes):

| Command | Runs |
|---|---|
| `npm run lanes:known-gap`, `lanes:published`, `lanes:flake`, `lanes:destructive` | Playwright selections: armed known gaps, published cases, repeats to find flaky cases, `@destructive` cases one at a time with a recovery after each. |
| `npm run lanes:dast -- --service <pack> [--actor <name>]` | An OWASP ZAP API scan of the pack, with the pack's rules, into `reports/dast/<pack>.json`. |
| `npm run lanes:perf -- --service <pack> [--actor <name>]` | A k6 performance smoke of the pack's `GET` operations at a steady rate, into `reports/perf/<pack>.json`. |
| `npm run lanes:diff -- --service <pack> --reference <env>` | The same read-only requests to two deployments of the pack, every difference in answers and contract reported, into `reports/diff/<pack>.json`. |
| `npm run quality:gate` | PASS, REVIEW or FAIL per check in qa-config `quality_gate`: pass rate, p95 latency, DAST alerts, mutation score. |

The lanes send the credential of the pack's default actor; `--actor` names another, or `anonymous`
for none. The lanes log in without Playwright, so against a fresh VAmPI run `npm run vampi:users`
first; the specs register their users themselves ([credentials in the
lanes](docs/quality-gates.md#credentials-in-the-dast-performance-and-differential-lanes)). ZAP and
k6 run from compose services pinned by digest (profiles `dast` and `perf`, so `docker compose up`
never starts them; [ADR 0010](docs/adr/0010-container-lanes.md)). Locally,
`npm run petstore:reference:up` starts an earlier Petstore release (profile `diff`) as the example's
`reference` environment. ZAP and k6 send real traffic, and a ZAP scan writes: point them at local
containers or an environment meant for it. The DAST lane refuses an environment whose pack entry has
`allow_writes` false, and restarts the service afterwards when the entry names a `recovery`.

## Adoption levels

Take only the layers you need. Each level includes the one before it.

### 1. Execution core

Helpers, fixtures, clients and specs: a typed Playwright suite for an HTTP API with evidence,
redaction, schema validation and controlled test data.

| | |
|---|---|
| **Uses** | `helpers/` (base client, authentication strategies, evidence and redaction, schema validation, state comparison, resource guards, known gaps, seeded data and clock), `fixtures/` (the core fixtures, global setup, preflight), `playwright.config.ts`, and one service pack per API with its clients, builders, flows and specs ([ADR 0007](docs/adr/0007-layered-test-architecture.md)). |
| **Needs** | Node, the npm dependencies, a qa-config environment and its credentials, and `scripts/lib/`: the core imports the contract normalizer, token issuing (`auth-tokens.mjs`), variable-name redaction (`env-names.mjs`), the state comparison and the log and text helpers from it. |
| **Start a pack** | `npm run scaffold:service -- --name <pack> --spec <file\|url>` prints the plan; add `--write` to create the pack. |
| **You can skip** | `.claude/`, `AGENTS.md` and `CLAUDE.md`, registries, the contract and lint scripts, the test-management and tracker adapters, CI. |

Results still land in `allure-results/` and `playwright-report/`. A test title that starts with a
case id (`TC-PET-01 ...`) gives its result a stable identity; without a registry that is optional.

### 2. Contract tooling, linters and gates

The checks that keep a suite honest: what the contract says, what changed in it, which cases it
calls for, and whether the specs and docs still agree with it.

| | |
|---|---|
| **Adds** | the `contract:*` scripts ([contract tooling](docs/contract-tooling.md)), registries of designed cases in `services/<pack>/registry/`, the linters, `coverage:status`, `traceability`, the lanes and the quality gate ([quality gates](docs/quality-gates.md)). `npm run gates` runs the checks among them (`contract:check`, the linters, `coverage:status`); the lanes, `traceability` and the quality gate run on their own. Plus the git hooks in `.githooks/`. |
| **Needs** | the rest of `scripts/` and `schemas/`; each pack's tracked contract outputs (`docs/discovery/<pack>-digest.json`, `services/<pack>/generated/`), which `contract:check` verifies are current (the `contract:*` scripts regenerate them); registries in the format of [the registry rule](.claude/rules/registry.md); Docker for the DAST and performance lanes; gitleaks if you install the git hooks. |
| **You can skip** | the agent-specific parts of `.claude/` (skills, agents, hooks). The files in `.claude/rules/` still describe the conventions the linters enforce, so read them as documentation. |

### 3. The agentic process

Phases with review gates, run by a coding agent.

| | |
|---|---|
| **Adds** | `.claude/rules/` (guardrails), `.claude/skills/` (one skill per phase, one for bug reporting, plus one per pack), `.claude/agents/` (subagents for isolated reviews and investigations), `.claude/hooks/` registered in `.claude/settings.json`, the [references](docs/references/README.md) and templates the phases apply. |
| **Needs** | levels 1 and 2, because the skills call the same npm scripts and gates; Claude Code for skills, subagents and hooks (the hooks need only Node). |
| **Other agents** | [`AGENTS.md`](AGENTS.md) describes the process and points to the rules as plain Markdown, so any agent can follow it. The automatic parts (skills that load by themselves, hooks that refuse unsafe calls) are Claude Code features; another agent follows the same rules without that enforcement. |

[`CLAUDE.md`](CLAUDE.md) lists the rules, skills, subagents and hooks. The phases and their
artifacts are in [`AGENTS.md`](AGENTS.md#the-process), and the [onboarding tour](docs/onboarding.md)
walks through them on the Petstore pack.

## Spec-version compatibility

Every contract tool, the scaffolder and response validation (`toMatchSchema`) read API descriptions
through one normalizer, `scripts/lib/openapi.mjs` ([ADR 0003](docs/adr/0003-openapi-normalizer.md)).
It turns each supported version into the same model, with schemas in JSON Schema 2020-12 form, so
one validator and one set of tools serve all of them.

| Version | Recognised by | What the normalizer does |
|---|---|---|
| Swagger 2.0 | `swagger: "2.0"` | Reads schemas from `definitions`. A `body` parameter becomes the request body, once per `consumes` type (default `application/json`). `formData` parameters become an object body, sent as `multipart/form-data` when a field has `type: file` and no form type is declared, otherwise as `application/x-www-form-urlencoded`. The constraints a non-body parameter carries inline become its schema. Response schemas are listed under each `produces` type (default `application/json`). `x-nullable: true` makes a schema nullable, and `type: file` becomes a binary string. Servers are built from `schemes` (default `https`), `host` and `basePath`; `basic` security becomes HTTP basic. |
| OpenAPI 3.0.x | `openapi: 3.0.<n>` | Reads schemas from `components/schemas`, and request bodies and responses by media type (a JSON type is preferred as the main schema). `nullable: true` makes a schema nullable. Server variables are replaced by their defaults. |
| OpenAPI 3.1.x | `openapi: 3.1.<n>` | Read as 3.0 for bodies, responses and servers. Schemas are already JSON Schema 2020-12, so they keep their own nullability (a `nullable` keyword is not applied) and boolean schemas pass through. |
| Anything else | | Rejected with "Unsupported API description version", for example OpenAPI 3.2, Swagger 1.2 or a document with no version field. |

For every supported version:

- **Formats.** JSON or YAML, from a file or an `http(s)` URL. A document whose text starts with `{`
  or `[` is read as JSON, anything else as YAML.
- **Operations.** Only `paths` is read: each method becomes one operation with its parameters
  (path-level ones merged in, an operation-level one with the same location and name wins; path
  parameters are always required), request body, responses and effective security. Webhooks and
  callbacks are not part of the model.
- **Schemas.** Named schemas are referenced as `#/schemas/<Name>`, other local references are
  inlined, `xml` and `externalDocs` are dropped, and a tuple `items: [...]` becomes `prefixItems`.
  `example` becomes an `examples` array, and boolean `exclusiveMinimum`/`exclusiveMaximum` become
  numeric bounds. Where nullability applies (above), `null` is added to the schema's type and to its
  `enum`; a schema without a `type`, such as a reference, is wrapped in `anyOf` with `null`.
- **Content it cannot use** is reported as a problem and never stops the tool: a `pattern` that does
  not compile (kept as `x-invalid-pattern`, not enforced), an external `$ref` (not followed), a
  circular or unresolvable reference.

The unit tests in `scripts/__tests__/openapi.test.mjs` check that the same resource written in
Swagger 2.0, OpenAPI 3.0 and OpenAPI 3.1 (YAML) produces the same model, and that the Petstore
documents in both Swagger 2.0 and OpenAPI 3.0 normalize without problems
(fixtures in `scripts/__fixtures__/openapi/`).

## Optional pieces

None of these is needed for a green run. Turn on what your project uses.

- **Test management.** Results and case definitions reach a test-management tool through adapters,
  chosen by `test_management.provider` in qa-config: an Allure HTML report when none is set, local
  JSON files in the example configuration, and others behind the same contract. See
  [test management](docs/test-management.md). CI can report to Allure TestOps instead once its
  token is configured ([reporting to Allure TestOps](docs/ci.md#reporting-to-allure-testops)).
- **Issue trackers.** Defects are searched, filed and re-read through `tracker.provider`; the example
  uses a local tracker kept in `docs/tracker/local/`. `none` turns every tracker call off. Same page.
- **CI workflows.** `.github/workflows/` runs the gates and the end-to-end suite of each pack, a
  daily drift check, and weekly DAST, performance and differential runs
  ([continuous integration](docs/ci.md)),
  plus CodeQL, a secret scan, Dependabot and an optional AI pull-request review
  ([CI security and review](docs/ci-security.md)). Keep the ones you want; each
  page says how to turn a workflow on or off. On Jenkins, `Jenkinsfile` and `Jenkinsfile.drift` run
  the same gates, suite and drift check on Linux or Windows agents
  ([Jenkins](docs/ci.md#jenkins)).
- **Git hooks.** `npm run hooks:install` turns on the secret scan before each commit and the gates
  before each push ([CONTRIBUTING](CONTRIBUTING.md#git-hooks)).
- **Local denylist scan.** `npm run scan:denylist` looks for terms from a private list in
  `.git/info/denylist`. Git does not track files inside its own directory, so the list cannot be
  pushed by mistake. Each line holds a regular expression, matched regardless of case, and `#`
  starts a comment. It is meant for words a contributor must never
  publish, such as client names or internal hosts. Without that file the scan prints a notice and
  passes, so a fresh clone loses nothing by ignoring it. The pre-commit and commit-msg hooks run the
  same scan on staged changes and on the message, `npm run scan:denylist:history` scans the whole
  history, and `npm run gates` runs only the scanner's self-test.
- **Security scan, performance smoke and differential lane.** A pack opts into each lane's policy
  with its optional files ([what a pack holds](.claude/rules/service-packs.md#what-a-pack-holds));
  without them the DAST and performance lanes still run on the contract alone
  ([optional lanes](docs/guides/add-a-service-pack.md)).
- **Quality gate checks.** Every check in `qa-config` `quality_gate` is optional
  ([quality gates](docs/quality-gates.md#quality-gate)).
- **Mutation testing.** `npm run mutation` runs Stryker over the framework's own libraries. It is
  slow, so it runs on demand rather than in the gates; its report feeds the quality gate's mutation
  score ([mutation testing](docs/quality-gates.md#mutation-testing)).

## Documentation

| Read | For |
|---|---|
| [Onboarding](docs/onboarding.md) | a guided tour: layout, phases, where facts live, reading order, common gotchas |
| [Adopt the template](docs/guides/adopt-the-template.md) | a repository of your own from the GitHub template: settings, the first pull request, later framework releases |
| [Add a test case](docs/guides/add-a-test-case.md) | from a designed case to a passing spec |
| [Add a service pack](docs/guides/add-a-service-pack.md) | testing a new API |
| [Consumer-driven contracts](docs/guides/consumer-driven-contracts.md) | what Pact-style consumer contracts would add, when they pay off, and where they would sit (not implemented) |
| [References](docs/references/README.md) | contract analysis, bug reporting, the defect rubric and the templates |
| [Contract tooling](docs/contract-tooling.md) | digest, probes, value sets, floor, declared codes, decision tables |
| [Architecture](docs/architecture.md) | the building blocks, the layers, the patterns used, with diagrams |
| [Quality gates](docs/quality-gates.md) | what `npm run gates` checks, the linters, the lanes, the quality gate, mutation testing |
| [Test management](docs/test-management.md) | adapters, case identity, trackers |
| [Continuous integration](docs/ci.md) and [CI security](docs/ci-security.md) | the workflows and how to adapt them |
| [Lessons learned](docs/lessons-learned.md) | the failure modes the checks guard against |
| [ADRs](docs/adr/README.md) | the decisions behind the structure |
| [Backlog](docs/backlog.md) | open work |
| [Changelog](CHANGELOG.md) | what each release contains |
| [CONTRIBUTING](CONTRIBUTING.md) | how to propose a change |
| [SECURITY](SECURITY.md) | how to report a security problem privately |

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE).
