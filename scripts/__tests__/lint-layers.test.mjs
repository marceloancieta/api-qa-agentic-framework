// Layer linter (GATE-16): exact self-test over the fixture tree, the repository held to no
// findings, and the scope of each rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { compareWithMarkers } from '../lib/lint.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';
import { FIXTURES, lintFile, lintLayers, RULES } from '../lint-layers.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'lint-layers.mjs');
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const rules = (findings) => findings.map((f) => f.rule);

test('self-test: the fixture tree yields exactly its marked findings', () => {
  const findings = lintLayers(FIXTURES);
  assert.deepEqual(compareWithMarkers(FIXTURES, findings), { missed: [], unexpected: [] });
  assert.deepEqual([...new Set(rules(findings))].sort(), [...RULES].sort());
  assert.match(run('--self-test').stdout, /self-test: exact/);
});

test('the repository has no findings', () => {
  assert.deepEqual(lintLayers(REPO_ROOT), []);
});

test('--root runs the linter on another tree and exits 1 on findings', () => {
  assert.equal(run('--root', FIXTURES).status, 1);
});

test('each rule applies to its own files only', () => {
  const packImport = "import { PetClient } from '../services/petstore/clients/pet-client';\n";
  assert.deepEqual(rules(lintFile(packImport, 'helpers/x.ts')), ['core-imports-pack']);
  // The specifier is resolved from the file: one level up from scripts/__tests__ is scripts/.
  assert.deepEqual(lintFile(packImport, 'scripts/__tests__/x.test.mjs'), []);
  const fromTests = "import { aPet } from '../../services/petstore/builders/pet-builder';\n";
  assert.deepEqual(rules(lintFile(fromTests, 'scripts/__tests__/x.test.mjs')), [
    'core-imports-pack',
  ]);
  // A pack may import from its own folder or the core; a doc tree is not linted.
  assert.deepEqual(lintFile(packImport, 'services/petstore/flows/x.ts'), []);
  assert.deepEqual(lintFile(packImport, 'docs/x.ts'), []);

  const rawFetch = "test('t', async () => { await fetch('pets/1'); });\n";
  assert.deepEqual(rules(lintFile(rawFetch, 'services/petstore/specs/a/b.spec.ts')), [
    'spec-sends-request',
  ]);
  // Outside a spec the same call is pack or core code.
  assert.deepEqual(lintFile(rawFetch, 'services/petstore/clients/x.ts'), []);
  assert.deepEqual(lintFile(rawFetch, 'helpers/x.ts'), []);
});
