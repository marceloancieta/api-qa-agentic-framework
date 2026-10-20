# CI security workflows

The supply-chain and review automation of the repository (backlog CI-02, CI-05 and CI-10): what each piece
does, which secrets it reads, how an adopter turns it on or off, and what can be tried locally with
`act` before a push. The workflow files own the details (triggers, pinned versions, permissions);
this page explains them.

| File | Runs on | Does | Permissions | Secrets |
|---|---|---|---|---|
| `.github/dependabot.yml` | weekly (Monday) | opens update pull requests for npm packages and actions | Dependabot's own | none |
| `.github/workflows/codeql.yml` | push to `main`, pull requests to `main`, weekly, manual | CodeQL analysis of JavaScript and TypeScript | `contents: read`, `security-events: write`, `actions: read` | none |
| `.github/workflows/secret-scan.yml` | every push, pull requests, manual | gitleaks over the full history | `contents: read` | none |
| `.github/workflows/publish.yml` | push of a `v<x.y.z>` tag, in the framework's repository only | publishes `create-api-qa` with npm trusted publishing and provenance, after the owner's approval | `contents: read`, `id-token: write` | none |
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
- **Advisories.** Version updates wait out the cooldown and only move direct dependencies, so a
  security fix in a package another one brings in can sit in the lockfile unnoticed (CI-12 found
  a critical `handlebars` advisory through `allure` that way). `npm run release:check` therefore
  runs `npm audit --audit-level=critical` before every release, because a release hands its
  lockfile to every copy. It does not run on pull requests: an advisory appears whenever it is
  published, and would fail changes that have nothing to do with it. Between releases, Dependabot
  security alerts and security updates report and fix them as they appear; they are repository
  settings under **Settings** > **Code security**, off until someone turns them on.
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
  workflow adds records that comment in the uploaded SARIF as an accepted suppression. GitHub keeps
  the alert open all the same, so dismiss it as "won't fix" with a comment that names the backlog
  item and the code that explains it. Example: the DAST lane saves the definition it fetched
  (`js/http-to-file-access`, alert 13, GATE-20). Never dismiss an alert the code does not explain.
- **Cost.** Free for public repositories. A private repository needs GitHub's code security
  licence; without it the upload step fails.
- **Enable or remove.** It runs once the file is on the default branch. Do not also enable CodeQL
  "default setup" in the repository settings: GitHub accepts the results of only one of the two
  configurations. To turn it off, disable the workflow under **Actions**; deleting the file
  also means editing every doc that cites it ([adopt the template](guides/adopt-the-template.md#2-set-up-the-repository)).

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
- **Enable or remove.** Nothing to configure; disable the workflow under **Actions** to stop it
  (deleting the file breaks the doc links that cite it, as for CodeQL). An ARM runner would need
  the `linux_arm64` archive and its checksum.

## Publishing create-api-qa

- **What.** A release tag publishes the `create-api-qa` package, the one behind
  `npm create api-qa`, built from that tag. The order of the release steps is in
  [CONTRIBUTING](../CONTRIBUTING.md#releases).
- **No stored token.** npm trusts the workflow, not a secret: the job asks GitHub for an OIDC token
  (`id-token: write`), and npm exchanges it for a credential that is valid for this one publish.
  The same token signs the provenance statement npm shows on the package page, which names the
  repository, the workflow and the tagged commit. No other workflow is granted `id-token: write`
  (`scripts/__tests__/create-api-qa.test.mjs` checks it, along with the trigger, the guard and the
  permissions).
- **The owner's approval.** The job runs in the `npm` environment, whose protection rule makes it
  wait for a reviewer. Approving the deployment is the moment the owner used to type
  `npm publish`.
- **Nothing installed but npm.** A job that can publish runs no dependency's install script, so it
  skips `npm ci`: building the package needs only git and Node. It installs one pinned npm,
  because trusted publishing needs npm 11.5.1 or later and Node 22 bundles npm 10. Dependabot does
  not read that pin. Update it by hand, to a release at least two weeks old, and change the
  expected command in the test with it.
- **Copies.** A repository created from the framework keeps the workflow. The job runs only when
  `github.repository` is the repository `packages/create-api-qa/package.json` names, so a copy's
  tags skip it, and GitHub never creates the environment there. To delete the package from a copy,
  see [adopt the template](guides/adopt-the-template.md#4-what-to-keep).
- **Setup, once, by the owner.** On npm, in the package's settings, add a trusted publisher of type
  GitHub Actions with the repository's owner and name, the workflow file `publish.yml` and the
  environment `npm` (npm's documentation, "Trusted publishing for npm packages"). On GitHub, create
  the environment `npm` under **Settings** > **Environments**, with the owner as required reviewer
  and a deployment rule that allows only tags matching `v*`. Once a release has been published this
  way, set the package's publishing access on npm to require two-factor authentication and
  disallow tokens, so only the workflow and the owner, with two factors, can publish.
- **A failed run.** A tag never moves. A run that failed before publishing is re-run once the cause
  outside the repository is fixed. A cause inside the repository becomes the next patch release.

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
  it, or disable the workflow under **Actions** to remove it. Adapt the review to another project by editing the rubric,
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
| `publish.yml` | Not meaningfully: the repository guard skips the job, and publishing needs GitHub's OIDC token, the environment's approval and npm's trusted publisher. The build it runs is `npm run create:build`, which runs locally. | OIDC, approval, provenance, the publish |
| `dependabot.yml` | Not a workflow; nothing to run. Its syntax is checked by GitHub when the file reaches the default branch. | update pull requests, cooldown, grouping |

The pinned `actions/checkout` and `actions/setup-node` releases run on the `node24` runtime, so
`act` needs a version that supports it (0.2.89 does).
