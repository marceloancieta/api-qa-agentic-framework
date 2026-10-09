// Documentation coherence linter (GATE-03): exact self-test over the fixture tree, and the real
// repository checked rule by rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { compareWithMarkers } from '../lib/lint.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';
import { FIXTURE_DIR, lintDocs, pathCandidate, slug } from '../lint-docs.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'lint-docs.mjs');

// Known defects in the current docs, listed so the gap is visible. Remove each entry when its doc
// is fixed; the test then holds the repository to the shorter list.
const KNOWN = [
  'docs/lessons-learned.md:117:lesson-guard', // `allureMeta` -> `applyCaseMeta` / `caseIdentity`
  'docs/lessons-learned.md:189:lesson-guard', // `resourceGuard` -> `withResourceGuard`
];

test('self-test: the fixture tree yields exactly its marked findings', () => {
  const { missed, unexpected } = compareWithMarkers(FIXTURE_DIR, lintDocs(FIXTURE_DIR));
  assert.deepEqual({ missed, unexpected }, { missed: [], unexpected: [] });
  const output = execFileSync(process.execPath, [SCRIPT, '--self-test'], { encoding: 'utf8' });
  assert.match(output, /self-test: exact/);
});

test('--root runs the linter on another tree and exits 1 on findings', () => {
  assert.throws(
    () => execFileSync(process.execPath, [SCRIPT, '--root', FIXTURE_DIR], { stdio: 'pipe' }),
    (error) => error.status === 1,
  );
});

test('the repository has no findings beyond the known list', () => {
  const found = lintDocs(REPO_ROOT).map((f) => `${f.file}:${f.line}:${f.rule}`);
  assert.deepEqual(found.sort(), [...KNOWN].sort());
});

test('GitHub heading slugs', () => {
  assert.equal(slug('E1 - Execution core'), 'e1---execution-core');
  assert.equal(slug('A. Checks and gates'), 'a-checks-and-gates');
  assert.equal(slug('Use `lint-docs` [here](x.md)'), 'use-lint-docs-here');
});

test('only path-shaped code spans are checked', () => {
  const top = new Set(['docs', 'scripts']);
  assert.deepEqual(pathCandidate('docs/a.md', top), { path: 'docs/a.md', anchored: true });
  assert.deepEqual(pathCandidate('enums.ts', top), { path: 'enums.ts', anchored: false });
  for (const span of ['GET /pet', 'services/<name>/', 'docs/*.md', 'api.auth', '--live', 'a/b']) {
    assert.equal(pathCandidate(span, top), null, span);
  }
});
