---
paths:
  - 'services/**'
  - '.claude/skills/**'
  - 'qa-config*.json'
---

# Service packs

Each API under test is a pack in `services/<name>/` (ADR 0007). The core (`helpers/`, `fixtures/`,
`scripts/`) never imports from a pack; `npm run lint:layers` reports an import that does.

## Which pack, which environment

- **The pack** comes from the request: the user names the API, or the endpoints belong to exactly one
  pack's contract. When several packs could match, ask. The contract tools default to the only pack
  when there is one.
- **The environment** comes from qa-config: `QA_ENV` if set, otherwise `api.default_environment`.
  It holds one entry per pack it serves (`api.environments.<env>.packs.<pack>`, ADR 0009), and that
  entry's `base_url`, `spec_url` and `allow_writes` decide where the pack's cases run and whether
  writes are allowed. A pack without an entry cannot run there; there is no global fallback.
  `qa-config.json` is per machine; without it, `qa-config.example.json` applies.
- **Credentials** are named in the pack's entry (`auth` for the `default` actor, `actors` for the
  others) and read from the environment.
- **Run one pack** with `npx playwright test --project=api-<pack>`, or a lane with
  `--service <pack>`; `--project=api-*` and the lanes without `--service` take every pack.

## What a pack holds

| Path | Holds |
|---|---|
| `service.json` | name and version (part of every identity), title, identity fields to pseudonymize, the contract file, and `workers` when the service cannot take concurrent callers |
| `openapi.json` | the contract under test |
| `generated/` | contract outputs; regenerate with the `contract:*` scripts, never edit |
| `error-envelopes.json` | the error formats the API answers with |
| `clients/`, `fixtures.ts`, `flows/`, `builders/`, `state-models.ts`, `guards.ts`, `assertions.ts` | the layers of `.claude/rules/generation.md` |
| `rules/` | decision tables as YAML |
| `registry/` | designed cases (`.claude/rules/registry.md`) |
| `services/<name>/docs/features/` | feature contracts written at intake |
| `services/<name>/docs/contract-notes.md` | where the API departs from its contract, with status |
| `specs/` | Playwright specs |
| `dast-rules.tsv`, `dast-exclude.txt`, `dast-false-positives.tsv` | optional: the DAST lane's rule policy, the URLs a scan must not call, and alerts shown to be false, each with its evidence |
| `perf.json` | optional: what the performance lane needs beyond the contract (parameter values, operations answered without credentials, operations it must not send) |

The pack's `README.md` is the map. Its skill (`.claude/skills/<name>-api/SKILL.md`) records what an
agent must know about this API that the contract does not say.

## A new pack

`npm run scaffold:service -- --name <pack> --spec <file|url>` creates one from a contract. It
reports what it found and writes nothing until it is run again with `--write`: the pack, its
generated contract files and its skill, from
[the service skill template](../../docs/templates/service-skill.md). For a pack that exists without
a skill, `--write --skill-only` writes only the skill. Never copy another pack by hand. Facts
specific to that API would come along and be wrong.
