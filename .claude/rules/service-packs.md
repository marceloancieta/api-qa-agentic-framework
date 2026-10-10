---
paths:
  - 'services/**'
  - '.claude/skills/**'
  - 'qa-config*.json'
---

# Service packs

Each API under test is a pack in `services/<name>/` (ADR 0007). The core (`helpers/`, `fixtures/`,
`scripts/`) never imports from a pack.

## Which pack, which environment

- **The pack** comes from the request: the user names the API, or the endpoints belong to exactly one
  pack's contract. When several packs could match, ask. The contract tools default to the only pack
  when there is one.
- **The environment** comes from qa-config: `QA_ENV` if set, otherwise `api.default_environment`.
  Its `base_url`, `spec_url` and `allow_writes` decide where cases run and whether writes are allowed.
  `qa-config.json` is per machine; without it, `qa-config.example.json` applies.
- **Credentials** are named in qa-config (`api.auth`, `api.actors`) and read from the environment.

## What a pack holds

| Path | Holds |
|---|---|
| `service.json` | name and version (part of every identity), title, identity fields to pseudonymize, the contract file |
| `openapi.json` | the contract under test |
| `generated/` | contract outputs; regenerate with the `contract:*` scripts, never edit |
| `error-envelopes.json` | the error formats the API answers with |
| `clients/`, `fixtures.ts`, `flows/`, `builders/`, `state-models.ts`, `guards.ts` | the layers of `.claude/rules/generation.md` |
| `rules/` | decision tables as YAML |
| `registry/` | designed cases (`.claude/rules/registry.md`) |
| `services/<name>/docs/features/` | feature contracts written at intake |
| `services/<name>/docs/contract-notes.md` | where the API departs from its contract, with status |
| `specs/` | Playwright specs |

The pack's `README.md` is the map. Its skill (`.claude/skills/<name>-api/SKILL.md`) records what an
agent must know about this API that the contract does not say.

## A new pack

`npm run scaffold:service` creates one from a contract: it reports what it found and writes nothing
until it is run again with `--write`. Never copy another pack by hand. Facts specific to that API
would come along and be wrong.
