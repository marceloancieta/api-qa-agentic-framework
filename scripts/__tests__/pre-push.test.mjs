// The pre-push hook (GATE-33), through real pushes to a bare repository with `npm` replaced: the
// gates run unless nothing new leaves, which only tags on commits the remote already has can say.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { gitEnv } from '../lib/git.mjs';

const temporary = [];
after(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

const FAKE_NPM = '#!/bin/sh\necho "$*" >> "$GATES_LOG"\nexit "${GATES_EXIT:-0}"\n';
const pathName = Object.keys(process.env).find((name) => /^path$/i.test(name)) ?? 'PATH';

/**
 * A repository with one commit on `main`, already on the bare `origin`, and the hook installed. The
 * hook is copied because it is tracked without its executable bit, and git skips such a hook.
 * `gatesRan` returns the runs since it was last called.
 */
function pushing() {
  const root = mkdtempSync(join(tmpdir(), 'pre-push-'));
  temporary.push(root);
  const [work, bare, hooks, bin] = ['work', 'origin.git', 'hooks', 'bin'].map((name) =>
    join(root, name),
  );
  const log = join(root, 'gates.log');
  for (const dir of [work, hooks, bin]) mkdirSync(dir);
  copyFileSync(join(REPO_ROOT, '.githooks', 'pre-push'), join(hooks, 'pre-push'));
  chmodSync(join(hooks, 'pre-push'), 0o755);
  writeFileSync(join(bin, 'npm'), FAKE_NPM);
  chmodSync(join(bin, 'npm'), 0o755);

  const run = (args, env = {}, input = undefined) =>
    spawnSync('git', args, {
      cwd: work,
      encoding: 'utf8',
      input,
      env: {
        ...gitEnv(),
        [pathName]: `${bin}${delimiter}${process.env[pathName]}`,
        GATES_LOG: log.replaceAll('\\', '/'),
        ...env,
      },
    });
  const git = (...args) => {
    const result = run(args);
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const commit = (message) => git('commit', '-q', '--allow-empty', '--no-gpg-sign', '-m', message);

  spawnSync('git', ['init', '-q', '--bare', bare], { env: gitEnv() });
  git('init', '-q', '--initial-branch=main');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  git('remote', 'add', 'origin', bare);
  commit('first');
  git('push', '-q', 'origin', 'main');
  git('config', 'core.hooksPath', hooks.replaceAll('\\', '/'));

  return {
    bare,
    git,
    commit,
    push: (args, env) => run(['push', ...args], env),
    gatesRan: () => {
      if (!existsSync(log)) return [];
      const runs = readFileSync(log, 'utf8').trim().split('\n');
      rmSync(log);
      return runs;
    },
    onRemote: (ref) =>
      spawnSync('git', ['rev-parse', '--verify', '-q', ref], {
        cwd: bare,
        env: gitEnv(),
      }).status === 0,
  };
}

const GATES = ['run gates'];

test('tags on commits the remote has leave without the gates, lightweight or annotated', () => {
  const repo = pushing();
  repo.git('tag', 'light');
  repo.git('tag', '--no-sign', '-a', 'annotated', '-m', 'annotated');
  const result = repo.push(['origin', 'light', 'annotated']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(repo.gatesRan(), []);
  assert.match(result.stdout + result.stderr, /only tags of commits origin already has/);
  assert.ok(repo.onRemote('refs/tags/light') && repo.onRemote('refs/tags/annotated'));

  // Deleting it pushes no commit, but rev-list has no commit to answer for, so the gates run.
  assert.equal(repo.push(['origin', ':refs/tags/light']).status, 0);
  assert.deepEqual(repo.gatesRan(), GATES, 'a deleted tag');
});

test('a branch, alone or with a tag, runs the gates once', () => {
  const repo = pushing();
  repo.commit('second');
  assert.equal(repo.push(['origin', 'main']).status, 0);
  assert.deepEqual(repo.gatesRan(), GATES, 'new commits on a branch');

  repo.git('tag', 'light');
  repo.git('branch', 'other');
  assert.equal(repo.push(['origin', 'light', 'other']).status, 0);
  assert.deepEqual(repo.gatesRan(), GATES, 'a known commit on a tag and a branch');
});

test('a tag on a commit the remote does not have runs the gates, and their failure stops it', () => {
  const repo = pushing();
  repo.commit('never pushed');
  repo.git('tag', 'unseen');
  assert.equal(repo.push(['origin', 'unseen'], { GATES_EXIT: '1' }).status, 1);
  assert.deepEqual(repo.gatesRan(), GATES);
  assert.equal(repo.onRemote('refs/tags/unseen'), false);

  const bypassed = repo.push(['origin', 'unseen'], { QA_NO_GATES: '1' });
  assert.equal(bypassed.status, 0, bypassed.stderr);
  assert.deepEqual(repo.gatesRan(), [], 'QA_NO_GATES=1 skips them');
  assert.match(bypassed.stdout + bypassed.stderr, /quality gate bypassed/);
});

test('what only looks like a known tag runs the gates', () => {
  const repo = pushing();
  repo.git('tag', 'light');
  assert.equal(repo.push(['origin', 'light:refs/heads/from-tag']).status, 0);
  assert.deepEqual(repo.gatesRan(), GATES, 'a tag pushed to a branch');

  assert.equal(repo.push([repo.bare, 'light']).status, 0);
  assert.deepEqual(repo.gatesRan(), GATES, 'a push to a URL, with no remote-tracking refs');

  repo.git('tag', 'file', repo.git('hash-object', '-w', join(REPO_ROOT, 'LICENSE')));
  assert.equal(repo.push(['origin', 'file']).status, 0);
  assert.deepEqual(repo.gatesRan(), GATES, 'a tag of something that is not a commit');
});
