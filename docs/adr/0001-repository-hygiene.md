# 0001 - Repository hygiene: secret scanning and a local denylist

**Status:** Accepted (2026-10-08)

## Context

This is a public repository maintained by people who also work on private client projects. Two kinds
of content must never reach it: secrets (tokens, keys, credentials) and client identifiers (product
names, hosts, issue keys, internal addresses, people's names). Review alone does not reliably catch
either, and once something is pushed it may be cached or indexed even if it is later removed.

## Decision

Two scanners run before every commit (`.githooks/pre-commit`, enabled with `npm run hooks:install`):

- **gitleaks** on the staged changes. It fails closed when gitleaks is missing, because a scanner that
  silently does not run reports the same green as one that found nothing.
- A **local denylist** of terms a contributor must never publish, stored in `.git/info/denylist`, which
  git never versions, so the list itself can never be committed (committing it would publish exactly
  what it protects). `scripts/scan-denylist.mjs` also scans commit messages, the tracked tree and the
  full history before a release.

## Consequences

- Contributors without a denylist get a notice, not a failure: a fresh clone has nothing to protect.
- The denylist is per machine; each contributor maintains their own.
- CI runs gitleaks; only local machines run the denylist.
