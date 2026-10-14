# Adopt the template

The framework's GitHub repository is a template repository: **Use this template** creates a
repository of your own from it, where you add a service pack for each API you test. This guide
covers the steps from that new repository to green gates, and how to take a later framework release
into it. Publishing the scaffolder as an npm package is separate work (backlog FUT-11).

The copy is yours from the start. Nothing links it back to the framework, so removing it, or the
framework no longer being a template, changes nothing in a copy that already exists.

## What the copy holds

GitHub creates the repository with the files of the template's default branch in a **single
commit** (GitHub's documentation, "Creating a repository from a template"). That decides the steps
below:

| Comes with the copy | Does not |
|---|---|
| every tracked file: the core, both example packs, `.claude/`, the workflows, the docs | the commit history and the release tags |
| `.github/rulesets/main.json`, the branch rules of `main` as a file | the rules themselves, and the other repository settings |
| `.env.example`, `qa-config.example.json` | secrets, the local `.env`, a `qa-config.json` |

Because the history is not copied, the framework's backlog cites commits your repository does not
have. `npm run lint:docs` reports it as one `closing-commit` finding that names this guide, and
`npm run gates` fails until the backlog is your own (step 3). If GitHub runs the workflows on the
first commit, that run fails for the same reason.

## 1. Create the repository

On the framework's GitHub page, choose **Use this template** > **Create a new repository**, or:

```sh
gh repo create <owner>/<name> --template <framework-owner>/<framework-repo> --private --clone
```

Leave **Include all branches** off. The copy holds the framework's default branch as it was at that
moment, which can be ahead of its latest release, so note the commit it came from; step 3 records
it, and step 5 starts from it:

```sh
git ls-remote <framework-repository-url> HEAD
```

## 2. Set up the repository

The settings that make the process hold are not copied. Run these once from the clone, as an
administrator of the new repository:

```sh
# Squash merges only, titled by the pull request, and branches deleted after merging. The `title`
# check reads the pull-request title because it becomes the commit subject on main.
gh repo edit <owner>/<name> --enable-squash-merge --squash-merge-commit-message pr-title-commits \
  --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge

# The rules of main: pull requests only, squash merges, linear history, no force push or deletion,
# and the required checks `title`, `gates` and `e2e (petstore)`.
gh api -X POST repos/<owner>/<name>/rulesets --input .github/rulesets/main.json

# Private vulnerability reporting, which CONTRIBUTING points security reports to.
gh api -X PUT repos/<owner>/<name>/private-vulnerability-reporting
```

The ruleset can also be imported in **Settings** > **Rules** > **Rulesets** > **New ruleset** >
**Import a ruleset**. `scripts/__tests__/ruleset.test.mjs` keeps its required checks equal to job
names of `.github/workflows/ci.yml`; rename a job and that test tells you to update the file, and
then the ruleset on GitHub.

Then decide on the parts that depend on the repository ([CI security](../ci-security.md)):

- **CodeQL** runs free on a public repository. A private one needs GitHub's code security licence,
  without which the upload step fails; delete `.github/workflows/codeql.yml` if you do not have it.
- **The AI review** of pull requests runs only once you add the `ANTHROPIC_API_KEY` Actions secret.
- **Secret scanning and push protection** are repository settings under **Settings** >
  **Code security**; the gitleaks workflow runs either way.

## 3. The adoption pull request

Work on a branch, as for every change ([CONTRIBUTING](../../CONTRIBUTING.md#branches-and-pull-requests)).
Set up the clone first, as in the [README](../../README.md#first-10-minutes): `npm ci`, a local
`.env` from `.env.example`, and `npm run hooks:install` if you use the git hooks.

1. **Start your own backlog.** Replace `docs/backlog.md` with the template, which holds one open
   row, `REPO-01`, for this adoption, and write the framework commit from step 1 into it:

   ```sh
   cp docs/templates/backlog.md docs/backlog.md
   ```

2. **Start your own changelog.** Keep the header of `CHANGELOG.md` and delete the framework's
   release sections, from the first `## [` heading to the end; `npm run changelog:write` adds your
   first release below the header:

   ```sh
   sed -i '/^## \[/,$d' CHANGELOG.md
   ```

   Your first release also lists GitHub's `Initial commit` under "Not conventional". That commit
   holds the template's files, so it needs no other message.
3. **Name the project.** In `package.json`, set `name`, `description` and `author`, and `version`
   to `0.0.0`; your first release is then `0.1.0`
   ([releases](../../CONTRIBUTING.md#releases)). Keep `"private": true`.
4. **Keep `LICENSE` and `NOTICE`.** The framework is under the Apache License 2.0, and a work
   derived from it carries both files. Add your own copyright line to `NOTICE` for what you add.
5. **Run the gates.** `npm run gates` passes with no other change.
6. **Open the pull request** titled `chore(repo): REPO-01 adopt the template`. Once it is merged,
   move `REPO-01` to **Done** with the merge commit, in a later pull request, as the backlog header
   describes.

## 4. What to keep

- **Keep both example packs** while you build your own. `services/petstore/` is the worked example
  the guides and the onboarding tour walk through, and its suite in a container is the required
  `e2e (petstore)` check, which shows on every pull request that the core still works.
  `services/vampi/` shows login authentication, actors and an authorization matrix. Neither calls
  anything outside the containers CI starts. Removing a pack today means editing the workflows,
  `docker-compose.yml`, the example configuration, the scripts and docs that name it, and the
  required checks; a procedure for it is backlog FUT-12.
- **Keep the framework's docs and rules**: `docs/lessons-learned.md`, the ADRs and `.claude/rules/`
  are what the checks and the skills cite. Number your own ADRs after the last one in
  `docs/adr/`.
- **Your first API** is a new pack: follow [add a service pack](add-a-service-pack.md).

## 5. Take a later framework release

The copy and the framework share no history, so a release is taken as the difference between the
framework commit your repository is on and the release tag, applied to your repository:

```sh
git remote add framework <framework-repository-url>
git fetch framework --tags
git switch -c chore/repo-nn-framework-<new>
git diff <old> v<new> -- . ':(exclude)docs/backlog.md' ':(exclude)CHANGELOG.md' > framework.patch
git apply -3 framework.patch
rm framework.patch
```

`<old>` is the framework commit your repository is on (`REPO-01` records the first one; after a
release you take, it is that release's tag, `v<x.y.z>`), and `<new>` the release you take. The framework's backlog and changelog stay out, because yours replace them.
`git apply -3` merges each change into files you edited as well, and leaves conflict markers where
both sides changed the same lines; resolve them, run `npm run gates`, and read the framework's
`CHANGELOG.md` section for the release, which names the changes that need something from you. Open
the pull request with a backlog id of your own, and note the new framework version in its row.
