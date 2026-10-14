# Reachability: stop when a system cannot be reached

The API under test, its contract URL, the test-management tool and the tracker are separate systems,
and any of them can be down, behind a VPN or misconfigured. Missing data from one of them is never
replaced with data from another.

- **Before a phase calls a system, check it answers.** The session start probe reports the API of
  each pack the active environment configures. `npm test` checks it again in the pack's
  `preflight-<pack>` project, and the contract tools fail fast with `--live`.
- **Stop on a connection failure**: refused connections, timeouts, DNS errors, TLS errors. Say which
  system did not answer and what to check (VPN, `QA_ENV`, the pack's entry under
  `api.environments.<env>.packs` in qa-config, the service itself), then wait. Do not retry in a
  loop.
- **Do not substitute.** If the live contract cannot be fetched, do not design from an issue
  description instead. If the tracker cannot be read, do not assume an issue's state. Either use a
  tracked copy and say that it is one (the pack's tracked contract, the file `service.json` `spec`
  names, or the tracked digest), or stop.
- **An HTTP error is not a reachability problem.** A `401`, `404` or `500` is an answer from the
  system. Read it as such and check credentials, paths and data before suspecting the network.
- Credentials are read from the environment or the local `.env` file. Name the missing variable;
  never print a value (L-43). `credential()` in `scripts/lib/env.mjs` and `missingVariableMessage`
  in `scripts/lib/env-names.mjs` build that message.
