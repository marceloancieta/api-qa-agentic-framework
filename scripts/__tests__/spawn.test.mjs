// The exit-code mapping every wrapper shares (CI-04, L-49): a child without an exit code of its own
// (killed, timed out, never started) is a failure, never a pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describeExit, exitCodeOf, spawnFailure } from '../lib/spawn.mjs';

const node = (code, options = {}) =>
  spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', ...options });

test('a child that exits with a code passes that code on', () => {
  const passed = node('process.exit(0)');
  const failed = node('process.exit(3)');
  assert.equal(exitCodeOf(passed), 0);
  assert.equal(spawnFailure(passed), null);
  assert.equal(exitCodeOf(failed), 3);
  assert.equal(spawnFailure(failed), null, 'a non-zero exit is a verdict, not a failure to run');
  assert.equal(describeExit(failed), 'exit 3');
});

test('a child killed by a signal has no status and maps to 1', () => {
  const killed = { status: null, signal: 'SIGKILL', stdout: '', stderr: '' };
  assert.equal(exitCodeOf(killed), 1);
  assert.equal(spawnFailure(killed), 'killed by SIGKILL');
  assert.equal(describeExit(killed), 'killed by SIGKILL');
});

test('a child that times out maps to 1 and says so', () => {
  const slow = node('setTimeout(() => {}, 30000)', { timeout: 200 });
  assert.equal(slow.status, null);
  assert.equal(exitCodeOf(slow), 1);
  assert.match(spawnFailure(slow), /^timed out/);
});

test('a command that cannot be started maps to 1 and says why', () => {
  const missing = spawnSync('qa-no-such-command-for-ci-04', [], { encoding: 'utf8' });
  assert.ok(missing.error, 'the fake command must not exist on this machine');
  assert.equal(exitCodeOf(missing), 1);
  assert.match(spawnFailure(missing), /^could not run: .*ENOENT/);
});

test('anything without a whole exit code is a failure, even beside status 0', () => {
  assert.equal(exitCodeOf(undefined), 1);
  assert.equal(exitCodeOf({ status: undefined }), 1);
  assert.equal(exitCodeOf({ status: 0, error: new Error('EPIPE') }), 1);
  assert.equal(exitCodeOf({ status: 0, signal: 'SIGTERM' }), 1);
  assert.equal(spawnFailure({ status: null, signal: null }), 'ended without an exit code');
  assert.equal(spawnFailure(undefined), 'did not run');
});
