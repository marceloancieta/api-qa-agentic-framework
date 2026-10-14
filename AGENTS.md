# Agent guide

Instructions for any coding agent working in this repository. Claude Code reads them through
[`CLAUDE.md`](CLAUDE.md), which adds what is specific to Claude Code.

## What this repository is

A framework for testing HTTP APIs: contract-driven test design, Playwright and TypeScript execution,
test-management and tracker adapters, and the process that connects them. Each API under test is a
service pack in `services/<name>/`; `services/petstore/` is the worked example. Read
[`README.md`](README.md) for the commands and `docs/adr/` for the decisions behind the structure.

## The process

Work on an API under test moves through phases. Each phase produces an artifact a person reviews
before the next phase starts.

| Phase | Produces | Mode |
|---|---|---|
| 0 intake | `services/<pack>/docs/features/<feature>.md`, the completed contract | design |
| 1 design | `services/<pack>/registry/<feature>.md`, the reviewed cases | design |
| 2 automate | `services/<pack>/specs/*.spec.ts`, specs that ran as designed | design |
| 3 publish | case definitions in the test-management tool | design |
| 4 run | a reported run | execution |

Defects found in any phase are triaged and filed separately
([bug reporting](docs/references/bug-reporting.md)).

**Design and execution never mix** (`.claude/rules/modes.md`):

- Design calls the API read-only, apart from running the specs it is writing and the credential
  exchange of the pack's auth strategy.
- Execution never edits specs, registries or definitions.

A request that needs both is split, and each half stops at its own gate.

## Rules that apply to every change

- **Gates.** `npm run gates` must pass before a commit. It runs the linters with their self-tests,
  the format, type, configuration, contract and coverage checks, and the unit tests.
- **No secrets or real data.** Credentials come from the environment or the local `.env`, never from
  arguments or files in the repository. Specs, registries and docs use placeholders and builders.
- **Facts have one home.** Link to the owner instead of copying a value; numbers come from scripts
  (`.claude/rules/documentation.md`).
- **Checks are tested.** A new linter rule comes with fixtures that contain the defect and
  look-alikes that do not, and its self-test expects exactly those findings.
- **Language.** Code, comments, file names, docs and commit messages are in English. Conversation
  follows the user's language.
- **Commits** follow `type(scope): <BACKLOG-ID> summary` (ADR 0008), one logical change each.
  Pushing and publishing anything outside the machine need the owner's approval.

## Where to look

| For | Read |
|---|---|
| how to complete a contract and choose techniques | [`docs/references/contract-analysis.md`](docs/references/contract-analysis.md) |
| registries, ids and statuses | `.claude/rules/registry.md` |
| how a case becomes a spec | `.claude/rules/generation.md` |
| tags | `.claude/rules/tagging.md` |
| what results carry | `.claude/rules/reporting.md` |
| which pack and environment | `.claude/rules/service-packs.md` |
| a system that does not answer | `.claude/rules/reachability.md` |
| defect classes and severity | [`docs/references/defect-rubric.md`](docs/references/defect-rubric.md) |
| the lessons behind the checks | [`docs/lessons-learned.md`](docs/lessons-learned.md) |
| open work | [`docs/backlog.md`](docs/backlog.md) |
