#!/usr/bin/env node
/**
 * `npm run test:scripts`: every suite in scripts/__tests__ in one `node --test` run, under a decoy
 * of the variables a git hook exports (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE), and the decoy
 * repository must come out unchanged (GATE-25). A pre-push hook started from a linked worktree
 * passes those variables to the gates, so a suite whose git commands do not drop them (`gitEnv` in
 * scripts/lib/git.mjs) would work on the repository being pushed. Running every suite once under
 * the decoy replaces a second run of the git suites inside a test (GATE-31).
 *
 *   node scripts/test-scripts.mjs [<test file>...]     (default: scripts/__tests__/*.test.mjs)
 *
 * Exit codes: 0 every suite passed and the decoy is unchanged; 1 a suite failed, the run was killed
 * or could not start (L-49), or a git command worked on the decoy; 2 the runner itself could not
 * run (the decoy repository could not be made).
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/cli.mjs';
import { gitEnv } from './lib/git.mjs';
import { describeExit, exitCodeOf } from './lib/spawn.mjs';

/** The suites `npm run test:scripts` runs when no file is given. */
export function defaultSuites(root = REPO_ROOT) {
  return readdirSync(join(root, 'scripts', '__tests__'))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => join('scripts', '__tests__', name));
}

function git(dir, ...args) {
  const run = spawnSync('git', args, { cwd: dir, env: gitEnv(), encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} in the decoy: ${run.stderr}`);
  return run.stdout;
}

/** A repository with one commit, for the suites' inherited git variables to point at. */
function makeDecoy(parent) {
  const dir = mkdtempSync(join(parent, 'test-scripts-decoy-'));
  git(dir, 'init', '-q', '--initial-branch=decoy');
  writeFileSync(join(dir, 'decoy.txt'), 'decoy\n');
  git(dir, 'add', 'decoy.txt');
  git(
    dir,
    '-c',
    'user.name=Decoy',
    '-c',
    'user.email=decoy@example.invalid',
    'commit',
    '-qm',
    'decoy',
  );
  return dir;
}

/** What a stray git command would change in the repository at `dir`. */
function snapshot(dir) {
  const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
  return {
    refs: git(dir, 'for-each-ref', '--format=%(refname) %(objectname)'),
    head: git(dir, 'symbolic-ref', '-q', 'HEAD'),
    config: readFileSync(join(dir, '.git', 'config'), 'utf8'),
    index: hash(join(dir, '.git', 'index')),
    objects: git(dir, 'count-objects', '-v'),
  };
}

/** The parts of two snapshots that differ. */
const changed = (before, after) => Object.keys(before).filter((key) => before[key] !== after[key]);

/**
 * Run `files` with `node --test` under a decoy and return the exit code. `spawn` replaces
 * `spawnSync`, `out` the console, `parent` the directory the decoy is made in and `stdio` the
 * inherited output, for tests.
 */
export function testScripts(
  files,
  { root = REPO_ROOT, spawn = spawnSync, out = console, parent = tmpdir(), stdio = 'inherit' } = {},
) {
  let decoy;
  try {
    decoy = makeDecoy(parent);
  } catch (error) {
    out.error(`test-scripts: ${error.message}`);
    return 2;
  }
  try {
    const before = snapshot(decoy);
    // NODE_TEST_CONTEXT marks a process the test runner started; inherited (when a suite runs this
    // runner), it makes the inner `node --test` run no file at all.
    const env = gitEnv();
    delete env.NODE_TEST_CONTEXT;
    const run = spawn(process.execPath, ['--test', ...files], {
      cwd: root,
      stdio,
      env: {
        ...env,
        GIT_DIR: join(decoy, '.git'),
        GIT_WORK_TREE: decoy,
        GIT_INDEX_FILE: join(decoy, '.git', 'index'),
      },
    });
    const differences = changed(before, snapshot(decoy));
    if (differences.length > 0) {
      out.error(
        `test-scripts: a git command worked on the repository of the inherited GIT_DIR ` +
          `(changed: ${differences.join(', ')}); pass env: gitEnv() to git run on a repository ` +
          `of its own (scripts/lib/git.mjs).`,
      );
      return 1;
    }
    if (exitCodeOf(run) !== 0) {
      out.error(`test-scripts: the suites failed (${describeExit(run)}).`);
      return 1;
    }
    return 0;
  } finally {
    rmSync(decoy, { recursive: true, force: true });
  }
}

const entryScript = process.argv[1];
if (entryScript && pathToFileURL(entryScript).href === import.meta.url) {
  const files = process.argv.slice(2);
  process.exit(testScripts(files.length > 0 ? files : defaultSuites()));
}
