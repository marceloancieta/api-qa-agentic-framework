# Security policy

## Reporting a vulnerability

Report a security problem in the framework, or a credential that reached the repository, privately:
use **Report a vulnerability** in the repository's **Security** tab, never a public issue, pull
request or discussion. A public report shows the problem to everyone before it is fixed, and a
leaked credential to everyone before it is revoked.

A report should contain:

- what is affected: a script, a hook, a helper or fixture of the execution core, an adapter, a
  workflow, or the `create-api-qa` package, and the release or commit you saw it in;
- how to reproduce it: the command or the call, the configuration it needs, and what happened;
- what an attacker could do with it, as far as you know;
- for a leaked credential, where it is (file and commit), never the value itself.

Replace any credential, host or personal data in what you paste with a placeholder. What belongs to
the tracker of the API you test instead of this repository is in
[CONTRIBUTING](CONTRIBUTING.md#reporting-a-problem).

## What happens next

The project has one maintainer, so these are targets, not guarantees: a report is acknowledged
within a week, and you hear what will be done about it, a fix or a decision, once it is assessed. A
leaked credential is revoked first and removed from the history second. The report stays private
until the fix or the decision is published.

## Supported versions

The project is before 1.0, so fixes go into the next release and earlier releases are not patched.
Only the latest release is supported; the releases and what each contains are in the
[changelog](CHANGELOG.md).

## Scope

In scope: the framework itself, meaning the scripts, the Claude Code hooks, the execution core, the
test-management and tracker adapters, the CI workflows and the `create-api-qa` package, and anything
that could leak a credential or let a test reach a system it was not configured for.

Out of scope:

- **A vulnerability of an API under test.** It belongs to that API's project and tracker, not this
  one. VAmPI's vulnerable mode ([the VAmPI pack](services/vampi/README.md#running)) is insecure on
  purpose: its flaws are what the pack detects, not findings about the framework.
- **Testing anything but the environments qa-config names.** Use the framework only against
  systems you are authorized to test, in the environments named under `api.environments` in
  qa-config, and never against production. Design work only reads an API; writes happen in spec
  runs and the lanes, with data a run creates ([modes](.claude/rules/modes.md)).

## Safeguards in place

- **`secret-guard`**, a Claude Code hook, refuses prompts and tool calls that carry a credential or
  read secret files, and masks credentials in tool output ([hooks](.claude/hooks/README.md)).
- **Credentials stay out of tracked files.** They come from the environment or a local `.env` that
  git ignores, and a missing one is reported by its variable name, never its value
  ([reachability](.claude/rules/reachability.md)).
- **gitleaks** scans every commit before it is made, once the git hooks are installed
  ([git hooks](CONTRIBUTING.md#git-hooks)), and the secret-scan workflow scans the whole history of every branch and tag
  ([secret scan](docs/ci-security.md#secret-scan), [`scripts/secret-scan.mjs`](scripts/secret-scan.mjs)).
- **A local denylist scan** keeps terms a contributor must never publish out of commits and their
  messages, through the same hooks ([optional pieces](README.md#optional-pieces),
  [`scripts/scan-denylist.mjs`](scripts/scan-denylist.mjs)). The list itself lives only on the
  maintainer's machine.
- **Evidence is redacted.** Every request and response attached to a result goes through the
  redaction of [`helpers/redact.ts`](helpers/redact.ts) first ([`helpers/evidence.ts`](helpers/evidence.ts)).
- **CodeQL** analyses the JavaScript and TypeScript on every pull request and weekly
  ([CodeQL](docs/ci-security.md#codeql)).
- **`create-api-qa` is published from CI with OIDC** (npm trusted publishing, no stored token) and
  with provenance that links the package to its workflow run and tagged commit
  ([`publish.yml`](.github/workflows/publish.yml),
  [publishing create-api-qa](docs/ci-security.md#publishing-create-api-qa)).
- **The supply chain is pinned and least-privileged**: actions pinned by commit SHA, workflow
  permissions granted per job, Dependabot updates and an audit of each lockfile change
  ([CI security](docs/ci-security.md)).
