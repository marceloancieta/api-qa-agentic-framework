# Contract tooling

Scripts that read an API description and tell you what to test and what changed. All of them read
the same normalized model (`scripts/lib/openapi.mjs`, ADR 0003), so Swagger 2.0, OpenAPI 3.0 and
OpenAPI 3.1, in JSON or YAML, give the same results.

Every tool except `contract:check` and `contract:decision-tables`, which take only `--service`
and cover every pack without it, takes the same source flags:

| Flag | Source |
|---|---|
| `--service <name>` | The pack's `services/<name>/service.json` names its document. Needed when the repository has more than one pack, as it does with the example packs: `npm run contract:digest -- --service petstore`. |
| `--spec <file\|url>` | An explicit document. |
| `--live` | The pack's `spec_url` in the active qa-config environment (`api.environments.<env>.packs.<pack>`; `QA_ENV` selects the environment, `QA_<PACK>_SPEC_URL` overrides the URL for one run). Needs a pack: `--service`, or the only one. |

## Tools

| Command | Answers | Output |
|---|---|---|
| `npm run contract:digest` | What does the contract look like now? | `docs/discovery/<service>-digest.json` (tracked) |
| `npm run contract:digest:check` | Did the contract change since it was tracked? Exits 1 on structural drift; text-only drift is a notice. | report by drift class |
| `npm run contract:digest:live` | Has the deployed contract moved away from the tracked one? | same report |
| `npm run contract:probes -- --service <pack>` | Which negative and boundary probes does each operation deserve, and which are covered by a spec? `--gaps` lists the uncovered ones. | table; `npm run contract:probes:write -- --service <pack>` updates `generated/probe-matrix.json` |
| `npm run contract:value-sets` | Which closed value sets (enums, literal patterns) does the contract define? | `generated/value-sets.json` and `generated/enums.ts` |
| `npm run contract:floor` | How many cases does each operation need at least? Every term of the formula is printed. | table; `--json` |
| `npm run contract:codes` | Which declared response codes were never reached, and which answers were not declared? Reads the latest run's evidence in `allure-results/`. `--strict` fails on undeclared answers. | table; `--json` |
| `npm run contract:decision-tables` | Are the pack's decision tables complete and consistent? Writes the module specs read them from. | `generated/decision-tables.ts` |
| `npm run contract:check` | Are the tracked digest, probe matrix, value sets and decision tables of every pack current? Runs in `npm run gates`. | exit code |

`npm run contract:probes:check` and `npm run contract:value-sets:check` run one of the checks of
`contract:check` on their own, for one pack (`-- --service <pack>`).

## Probes

Probes come in three classes:

- **scheduled**: derived from an explicit constraint (length, bounds, pattern, enum, required). This
  class includes pairwise combinations of independent optional parameters (`scripts/lib/pairwise.mjs`).
- **exploratory**: derived from declared types (wrong type, null, unknown property, numeric overflow).
- **service-wide**: applied to every operation (malformed or truncated JSON, wrong content type,
  empty required body, and invalid path parameters).

Each probe has a stable id (`p-` and ten hex digits). A spec covers a probe by containing
`probe:<id>`, usually at the end of the test title. After adding or removing such references, run
`npm run contract:probes:write -- --service <pack>` so the tracked matrix records the new coverage.

## Decision tables

A result that depends on a combination of conditions is written as a table in
`services/<pack>/rules/<id>.yaml`: the conditions and their classes of values, the actions every
rule states, and the rules. A condition a rule leaves out matches any class. The generator refuses a
table where some combination has no rule, or where two rules give different outcomes for the same
combination. It then writes `generated/decision-tables.ts`, because specs must not read files
while they are being collected (L-24).

A spec iterates one table in one test, so the case keeps a single identity. Each rule becomes a
step with soft assertions, and the spec maps each class to concrete inputs, taking values from
`generated/enums.ts`. TC-PET-55 and TC-PET-60 in `services/petstore/specs/pet-search.spec.ts` are
the worked examples.

## Floor

The floor formula is defined once, in the header of `scripts/derive-floor.mjs`. A test-design
review compares a registry's case count with this number rather than with an estimate.
