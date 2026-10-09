// Harness linter (GATE-01): exact against its fixtures, and the shipped specs stay clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES, lintFixtures, lintRepository, lintSource, RULES } from '../lint-harness.mjs';
import { compareWithMarkers, selfTest } from '../lib/lint.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';

const silent = { log: () => {} };

test('the self-test is exact: every marked defect found, no look-alike reported', () => {
  const findings = lintFixtures();
  assert.deepEqual(compareWithMarkers(FIXTURES, findings), { missed: [], unexpected: [] });
  assert.equal(selfTest('lint-harness', FIXTURES, findings, silent), 0);
});

test('every rule is exercised by at least one fixture', () => {
  const seen = new Set(lintFixtures().map((f) => f.rule));
  assert.deepEqual(
    RULES.filter((rule) => !seen.has(rule)),
    [],
  );
});

test('the Petstore specs are clean', () => {
  assert.deepEqual(lintRepository(REPO_ROOT, 'petstore'), []);
});

test('a finding names the file, the line and the rule', () => {
  const source = [
    "import { test, expect } from '../fixtures';",
    "test('t', async ({ pets }) => {",
    '  await pets.remove(4);',
    '});',
  ].join('\n');
  const [only, ...rest] = lintSource(source, 'services/x/specs/a.spec.ts');
  assert.deepEqual(rest, []);
  assert.equal(only.rule, 'shared-fixture-mutation');
  assert.equal(only.file, 'services/x/specs/a.spec.ts');
  assert.equal(only.line, 3);
});
