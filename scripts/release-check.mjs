#!/usr/bin/env node
/**
 * The checks before a release tag (GATE-24), as one command that stops at the first failure. Each
 * of them used to be a separate release step (CONTRIBUTING, releases) that nothing ran together.
 * Run it on the commit that gets tagged.
 *
 * Checks, in this order:
 *   tree           no uncommitted change to a tracked file, so the files read below are the
 *                  commit's and not edits that never reach the tag
 *   versions       the root package.json version equals the latest section of CHANGELOG.md; in the
 *                  framework's own repository the `create-api-qa` package carries it too (a project
 *                  created from the framework has its own version, while that package keeps the
 *                  framework's)
 *   backlog        docs/backlog.md has a `## v<version>` section with no row left in it (every item
 *                  moved to Done, finished or as `**Won't do.**`, or to a later version) that says
 *                  it was released, as
 *                  "Released as `v<version>`"
 *   dependency audit
 *                  `npm audit --audit-level=critical` over the lockfile (CI-12): a release hands its
 *                  lockfile to every copy and every `npm create api-qa`, so it carries no package
 *                  with a known critical advisory; fails when the registry cannot be asked, because
 *                  an audit that did not run must not pass
 *   secret scan   gitleaks over every commit (`npm run scan:secrets`); fails when gitleaks is
 *                  missing, because a scan that did not run must not pass
 *   denylist scan  the local denylist over every patch and message (`npm run scan:denylist:history`);
 *                  SKIPPED, and said so, when the repository has no denylist: it is private and
 *                  untracked, so a clone or a copy may not have one, and the scan itself would pass
 *                  without a word about it
 *
 *   node scripts/release-check.mjs
 *
 * Exit codes: 0 every check passed (a skip is printed); 1 a check failed, or a scan was killed by a
 * signal or could not start (L-49); 2 the command itself could not run (unreadable package.json).
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { latestRelease, parseVersion } from './changelog.mjs';
import { readTextIfExists, REPO_ROOT } from './lib/cli.mjs';
import { escapeRegExp } from './lib/text.mjs';
import { describeExit, exitCodeOf, spawnFailure } from './lib/spawn.mjs';
import { parseBacklog } from './lint-docs.mjs';
import { denylistPath } from './scan-denylist.mjs';
import { gitEnv } from './lib/git.mjs';

/** The root package name of the framework's own repository; a copy renames it. */
export const FRAMEWORK_NAME = 'api-qa-agentic-framework';
export const PACKAGE_FILE = 'packages/create-api-qa/package.json';
const STEP = 'CONTRIBUTING, releases, step';

/**
 * The history scans, run as their npm scripts say (a test keeps `args` equal to the script), with
 * what to do when one finds something.
 */
export const SCANS = [
  {
    name: 'secret scan',
    script: 'scan:secrets',
    args: ['scripts/secret-scan.mjs', '--history'],
    hint: 'revoke a real secret first; a false positive goes to .gitleaksignore (docs/ci-security.md, Secret scan)',
  },
  {
    name: 'denylist scan',
    script: 'scan:denylist:history',
    args: ['scripts/scan-denylist.mjs', '--history'],
    hint: 'a denylisted term in the history must be removed from it before anything is published',
    optional: true,
  },
];

/**
 * The dependency audit. It runs before a release only, not on each pull request: an advisory is
 * published whenever its finder publishes it, and would fail pull requests that changed nothing.
 */
export const AUDIT = {
  name: 'dependency audit',
  args: ['audit', '--audit-level=critical'],
  hint:
    'take the patched release into the lockfile (npm update <package>, or the dependency that ' +
    'brings it in), or a release of it at least two weeks old (docs/ci-security.md, Dependabot)',
};

/** Problems with `git status --porcelain` output: every changed tracked file, at most ten named. */
export function treeProblems(porcelain) {
  const files = porcelain
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => line.slice(3));
  if (files.length === 0) return [];
  const named = files.slice(0, 10).join(', ') + (files.length > 10 ? ', ...' : '');
  return [
    `${files.length} tracked file(s) changed and not committed (${named}): commit or discard them, ` +
      'so the checks read the commit that gets tagged',
  ];
}

/**
 * Problems with the versions: `rootVersion` from package.json, `packageVersion` from the
 * create-api-qa package (null when it is not compared) and the CHANGELOG.md text (null when the
 * file is missing).
 */
export function versionProblems({ rootVersion, packageVersion = null, changelog }) {
  if (!parseVersion(rootVersion) || String(rootVersion).startsWith('v')) {
    return [`package.json has no x.y.z version (found ${JSON.stringify(rootVersion ?? null)})`];
  }
  const problems = [];
  const latest = changelog === null ? null : latestRelease(changelog);
  if (changelog === null) {
    problems.push(`CHANGELOG.md is missing: npm run changelog:write creates it (${STEP} 2)`);
  } else if (latest === null) {
    problems.push(
      `CHANGELOG.md has no release section (## [x.y.z] - date): npm run changelog:write adds it (${STEP} 2)`,
    );
  } else if (latest !== rootVersion) {
    problems.push(
      `package.json is ${rootVersion} but the latest CHANGELOG.md section is ${latest}: add the ` +
        `release's section with npm run changelog:write (${STEP} 2) or set its version with ` +
        `npm version <x.y.z> --no-git-tag-version (${STEP} 3)`,
    );
  }
  if (packageVersion !== null && packageVersion !== rootVersion) {
    problems.push(
      `${PACKAGE_FILE} is ${packageVersion} but package.json is ${rootVersion}: ` +
        `set the same version in both (${STEP} 3)`,
    );
  }
  return problems;
}

/** The `## v<version>` heading, also with a title after it (`## v0.6.0 - ...`). */
const isSection = (heading, version) => heading.split(/\s+/)[0] === `v${version}`;

/**
 * Problems with the `## v<version>` section of the backlog text: missing, a row still in it, or no
 * "Released as `v<version>`" in its prose. Rows are read as `lint-docs` reads them; text outside
 * the section, such as Done rows that name the version, does not count.
 */
export function backlogProblems(text, version) {
  if (text === null) return ['docs/backlog.md is missing'];
  const where = `the ## v${version} section of docs/backlog.md`;
  const backlog = parseBacklog(text);
  let heading = null;
  let found = false;
  const prose = [];
  for (const line of backlog.lines) {
    const h2 = line.code ? null : /^##\s+(.*?)\s*$/.exec(line.text);
    if (h2) heading = h2[1];
    if (heading === null || !isSection(heading, version)) continue;
    found = true;
    if (!line.code && !h2) prose.push(line.text);
  }
  if (!found) {
    return [
      `docs/backlog.md has no ## v${version} section: the release pull request says there that the version was released (${STEP} 4)`,
    ];
  }
  const problems = [];
  const open = backlog.tables
    .filter((table) => isSection(table.heading, version) && table.header[0] === 'Id')
    .flatMap((table) => table.rows.map((row) => row.cells[0]));
  if (open.length > 0) {
    problems.push(
      `${where} still has ${open.length} row(s): ${open.join(', ')}; move each finished item to ` +
        `Done with its closing commit, each item that will not be done to Done as **Won't do.** ` +
        `with the commit that decided it, and any other to a later version (${STEP} 4)`,
    );
  }
  const released = new RegExp(`Released as\\s+\`v${escapeRegExp(version)}\``);
  if (!released.test(prose.join(' '))) {
    problems.push(`${where} does not say "Released as \`v${version}\`" (${STEP} 4)`);
  }
  return problems;
}

/** The version and its problems, from the files at `root`. */
function readVersions(root) {
  const rootText = readTextIfExists(join(root, 'package.json'));
  if (rootText === null) throw new Error(`no package.json in ${root}`);
  const pkg = JSON.parse(rootText);
  const packageText =
    pkg.name === FRAMEWORK_NAME ? readTextIfExists(join(root, PACKAGE_FILE)) : null;
  const packageVersion = packageText === null ? null : (JSON.parse(packageText).version ?? null);
  const changelog = readTextIfExists(join(root, 'CHANGELOG.md'));
  return {
    version: pkg.version,
    compared:
      packageVersion === null
        ? 'package.json and CHANGELOG.md'
        : `package.json, ${PACKAGE_FILE} and CHANGELOG.md`,
    problems: versionProblems({ rootVersion: pkg.version, packageVersion, changelog }),
  };
}

/**
 * Run the checks in order and return the exit code; the first failure stops the rest. `spawn`
 * replaces `spawnSync`, `out` the console and `hasDenylist` the look for `.git/info/denylist` in
 * tests.
 */
export function releaseCheck({
  root = REPO_ROOT,
  spawn = spawnSync,
  out = console,
  hasDenylist = () => existsSync(denylistPath(root)),
} = {}) {
  const versions = readVersions(root);
  const checks = [
    {
      name: 'tree',
      run: () => {
        const status = spawn('git', ['status', '--porcelain', '--untracked-files=no'], {
          cwd: root,
          env: gitEnv(),
          encoding: 'utf8',
        });
        if (exitCodeOf(status) !== 0) {
          const detail = spawnFailure(status) ?? (status.stderr ?? '').trim();
          return { problems: [`git status failed: ${detail || describeExit(status)}`] };
        }
        return { problems: treeProblems(status.stdout ?? ''), detail: 'no uncommitted change' };
      },
    },
    {
      name: 'versions',
      run: () => ({
        problems: versions.problems,
        detail: `${versions.version} in ${versions.compared}`,
      }),
    },
    {
      name: 'backlog',
      run: () => ({
        problems: backlogProblems(
          readTextIfExists(join(root, 'docs', 'backlog.md')),
          versions.version,
        ),
        detail: `## v${versions.version} has no row left and says it was released`,
      }),
    },
    {
      name: AUDIT.name,
      run: () => {
        const command = `npm ${AUDIT.args.join(' ')}`;
        // npm is npm.cmd on Windows, which only a shell runs; the arguments are fixed above.
        const result = spawn('npm', AUDIT.args, {
          cwd: root,
          stdio: 'inherit',
          shell: process.platform === 'win32',
        });
        if (exitCodeOf(result) === 0) return { problems: [], detail: command };
        return { problems: [`${command} failed (${describeExit(result)}): ${AUDIT.hint}`] };
      },
    },
    ...SCANS.map((scan) => ({
      name: scan.name,
      run: () => {
        if (scan.optional && !hasDenylist()) {
          return {
            skipped:
              'no .git/info/denylist, so the history was NOT scanned for denylisted terms ' +
              '(the list is private and untracked; README, optional pieces)',
          };
        }
        const command = `node ${scan.args.join(' ')}`;
        const result = spawn(process.execPath, scan.args, { cwd: root, stdio: 'inherit' });
        if (exitCodeOf(result) === 0) return { problems: [], detail: command };
        return { problems: [`${command} failed (${describeExit(result)}): ${scan.hint}`] };
      },
    })),
  ];

  const skipped = [];
  for (const [index, check] of checks.entries()) {
    const outcome = check.run();
    if (outcome.skipped) {
      skipped.push(check.name);
      out.log(`release-check: ${check.name} SKIPPED: ${outcome.skipped}`);
      continue;
    }
    if (outcome.problems.length > 0) {
      for (const problem of outcome.problems) {
        out.error(`release-check: ${check.name} FAILED: ${problem}`);
      }
      const rest = checks.slice(index + 1).map((later) => later.name);
      if (rest.length > 0) out.error(`release-check: stopped; not run: ${rest.join(', ')}`);
      return 1;
    }
    out.log(`release-check: ${check.name} passed: ${outcome.detail}`);
  }
  const note = skipped.length > 0 ? ` (skipped: ${skipped.join(', ')})` : '';
  out.log(`release-check: v${versions.version} is ready to tag${note}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exit(releaseCheck());
  } catch (error) {
    console.error(`release-check: ${error.message}`);
    process.exit(2);
  }
}
