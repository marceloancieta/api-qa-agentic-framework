# Architecture

How the framework is put together: the building blocks and how they connect, the layers of the
test code, the phases that move work on an API forward, what happens during a run, the patterns the
code uses and where to extend it. The page explains structure; the decisions behind it are recorded
in the [ADRs](adr/README.md), and the [onboarding tour](onboarding.md) maps the repository folder by
folder. Each section links to the file that owns the detail instead of repeating it.

## The big picture

The framework turns an API contract into reviewed test cases, runs them as Playwright specs, and
sends results and defects to the tools a team already uses. An agentic layer can drive that work
through phases, inside guardrails.

```mermaid
flowchart TB
  contractDoc["OpenAPI or Swagger document"]

  subgraph tooling["Contract tooling - scripts/"]
    norm["Normalizer<br/>scripts/lib/openapi.mjs"]
    digest["Digest"]
    probes["Probe matrix"]
    values["Value sets"]
    floor["Floor"]
  end

  subgraph designArt["Design artifacts"]
    feat["Feature contract doc"]
    reg["Registry of cases"]
  end

  subgraph packBox["Service pack - services/pack-name/"]
    specs["Specs"]
    packCode["Clients, builders, flows,<br/>fixtures, generated code"]
  end

  core["Execution core - helpers/ and fixtures/<br/>base client, auth, evidence, redaction"]
  api[("API under test")]
  results["allure-results/<br/>results and redacted evidence"]
  manifest["Case manifest"]
  tm["Test-management adapters"]
  tracker["Tracker adapters"]
  gates["Gates and linters<br/>npm run gates"]

  subgraph agentic["Agentic layer - .claude/"]
    rules["Rules"]
    skills["Phase skills"]
    agents["Subagents"]
    hooks["Hooks"]
  end

  contractDoc --> norm
  norm --> digest
  norm --> probes
  norm --> values
  norm --> floor
  digest --> feat
  feat --> reg
  floor -->|minimum case count| reg
  reg --> specs
  probes -->|probes to cover| specs
  values -->|generated enums| packCode
  specs --> packCode
  packCode --> core
  core -->|HTTP| api
  core -->|evidence| results
  results --> manifest
  reg --> manifest
  manifest --> tm
  results -.->|findings after triage| tracker
  gates -.->|check| specs
  gates -.->|check| reg
  gates -.->|check current| digest
  rules -.->|constrain| skills
  hooks -.->|guard tool calls| skills
  skills -.->|launch| agents
  skills -.->|drive the phases| feat
```

Reading the diagram from the top:

- **Contract tooling.** Every tool reads the API description through one normalizer, so Swagger 2.0,
  OpenAPI 3.0 and OpenAPI 3.1 give the same results ([ADR 0003](adr/0003-openapi-normalizer.md)).
  From the normalized model come the tracked digest (what the contract looks like, used to detect
  drift), the probe matrix (negative and boundary probes per operation), the value sets (closed
  sets of values, generated into TypeScript) and the floor (the minimum number of cases per
  operation). [Contract tooling](contract-tooling.md) lists the commands and their outputs.
- **Design artifacts.** A feature contract doc completes what the OpenAPI document leaves out, and
  a registry lists the designed cases with a technique, a priority and a status. The format is in
  [the registry rule](../.claude/rules/registry.md).
- **Service pack.** Each API under test lives in `services/<pack>/`, with its specs and the code
  they need ([ADR 0007](adr/0007-layered-test-architecture.md)). `services/petstore/` is the worked
  example.
- **Execution core.** `helpers/` and `fixtures/` hold everything that is the same for every API:
  the base client, authentication, evidence and redaction, schema validation, seeded data. The core
  never imports from a pack.
- **Results and tools.** A run writes results and redacted evidence to `allure-results/`. A neutral
  case manifest joins them with the registries and feeds the configured test-management adapter
  ([ADR 0004](adr/0004-test-management-adapters.md)). Defects go to the configured tracker through
  another adapter. Both are described in [test management](test-management.md).
- **Gates.** `npm run gates` checks the specs, the registries, the docs and the freshness of the
  contract outputs without calling the API ([quality gates](quality-gates.md)).
- **Agentic layer.** Rules, phase skills, subagents and hooks let a coding agent run the phases with
  a human review gate after each one ([`CLAUDE.md`](../CLAUDE.md) lists them). Everything below the
  agentic layer also works without an agent; the [adoption levels](../README.md#adoption-levels)
  say which parts you can skip.

## Layers of the test code

Inside a pack, test code is layered so that a spec states what is tested and nothing about how a
request is built. [ADR 0007](adr/0007-layered-test-architecture.md) defines the layers, and
[the generation rule](../.claude/rules/generation.md) says which concern goes where. The arrows
below are real import or call directions in `services/petstore/`, `helpers/` and `fixtures/`.

```mermaid
flowchart TB
  spec["Spec<br/>specs/name.spec.ts"]

  subgraph packLayers["Service pack"]
    packFx["Pack fixtures<br/>fixtures.ts"]
    flows["Flows<br/>flows/"]
    clients["Resource clients<br/>clients/"]
    builders["Builders and Object Mother<br/>builders/"]
    models["State models and guards<br/>state-models.ts, guards.ts"]
    gen["Generated from the contract<br/>generated/"]
  end

  subgraph coreLayers["Core - never imports a pack"]
    coreFx["Core fixtures<br/>fixtures/index.ts"]
    helpers["Case and assertion helpers<br/>case-meta, data-gate, error-envelope,<br/>state-compare, resource-guard"]
    base["BaseClient<br/>helpers/base-client.ts"]
    auth["Auth strategies<br/>helpers/auth.ts"]
    evidence["Evidence and redaction<br/>helpers/evidence.ts, helpers/redact.ts"]
  end

  pw["Playwright APIRequestContext"]

  spec -->|receives clients and actor| packFx
  spec --> flows
  spec --> builders
  spec --> models
  spec --> gen
  spec --> helpers
  packFx --> clients
  packFx --> coreFx
  flows -->|calls the clients it is given| clients
  models --> clients
  models --> helpers
  builders --> gen
  clients --> base
  coreFx --> auth
  base --> auth
  base --> evidence
  base --> pw
```

| Layer | May | May not |
|---|---|---|
| Spec (`services/petstore/specs/`) | take clients and `actor(name)` from the pack fixtures; call flows; take data from builders; assert status, schema (`toMatchSchema`), error envelope and business fields; use the core helpers for metadata, data gates, state comparison and known gaps | build a URL or a header, send a request itself, use `Math.random` or `Date.now()`, type a value set from memory, attach raw bodies, import another spec, read files at import time |
| Pack fixtures (`services/petstore/fixtures.ts`) | extend the core `test` with the pack's manifest, contract validator, error envelopes and clients; bind the clients to a named credential (`actor`); label every case with its identity | hold test logic |
| Flows (`services/petstore/flows/`) | run a multi-step precondition over the clients they are given, one named step each, stopping on an unexpected status (`expectStatus` in `helpers/flow.ts`) | assert what the case is about; create clients |
| Clients (`services/petstore/clients/`) | name the paths of one resource and return the raw response | judge a status; know which credential is in use |
| `BaseClient` (`helpers/base-client.ts`) | apply the auth strategy, encode path parameters, send raw bodies byte for byte, attach redacted evidence | know anything about a particular API |
| Builders (`services/petstore/builders/`) | build request data from the seeded `faker` and `clock`, with values from `generated/enums.ts` through the pack's types | send requests |
| State models and guards (`services/petstore/state-models.ts`, `services/petstore/guards.ts`) | classify fields into buckets for comparison; capture and restore shared records | decide a case's verdict on their own |

What the code shows beyond the layer list in ADR 0007:

- **Actors are a fixture, not a folder.** `actorSession` in `fixtures/index.ts` opens one request
  context per credential, and `actor(name)` in the pack fixtures binds the same clients to it.
- **A spec may skip layers.** A simple case uses a client fixture directly, and flows are opt-in.
  Specs also import core helpers directly (case metadata, data gates, envelopes, state comparison).
  The rule that holds everywhere in a pack is narrower: only clients send HTTP, and only through
  `BaseClient`. Flows, guards and cleanup helpers call client methods; no spec uses the raw
  `request` fixture.
- **The core reaches into `scripts/lib/` but never into a pack.** `helpers/schema.ts` uses the
  normalizer, `helpers/case-meta.ts` uses the text helpers and `fixtures/global-setup.ts` uses the
  run id from the logger.

## The phases

Work on an API moves through phases. Each one produces an artifact that a person reviews before the
next starts, and the phases fall into two modes that never mix. [`AGENTS.md`](../AGENTS.md#the-process)
owns the list of phases, and [the modes rule](../.claude/rules/modes.md) owns what each mode may do.

```mermaid
flowchart LR
  subgraph designMode["Design mode: read-only calls, except running the specs being written"]
    direction LR
    p0["0 Intake<br/>qa-intake<br/>feature contract doc"] -->|review gate| p1["1 Design<br/>qa-design<br/>registry with draft cases"]
    p1 -->|"review gate: approved cases"| p2["2 Automate<br/>qa-automate<br/>specs that ran as designed"]
    p2 -->|review gate| p3["3 Publish<br/>qa-publish<br/>case definitions in the tool"]
  end

  subgraph execMode["Execution mode: never edits a spec, registry or definition"]
    direction LR
    p4["4 Run<br/>qa-run<br/>reported run"] -->|review gate| next(["next design change,<br/>defect or known gap"])
  end

  p3 -->|review gate| p4
  bug["Bug reporting<br/>qa-report-bug"]
  trackerTool[("Tracker")]
  designMode -.->|finding| bug
  execMode -.->|finding| bug
  bug -->|after triage and approval| trackerTool
```

- Each phase is a skill in `.claude/skills/`, so the agent loads its instructions when the phase
  starts. Without an agent, the same skills are readable instructions you follow by hand.
- The registry status moves with the phases: `draft` at design, `approved` at its gate, `automated`
  once a reviewed spec proves the case, `published` once the definition is in the tool
  ([status lifecycle](../.claude/rules/registry.md#status-lifecycle)).
- During automate, `qa-automate` can hand each spec file to a `spec-author` subagent, and every new
  or changed spec is reviewed by a fresh `api-spec-reviewer` subagent. Intake and bug triage can
  launch a `contract-investigator` for one contract discrepancy. Subagents return reports; approvals
  stay in the conversation.
- A tool that keeps no case definitions (the default `allure-report`) has nothing to publish, so
  `tm:publish` skips that phase with a notice.
- Bug reporting branches off any phase. It writes to the tracker, never to the system under test
  ([bug reporting](references/bug-reporting.md), [defect rubric](references/defect-rubric.md)).

## A run, end to end

What `npm test` does, step by step, and how its results reach a test-management tool. Every step is
in `playwright.config.ts`, `fixtures/`, `helpers/` and `scripts/tm/`.

```mermaid
sequenceDiagram
  autonumber
  actor Dev as Developer or CI
  participant PW as Playwright runner
  participant GS as Global setup and teardown
  participant PF as Preflight project
  participant FX as Fixtures
  participant SP as Spec
  participant CL as Client and BaseClient
  participant API as API under test
  participant EV as Evidence and redaction
  participant AR as Results folder
  participant TM as Report command
  participant AD as Adapter

  Dev->>PW: npm test
  PW->>PW: load qa-config and the local env file
  PW->>GS: globalSetup
  GS->>GS: refuse a run whose reporters leave out Allure
  GS->>GS: acquire the run lock
  GS->>AR: clear previous results unless QA_KEEP_RESULTS=1
  GS->>GS: fix QA_SEED, QA_RUN_ID and the redaction salt
  PW->>PF: run the preflight before the api project
  PF->>PF: check the variables api.auth names
  PF->>API: GET the base URL
  API-->>PF: any HTTP answer
  Note over PF,API: no answer stops the run before any API case
  PW->>FX: api project, one test
  FX->>FX: worker scope qa, auth, service, contract, envelopes
  FX->>FX: test scope rng, faker, clock and the case labels
  FX->>SP: inject clients or actor(name)
  SP->>CL: client method, for example pets.create(pet)
  CL->>CL: auth strategy decorates the request
  CL->>API: HTTP request
  API-->>CL: response
  CL->>EV: attachExchange(request, response)
  EV->>EV: mask secrets, pseudonymize identity fields
  EV->>PW: attach the exchange to the test as JSON
  CL-->>SP: raw APIResponse
  SP->>SP: assert status, schema and business fields
  PW->>AR: allure-playwright writes results, attachments and labels
  PW->>GS: globalTeardown releases the run lock
  Dev->>TM: npm run tm:report
  TM->>AR: read the latest run
  TM->>TM: build the manifest from registries, specs and results
  TM->>AD: startRun, reportResults, closeRun
  AD->>AD: read back every write
  TM->>TM: write what was done to reports/tm/
```

Notes on the steps:

- **Projects.** `npm test` runs the `unit`, `preflight` and `api` projects defined in
  `playwright.config.ts`. Only `api` depends on the preflight, and it leaves out `@destructive`
  cases, which `npm run lanes:destructive` runs alone ([lanes](quality-gates.md#lanes)).
- **Global setup** (`fixtures/global-setup.ts`) checks before it deletes anything: a run whose
  reporters would record nothing fails with the old results still on disk. The run lock
  (`helpers/run-lock.ts`) keeps a second local run from clearing the first one's results.
- **The preflight** (`fixtures/preflight.setup.ts`) turns a missing variable or a host that does
  not answer into one readable failure. Any HTTP status counts as an answer
  ([the reachability rule](../.claude/rules/reachability.md)).
- **Case labels.** The pack's automatic `caseMeta` fixture calls `applyCaseMeta` in
  `helpers/case-meta.ts`, which gives each result its suite, its run id and, when the title starts
  with a case id, the identity `<service>-<version>-<TC id>`. What a result carries is set by
  [the reporting rule](../.claude/rules/reporting.md).
- **Evidence.** `BaseClient.send` calls `attachExchange` in `helpers/evidence.ts` for every request.
  Secrets are masked and identity fields are pseudonymized with a per-run salt (`helpers/redact.ts`)
  before anything is attached. Playwright traces are not redacted; [CI](ci.md#secrets-and-variables)
  explains what that means for a real credential.
- **Reporting.** `scripts/tm/run.mjs` builds the manifest (`scripts/tm/manifest.mjs`), continues the
  run id the results were recorded under, loads the adapter named by `test_management.provider`, and
  closes the run even when reporting failed. Results without an identity are listed with a reason,
  never dropped.

## Patterns used

Each pattern below is in the code today; the path is where to read it.

**Test code**

| Pattern | Where | Why |
|---|---|---|
| Layered test architecture | `services/petstore/specs/`, `services/petstore/flows/`, `services/petstore/clients/`, `helpers/base-client.ts` | Specs state intent, lower layers own the mechanics, so specs stay short and easy to generate and lint. |
| Plugin architecture: service packs | `services/petstore/`, `scripts/scaffold-service.mjs` | A new API is a new folder; the core never imports from a pack. |
| Service Object over a base client | `services/petstore/clients/pet-client.ts` extends `helpers/base-client.ts` | One client per resource names paths; the base owns auth, encoding and evidence. |
| Actor: clients bound to a credential | `actorSession` in `fixtures/index.ts`, `actor` in `services/petstore/fixtures.ts` | Authorization cases compare callers with their own request contexts, so cookies never leak. |
| Facade: flows | `services/petstore/flows/purchase.ts`, `helpers/flow.ts` | A multi-step precondition reads as one call and fails with the step that broke. |
| Fixtures as dependency injection | `fixtures/index.ts`, `services/petstore/fixtures.ts` | Configuration, clients, randomness and time reach a spec as parameters, never as globals. |
| Strategy: authentication | `factories` in `helpers/auth.ts` | Clients never know the scheme; a new scheme is one entry. |
| Fail-fast preflight | `fixtures/preflight.setup.ts` | A missing variable or an unreachable host gives one clear failure instead of every case timing out. |
| Visible skips and data gates | `helpers/data-gate.ts` | A skip carries its reason; data in the wrong state fails the case instead of letting it pass. |

**Test data and state**

| Pattern | Where | Why |
|---|---|---|
| Test Data Builder and Object Mother | `services/petstore/builders/pet-builder.ts`, `services/petstore/builders/mother.ts` | Valid data by default, one change per variant, named variants shared by specs. |
| Seeded randomness and an injected clock | `helpers/rng.ts`, `helpers/clock.ts`, the `rng`, `faker` and `clock` fixtures | Each test's seed is recorded, so a failure replays with the same data; `QA_CLOCK` pins "now". |
| Field buckets for state comparison | `helpers/state-compare.ts`, `services/petstore/state-models.ts` | Identity and business fields must match, volatile ones are never compared, unknown fields are reported. |
| Resource guard | `helpers/resource-guard.ts`, `services/petstore/guards.ts` | Shared records are captured, compared and repaired after a case, and an unexpected change is a finding. |
| Cleanup confirmed by a read | `services/petstore/flows/cleanup.ts` | A delete's own status can prove nothing; the read after it does. |
| Redaction and pseudonymization | `helpers/redact.ts`, `helpers/evidence.ts`, `helpers/anonymize.ts` | Evidence keeps its value for debugging without carrying credentials or personal data. |
| Run lock | `helpers/run-lock.ts` | Two local runs cannot clear or mix each other's results. |

**Contract**

| Pattern | Where | Why |
|---|---|---|
| Normalizer as an anti-corruption layer | `scripts/lib/openapi.mjs`, used by `helpers/schema.ts` and every contract tool | Spec-version differences are handled once; no tool reads a raw document ([ADR 0003](adr/0003-openapi-normalizer.md)). |
| Code generated from the contract | `scripts/derive-value-sets.mjs` writing `services/petstore/generated/enums.ts`, `scripts/scaffold-service.mjs` | Literal values and first clients come from the contract, not from memory; `contract:check` fails when they are stale. |
| Decision tables driving data-driven specs | `services/petstore/rules/`, `scripts/derive-decision-tables.mjs`, `services/petstore/generated/decision-tables.ts`, `services/petstore/specs/pet-search.spec.ts` | Combinations of conditions are checked for completeness and consistency, then a spec runs one step per rule. |
| Error envelope catalog | `helpers/error-envelope.ts`, `services/petstore/error-envelopes.json` | Error shapes are declared once per API and checked on every negative case. |
| Stable case identity | `caseIdentity` in `helpers/case-meta.ts` | Results follow the designed case id, not the file or the title, so refactors do not orphan history. |
| Known-gap arming | `knownGap` in `helpers/case-meta.ts`, `scripts/known-gap-lane.mjs` | A known defect keeps its case red on purpose, linked to its issue, and a gap that starts passing is reported. |

**Integration and process**

| Pattern | Where | Why |
|---|---|---|
| Adapter with a shared contract test: test management | `scripts/tm/adapter.mjs`, `scripts/tm/adapters/`, `scripts/tm/contract.mjs` | One neutral interface and manifest; a new tool is one adapter that passes the same contract ([ADR 0004](adr/0004-test-management-adapters.md)). |
| Adapter with a shared contract test: trackers | `scripts/tracker/adapters/`, `scripts/tracker/contract.mjs` | GitHub, Jira and the local store behave the same behind one interface. |
| Read-back after every write | `verifiedTracker` in `scripts/tracker/tracker.mjs` (a decorator over any tracker adapter), `assertReadBack` in `scripts/tm/adapter.mjs` | A write that says it worked is checked against what the tool now holds. |
| Strategy: quality-gate checks | `STRATEGIES` in `scripts/quality-gate.mjs` | Each metric reads and judges its own source; the worst verdict wins. |
| Exact self-tests for linters | `scripts/lib/lint.mjs`, `scripts/__fixtures__/` | A linter passes only when it reports exactly the marked lines, so missed defects and false alarms both fail. |
| Design and execution separation | `.claude/rules/modes.md` | Design never writes to the system under test; a run never edits what defines it. |
| Hooks as guardrails | `.claude/hooks/`, registered in `.claude/settings.json` | Credentials in prompts, tool calls and output are refused or masked, and the configured git policy is applied, whatever the agent intends ([ADR 0005](adr/0005-claude-code-hooks.md)). |

## Extension points

- **A new API (service pack):** `npm run scaffold:service`, then the
  [add a service pack](guides/add-a-service-pack.md) guide.
- **A new test case:** the [add a test case](guides/add-a-test-case.md) guide, from the contract
  doc to a reported run.
- **An authentication scheme:** a new entry in `factories` in `helpers/auth.ts`, with its config
  type and schema branch
  ([authentication strategies](guides/add-a-service-pack.md#4-authentication-strategies)).
- **A test-management tool:** copy `scripts/tm/adapters/local/index.mjs`, register it in
  `scripts/tm/adapters/index.mjs` and pass `scripts/tm/contract.mjs`
  ([writing an adapter](test-management.md#writing-an-adapter-testrail-and-others)).
- **An issue tracker:** an adapter in `scripts/tracker/adapters/`, registered in
  `scripts/tracker/index.mjs`, that passes `scripts/tracker/contract.mjs`
  ([issue trackers](test-management.md#issue-trackers)).
- **A quality-gate check:** a new strategy in `STRATEGIES` in `scripts/quality-gate.mjs`, with its
  settings in `schemas/qa-config.schema.json` ([quality gate](quality-gates.md#quality-gate)).
- **A linter rule:** a rule in `scripts/lint-harness.mjs`, `scripts/lint-suite.mjs` or
  `scripts/lint-docs.mjs`, with fixtures in `scripts/__fixtures__/` that contain the defect and
  look-alikes that do not ([linters](quality-gates.md#linters)).
- **A decision table:** a YAML file in the pack's `rules/` folder, generated with
  `npm run contract:decision-tables` ([decision tables](contract-tooling.md#decision-tables)).
- **A secret pattern for the hooks:** `.claude/hooks/lib/secrets.mjs`
  ([hooks README](../.claude/hooks/README.md)).
- **A rule, skill or subagent:** register it as
  [the documentation rule](../.claude/rules/documentation.md) says, and walk its propagation table
  in the same change.
