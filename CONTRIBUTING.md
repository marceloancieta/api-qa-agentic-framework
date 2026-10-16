# Contributing

Thank you for helping. This page covers how to propose a change, what a change must pass, and how
to report a problem. If you are new to the repository, take the [onboarding tour](docs/onboarding.md)
first; [`AGENTS.md`](AGENTS.md) lists the rules that apply to every change, whoever or whatever
writes it.

## Before you start

- **Find or propose the backlog item.** Work is tracked in [`docs/backlog.md`](docs/backlog.md), one
  row per item with an id such as `GATE-03`. Every commit names the item it delivers. For a change
  that has no row yet, open an issue first and describe the problem; the maintainer adds or names
  the backlog item it belongs to.
- **Set up once:** the [first 10 minutes](README.md#first-10-minutes), then `npm run hooks:install`
  ([git hooks](#git-hooks)).
- **Keep the language.** Code, comments, file names, docs and commit messages are in English.
- **Keep secrets and real data out.** Credentials come from the environment or your local `.env`,
  never from arguments or tracked files. Specs, registries and docs use placeholders and builders.

## Making a change

1. **One logical change per commit.** A fix and an unrelated clean-up are two commits.
2. **Write the commit message** as `type(scope): <BACKLOG-ID> summary`
   ([ADR 0008](docs/adr/0008-branching-and-traceability.md)), for example
   `feat(core): CORE-04 actor fixture bound to a credential`. The type is one of `COMMIT_TYPES` in
   `scripts/changelog.mjs` (`feat`, `fix`, `perf`, `docs`, `test`, `ci`, `build`, `refactor`,
   `style`, `chore`, `revert`); the changelog lists any other type under "Not conventional". The
   scope names the area touched. Dependency updates opened by
   Dependabot are the one exception: they carry no backlog id
   ([CI security](docs/ci-security.md#dependabot)).
3. **Run the gates before committing:**

   ```sh
   npm run gates
   ```

   They need no API and must pass. What they run is described in
   [quality gates](docs/quality-gates.md). When `format:check` fails, `npm run format` rewrites the
   files. When you change a spec, also run its pack against that pack's
   local service (`npm run petstore:up` or `npm run vampi:up`, then
   `npx playwright test --project=api-<pack>`) and include what you saw in the pull request.
4. **Update the documentation in the same commit** (see [Documentation](#documentation)).

### New checks

A check that nobody tested gives false assurance, so every new check is tested in both directions:

- add fixtures that contain the defect and look-alikes that are correct but resemble it;
- mark each line the check must report (`expect-finding: <rule>`), and make the self-test expect
  exactly those findings, no more and no fewer;
- add the script to `package.json`, and to `gates` when it is a check, so its failure blocks.

The existing linters and their fixtures in `scripts/__fixtures__/` are the examples to follow
([quality gates](docs/quality-gates.md)).

### Documentation

- **One home per fact.** Link to the file that owns a fact instead of copying it, and let scripts
  produce numbers; never type a count by hand. The owners and the propagation table are in
  [the documentation rule](.claude/rules/documentation.md).
- **Make every new file reachable** in the commit that adds it: link a new doc from a page that
  already has readers, list a new rule or skill in [`CLAUDE.md`](CLAUDE.md), add a new script to
  `package.json`.
- **Change a policy together with everything that applies it**, using the propagation table.
- `npm run lint:docs` checks links, paths, unlinked docs and some counts. Prettier does not format
  Markdown, so wrap prose by hand at about 100 columns.

## Git hooks

`npm run hooks:install` points git at the hooks in `.githooks/` for this clone:

| Hook | Runs | Notes |
|---|---|---|
| `pre-commit` | gitleaks on the staged changes, then the local denylist scan on them | Fails when gitleaks is not installed, because a scan that did not run must not pass. `git commit --no-verify` skips it once, knowing what you skip. |
| `commit-msg` | the local denylist scan on the message | Passes with a notice when there is no denylist. |
| `pre-push` | `npm run gates` | The same gate CI runs. `QA_NO_GATES=1` skips it for one push. |

A hook exports git's own variables (`GIT_DIR`, `GIT_INDEX_FILE`, `GIT_WORK_TREE`) to what it runs,
and from a linked worktree they point at that worktree's repository. A script or test that runs git
on a repository of its own, a temporary one or a directory it was given, therefore passes
`env: gitEnv()` (`scripts/lib/git.mjs`), or its commands land in the repository being pushed;
`scripts/__tests__/git-env.test.mjs` runs those suites under a decoy `GIT_DIR`. The scans of what is
being committed keep the variables, because a pre-commit hook's `GIT_INDEX_FILE` is the index the
commit is made from.

The denylist is a private, untracked list of terms you must never publish, kept in
`.git/info/denylist`; the [README](README.md#optional-pieces) explains it.

In Claude Code, the project also registers its own hooks: `secret-guard` refuses prompts and tool
calls that carry credentials, `git-policy` applies the commit and pull-request rules configured in
qa-config `policies` (the example configuration turns on the subject check and the protected
`main`), and `session-probe` reports the setup state when a
session starts ([hooks README](.claude/hooks/README.md)).

## Branches and pull requests

The project follows GitHub Flow ([ADR 0008](docs/adr/0008-branching-and-traceability.md)):

- one short-lived branch per change, named `<type>/<backlog-id>-<short-description>`, for example
  `feat/core-04-actor-fixture`;
- a pull request titled like its commit, whose description links the backlog item;
- CI must pass before merging ([continuous integration](docs/ci.md));
- a squash merge into `main`, so the history keeps one commit per backlog item;
- releases are tags `vX.Y.Z` on `main`.

The repository enforces it with the ruleset in `.github/rulesets/main.json`. `main` accepts changes
only through pull requests, squash merges only, with a linear history. A pull request merges when
the checks the ruleset requires pass: `title`, `gates`, each pack's end-to-end job and the DAST
scans ([required checks](docs/ci.md#required-checks)). The `title` check reads the pull-request
title with the same parser as the changelog (`npm run commit:title -- "<title>"` runs it locally),
because the title becomes the commit subject on `main`. Opening a pull request fills in its
template. Locally, the `git-policy` hook asks before a commit straight onto `main` and checks the
subject's shape (qa-config `policies`).

### Releases

`CHANGELOG.md` is built from the commit messages by `scripts/changelog.mjs`, which reads them since
the latest `vX.Y.Z` tag and groups them by type:

1. `npm run changelog` prints the next section and the version it proposes from the commits (below
   1.0, a breaking change or a feature gives a minor bump and anything else a patch; from 1.0,
   breaking gives major, feature minor, anything else patch). Read it; a commit listed under "Not
   conventional" needs an explanation or a better message before the release.
2. `npm run changelog:write` adds the section to `CHANGELOG.md`; it refuses a version that is
   already there. For a version other than the proposed one, run
   `node scripts/changelog.mjs --version <x.y.z> --write`.
3. Set the version in `package.json` with `npm version <x.y.z> --no-git-tag-version`. In the
   framework's repository, set the same version in the `create-api-qa` package, which a test keeps
   equal: `(cd packages/create-api-qa && npm version <x.y.z> --no-git-tag-version)`.
4. Open a pull request titled `docs(changelog): <BACKLOG-ID> release <x.y.z>` with those changes,
   the version's section of the [backlog](docs/backlog.md) saying it was released, and every item
   closed since the last release moved to **Done** with its closing commit, the item merged just
   before the release included. Nothing is committed after the release: merge the items first,
   then this pull request. After the squash merge, check out the resulting commit on `main` and
   run `npm run release:check`: the versions, the backlog section and the history scans, which
   need gitleaks, as `scripts/release-check.mjs` describes. It stops at the first failure and says
   what to fix. Then tag that commit as `v<x.y.z>`, push the tag and create the GitHub release
   from it, with the owner's approval ([AGENTS.md](AGENTS.md)).
5. In the framework's repository only (a copy never publishes it), publish `create-api-qa` from
   the tag, with the owner's npm account; nothing in the repository changes:
   - with the tag checked out (`git switch --detach v<x.y.z>`), `npm run create:build` writes the
     release into `packages/create-api-qa`, and refuses a tag whose version differs;
   - in that directory, `npm pack --dry-run` must list the four release files, `framework.tar.gz`,
     `LICENSE`, `NOTICE` and `packages/create-api-qa/framework.json`, which must name `v<x.y.z>`;
   - `npm publish --access public`; its `prepublishOnly` refuses a package without those files or
     built from another tag. A published version cannot be replaced, only deprecated;
   - read it back from a directory outside the repository:
     `npm view create-api-qa@<x.y.z> version`, then
     `npm create api-qa@<x.y.z> <temporary-directory> -- --skip-install`. Inside
     `packages/create-api-qa`, npm takes the local package of the same name and version for the
     project instead of the published one, and the command fails.

## Reporting a problem

- **A problem in the framework** (a wrong result, a check that misses a defect or flags correct
  code, a broken command, unclear documentation): open an issue in the project's GitHub repository.
  Say what you ran, what you expected and what happened, and include the command output with any
  credential, host or personal data replaced by a placeholder.
- **A defect in an API you test with the framework** belongs to that API's tracker, not here. The
  `qa-report-bug` process and the [bug-reporting reference](docs/references/bug-reporting.md)
  describe how to triage and file it.
- **A security problem in the framework, or a credential that reached the repository**: do not open
  a public issue with the details. Report it privately through the repository's GitHub security
  advisories ("Report a vulnerability"), so it can be fixed, and a leaked credential revoked, before
  it is disclosed.

## License

The project is licensed under the [Apache License 2.0](LICENSE) (see also [NOTICE](NOTICE)). By
submitting a contribution you agree that it is licensed under the same terms, as section 5 of the
license states.
