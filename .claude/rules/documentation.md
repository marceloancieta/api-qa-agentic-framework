---
paths:
  - '**/*.md'
  - 'scripts/**'
---

# Documentation

Documentation drifts from the repository it describes in a few predictable ways. A fact is copied and
only one copy gets corrected. A new file is never linked. A number is written by hand. A policy
changes while the code that applies it does not (L-07 to L-10). `npm run lint:docs` catches what can
be checked mechanically. This rule covers the rest.

## One home per fact

Each fact below has one owner. Other files link to it or name it; they never restate it.

| Fact | Owner |
|---|---|
| The floor formula and each operation's floor | `scripts/derive-floor.mjs`; `npm run contract:floor`, `npm run coverage:status` |
| The live contract surface: operations, parameters, responses, drift classes | `docs/discovery/<pack>-digest.json` (`npm run contract:digest`) |
| Value sets and the literal values a spec may send | `services/<pack>/generated/` (`npm run contract:value-sets`) |
| The registry format: header keys, columns, statuses, techniques, priorities | `scripts/lib/registry.mjs`; meaning in `.claude/rules/registry.md` |
| The tag taxonomy | `scripts/lib/tags.mjs`; meaning in `.claude/rules/tagging.md` |
| Case identity | `helpers/case-meta.ts` (`caseIdentity`) |
| Design versus execution | `.claude/rules/modes.md` |
| Scope levels, defect title format, mapping cases to issues | `docs/references/bug-reporting.md` |
| Defect classes and severity | `docs/references/defect-rubric.md` |
| How to complete a contract and choose techniques | `docs/references/contract-analysis.md` |
| Quality gate thresholds | `qa-config` `quality_gate`; meaning in `docs/quality-gates.md` |
| Auth strategies | `helpers/auth.ts` (`createAuth`); config shape in `schemas/qa-config.schema.json` |
| Where an API departs from its contract | `services/<pack>/docs/contract-notes.md` |
| Whether a cited issue is still open | the tracker itself, re-read by `npm run cited:status` (L-11) |

A disagreement between two files about a fact missing from this table means the table needs a new row.

## Working rules

1. **Link to the owner instead of copying.** If a value has to appear somewhere else to be readable,
   make it the output of the owning script, not a copy typed by hand.
2. **Numbers and sets come from scripts** (L-08). A formula kept only in prose is never run, so
   nobody notices when its result goes wrong.
3. **Make every new file reachable in the commit that adds it** (L-09):
   - a doc under `docs/` or a pack's `docs/`: link it from a file that already has readers
     (`lint-docs` reports orphans);
   - a rule: name it in `CLAUDE.md`;
   - a skill: list it in `CLAUDE.md`;
   - a script: add it to `package.json`, and to `gates` if it is a check.
4. **Change a policy together with everything that applies it** (L-10). Walk the table below in the
   same commit.
5. **Statements about other systems carry their key** in a form `cited:status` can re-read
   ("until `<KEY>` ships", "waiting on `<KEY>`"). Statements about the past use the past tense, which the check ignores.
6. **Backlog rows** keep one status from the enum in the backlog header. A finished row moves to
   **Done** with its closing commit (`lint-docs` backlog-row-shape, L-12), a commit in the history
   of the branch (`lint-docs` closing-commit). A row that will not be done moves to **Done** too,
   its item starting with `**Won't do.**` and the reason, closed by the commit that recorded the
   decision; it is never left open with a status of its own (GATE-28).

## Propagation

| When this changes | Check these in the same commit |
|---|---|
| `.claude/rules/modes.md` | every `.claude/skills/qa-*/SKILL.md`, `AGENTS.md` |
| `.claude/rules/registry.md` or `scripts/lib/registry.mjs` | `docs/templates/registry.md`, `qa-design`, `qa-automate`, `qa-publish`, `coverage-status`, every pack registry |
| `.claude/rules/tagging.md` or `scripts/lib/tags.mjs` | each other (a test keeps them equal), `qa-automate`, `qa-run`, the CI lanes |
| `.claude/rules/generation.md` | `qa-automate`, the scaffolder's templates, `services/petstore/` as the worked example |
| `.claude/rules/reporting.md` | `helpers/case-meta.ts`, the adapters, `docs/test-management.md`, `qa-publish`, `qa-run` |
| `docs/references/bug-reporting.md` or `docs/references/defect-rubric.md` | `qa-report-bug`, the registry rule's Defect column, `cited-status` |
| `docs/references/contract-analysis.md` | `qa-intake`, `qa-design`, `docs/templates/feature-contract.md` |
| a phase skill | `CLAUDE.md` (the pipeline table), the skills before and after it |
| an agent in `.claude/agents/` | `CLAUDE.md` (the agents table), the skills that launch it, `scripts/__tests__/agent-guide.test.mjs` |
| `.githooks/`, or when the gates must run | `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` (step 3 and the hooks table), `README.md`, `docs/onboarding.md`, `docs/quality-gates.md`, `docs/guides/add-a-test-case.md` |
| `docs/templates/service-skill.md` or `SKILL_PHASES` in `scripts/lint-docs.mjs` | `scripts/scaffold-service.mjs`, `qa-intake`, `qa-design`, `qa-automate`, `docs/guides/add-a-service-pack.md` |
| a variable in `.env.example` or qa-config | `README.md` setup, the docs that name it, `schemas/qa-config.schema.json` |
| an auth strategy in `helpers/auth.ts` | `helpers/config.ts` (`AuthConfig`, `requiredEnvVars`), `scripts/lib/auth-tokens.mjs` (`variablesOf` and `laneCredential`, for the lanes), `scripts/perf-lane.mjs` (`TOKEN_TYPES`), `schemas/qa-config.schema.json`, `docs/guides/add-a-service-pack.md` (the strategy table), `scripts/scaffold-service.mjs` (the `auth` it suggests), `docs/quality-gates.md` (credentials in the lanes) |

A linter sees statements that conflict, not updates that were never made, so this table is walked by
hand. Each missing pair you discover becomes a new row.
