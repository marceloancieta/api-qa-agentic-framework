# 0008 - Branching model and change traceability

**Status:** Accepted (2026-10-08)

## Context

Every change should be traceable from the backlog item that asked for it to the commit that delivered
it and the release that shipped it. The project has a single line of releases (no older versions
maintained in parallel), will accept outside contributions through GitHub, and runs its quality gates
in CI.

Three common models were compared:

- **GitFlow** (`main`, `develop`, `feature/*`, `release/*`, `hotfix/*`) suits scheduled releases with
  several supported versions. Here it would add two long-lived branches to keep in sync and gain nothing.
- **Trunk-based development** keeps everyone on `main` with very short branches or direct commits. It
  leaves no natural place for CI results, review and discussion to attach to a change.
- **GitHub Flow** (`main` plus one short-lived branch per change, merged through a pull request) gives
  each change a pull request carrying its CI run, review and backlog reference, and is the workflow
  outside contributors already expect.

## Decision

Use **GitHub Flow**, with two trunk-based habits: branches live hours to a few days, and `main` is
protected and always green.

| Element | Convention |
|---|---|
| Branch | `<type>/<backlog-id>-<short-description>`, e.g. `feat/core-04-actor-fixture` |
| Commit | Conventional Commits with the backlog id: `feat(core): CORE-04 actor fixture bound to a credential` |
| Pull request | Same title as the commit; body links the backlog item; CI must pass before merging |
| Merge | Squash merge into `main`: one commit per backlog item |
| Release | Tag `vX.Y.Z` on `main`; `CHANGELOG.md` built from the commit history |
| Backlog | A finished item moves to **Done** with its squash commit hash |

`git-policy` can enforce part of this through configuration: `tracker.key_pattern` matching the
backlog ids, `policies.commit.conventional_commits: true` and `policies.commit.protected_branches:
["main"]`.

**Adoption timing.** Until the first push the repository was local: commits went to `main` directly,
following the commit convention above, and the history was cleaned before publication (backlog
DOC-04). Branches and pull requests started right after that first push (DOC-05).

## Consequences

- The history reads as one commit per backlog item, each linked to a pull request with its CI evidence.
- Contributors follow the default GitHub workflow.
- Releases come from tags on `main`; there are no release or develop branches to maintain.
