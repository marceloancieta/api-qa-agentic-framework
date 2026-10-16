# Adopt the template

The framework's GitHub repository is a template repository: **Use this template** creates a
repository of your own from it, where you add a service pack for each API you test. This guide
covers the steps from that new repository to green gates, and how to take a later framework release
into it.

Without GitHub first, `npm create api-qa <directory>` does steps 1 and 3 on your machine from a
framework release (the [`create-api-qa`](../../packages/create-api-qa/README.md) package): it
unpacks the release, starts your own backlog with `REPO-01` naming the release and its commit,
reduces the changelog to its header, names the package after the directory at version `0.0.0`,
makes the first commit on `main` and runs `npm ci`. Then create the GitHub repository from that
clone and continue with step 2. Of step 3 two things remain, since there is no adoption pull
request: add your copyright line to `NOTICE`, and move `REPO-01` to **Done** with the hash of that
first commit.

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
it, and step 5 starts from it. Run this right after creating the copy, because it prints the
framework's latest commit, not the one the copy was made from:

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
# and the required checks: `title`, `gates`, each pack's `e2e` job and the `dast` jobs.
gh api -X POST repos/<owner>/<name>/rulesets --input .github/rulesets/main.json

# Private vulnerability reporting, which CONTRIBUTING points security reports to.
gh api -X PUT repos/<owner>/<name>/private-vulnerability-reporting
```

The ruleset can also be imported in **Settings** > **Rules** > **Rulesets** > **New ruleset** >
**Import a ruleset**. `scripts/__tests__/ruleset.test.mjs` keeps its required checks equal to names
that jobs report in workflows running on every pull request ([required checks](../ci.md#required-checks)).
If you rename a required job, update the file, the expected list in that test, and then the
ruleset on GitHub.

Then decide on the parts that depend on the repository ([CI security](../ci-security.md)):

- **CodeQL** runs free on a public repository. A private one needs GitHub's code security licence,
  without which the upload step fails; delete `.github/workflows/codeql.yml` if you do not have it.
- **The scheduled lanes** run against the example packs: `drift.yml` daily, and `dast.yml`,
  `perf.yml` and `diff.yml` weekly ([CI](../ci.md)), which a private repository pays for in Actions
  minutes. Disable the ones you do not want under **Actions**, or delete them.
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

   Ids such as `FUT-12` or `GATE-23` that the framework's docs and rules cite then refer to the
   framework's backlog, on its GitHub page.

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
   ([releases](../../CONTRIBUTING.md#releases)). Keep `"private": true`. Then run
   `npm install --package-lock-only`, so `package-lock.json` carries the same name and version.
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
  anything outside the containers CI starts. To drop one later, see
  [remove an example pack](#remove-an-example-pack).
- **Keep the framework's docs and rules**: `docs/lessons-learned.md`, the ADRs and `.claude/rules/`
  are what the checks and the skills cite. Number your own ADRs after the last one in
  `docs/adr/`.
- **Your first API** is a new pack: follow [add a service pack](add-a-service-pack.md).
- **`packages/create-api-qa/` publishes the framework itself.** It is harmless in your copy, where
  its tests pass, but its release step in CONTRIBUTING is for the framework's repository only:
  never publish it. To delete it, also delete `scripts/build-create-package.mjs`, the
  `create:build` script, `scripts/__tests__/create-api-qa.test.mjs` and its `.gitignore` lines,
  then the links `lint-docs` reports, and leave those paths out of later releases (step 5).

### Remove an example pack

Once your own pack runs, an example pack you do not want goes with one command, from a working
tree without changes:

```sh
npm run remove:service -- --name vampi --dry-run   # prints the plan, changes nothing
npm run remove:service -- --name vampi
```

It deletes `services/<pack>/`, the pack's skill and its digest, and edits what runs the pack: its
`package.json` scripts, its entries in `qa-config.example.json` and the environments only it used,
its services in `docker-compose.yml`, its jobs in the workflows and its stages in the Jenkinsfiles,
and its lines in `.env.example`, `.actrc`, `.gitleaksignore` and `NOTICE`. What is the pack's is
read from structure, never from its name in prose: its scripts and the containers they start, the
variables its qa-config entries name, and in CI text `services/<pack>/`, `--service <pack>`,
`api-<pack>`, a job or stage named `(<pack>)` and its entry in a `strategy.matrix` list. A job,
stage or line that also runs another pack is left to you. Each YAML and JSON edit is parsed back
and compared with the expected result; a file it cannot edit that way is listed for you instead.

It refuses:

- the last pack, and a pack whose name is also a word of the framework (`github`, `qa`, `api`, a
  namespace of the framework's scripts, ...), whose markers could not be told apart;
- a removal that would leave `api.default_environment` without a pack: make an environment that
  runs another pack the default first;
- a working tree with changes, so that `git restore .` undoes the removal (`--force` overrides
  that). Untracked or ignored files under the pack's directory are deleted too; the plan names
  them first.

It never edits `CHANGELOG.md`, `docs/backlog.md` or the ADRs, and only reports what your
`qa-config.json` still says about the pack. Then it prints what is left to you:

- every mention of the pack outside those history files, by file and line: the prose and examples;
- what fails right after it and blocks `npm run gates`: the dead links and paths `lint-docs`
  finds, and the failing tests of each test file that names the pack;
- notes on what other packs share: a workflow job or matrix that runs them too, a `quality_gate`
  source that read the pack's report, a Jenkinsfile function nothing calls any more.

Removing `vampi` leaves docs and notes: `lint-docs`, and with it its repository test, fails on the
dead links and paths into the removed files until you edit them. The framework's own backlog names
a VAmPI file, and the command never edits `docs/backlog.md`; after step 3 the backlog is your own
and that finding does not arise, otherwise edit that row by hand. `petstore` is also the example
the guides walk through and the data that some core tests read, so its removal also leaves those
tests, which the command names, to rewrite against your own pack.

In a Jenkinsfile, a line that runs the pack is removed only when the line before it shows it stands
alone (it opens or closes a block, or is a complete statement). A line that may be the body of an
`if`, `else`, `for` or `while` without braces is left and noted, because removing it would hand
that statement the next line.

When you later take a framework release (step 5), leave the removed pack out of the patch, since
`git apply` changes nothing when a patched file is missing:
`--exclude='services/<pack>/*' --exclude='.claude/skills/<pack>-api/*' --exclude=docs/discovery/<pack>-digest.json`.
Hunks in the files the command edited (workflows, `docker-compose.yml`, the Jenkinsfile) may
conflict where they touch the lines it removed.

When the pack's jobs were required checks, as `e2e (petstore)` and `dast (petstore)` are, the
command removes them from `.github/rulesets/main.json` and from the list in
`scripts/__tests__/ruleset.test.mjs`. Change the ruleset on GitHub yourself, as in step 2, or every
pull request waits for a check that no job reports; make your own pack's jobs required in their
place.

## 5. Take a later framework release

The copy and the framework share no history, so a release is taken as the difference between the
framework commit your repository is on and the release tag, applied to your repository:

```sh
git remote add --no-tags framework <framework-repository-url>
git fetch framework '+refs/tags/*:refs/framework/tags/*'
git switch -c chore/repo-nn-framework-<new>
git diff <old> refs/framework/tags/v<new> -- . \
  ':(exclude)docs/backlog.md' ':(exclude)CHANGELOG.md' > framework.patch
git apply -3 framework.patch
rm framework.patch
```

The framework's tags are fetched under `refs/framework/tags/`, because your own releases also start
at `v0.1.0` and the names would collide. `<old>` is the framework commit your repository is on:
`REPO-01` records the first one, and after you take a release it is that release's tag,
`refs/framework/tags/v<x.y.z>`. `<new>` is the release you take. The framework's backlog and
changelog stay out, because yours replace them.

`git apply -3` merges each change into files you edited as well, and leaves conflict markers where
both sides changed the same lines. It changes nothing at all if the patch touches a file you
deleted, such as `codeql.yml` or a scheduled lane in step 2. Leave each one out with
`--exclude=<path>`:

```sh
git apply -3 --exclude=.github/workflows/codeql.yml framework.patch
```

Then:

1. Resolve the conflicts. For `package.json` and `package-lock.json`, keep your name and version,
   then run `npm install --package-lock-only` and `npm ci`.
2. Run `npm run gates`.
3. Read what the release needs from you in its changelog section, with
   `git show refs/framework/tags/v<new>:CHANGELOG.md`.
4. Open the pull request with a backlog id of your own, and note the new framework version in its
   row.
