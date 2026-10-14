# CI security workflows

The supply-chain and review automation of the repository (backlog CI-02 and CI-05): what each piece
does, which secrets it reads, how an adopter turns it on or off, and what can be tried locally with
`act` before a push. The workflow files own the details (triggers, pinned versions, permissions);
this page explains them.

| File | Runs on | Does | Permissions | Secrets |
|---|---|---|---|---|
| `.github/dependabot.yml` | weekly (Monday) | opens update pull requests for npm packages and actions | Dependabot's own | none |
| `.github/workflows/codeql.yml` | push to `main`, pull requests to `main`, weekly, manual | CodeQL analysis of JavaScript and TypeScript | `contents: read`, `security-events: write`, `actions: read` | none |
| `.github/workflows/secret-scan.yml` | every push, pull requests, manual | gitleaks over the full history | `contents: read` | none |
| `.github/workflows/pr-review.yml` | pull requests (opened, updated, reopened, ready for review) | Claude reviews the change against `.github/review-rubric.md` and comments | `contents: read`, `pull-requests: write` | `ANTHROPIC_API_KEY`, optional |

Each workflow in this table sets `permissions: {}` at the top and grants each job only what it
needs; the test workflows of [continuous integration](ci.md) start from `contents: read`. Every
third-party action is pinned by full commit SHA with its version in a trailing comment, and every
pinned release was at least two weeks old when it was chosen. Dependabot proposes new pins and keeps
the comments in step.

## Dependabot

- **What.** Weekly update pull requests for the root `package.json` and for the actions used in
  `.github/workflows/`. Minor and patch updates arrive grouped, one pull request per ecosystem; a
  major update arrives alone. At most five npm and three actions pull requests are open at once.
- **Cooldown.** A release is proposed only once it is 14 days old, the same rule the pinned actions
  follow, so a compromised release has time to be noticed and pulled. Security updates are not
  delayed.
- **`@types/node`.** Major versions are ignored: the type definitions follow the Node major in
  `.nvmrc`, and moving to a new major is a runtime change made on purpose.
- **`typescript`.** Major versions are ignored too: `typescript-eslint` declares the TypeScript
  range it supports as a peer dependency, and a major outside it fails `npm ci` in the gates. Both
  move together, by hand, once `typescript-eslint` accepts the new major.
- **Commit messages.** Dependabot accepts only a fixed prefix, so its commits read
  `build(deps): Bump <package> from <old> to <new>` (`build(deps-dev)` for development
  dependencies) and `ci(deps): Bump <action> ...`. This satisfies Conventional Commits and the
  `conventional_commits` rule of `git-policy`, but not the backlog id that ADR 0008 asks for:
  Dependabot cannot write a different id for each update, and a fixed id would tie every bump to the
  same backlog item. Dependency updates therefore carry no backlog id. The `git-policy` hook applies
  only to commits made in a local Claude Code session, so it never sees these.
- **Not covered.** The gitleaks version and checksum in `.github/workflows/secret-scan.yml` are
  plain values that Dependabot does not read; update them by hand (below).
- **Enable or remove.** The file takes effect when it reaches the default branch. Delete it to stop
  version updates. Dependabot security alerts and security updates are separate repository settings.

## CodeQL

- **What.** CodeQL's `security-extended` query suite over the JavaScript and TypeScript sources, with
  no build step (`build-mode: none`). The linter fixtures in `scripts/__fixtures__/` are excluded:
  they contain defective code on purpose. Results appear as code scanning alerts in the repository's
  Security tab, and on the pull request that introduces them.
- **An accepted finding is explained in the code.** Fix an alert when the code can change. When the
  flagged behaviour is the code's purpose, guard it, explain why next to it, and put
  `// codeql[<rule id>]` on the line above the flagged line; the `AlertSuppression` query the
  workflow adds turns that comment into a suppression. Example: the DAST lane saves the definition
  it fetched (`js/http-to-file-access`, GATE-20). Dismissing an alert by hand leaves no trace in
  the code, so it is the last resort.
- **Cost.** Free for public repositories. A private repository needs GitHub's code security
  licence; without it the upload step fails.
- **Enable or remove.** It runs once the file is on the default branch. Do not also enable CodeQL
  "default setup" in the repository settings: GitHub accepts the results of only one of the two
  configurations. To remove it, delete the workflow file.

## Secret scan

- **What.** gitleaks over every commit of every branch and tag (`fetch-depth: 0`), with findings
  redacted in the log. Any finding fails the job. The job runs `node scripts/secret-scan.mjs
  --history`, the command behind `npm run scan:secrets`, so the arguments live in one place and a
  local run behaves like CI. The repository has no gitleaks configuration file, so gitleaks' default
  rules apply.
- **Why the binary and not `gitleaks/gitleaks-action`.** The action needs a paid licence key when the
  repository belongs to an organisation, which would break the workflow for adopters, and it adds a
  third-party action with access to the job. The workflow instead downloads the Linux x64 archive of
  a pinned gitleaks release and checks it against a SHA-256 written in the workflow before
  extracting it; a mismatch stops the job before gitleaks runs.
- **Updating gitleaks.** Pick a release that is at least two weeks old, take the `linux_x64` line of
  its `gitleaks_<version>_checksums.txt`, confirm it against the digest GitHub shows for the asset
  (`gh api repos/gitleaks/gitleaks/releases/tags/v<version>`, field `assets[].digest`), and change
  `GITLEAKS_VERSION` and `GITLEAKS_SHA256` together.
- **A false positive.** Check the finding locally with `npm run scan:secrets`. If it is not a
  secret, add its fingerprint to a `.gitleaksignore` file in the same pull request, so the exception
  is reviewed. A real secret is revoked first; removing it from history comes second.
- **The denylist scan cannot run in CI.** `scripts/scan-denylist.mjs` reads `.git/info/denylist`,
  which exists only on the maintainer's machine and is never committed. CI runs only its self-test,
  inside `npm run gates`.
- **Enable or remove.** Nothing to configure; delete the file to remove it. An ARM runner would need
  the `linux_arm64` archive and its checksum.

## AI pull-request review

- **What.** On each non-draft pull request, Claude (model `claude-opus-5-5`, through
  `anthropics/claude-code-action`) reads `.github/review-rubric.md`, reviews the diff for what the
  gates and the workflows above do not check, and posts inline comments and one summary comment. It
  never approves, requests changes, pushes or merges. Each new push to the pull request starts a new
  review and cancels the one still running.
- **Secret.** `ANTHROPIC_API_KEY`, an Anthropic API key stored as a repository Actions secret.
  Without it, a first job notes that the review was skipped and the review job shows as skipped, not
  failed. That is also what happens on pull requests from forks and from Dependabot, which do not
  receive repository secrets.
- **Why `pull_request`.** `pull_request_target` runs with the repository's secrets on code a fork
  controls. With `pull_request`, only branches pushed to this repository, by people with write
  access, ever reach the key, and the action itself refuses actors without write access and bots.
- **Least privilege.** The review job gets `contents: read` and `pull-requests: write`, and passes
  its own short-lived token to the action instead of the Claude GitHub App token, which would ask for
  write access to contents and issues as well. Claude may only read files, run `gh pr view`,
  `gh pr diff` and `gh pr comment`, and post inline comments; editing, writing and web tools are
  disallowed. The job has a 30-minute timeout and a turn limit.
- **Untrusted input.** The pull request's title, body and diff are never written into the workflow
  file; Claude reads them through `gh`, and the prompt tells it to treat them as data, never follow
  instructions found in them, and report such instructions as a finding. The session starts with
  `--setting-sources user`, so the checked-out `.claude/settings.json` and `CLAUDE.md` are not
  loaded: the project's hooks run repository scripts (the session probe runs
  `scripts/coverage-status.mjs`), and a pull request can change those scripts.
- **Limits.** A pull request can change the rubric or the workflow it is reviewed with, because
  `pull_request` uses the files of the pull request; a human reviewer checks such changes. The review
  is advisory and costs API usage on every push.
- **Enable or remove.** Add the `ANTHROPIC_API_KEY` secret to enable it. Delete the secret to pause
  it, or the workflow file to remove it. Adapt the review to another project by editing the rubric,
  not the prompt.

## What `act` can and cannot reproduce

The commands and the shared settings (`.actrc`) are in
[running the workflows locally](ci.md#running-the-workflows-locally); this table adds what each
security workflow needs.

| Workflow | With `act` | Without GitHub |
|---|---|---|
| `secret-scan.yml` | Fully: the checkout step uses the local repository with its history, the download and checksum check run as written. Needs network access to the gitleaks release and a runner image with `curl`, `tar` and `sha256sum`. | nothing missing |
| `codeql.yml` | Not meaningfully: analysis needs the CodeQL bundle and the upload needs the code scanning API of a real repository. | alerts, pull-request annotations |
| `pr-review.yml` | The skip path: run without the secret and the review job is skipped. The review itself needs a real pull request (the action reads it and checks the actor's permission through the GitHub API) and a key passed with `act -s`; hosted secrets are not available to `act`. | inline and summary comments, fork behaviour |
| `dependabot.yml` | Not a workflow; nothing to run. Its syntax is checked by GitHub when the file reaches the default branch. | update pull requests, cooldown, grouping |

The pinned `actions/checkout` and `actions/setup-node` releases run on the `node24` runtime, so
`act` needs a version that supports it (0.2.89 does).
