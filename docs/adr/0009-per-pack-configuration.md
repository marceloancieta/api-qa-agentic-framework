# 0009 - Configuration per service pack

**Status:** Accepted (2026-10-12)

## Context

ADR 0007 made each API under test a service pack, but qa-config still described one API per
environment: one `base_url`, `spec_url`, `allow_writes` and `recovery` per environment, and one
`api.auth` with one set of `api.actors` for every pack. Packs on different hosts, with different
credentials, could not be expressed. The Playwright `api` project and the lanes collected the specs
of every pack against that single base URL, so a second pack could only be run one folder at a time
with its own `QA_ENV`, and its credentials had to replace the first pack's in `qa-config.json`. This
was backlog item FUT-09.

## Decision

**Each environment holds one entry per pack it serves**, at
`api.environments.<env>.packs.<pack>`, keyed by the pack's folder name. The entry holds everything
that differs between packs: `base_url` and `auth` (required; `auth` is the credential of the
built-in `default` actor), and `spec_url`, `allow_writes`, `recovery` and `actors`.
`api.default_environment` still picks the environment when `QA_ENV` is unset. The schema,
`schemas/qa-config.schema.json`, is the owner of the shape.

**No fallback.** The global `api.auth` and `api.actors` and the environment-level `base_url`,
`spec_url`, `allow_writes` and `recovery` were removed, not kept as defaults. A pack the active
environment does not list cannot run there, and the error names the environment and the packs it
does configure. `npm run config:check` rejects the old shape and names the removed keys.

**Overrides per pack.** `QA_<PACK>_BASE_URL` and `QA_<PACK>_SPEC_URL` (the pack name upper-cased,
hyphens as underscores) override one pack's URLs for a run. `API_BASE_URL` and `API_SPEC_URL` were
removed: with several packs, one variable could not say which pack it meant.

**Projects and preflight per pack.** `playwright.config.ts` gives every folder under `services/`
that has a `service.json` a setup project `preflight-<pack>` and a test project `api-<pack>` that
depends on it. The preflight checks the variables the pack's `auth` and `actors` name and that the
pack's base URL answers. `--project=api-<pack>` runs one pack and `--project=api-*` every pack. A
pack fails in its own preflight when it is selected and the environment does not configure it; a
pack that is not selected never blocks a run. The pack name reaches the core through the project's
metadata, so the core still never imports from a pack or names one (ADR 0007).

**Lanes scoped by pack.** The lanes run every pack's project by default and one with
`--service <pack>`. The destructive lane takes `allow_writes`, `recovery` and the readiness URL from
the entry of each case's pack. The contract tools' `--live` reads the pack's `spec_url`, so it needs
a pack: `--service`, or the only one.

Alternatives rejected:

- **Global auth and base URL with per-pack overrides.** Every reader, and every tool, would have to
  look in two places and merge them, and a pack that forgot its override would silently run with
  another pack's credentials.
- **A separate configuration file per pack.** Environments would be split across files: adding an
  environment, or reading what one contains, would mean opening every pack's file, and the
  environment-wide settings (test management, tracker, policies) would have no single home.

## Consequences

- A breaking change for existing `qa-config.json` files: each environment's URLs, `allow_writes` and
  `recovery`, and the global `api.auth` and `api.actors`, move under
  `api.environments.<env>.packs.<pack>`. `npm run config:check` names each removed key it finds.
- Commands and jobs that used `--project=api`, the `preflight` project or `API_BASE_URL` and
  `API_SPEC_URL` change to the per-pack names; Jenkins takes `PETSTORE_BASE_URL` and
  `PETSTORE_SPEC_URL` and exports them as the pack's variables ([CI](../ci.md#jenkins)).
- A new pack needs no change to `playwright.config.ts`: the scaffolder's folder and a qa-config
  entry are enough ([add a service pack](../guides/add-a-service-pack.md)).
- The session start probe reports one line per pack the active environment configures.
