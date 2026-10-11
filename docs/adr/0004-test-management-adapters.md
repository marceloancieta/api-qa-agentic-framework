# 0004 - Test management behind adapters

**Status:** Accepted (2026-10-08)

## Context

Teams use different test-management tools, and they differ in model: most are definitions-first
(cases exist before runs); some materialize cases from results. Designing the interface around a
single tool would silently take that tool's shape.

## Decision

The process (gates, only approved and automated cases are published, the runner never edits
definitions, registry `status: published` + `tm_id` + link) lives in the generic phase skills. A
neutral case manifest feeds a tool-specific adapter under `scripts/tm/adapters/<tool>`, selected by
`qa-config` `test_management.provider` and invoked through `npm run tm:publish` / `tm:report`.

Interface: `capabilities { definitions, runs }`, `publishDefinitions`, `startRun`, `reportResults`,
`closeRun`, and the read-back methods `readDefinitions` and `readRun` that verify every write. The
full list, with the optional capabilities, is in the header of `scripts/tm/adapter.mjs`.

Adapters: `allure-report` (default; no definitions, so the publish phase is skipped with a notice),
`local` (JSON files, definitions-first: the reference implementation that runs the adapter contract
tests in public CI, and the template for new adapters), `allure-testops` (optional) and `testrail`
(documentation only).

## Consequences

- Adding a tool means adding one adapter that passes the contract tests.
- The `local` adapter keeps the definitions-first model honest without any external service.
