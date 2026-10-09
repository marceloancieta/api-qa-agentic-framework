import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareWithMarkers, expectedFindings, finding, report, selfTest } from '../lib/lint.mjs';

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), 'lint-'));
  mkdirSync(join(dir, 'sub'));
  writeFileSync(
    join(dir, 'a.spec.ts'),
    [
      'ok();',
      'bad(); // expect-finding: rule-one',
      'worse(); // expect-finding: rule-one, rule-two',
    ].join('\n'),
  );
  writeFileSync(join(dir, 'sub', 'b.md'), '| row |  <!-- expect-finding: rule-three -->\n');
  return dir;
}

const silent = { log: () => {} };

test('markers declare (file, line, rule) triples in any comment syntax', () => {
  assert.deepEqual(expectedFindings(fixtureDir()), [
    { file: 'a.spec.ts', line: 2, rule: 'rule-one' },
    { file: 'a.spec.ts', line: 3, rule: 'rule-one' },
    { file: 'a.spec.ts', line: 3, rule: 'rule-two' },
    { file: 'sub/b.md', line: 1, rule: 'rule-three' },
  ]);
});

test('the self-test passes only on the exact set', () => {
  const dir = fixtureDir();
  const exact = [
    finding('rule-one', 'a.spec.ts', 2, 'm'),
    finding('rule-one', 'a.spec.ts', 3, 'm'),
    finding('rule-two', 'a.spec.ts', 3, 'm'),
    finding('rule-three', 'sub\\b.md', 1, 'm'),
  ];
  assert.deepEqual(compareWithMarkers(dir, exact), { missed: [], unexpected: [] });
  assert.equal(selfTest('t', dir, exact, silent), 0);

  const noisy = [...exact.slice(1), finding('rule-one', 'a.spec.ts', 1, 'false alarm')];
  assert.deepEqual(compareWithMarkers(dir, noisy), {
    missed: ['a.spec.ts:2:rule-one'],
    unexpected: ['a.spec.ts:1:rule-one'],
  });
  assert.equal(selfTest('t', dir, noisy, silent), 1);
});

test('report sorts findings and returns the exit code', () => {
  const lines = [];
  const out = { log: (line) => lines.push(line) };
  const code = report(
    'tool',
    [finding('r2', 'b.ts', 1, 'second'), finding('r1', 'a.ts', 9, 'first')],
    out,
  );
  assert.equal(code, 1);
  assert.deepEqual(lines, ['a.ts:9  r1  first', 'b.ts:1  r2  second', 'tool: 2 finding(s).']);
  assert.equal(report('tool', [], silent), 0);
});
