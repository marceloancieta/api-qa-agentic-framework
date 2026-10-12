import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { titleProblem } from '../commit-title.mjs';

const CLI = join(import.meta.dirname, '..', 'commit-title.mjs');
const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('titles that follow the convention pass', () => {
  for (const title of [
    'feat(tm): TM-08 report CI runs to Allure TestOps',
    'docs: DOC-05 pull-request template',
    'fix(gates)!: GATE-03 GATE-04 stricter lesson guards',
    'build(mutation): PROC-01..05 bring Stryker back',
  ]) {
    assert.equal(titleProblem(title), null, title);
  }
});

test('titles that break the convention name the reason', () => {
  assert.match(titleProblem('Update README'), /subject is not/);
  assert.match(titleProblem('feature(tm): TM-08 x'), /unknown type "feature"/);
  assert.match(titleProblem('build(deps): Bump eslint from 10.11.0 to 10.12.0'), /no backlog id/);
  assert.match(titleProblem('docs: DOC-05'), /no summary/);
  assert.match(titleProblem(''), /subject is not/);
});

test('the CLI exits 0, 1 with the reason, or 2 without a title', () => {
  const good = run('ci(github): DOC-05 check pull-request titles');
  assert.equal(good.status, 0);
  assert.match(good.stdout, /follows the commit convention/);

  const bad = run('Fix stuff');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /ADR 0008.*subject is not/);

  assert.equal(run().status, 2);
});
