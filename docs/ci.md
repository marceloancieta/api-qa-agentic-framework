# Continuous integration

Two GitHub Actions workflows run the framework's checks against the example pack: `ci.yml` on every
pull request and every push to `main`, and `drift.yml` once a day. Both start the Swagger Petstore
in Docker on the runner, the same way a contributor does (`npm run petstore:up`). The commands they
call are described in [quality gates](quality-gates.md), [contract tooling](contract-tooling.md) and
[test management](test-management.md); this page covers the order and the reasons. The same runs
exist as Jenkins pipelines ([Jenkins](#jenkins)).

| Workflow | Trigger | Jobs |
|---|---|---|
| `.github/workflows/ci.yml` | `pull_request`, `push` to `main` | `title` (pull requests only), `gates`, then `e2e` and `e2e-vampi` |
| `.github/workflows/drift.yml` | daily `schedule`, `workflow_dispatch` | `drift` |

## `ci.yml`

### `title`

On a pull request only: the title has to follow ADR 0008 (`type(scope): <BACKLOG-ID> summary`),
because `main` takes squash merges and the title becomes the commit subject there. It runs
`scripts/commit-title.mjs`, which uses the changelog's parser, with the title passed through an
environment variable so a title cannot inject shell code. Dependabot's pull requests skip it: their
titles cannot carry a backlog id.

### `gates`

Checkout with the full history (`lint-docs` checks each closing commit of the backlog against it,
and reports a shallow clone), Node from `.nvmrc` with the npm cache, `npm ci`, `npm run gates`.
The gates need no API,
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
| Provide `API_KEY` | The variable that the `petstore` pack's `auth.env` names in qa-config. See [secrets and variables](#secrets-and-variables). |
| `npm run petstore:up` | Starts the pinned Petstore image and waits for its healthcheck. |
| `npx playwright test --project=api-petstore` | The `api-petstore` project, after its `preflight-petstore` project: the job starts only the Petstore; VAmPI runs in [`e2e-vampi`](#e2e-vampi). When the API is not answering, the preflight fails once with the reason and no case runs. `@destructive` cases are left out. |
| `npm run lanes:destructive -- --service petstore` | Last. Each `@destructive` case runs alone and is followed by its pack's recovery, a restart of the container, and a wait until the API answers (L-59). Its results join the run above under the same run id. |
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

### `e2e-vampi`

The second pack (CI-08), in a job of its own so that the required `e2e (petstore)` check keeps its
meaning. It is not a required check. Both VAmPI modes run from one pinned image on the same runner.

| Step | Why |
|---|---|
| Provide the VAmPI users | `VAMPI_USER_A_*` and `VAMPI_USER_B_*`, the users behind actors `user-a` and `user-b`: throwaway values per run (the pack registers them on a fresh container), passwords masked. |
| `npm run vampi:up` | Starts both modes and creates their databases (VN-01). |
| BOLA detection on the vulnerable mode | Runs `specs/books-authorization.spec.ts` with `QA_ENV=local-vulnerable` and passes only when TC-BOOK-02 is the one case that failed (`services/vampi/check-bola-detection.mjs`, VN-09): a matrix that stops failing there has stopped detecting the flaw. First, because every run clears `allure-results/`. |
| `npx playwright test --project=api-vampi` | The pack on the secure mode, after `preflight-vampi`. |
| `npm run coverage:status`, `npm run quality:gate`, the Allure report | As in `e2e`, on the secure-mode run. The run is not reported to the test-management tool: the pack has no published cases yet. |

### Why docker compose and not a service container

The backlog item asked for a service container. The workflow starts the Petstore with
`docker compose` instead. The destructive lane recovers the service with the `recovery.command` of
the pack's entry in the environment, which for `petstore` in `local` is
`docker compose restart petstore`. That command only works on a container started by compose from
`docker-compose.yml`. A service container is created by the runner under a generated name, and
compose cannot restart it. Compose also keeps the image tag in one place, the file a contributor
uses locally.

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
| `npm run contract:digest:live -- --service petstore` | Compares the contract the pack's `spec_url` serves with `docs/discovery/<pack>-digest.json`. 0: no structural drift. 1: drift, recorded; the job fails in the last step, after both lanes. 2: could not compare (no digest, contract not reachable); the step fails at once. |
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

By default, the `spec_url` of the pack's entry in the active environment is compared. For the
example pack that is the local container, whose image tag is pinned, so its contract changes only
when the tag in `docker-compose.yml` changes. To watch a deployed contract, set the repository
variable `QA_DRIFT_CONTRACT_ENV`, or the `contract_env` input of a manual run, to another qa-config
environment, such as `public`. The digest step and the changed-cases lane read it; the selected
cases then run on that environment, where a pack whose `allow_writes` is false there skips the
write cases with their reason. The known-gap lane and the full published lane stay on the default
environment, which allows writes.

### Changed cases versus all published cases

When the digest moves, the cases that touch a changed operation must run. `--changed-from-digest`
alone compares the tracked digest with the pack's tracked contract file, which the gates keep in step
(`contract:check`), so in CI it would always select nothing. The workflow uses
`lanes:published:changed:live` (`--live`), which compares with each pack's `spec_url` in the
environment, and then runs the full published lane as the daily re-run.

## Secrets and variables

None are required for the Petstore.

| Name | Kind | Used by | Meaning |
|---|---|---|---|
| `API_KEY` | secret, optional | `e2e`, `drift` | The API key of a real API. Without it, each run generates a random value (`openssl rand -hex 12`) and masks it. The Petstore accepts any non-empty value. A literal value is never written in a workflow. |
| `QA_DRIFT_CONTRACT_ENV` | variable, optional | `drift` | The qa-config environment whose contract the digest step compares. Empty: the default environment. |
| `contract_env` | `workflow_dispatch` input | `drift` | The same, for one manual run. It takes precedence over the variable. |
| `ALLURE_TOKEN` | secret, optional | `e2e` | Report the run to Allure TestOps ([below](#reporting-to-allure-testops)). |
| `ALLURE_ENDPOINT`, `ALLURE_PROJECT_ID` | variables, with `ALLURE_TOKEN` | `e2e` | The TestOps instance and project. |

Secrets are not passed to workflows triggered by pull requests from forks. Those runs fall back to
the generated key. That works for the Petstore, and against a real API it fails loudly with `401`
answers rather than passing.

Before a real secret is used, keep in mind that Playwright traces are not redacted. Allure evidence
is (L-42). The configuration keeps a trace of each failed test (`QA_TRACE`, default
`retain-on-failure`), and the HTML report in the artifact embeds it, request headers included. Set
`QA_TRACE: off` on the job, or leave `playwright-report/` out of the upload, before setting
`API_KEY`.

### Reporting to Allure TestOps

By default `e2e` reports the run to the tool in qa-config (the example's `local` store). To send it
to Allure TestOps instead, add one repository secret and two repository variables:

| Name | Kind | Value |
|---|---|---|
| `ALLURE_TOKEN` | secret | an API token from your TestOps profile |
| `ALLURE_ENDPOINT` | variable | the instance URL, for example `https://<instance>.testops.cloud` |
| `ALLURE_PROJECT_ID` | variable | the numeric project id |

Only the token is secret. GitHub masks a secret's value wherever it appears in a log, so a project
id such as `1` stored as a secret would hide every `1` in the output.

When `ALLURE_TOKEN` is set, the job sets `QA_TM_PROVIDER=allure-testops`, which replaces the
configured provider for that run ([test management](test-management.md#test-management-providers)),
and the three values reach only the report step. The run becomes a TestOps launch named after the
run id (`gh-<run>-<attempt>`), every result is uploaded under its case identity and read back.
Remove the secrets (for example when a trial instance expires) and the job reports to qa-config's
tool again; nothing else changes.

On Jenkins the same comes from three parameters: `ALLURE_TOKEN_CREDENTIALS_ID` (a secret-text
credential holding the token), `ALLURE_ENDPOINT` and `ALLURE_PROJECT_ID` ([Jenkins](#jenkins)).

## Artifacts

Each run uploads one artifact, even when a step failed, and keeps it for 14 days:

| Artifact | Holds |
|---|---|
| `e2e-reports-<attempt>` | `reports/allure-report/index.html` (the Allure report of the run, one file that opens from disk), `allure-results/` (the run, with redacted evidence), `playwright-report/`, `reports/` (the quality gate's JSON and Markdown, `reports/tm/`, and the Petstore log after a failure) |
| `e2e-vampi-reports-<attempt>` | the same for the VAmPI job, plus `reports/vampi-vulnerable.json` (the vulnerable-mode run the detection reads) and the VAmPI log after a failure |
| `drift-reports-<attempt>` | `reports/drift/` (digest report and lane tables), `reports/allure-report/index.html`, the Allure and Playwright output of the last lane run, and the Petstore log after a failure |

## Adapting to a new pack or environment

- **Another pack against a containerised API.** Add its service to `docker-compose.yml` and an
  entry for the pack under each qa-config environment that serves it
  (`api.environments.<env>.packs.<pack>`), with a `recovery.command` if it has `@destructive`
  cases. Then change the start step, the suite's `--project=api-<pack>` and `--service` in the
  destructive lane and the report step. `--project=api-*` and the
  lanes collect every pack in `services/`, each against its own base URL and credentials
  ([ADR 0009](adr/0009-per-pack-configuration.md)); `--project=api-<pack>` and a lane's
  `--service <pack>` narrow a step to one pack.
- **A deployed environment.** Drop the start and stop steps, and set `QA_ENV` on the job to the
  qa-config environment. Each pack's entry there has a `base_url`, a `spec_url` and the credentials
  its `auth` names, supplied as secrets. `qa-config.json` is per machine and not tracked, so CI
  reads `qa-config.example.json` unless a step writes one. The destructive lane refuses a pack
  whose entry has `allow_writes` false or no recovery, and that refusal fails the job, so remove
  the step rather than let it fail. Never point a workflow at production.
- **Different credentials.** Provide every variable that each pack's `auth` and `actors` name, from
  secrets, in the same step as `API_KEY`. The pack's preflight names any variable that is missing.
- **A real test-management tool.** Set `test_management` in the configuration the job reads, and
  pass the adapter's token variable from a secret to the report step only.

The actions are pinned by full commit SHA, with the release in a trailing comment. Dependabot
(CI-02) proposes updates.

## Running the workflows locally

`act` (the `nektos/act` project) runs the jobs in Docker on your machine, so a workflow change
can be tried before it is pushed. `.actrc` at the repository root holds the settings every command
below needs: the runner image for `ubuntu-24.04` and `ubuntu-latest`, and `QA_PETSTORE_BASE_URL`
and `QA_PETSTORE_SPEC_URL` pointing at `host.docker.internal`. A job runs in its own container,
while the Petstore that `docker compose` starts runs on the host's Docker, so `localhost:8080`
inside the job would not reach it.

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
| `Jenkinsfile` | the job's own triggers (a webhook, SCM polling or a schedule, [below](#scheduled-builds)) | Node, Install, Gates, `e2e (petstore)`, `e2e (vampi)` (the secure mode; its results join the Petstore run) |
| `Jenkinsfile.drift` | `cron('H 5 * * *')` | Node, Install, `Drift (petstore)` |

**Agent.** Any agent with git, Node at the major version in `.nvmrc` on the `PATH` (the Node stage
checks it) and Docker with the compose plugin. Steps run with `sh` on Linux agents and `bat` on
Windows agents, so the same files serve both. Plugins: Pipeline, Git, Credentials Binding, JUnit and
Timestamper; Allure is optional, but `PUBLISH_ALLURE` is on by default (see the table below).

**Job.** A Pipeline (or Multibranch Pipeline) job with "Pipeline script from SCM" and script path
`Jenkinsfile` or `Jenkinsfile.drift`. Parameters appear after the first build has read the file;
until then every parameter takes its default.

Every text parameter left empty falls back to the Jenkins environment variable `DEFAULT_<name>`
(`DEFAULT_PETSTORE_PORT`, `DEFAULT_ALLURE_ENDPOINT`, ...), set globally (Manage Jenkins, System,
Global properties) or on the agent (its node's Environment variables). Set the values that describe
a machine there, once, and leave the parameters for a one-off change. The prefix is needed: Jenkins
also exposes every parameter as a variable of its own name, empty when the parameter is, so a
variable named exactly like a parameter would be hidden.

| Parameter | Use |
|---|---|
| `AGENT_LABEL` | the agent label to run on; empty means any agent |
| `API_KEY_CREDENTIALS_ID` | a secret-text credential with the API key; empty generates one per build, which the Petstore accepts |
| `PETSTORE_PORT` | host port for the Petstore container when 8080 is taken, for example by Jenkins itself on the same machine; the API URLs follow it |
| `PETSTORE_BASE_URL`, `PETSTORE_SPEC_URL` | explicit URLs of the `petstore` pack, exported as `QA_PETSTORE_BASE_URL` and `QA_PETSTORE_SPEC_URL`, for an agent that runs in a container and reaches the Petstore through `host.docker.internal` |
| `CONTRACT_ENV` | drift only: the qa-config environment whose contract is compared |
| `PUBLISH_ALLURE` | CI only, on by default: publish `allure-results` with the Allure plugin, which shows the report on the build page. On a Jenkins without the plugin the build prints a notice and carries on; set it to `false` to drop the notice. The single-file report is archived either way |
| `ALLURE_TOKEN_CREDENTIALS_ID`, `ALLURE_ENDPOINT`, `ALLURE_PROJECT_ID` | CI only: report the run to Allure TestOps ([reporting to Allure TestOps](#reporting-to-allure-testops)) |

The build publishes the JUnit report (`reports/junit.xml`), prints the quality gate summary and
archives `reports/` (with the single-file Allure report, `reports/allure-report/index.html`),
`playwright-report/` and `allure-results/`. With `PUBLISH_ALLURE`, the Allure plugin also shows the
report in the build page; it needs an Allure Commandline tool configured in Jenkins. It stops the
Petstore in every case, and on failure archives its log.

### Scheduled builds

A scheduled build takes every parameter's default, which is why the empty defaults fall back to
`DEFAULT_<name>` variables. To run the CI pipeline every night, open the job's configuration and set
"Build periodically" with a schedule that names its time zone; the controller's clock is usually
UTC:

```text
TZ=<Area/City>
0 23 * * *
```

`<Area/City>` is an IANA time zone such as `Europe/Madrid`; without the line the schedule follows
the controller's clock.

Jenkins keeps a trigger set in the job's configuration, because the pipeline declares none of its
own; `Jenkinsfile.drift` declares its daily `cron`, so its schedule is changed in the file. A
machine where Jenkins itself listens on 8080, for example, sets `DEFAULT_PETSTORE_PORT` in the
agent's environment, and a project that reports to TestOps sets
`DEFAULT_ALLURE_TOKEN_CREDENTIALS_ID`, `DEFAULT_ALLURE_ENDPOINT` and `DEFAULT_ALLURE_PROJECT_ID`
there.
