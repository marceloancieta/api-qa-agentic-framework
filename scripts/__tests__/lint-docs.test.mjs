// Documentation coherence linter (GATE-03): exact self-test over the fixture tree, and the real
// repository checked rule by rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gitEnv } from '../lib/git.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareWithMarkers } from '../lib/lint.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';
import { FIXTURE_DIR, lintDocs, pathCandidate, slug, withFixtureHistory } from '../lint-docs.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'lint-docs.mjs');

// Known defects in the current docs, listed so the gap is visible. Remove each entry when its doc
// is fixed; the test then holds the repository to the shorter list.
const KNOWN = [];

const closingCommit = (findings) => findings.filter((f) => f.rule === 'closing-commit');

test('self-test: the fixture tree yields exactly its marked findings', () => {
  const findings = withFixtureHistory((git) => lintDocs(FIXTURE_DIR, { git }));
  const { missed, unexpected } = compareWithMarkers(FIXTURE_DIR, findings);
  assert.deepEqual({ missed, unexpected }, { missed: [], unexpected: [] });
  const output = execFileSync(process.execPath, [SCRIPT, '--self-test'], { encoding: 'utf8' });
  assert.match(output, /self-test: exact/);
});

test('closing-commit names every absent hash of a row', () => {
  const findings = withFixtureHistory((git) => lintDocs(FIXTURE_DIR, { git }));
  const messages = closingCommit(findings).map((f) => f.message);
  assert.deepEqual(messages, [
    'HIST-03: `f56536b` is not a commit in the history of HEAD',
    'HIST-04: `0123456` is not a commit in the history of HEAD',
    'HIST-05: `f56536b` is not a commit in the history of HEAD',
  ]);
});

test('backlog-row-shape sends an open wont-do row to Done and accepts it there (GATE-28)', () => {
  const messages = lintDocs(FIXTURE_DIR)
    .filter((f) => f.rule === 'backlog-row-shape')
    .map((f) => f.message);
  assert.ok(
    messages.includes(
      "TOOL-07: a row that will not be done is not open; move it to Done, its item starting with **Won't do.** and the reason, closed by the commit that decided it",
    ),
  );
  assert.ok(messages.includes('TOOL-02: status "done" is not one of todo, in-progress, blocked'));
  assert.equal(messages.filter((message) => message.startsWith('DROP-01')).length, 0);
});

test('note-citation names the missing ids and the file that should define them', () => {
  const messages = lintDocs(FIXTURE_DIR)
    .filter((f) => f.rule === 'note-citation')
    .map((f) => f.message)
    .sort();
  const notes = 'services/demo/docs/contract-notes.md';
  assert.deepEqual(
    messages,
    [
      `DN-03 to DN-01 is a reversed range in ${notes}`,
      `DN-03 to DN-05: DN-04 is not a note in ${notes}`,
      `DN-04 is not a note in ${notes}`,
      `DN-06 is not a note in ${notes}`,
      `DN-07 is not a note in ${notes}`,
      `DN-1 is not a note in ${notes}`,
      'DN-02 is already defined at line 8',
      `prefix DN is already used by ${notes}; give this pack its own`,
    ].sort(),
  );
});

test('closing-commit is not checked when the root is not a git repository', () => {
  assert.deepEqual(closingCommit(lintDocs(FIXTURE_DIR)), []);
});

test('closing-commit reports a history that holds none of the cited hashes once', () => {
  const copy = mkdtempSync(join(tmpdir(), 'lint-docs-copy-'));
  try {
    const env = gitEnv();
    const git = (...args) => execFileSync('git', args, { cwd: copy, env, stdio: 'pipe' });
    git('init', '-q', '--initial-branch=main');
    git(
      '-c',
      'user.name=adopter',
      '-c',
      'user.email=adopter@example.invalid',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'Initial commit',
    );
    const findings = closingCommit(lintDocs(FIXTURE_DIR, { git: copy }));
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /no closing commit is in the history of HEAD/);
    assert.match(findings[0].message, /adopt-the-template.md/);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
});

test('closing-commit reports a shallow clone once instead of every hash', () => {
  const clone = mkdtempSync(join(tmpdir(), 'lint-docs-shallow-'));
  try {
    withFixtureHistory((origin) => {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')),
      );
      const source = pathToFileURL(origin).href;
      execFileSync('git', ['clone', '-q', '--depth', '1', source, clone], { env, stdio: 'pipe' });
    });
    const findings = closingCommit(lintDocs(FIXTURE_DIR, { git: clone }));
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /shallow/);
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
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
