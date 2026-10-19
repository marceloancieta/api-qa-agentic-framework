// Git run by scripts and their tests never works on the repository a calling hook points at
// (GATE-25). A pre-push hook started from a linked worktree exports GIT_DIR, GIT_INDEX_FILE and
// GIT_WORK_TREE to the gates; the suites that run git on repositories of their own run here under a
// decoy of those variables, and the decoy must come out unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { gitEnv } from '../lib/git.mjs';

test('gitEnv drops every variable of git, in any case, and keeps the others', () => {
  const env = {
    GIT_DIR: '/r/.git',
    GIT_INDEX_FILE: '/r/.git/index',
    GIT_WORK_TREE: '/r',
    git_dir: '/r/.git',
    GIT_AUTHOR_NAME: 'a',
    PATH: '/bin',
    GITHUB_TOKEN: 't',
    MY_GIT_DIR: '/x',
  };
  assert.deepEqual(gitEnv(env), { PATH: '/bin', GITHUB_TOKEN: 't', MY_GIT_DIR: '/x' });
  assert.deepEqual(gitEnv({}), {});
});

/** The suites whose tests or scripts run git on a repository of their own. */
const SUITES = [
  'changelog.test.mjs',
  'remove-service.test.mjs',
  'framework-update.test.mjs',
  'create-api-qa.test.mjs',
  'release-check.test.mjs',
  'lint-docs.test.mjs',
];

/** What a stray git command would change in the repository at `dir`. */
function snapshot(dir) {
  const git = (...args) =>
    spawnSync('git', args, { cwd: dir, env: gitEnv(), encoding: 'utf8' }).stdout;
  const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
  return {
    refs: git('for-each-ref', '--format=%(refname) %(objectname)'),
    head: git('symbolic-ref', '-q', 'HEAD'),
    config: readFileSync(join(dir, '.git', 'config'), 'utf8'),
    index: hash(join(dir, '.git', 'index')),
    objects: git('count-objects', '-v'),
  };
}

test(
  'the suites that run git leave the repository of an inherited GIT_DIR untouched',
  { timeout: 600_000 },
  () => {
    const decoy = mkdtempSync(join(tmpdir(), 'git-env-decoy-'));
    try {
      const git = (...args) => spawnSync('git', args, { cwd: decoy, env: gitEnv() });
      git('init', '-q', '--initial-branch=decoy');
      writeFileSync(join(decoy, 'decoy.txt'), 'decoy\n');
      git('add', 'decoy.txt');
      git(
        '-c',
        'user.name=Decoy',
        '-c',
        'user.email=decoy@example.invalid',
        'commit',
        '-qm',
        'decoy',
      );
      const before = snapshot(decoy);

      // NODE_TEST_CONTEXT marks a process the runner started; inherited, it makes the inner
      // `node --test` run no file at all, and this test would pass without running a suite.
      const outer = gitEnv();
      delete outer.NODE_TEST_CONTEXT;
      const run = spawnSync(
        process.execPath,
        [
          '--test',
          '--test-reporter=tap',
          ...SUITES.map((suite) => join(REPO_ROOT, 'scripts', '__tests__', suite)),
        ],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
          env: {
            ...outer,
            GIT_DIR: join(decoy, '.git'),
            GIT_WORK_TREE: decoy,
            GIT_INDEX_FILE: join(decoy, '.git', 'index'),
          },
        },
      );
      const out = run.stdout ?? '';
      const count = (name) => Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(out)?.[1] ?? 0);
      const failed = out.split('\n').filter((line) => /^\s*not ok/.test(line));
      assert.ok(count('pass') > 0, `the suites ran no test under the decoy:\n${out.slice(-2000)}`);
      assert.equal(count('fail'), 0, `the suites failed under the decoy:\n${failed.join('\n')}`);
      assert.equal(run.status, 0, `the suites exited ${run.status} under the decoy`);
      assert.deepEqual(snapshot(decoy), before, 'a git command worked on the decoy repository');
    } finally {
      rmSync(decoy, { recursive: true, force: true });
    }
  },
);
