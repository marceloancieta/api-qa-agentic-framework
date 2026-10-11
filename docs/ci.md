# Continuous integration

Two GitHub Actions workflows run the framework's checks against the example pack: `ci.yml` on every
pull request and every push to `main`, and `drift.yml` once a day. Both start the Swagger Petstore
in Docker on the runner, the same way a contributor does (`npm run petstore:up`). The commands they
call are described in [quality gates](quality-gates.md), [contract tooling](contract-tooling.md) and
[test management](test-management.md); this page covers the order and the reasons. The same runs
exist as Jenkins pipelines ([Jenkins](#jenkins)).

| Workflow | Trigger | Jobs |
|---|---|---|
| `.github/workflows/ci.yml` | `pull_request`, `push` to `main` | `gates`, then `e2e` |
| `.github/workflows/drift.yml` | daily `schedule`, `workflow_dispatch` | `drift` |

## `ci.yml`

### `gates`

Checkout, Node from `.nvmrc` with the npm cache, `npm ci`, `npm run gates`. The gates need no API,
so a broken lint, type, contract or linter check fails in minutes, before any container starts. This
is the same command as the pre-push hook: a gate counts only if its failure blocks (L-49).

No gate needs a binary that the runner lacks. Gitleaks is called only by the git hooks through
`scripts/secret-scan.mjs`; the gates need only git and Node. In Actions the secret scan is a
workflow of its own (`secret-scan.yml`, see [CI security](ci-security.md)).

### `e2e`

Runs only when `gates` passed. Every step fails the job when its command fails. There is no
`continue-on-error`, and the reporting steps that run after a failure do not turn the job green.

| Step | Why |
|---|---|
| Provide `API_KEY` | The variable named by qa-config `api.auth.env`. See [secrets and variables](#secrets-and-variables). |
| `npm run petstore:up` | Starts the pinned Petstore image and waits for its healthcheck. |
| `npx playwright test --project=api` | The `preflight` project runs first. When the API is not answering, it fails once with the reason and no API case runs. `@destructive` cases are left out. |
| `npm run lanes:destructive` | Last. Each `@destructive` case runs alone and is followed by the environment's recovery, a restart of the container, and a wait until the API answers (L-59). Its results join the run above under the same run id. |
| Rebuild the local tool's definitions | Only for the example's `local` tool: its store (`reports/tm/local`) is not tracked, so a fresh runner starts empty, and `npm run tm:publish` rebuilds the definitions from the registries. A real definitions-first tool is published by `qa-publish` after its review gate, never by CI; a results-first tool (Allure TestOps) needs no definitions. |
| `npm run tm:report -- --service petstore` | Reports the suite and the destructive lane as one run to the configured tool. |
| `npm run coverage:status` | The gates ran it without results. Here it also checks that every published case has a result in this run and that no blocked case passed. |
| `npm run quality:gate` | The verdict from `qa-config.quality_gate`. A FAIL fails the job, a REVIEW does not. The Markdown summary is added to the job summary. |

The destructive lane, the report, the coverage check and the quality gate run even when the suite
failed. A failed run is still reported as one run, and the lane completes it. They do not run when
the suite never started, for example because the Petstore did not start. The job sets `QA_RUN_ID` to
`gh-<run id>-<attempt>`, so the results, the tool logs and the run in the test-management tool all
carry the id of the workflow run (L-48).

The suite uses only Playwright's API client, so no browser is installed (`playwright install` is not
needed).

### Why docker compose and not a service container

The backlog item asked for a service container. The workflow starts the Petstore with
`docker compose` instead. The destructive lane recovers the service with the environment's
`recovery.command`, which for the local environment is `docker compose restart petstore`. That
command only works on a container started by compose from `docker-compose.yml`. A service container
is created by the runner under a generated name, and compose cannot restart it. Compose also keeps
the image tag in one place, the file a contributor uses locally.

Each workflow sets its own `COMPOSE_PROJECT_NAME`. Stopping and restarting then touch only the
container that run started, even where the Docker daemon is shared, as under `act`.

### Pull requests and concurrency

A new push to a pull request cancels the run it supersedes. Runs on `main` always finish. The
`GITHUB_TOKEN` has `contents: read` only.

## `drift.yml`

The contract can change without notice (L-28), and published cases are re-run when it does and
periodically even when it does not (L-31).

| Step | Exit and effect |
|---|---|
| `npm run petstore:up` | The lanes run against it. |
| `npm run contract:digest:live` | Compares the contract the environment serves with `docs/discovery/<pack>-digest.json`. 0: no structural drift. 1: drift, recorded; the job fails in the last step, after both lanes. 2: could not compare (no digest, contract not reachable); the step fails at once. |
| `npm run lanes:known-gap` | Each armed known gap alone. A gap that starts passing fails the job, for investigation before the arm is removed. |
| `npm run lanes:published:changed:live` | Only when the digest moved: the published cases whose operations changed in the compared contract, first, so their results name what the move broke. |
| `npm run lanes:published` | Every published case, zero retries. |
| Fail on contract drift | When the digest moved, prints what moved and fails the job. |

The two lanes run whatever the digest step found, because they need only the Petstore. The job
summary shows the digest report and both lane tables. A drift is never only a warning: the run turns
red, and an annotation points to the summary. Text-only drift (operation descriptions) is printed
but does not fail, as in `contract:digest:live` itself.

To clear a drift, review the change, update the pack's contract and refresh the digest
(`npm run contract:digest`) in a pull request. A behaviour change goes through the intake phase
before any case changes.

### Which contract is compared

By default, the active environment's `spec_url` is compared. For the example pack that is the local
container, whose image tag is pinned, so its contract changes only when the tag in
`docker-compose.yml` changes. To watch a deployed contract, set the repository variable
`QA_DRIFT_CONTRACT_ENV`, or the `contract_env` input of a manual run, to another qa-config
environment, such as `public`. The digest step and the changed-cases lane read it; the selected cases
then run on that environment, where an environment whose `allow_writes` is false skips the write
cases with their reason. The known-gap lane and the full published lane stay on the default
environment, which allows writes.

### Changed cases versus all published cases

When the digest moves, the cases that touch a changed operation must run. `--changed-from-digest`
alone compares the tracked digest with the pack's tracked contract file, which the gates keep in step
(`contract:check`), so in CI it would always select nothing. The workflow uses
`lanes:published:changed:live` (`--live`), which compares with the environment's `spec_url`, and then
runs the full published lane as the daily re-run.

## Secrets and variables

None are required for the Petstore.

| Name | Kind | Used by | Meaning |
|---|---|---|---|
| `API_KEY` | secret, optional | `e2e`, `drift` | The API key of a real API. Without it, each run generates a random value (`openssl rand -hex 12`) and masks it. The Petstore accepts any non-empty value. A literal value is never written in a workflow. |
| `QA_DRIFT_CONTRACT_ENV` | variable, optional | `drift` | The qa-config environment whose contract the digest step compares. Empty: the default environment. |
| `contract_env` | `workflow_dispatch` input | `drift` | The same, for one manual run. It takes precedence over the variable. |

Secrets are not passed to workflows triggered by pull requests from forks. Those runs fall back to
the generated key. That works for the Petstore, and against a real API it fails loudly with `401`
answers rather than passing.

Before a real secret is used, keep in mind that Playwright traces are not redacted. Allure evidence
is (L-42). The configuration keeps a trace of each failed test (`QA_TRACE`, default
`retain-on-failure`), and the HTML report in the artifact embeds it, request headers included. Set
`QA_TRACE: off` on the job, or leave `playwright-report/` out of the upload, before setting
`API_KEY`.

## Artifacts

Each run uploads one artifact, even when a step failed, and keeps it for 14 days:

| Artifact | Holds |
|---|---|
| `e2e-reports-<attempt>` | `allure-results/` (the run, with redacted evidence), `playwright-report/`, `reports/` (the quality gate's JSON and Markdown, `reports/tm/`, and the Petstore log after a failure) |
| `drift-reports-<attempt>` | `reports/drift/` (digest report and lane tables), the Allure and Playwright output of the last lane run, and the Petstore log after a failure |

## Adapting to a new pack or environment

- **Another pack against a containerised API.** Add its service to `docker-compose.yml` and its
  environment to qa-config, with a `recovery.command` if it has `@destructive` cases. Then change
  the start step and `--service` in the report step. The suite and the lanes collect every pack in
  `services/`, but qa-config has one `base_url`, one `api.auth` and one set of actors per
  environment, so packs on different hosts need one job per pack, each running its own
  `services/<pack>/specs` folder with its `QA_ENV` (backlog FUT-09).
- **A deployed environment.** Drop the start and stop steps, and set `QA_ENV` on the job to the
  qa-config environment. That environment has a `base_url`, a `spec_url` and the credentials its
  `api.auth` names, supplied as secrets. `qa-config.json` is per machine and not tracked, so CI
  reads `qa-config.example.json` unless a step writes one. The destructive lane refuses an
  environment with `allow_writes` false or no recovery, and that refusal fails the job, so remove
  the step rather than let it fail. Never point a workflow at production.
- **Different credentials.** Provide every variable that `api.auth` and `api.actors` name, from
  secrets, in the same step as `API_KEY`. The preflight names any variable that is missing.
- **A real test-management tool.** Set `test_management` in the configuration the job reads, and
  pass the adapter's token variable from a secret to the report step only.

The actions are pinned by full commit SHA, with the release in a trailing comment. Dependabot
(CI-02) proposes updates.

## Running the workflows locally

`act` (the `nektos/act` project) runs the jobs in Docker on your machine, so a workflow change
can be tried before it is pushed. `.actrc` at the repository root holds the settings every command
below needs: the runner image for `ubuntu-24.04` and `ubuntu-latest`, and `API_BASE_URL` and
`API_SPEC_URL` pointing at `host.docker.internal`. A job runs in its own container, while the
Petstore that `docker compose` starts runs on the host's Docker, so `localhost:8080` inside the job
would not reach it.

Stop your own Petstore first (`npm run petstore:down`): the job's container takes port 8080.

```sh
act push -j gates                  # the gates on Linux
act push -j e2e                    # gates, then the suite, the destructive lane, report, quality gate
act workflow_dispatch -j drift     # the daily drift run, on demand
act push -j gitleaks               # the secret scan over the full history
act pull_request -j key            # the PR review's key check: skips the review without a key
```

What `act` does not reproduce:

| Job or step | Why |
|---|---|
| Upload reports | `act`'s artifact server lacks the `upload-artifact` v7 protocol; the step is skipped when `ACT` is set. The reports stay in the job container. |
| `codeql.yml` | needs GitHub code scanning to receive the results |
| `pr-review.yml` `review` | needs `ANTHROPIC_API_KEY` and a pull request on GitHub to read and comment on |
| `schedule` triggers | run the scheduled job with `workflow_dispatch` instead |
| `dependabot.yml` | Dependabot is a GitHub service, not a workflow |

Results under `act` can differ from a hosted runner in timing. Before treating a failure seen only
under `act` as a defect, repeat the suite with `npm run lanes:flake`.

## Jenkins

`Jenkinsfile` and `Jenkinsfile.drift` at the repository root run the same steps as `ci.yml` and
`drift.yml`, in the same order and for the same reasons, as declarative pipelines.

| File | Trigger | Stages |
|---|---|---|
| `Jenkinsfile` | the job's own triggers (a webhook or SCM polling) | Node, Install, Gates, `e2e (petstore)` |
| `Jenkinsfile.drift` | `cron('H 5 * * *')` | Node, Install, `Drift (petstore)` |

**Agent.** Any agent with git, Node at the major version in `.nvmrc` on the `PATH` (the Node stage
checks it) and Docker with the compose plugin. Steps run with `sh` on Linux agents and `bat` on
Windows agents, so the same files serve both. Plugins: Pipeline, Git, Credentials Binding, JUnit and
Timestamper; Allure is optional (`PUBLISH_ALLURE`).

**Job.** A Pipeline (or Multibranch Pipeline) job with "Pipeline script from SCM" and script path
`Jenkinsfile` or `Jenkinsfile.drift`. Parameters appear after the first build has read the file;
until then every parameter takes its default.

| Parameter | Use |
|---|---|
| `AGENT_LABEL` | the agent label to run on; empty means any agent |
| `API_KEY_CREDENTIALS_ID` | a secret-text credential with the API key; empty generates one per build, which the Petstore accepts |
| `PETSTORE_PORT` | host port for the Petstore container when 8080 is taken, for example by Jenkins itself on the same machine; the API URLs follow it |
| `API_BASE_URL`, `API_SPEC_URL` | explicit URLs, for an agent that runs in a container and reaches the Petstore through `host.docker.internal` |
| `CONTRACT_ENV` | drift only: the qa-config environment whose contract is compared |
| `PUBLISH_ALLURE` | CI only: publish `allure-results` with the Allure plugin |

The build publishes the JUnit report (`reports/junit.xml`), prints the quality gate summary and
archives `reports/`, `playwright-report/` and `allure-results/`. It stops the Petstore in every
case, and on failure archives its log.
