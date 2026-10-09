import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import {
  assertZeroRetries,
  blockingVerdicts,
  errorLine,
  flakeLane,
  flakeVerdicts,
  formatTable,
  laneArgs,
  parseRepeats,
  quarantineReport,
} from '../flake-lane.mjs';

const FIXTURES = join(REPO_ROOT, 'scripts', '__fixtures__', 'flake-lane');
const records = JSON.parse(readFileSync(join(FIXTURES, 'records.json'), 'utf8'));
const byTitle = (verdicts) => Object.fromEntries(verdicts.map((v) => [v.title, v]));

test('repeats are grouped per test and judged stable, flaky, failing or skipped', () => {
  const verdicts = byTitle(flakeVerdicts(records));
  assert.deepEqual(
    Object.entries(verdicts).map(([title, v]) => [title, v.verdict, v.pass, v.fail, v.skip]),
    [
      ['steady', 'stable', 3, 0, 0],
      ['group > wobbly', 'flaky', 2, 1, 0],
      ['broken', 'failing', 0, 3, 0],
      ['data missing', 'skipped', 0, 0, 3],
      ['held back', 'stable', 3, 0, 0],
      ['held back, unsteady', 'flaky', 1, 2, 0],
      ['armed gap', 'stable', 3, 0, 0],
    ],
  );
  assert.ok(verdicts['held back'].quarantined);
  assert.deepEqual(verdicts['held back'].tags, ['@quarantine']);
});

test('the quarantine report lists what to tag and what to release', () => {
  const report = quarantineReport(flakeVerdicts(records), 3);
  assert.deepEqual(
    report.quarantine.map((v) => v.title),
    ['group > wobbly'],
  );
  assert.deepEqual(
    report.release.map((v) => v.title),
    ['held back'],
  );
  assert.deepEqual(
    report.stillUnsteady.map((v) => v.title),
    ['held back, unsteady'],
  );
  // Stable fewer times than asked for is not enough to release.
  assert.deepEqual(quarantineReport(flakeVerdicts(records), 5).release, []);
});

test('only non-quarantined flaky or failing tests block the lane', () => {
  assert.deepEqual(
    blockingVerdicts(flakeVerdicts(records)).map((v) => v.title),
    ['group > wobbly', 'broken'],
  );
});

test('gate lanes refuse a non-zero QA_RETRIES', () => {
  assert.doesNotThrow(() => assertZeroRetries({}));
  assert.doesNotThrow(() => assertZeroRetries({ QA_RETRIES: '0' }));
  assert.throws(() => assertZeroRetries({ QA_RETRIES: '2' }), /QA_RETRIES=2 .*zero retries/);
  assert.throws(() => flakeLane({ repeats: 2 }, REPO_ROOT, { QA_RETRIES: '1' }), /zero retries/);
});

test('arguments, repeat counts, errors and tables', () => {
  assert.deepEqual(
    laneArgs({
      files: ['a.spec.ts'],
      project: 'api',
      grep: '@smoke',
      grepInvert: '@quarantine',
      repeats: 5,
    }),
    [
      '--project=api',
      '--grep',
      '@smoke',
      '--grep-invert',
      '@quarantine',
      '--repeat-each=5',
      'a.spec.ts',
    ],
  );
  assert.equal(parseRepeats('3'), 3);
  assert.throws(() => parseRepeats('1'), /at least 2/);
  assert.throws(() => parseRepeats('x'), /at least 2/);
  const colour = String.fromCharCode(27);
  assert.equal(
    errorLine({ errors: [`${colour}[31mError: red${colour}[39m\n  at x`] }),
    'Error: red',
  );
  assert.equal(errorLine(undefined), '');
  assert.equal(
    formatTable(
      [{ a: 'x', b: 'long value' }],
      [
        ['A', (r) => r.a],
        ['Bee', (r) => r.b],
      ],
    ),
    'A  Bee\n-  ----------\nx  long value',
  );
});

test('end to end: repeated runs of an offline project expose the flaky tests', () => {
  const { code, report } = flakeLane(
    {
      project: 'offline',
      repeats: 4,
      quarantineReport: true,
      config: 'scripts/__fixtures__/flake-lane/project/playwright.config.mjs',
    },
    REPO_ROOT,
    {},
  );
  assert.equal(code, 1);
  assert.deepEqual(
    report.verdicts.map((v) => [v.title, v.verdict, v.pass, v.fail]),
    [
      ['always passes', 'stable', 4, 0],
      ['passes on even repeats only', 'flaky', 2, 2],
      ['always fails', 'failing', 0, 4],
      ['held back but steady', 'stable', 4, 0],
      ['held back and still unsteady @quarantine', 'flaky', 1, 3],
    ],
  );
  assert.deepEqual(
    report.quarantine.quarantine.map((v) => v.title),
    ['passes on even repeats only'],
  );
  assert.deepEqual(
    report.quarantine.release.map((v) => v.title),
    ['held back but steady'],
  );
});
