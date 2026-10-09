# 0005 - Three Claude Code hooks, exec form

**Status:** Accepted (2026-10-08)

## Context

Claude Code hooks run on every matching event, so each one costs a process per tool call. Secret
detection split across several hooks duplicates patterns and processes, and small single-purpose
policy hooks (commits, pull requests) multiply the same cost.

## Decision

Three hooks, all Node ES modules declared in exec form (`command: node`, `args: [...]`), with no
shell involved:

- `secret-guard.mjs` - credential shapes in any tool call, sensitive paths, egress/exfiltration,
  prompt scan, output redaction. Single source of secret patterns in `lib/secrets.mjs`.
- `git-policy.mjs` - commit-message and PR policy from `qa-config` (`tracker`, `policies`); every
  rule is off by default.
- `session-probe.mjs` - API reachability, setup state and coverage counts at session start.

Checks fail closed when they cannot read their input. Every hook has table-driven `node:test` tests
with negative cases.

## Consequences

- One security process per tool call instead of two.
- Teams opt in to tracker-key, Conventional Commit, protected-branch and PR-label rules by config.
