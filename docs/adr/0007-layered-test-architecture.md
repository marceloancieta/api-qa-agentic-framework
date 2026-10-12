# 0007 - Layered test architecture and service packs

**Status:** Accepted (2026-10-08)

## Context

A generic framework must keep its core independent of any API under test, make simple tests trivial
to write (by people and by agents), and still support multi-user, authorization and multi-step
business scenarios. Every piece below is an established, named pattern; only the folder names are
this project's own.

## Decision

### Service packs

Each API under test lives in `services/<name>/`: configuration, clients, flows, builders, business
rules, registry, contract docs and specs. The core (`helpers/`, `fixtures/`, `scripts/`) never
imports from a service pack. A new API is a new pack, created by the scaffolder. *(Plugin
architecture; convention over configuration.)*

### Layers (calls go downward; only clients send HTTP, through `BaseClient`)

```
specs            Playwright tests + expect + schema validation
flows            optional multi-step business operations         (Facade; Screenplay "Tasks")
actors           who calls: the clients bound to one credential  (Screenplay Actor + Ability, as a fixture)
clients          one Service Object per resource                 (Service Object: the API form of Page Object)
BaseClient       Playwright APIRequestContext, evidence, redaction
```

- **Clients** stay the base layer. A simple test uses a client fixture directly, and a spec may
  also use builders, state models, guards and core helpers; what it never does is send a request
  itself. [The architecture page](../architecture.md) draws the import directions the code has.
- **Actors** (`actor('owner')`, `actor('user')`, `actor('anonymous')`) are the same clients bound to
  different credentials. They enable authorization matrices, covering OWASP API Security Top 10
  API1:2023 Broken Object Level Authorization.
- **Flows** are plain functions over an actor's clients for repeated business sequences.
- Screenplay's Interactions and Questions are **not** adopted: for an API, the client and `expect`
  already play those roles, and the extra indirection makes specs harder to generate and lint.
  (Serenity's `CallAnApi` ability is the same hybrid: an actor ability over a REST client.)

### Test data

- **Test Data Builders** with an **Object Mother** for named variants, derived from the normalized
  OpenAPI model (enums from value sets). Faker with a fixed, printed seed, so a failure reproduces.
- Randomness and time are **injected** (seeded RNG and clock fixtures), never global.
- Data captured from real environments is **anonymized** (mask, hash, substitution, generalization)
  before it becomes evidence or a fixture.

### Test design and quality

- Black-box techniques per ISTQB - equivalence partitions, boundary values, decision tables (rules
  as YAML in the service pack) and **pairwise** (bounding probe-matrix combinations) - are named on
  each designed case, and a **requirements traceability matrix** is generated from the registry.
- One **quality gate** reads optional metric sources (pass rate, p95 latency, DAST findings, mutation
  score) with thresholds in `qa-config`, one Strategy per check, and a three-state verdict
  **PASS / REVIEW / FAIL** (REVIEW publishes an artifact without breaking the build).

## Consequences

- A simple test is written exactly as with plain clients; actors and flows are opt-in.
- `scripts/lint-layers.mjs` checks the two boundaries that a review alone would have to catch: the
  core never imports from a pack, and a spec never sends a request without a client (GATE-16).
- Contributors who know the testing literature recognize each layer (Meszaros, *xUnit Test
  Patterns*; Freeman and Pryce, *Growing Object-Oriented Software*; Screenplay; GoF Facade/Adapter).
