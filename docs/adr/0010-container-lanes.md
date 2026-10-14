# 0010 - Lanes that run their tools in containers

**Status:** Accepted (2026-10-14)

## Context

Three lanes need software the repository does not write: the DAST lane runs OWASP ZAP (FUT-01), the
performance lane runs k6 (FUT-02), and the differential lane compares the Petstore with an earlier
release of it (FUT-06). Node is the only runtime a contributor installs (ADR 0002), so none of these
can be a host install. ZAP needs Java, and k6 is a separate binary. The lanes have to behave the same
on a laptop and in CI. Their results also feed the quality gate, which
already judges thresholds from the reports of other tools (GATE-08).

Two questions had to be settled once for all three lanes. The first is where a tool's version is
pinned and how a lane starts it. The second is which verdict belongs to the lane and which to the
quality gate.

## Decision

**Each tool, and each reference deployment, is a pinned compose service.** `docker-compose.yml`
holds `zap`, `k6` and `petstore-reference`. Each of these three is pinned by tag and digest and sits in its own
profile (`dast`, `perf`, `diff`), so `docker compose up` never starts it. The lane builds the
command and runs the tool with `docker compose run --rm`. The reference deployment is started with
`docker compose --profile diff up -d --wait`. The same compose file serves local runs and the GitHub
workflows (`dast.yml`, `perf.yml`, `diff.yml`), so a tool's version lives in exactly one place. The
Jenkinsfile does not run these lanes yet; when it does, it uses the same services. Updating a tool means changing one line.

**The pack's inputs are mounted read-only and the outputs land in `reports/<lane>/`.** ZAP reads
`services/` from a read-only mount, and k6 reads its fixed script from `scripts/k6`. Each tool writes
its report under `reports/`, which CI uploads.

**The lane reaches the API the way the container sees it.** Inside a container, `localhost` is the
container itself. `scripts/lib/container.mjs` therefore rewrites a loopback base URL to the compose
service that publishes the port, or else to `host.docker.internal`, and the lane prints the rewrite.
What a lane exposes stays on the machine: the reference deployment's port and ZAP's API port are
bound to 127.0.0.1.

**Credentials never reach the disk or a command line.** A lane obtains the actor's credential on
the host through `scripts/lib/auth-tokens.mjs`. For k6, it passes the credential through the docker
process's environment (`docker compose run -e NAME`). For ZAP, it sets a replacer rule through
ZAP's API on a loopback port and renews it before the token expires. Messages name variables, never
values (`scripts/lib/env-names.mjs`).

**The lane judges statuses; the quality gate judges thresholds.** A lane answers one question: did
every request, alert or answer have the status it must have?

- The DAST lane fails on an alert of a rule the pack sets to `FAIL`.
- The performance lane fails when a request does not answer its expected status.
- The differential lane fails on a difference the pack has not accepted, or on an accepted
  difference that no longer shows up.

Counting alerts per risk level and judging the 95th-percentile latency belong to the quality gate.
Its `dast` and `p95_latency` checks read the report the lane wrote, against the thresholds in
`qa-config.quality_gate` ([quality gates](../quality-gates.md)). No threshold is judged twice.

**The exit codes mean the same thing in every lane.** `0` means nothing beyond what the pack
accepts. `1` means a finding. `2` means the lane could not run, or its result cannot be trusted: bad
arguments, missing Docker, an API or a credential that does not answer, or a report missing or
malformed. A pipeline can therefore tell a finding from a broken run.

Alternatives rejected:

- **Installing the tools on the host, or through npm wrappers.** That would add Java and other
  runtimes to every contributor's machine (ADR 0002), and each machine would run whatever version it
  had installed.
- **Marketplace CI actions** for the scans. They run in GitHub Actions only, so a finding could not
  be reproduced locally or on another CI, and the version would be pinned in a workflow rather than next
  to the services the scan targets.
- **Thresholds in the lanes too.** Two places would judge the same numbers, and the day they
  disagreed, a lane and the gate would give two verdicts on one run.

## Consequences

- The DAST and performance lanes need Docker. The differential lane runs on the host and needs it
  only for a reference started from compose. The gates and the specs do not need it.
- A tool upgrade is a reviewed change to one digest in `docker-compose.yml`. Dependabot does not
  watch the compose file, so upgrades are made by hand.
- A pack controls its own scan and comparison through files in the pack: `dast-rules.tsv`,
  `dast-exclude.txt`, `dast-false-positives.tsv`, `perf.json` and `diff.json`
  (`.claude/rules/service-packs.md`). The core stays free of pack names (ADR 0007).
- A new tool lane follows the same shape: a pinned service in its own profile, a lane script that
  builds the command, a report under `reports/<lane>/`, statuses judged in the lane, thresholds in
  the gate, and the exit codes above.
