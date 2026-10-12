# Add a service pack

Each API under test is a service pack in `services/<pack>/`, next to the example in
`services/petstore/`. The core (`helpers/`, `fixtures/`, `scripts/`) never imports from a pack, so
adding an API means adding a pack and configuring where it runs; nothing in the core changes unless
the API authenticates in a way the core does not support yet.

This guide covers the steps up to the first designed case: create the pack from the contract,
configure its environment and credentials, run the contract tools, then work through the phases.
Which pack and environment a request means, and what a pack holds, are set by
[the service-pack rule](../../.claude/rules/service-packs.md); the layers inside a pack by
[ADR 0007](../adr/0007-layered-test-architecture.md).

## Before you start

- **The contract.** An OpenAPI document as a file or a URL. The tools read it through one normalizer
  ([ADR 0003](../adr/0003-openapi-normalizer.md)); [contract tooling](../contract-tooling.md) lists
  the versions and formats it accepts.
- **An environment you may test.** Testing is limited to the environments qa-config names, and
  never production. Know whether writes are allowed there, and how the service is brought back if a
  case breaks it.
- **Credentials**, if the API needs them, available as environment variables or in the local `.env`
  file (template: `.env.example`). They never go in qa-config, a command line or the repository.

## 1. Plan the pack

```sh
npm run scaffold:service -- --name <pack> --spec <file|url>
```

The scaffolder (`scripts/scaffold-service.mjs`) reads the contract and prints a plan: the resources
it found and their clients, a suggested feature code per resource, the security schemes and a
suggested qa-config entry for the pack (`base_url` and `auth`), any problems in the contract, and
the files it would write. It writes nothing.

Options:

| Option | Use |
|---|---|
| `--name <pack>` | the pack's folder and the first part of every case identity; lower case, digits and hyphens |
| `--spec <file\|url>` | the contract to read |
| `--version <v>` | the pack version, the second part of every case identity; by default a `/vN` segment of the first server URL, else `v` plus the major of `info.version` |
| `--title <text>` | the pack's display title; by default the contract's `info.title` |
| `--write` | write the planned files |
| `--skill-only` | with `--write`: write only the `<pack>-api` skill, for a pack that exists without one |

Settle the name and the version before anything is published: every case's identity is
`<pack>-<version>-TC-<FEATURE>-NN`, and changing either part later turns every published case into
a new one. The suggested feature codes are only suggestions; the code is agreed at the first intake
([the registry rule](../../.claude/rules/registry.md)).

## 2. Write the pack

```sh
npm run scaffold:service -- --name <pack> --spec <file|url> --write
```

It refuses when `services/<pack>/` or the skill already exists: a pack is never overwritten, and
never copied from another pack by hand (facts specific to that API would come along and be wrong).
After writing, it runs the contract tools for the pack, so the tracked digest, the value sets and
the probe matrix exist and `npm run contract:check` covers the new pack at once. The script's header
lists what it writes. In short:

- `service.json`, the contract copy and an empty `error-envelopes.json`;
- `clients/`, one client per resource with one method per operation, over
  `helpers/base-client.ts`, and `fixtures.ts`, which binds them to the default credential and to
  `actor(name)`;
- `services/<pack>/specs/smoke.spec.ts`, when some `GET` needs no parameter: a first check of
  configuration and credentials, with no case ids, that designed cases replace;
- `README.md`, the pack's map, and `services/<pack>/docs/contract-notes.md`, empty until the first
  intake;
- `generated/` and `docs/discovery/<pack>-digest.json`, from the contract tools;
- `.claude/skills/<pack>-api/SKILL.md`, from
  [the service skill template](../templates/service-skill.md).

The rest of a pack is added by the phase that needs it, with the Petstore pack as the worked
example: intake writes the feature docs in `services/<pack>/docs/features/`; design writes
`registry/` and, for combinations of conditions, decision tables in `rules/`; automate builds
`types.ts`, `builders/`, `flows/`, `state-models.ts`, `guards.ts` and `assertions.ts` before the
specs that use them, following [the generation rule](../../.claude/rules/generation.md), plus
offline tests of the builders in `__tests__/`.

Two things in `service.json` need your attention before the first run that records evidence:

- `identity_fields` starts empty. List the keys whose values identify a person (names, e-mail
  addresses, usernames); evidence pseudonymizes them. See `services/petstore/service.json`.
- `secret_keys` (optional) adds header and query names to mask beyond the built-in ones and the auth
  header.

## 3. Configure qa-config

qa-config says where cases run and as whom. `qa-config.json` is per machine and not tracked; without
it, `qa-config.example.json` applies. The schema is `schemas/qa-config.schema.json`, and
`npm run config:check` validates the file against it.

Give the pack an entry in each environment where it runs, under
`api.environments.<env>.packs.<pack>` (the key is the pack's folder name). The entry holds the
pack's URLs, whether writes are allowed, its recovery and its credentials; each pack has its own,
so packs on different hosts with different credentials share one environment
([ADR 0009](../adr/0009-per-pack-configuration.md)):

```json
{
  "api": {
    "default_environment": "<env>",
    "environments": {
      "<env>": {
        "packs": {
          "<pack>": {
            "base_url": "<BASE_URL>",
            "spec_url": "<SPEC_URL>",
            "allow_writes": true,
            "recovery": { "command": "<command that restores the service>" },
            "auth": { "type": "bearer", "env": "<PACK>_TOKEN" },
            "actors": {
              "<actor>": { "type": "bearer", "env": "<PACK>_<ACTOR>_TOKEN" }
            }
          }
        }
      }
    }
  }
}
```

- `base_url` and `auth` are required. `base_url` is where the clients send requests; `spec_url` is
  the deployed contract that `--live` compares with the tracked copy.
- `allow_writes: false` marks a shared environment: write cases skip there with a reason.
- `recovery` is needed only for `@destructive` cases. The destructive lane runs it after each such
  case and refuses a pack entry without it.
- `env` names the variable that holds a secret, never the secret. The scaffolder printed a
  suggested entry, with `base_url` from the contract's servers and `auth` from its security
  schemes.
- `default` (the pack's `auth` credential) and `anonymous` (no credential) are built-in actors; any
  other name comes from the pack's `actors`.
- `QA_<PACK>_BASE_URL` and `QA_<PACK>_SPEC_URL` (the pack name upper-cased, hyphens as underscores)
  override the pack's URLs for one run without editing the file.

There is no global `api.auth`, `api.actors` or environment-wide `base_url`: a pack the active
environment does not list cannot run there, and `npm run config:check` rejects the old shape by
naming the removed keys.

Playwright gets a `preflight-<pack>` and an `api-<pack>` project for every folder under `services/`
that has a `service.json`, so the new pack needs no change to `playwright.config.ts`. Run one pack
with its project:

```sh
QA_ENV=<env> npx playwright test --project=api-<pack>
```

(In PowerShell, set `$env:QA_ENV` first.) `--project=api-*` runs every pack, each against its own
entry.

## 4. Authentication strategies

A pack's `auth` and each of its actors select a strategy in `helpers/auth.ts`. The core supports:

| `type` | Sends |
|---|---|
| `none` | no credential |
| `api_key` | the secret in a header or a query parameter (`in`, `name`) |
| `bearer` | `Authorization: Bearer <secret>` |

A strategy only decorates outgoing requests, so clients and specs never know which scheme is in
use, and a caller's explicit value is never overwritten, which lets a case send a deliberately bad
credential. Each strategy also names the header or query keys it fills, so evidence masks them.

To support another scheme, change these together, in one commit:

1. the `AuthConfig` union in `helpers/config.ts`, and `requiredEnvVars` there if the new type
   reads more than one variable (the preflight checks the variables it returns);
2. a new entry in `factories` in `helpers/auth.ts`, with its `secretKeys`;
3. a new branch of `$defs.auth` in `schemas/qa-config.schema.json`;
4. tests in `helpers/__tests__/auth.spec.ts`;
5. optionally, `suggestAuth` in `scripts/scaffold-service.mjs`, so the scaffolder proposes it.

Variables that a new type needs follow the propagation rules in
[documentation](../../.claude/rules/documentation.md): the README setup and the docs that name them
change in the same commit. A strategy's `apply` runs synchronously on each request, so a scheme that
has to log in and refresh a token needs more than a factory entry; that work is still open in the
[backlog](../backlog.md) (FUT-07).

## 5. First run

Start the API (for a container, add its service to `docker-compose.yml`), then:

```sh
QA_ENV=<env> npx playwright test --project=api-<pack>
```

The `preflight-<pack>` project runs first. It stops the pack's run with one readable failure when
the environment has no entry for the pack, when a variable that the pack's `auth` or `actors` name
is missing, or when the pack's base URL does not answer; other packs are not affected. A `401` or
`404` from the smoke spec is an answer from the API, not a reachability problem: check the
credentials, the base URL path and the pack's `auth`
([reachability](../../.claude/rules/reachability.md)).

## 6. Run the contract tools

Before any design, get the computed part of the analysis. With more than one pack, every contract
tool needs `--service <pack>`. [Contract tooling](../contract-tooling.md) explains each tool and its
output:

```sh
npm run contract:digest -- --service <pack>
npm run contract:digest:live -- --service <pack>
npm run contract:value-sets -- --service <pack>
npm run contract:probes -- --service <pack>
npm run contract:floor -- --service <pack>
```

- **Digest**: the tracked shape of the contract. The live comparison tells you whether the deployed
  API has moved away from the copy in the pack; if it has, decide which one the pack tests before
  designing.
- **Value sets**: the closed sets the contract defines, generated into `generated/enums.ts`. Specs
  and builders take literal values from there.
- **Probe matrix**: the negative and boundary probes each operation deserves. Design turns them into
  cases; specs reference the ones they cover as `probe:<id>`.
- **Floor**: the minimum number of cases per operation, from `scripts/derive-floor.mjs`. Design
  compares a registry with it rather than with an estimate.

Later, once runs exist, `npm run contract:codes` shows declared response codes no run reached and
answers the contract did not declare, and `npm run contract:decision-tables` generates the pack's
decision tables from `rules/`.

## 7. Work through the phases

From here the pack follows the same process as Petstore. Each phase is a skill that stops at a
review gate; [add a test case](add-a-test-case.md) shows each one for a single case, with Claude
Code and by hand.

| Phase | Skill | For a new pack, also |
|---|---|---|
| 0 intake | `qa-intake` | agree the feature code; record the error formats measured, and the departures in `services/<pack>/docs/contract-notes.md`; link the feature doc from the pack README; fill the _pending_ facts of the `<pack>-api` skill |
| 1 design | `qa-design` | create `registry/<feature>.md` from [the registry template](../templates/registry.md) |
| 2 automate | `qa-automate` | build `types.ts`, builders, flows, state models, guards and the `error-envelopes.json` catalogue before the specs; replace the smoke spec with designed cases |
| 3 publish | `qa-publish` | check that the pack's name and version are final |
| 4 run | `qa-run` | run `--project=api-<pack>` (or a lane with `--service <pack>`) with its `QA_ENV`, then `npm run tm:report -- --service <pack>` |

The `<pack>-api` skill holds what an agent must know about this API that its contract does not say:
environments and shared records, how it authenticates, its error formats, where it departs from its
contract. It starts with _pending_ facts; the first intake fills them, and every later phase keeps
them current. Link to the pack's files instead of copying their facts.

## 8. Wire it in

- **Reachable docs.** The pack README links its feature docs and its contract notes, so
  `npm run lint:docs` does not report them as orphans.
- **Checks.** `npm run gates` covers every pack: the contract check, the linters and the coverage
  status all read `services/*/`.
- **CI.** [Continuous integration](../ci.md#adapting-to-a-new-pack-or-environment) lists what to
  change for another pack or a deployed environment.
- **Commits.** One logical change each, following
  [ADR 0008](../adr/0008-branching-and-traceability.md): the scaffolded pack, then each phase's
  artifact after its gate.

## Checklist

- [ ] The plan was reviewed, and the name and version are final.
- [ ] `--write` created the pack and its skill; `npm run contract:check` passes.
- [ ] `service.json` lists the identity fields.
- [ ] qa-config has an entry for the pack in each environment, with `base_url`, `auth` and any
  actors; `npm run config:check` passes.
- [ ] The credentials are set as environment variables, by name.
- [ ] `QA_ENV=<env> npx playwright test --project=api-<pack>` passes its preflight and smoke spec.
- [ ] The digest, value sets, probe matrix and floor were read before design.
- [ ] The first feature went through intake, with the `<pack>-api` skill's pending facts filled in.
