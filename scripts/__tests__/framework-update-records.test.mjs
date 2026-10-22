// framework-update (FUT-14): where the command reads the release a copy is on, and what it records,
// run on the synthetic repositories of framework-update-repos.mjs. The command's suites are split
// by file so they run in parallel (GATE-31).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { RECORD_FILE } from '../framework-update.mjs';
import {
  REMOVE_VAMPI,
  copyRepository,
  framework,
  gitOut,
  read,
  runUpdate,
  stateOf,
} from './framework-update-repos.mjs';

test('the release file wins over the backlog, and a start no release has is named as recorded', () => {
  const root = copyRepository({ changes: { ...REMOVE_VAMPI, [RECORD_FILE]: 'v0.2.0\n' } });
  const later = runUpdate(root, '--to', 'v0.2.0', '--dry-run');
  assert.equal(later.code, 1);
  assert.match(later.err, /--to v0\.2\.0 is not later than v0\.2\.0, the release this copy is on/);

  writeFileSync(join(root, RECORD_FILE), 'v0.1.5\n');
  const unknown = runUpdate(root, '--to', 'v0.2.0', '--dry-run');
  assert.equal(unknown.code, 1);
  assert.match(
    unknown.err,
    /^v0\.1\.5 \(recorded in \.framework-release\) is not a framework release/,
  );
  assert.doesNotMatch(unknown.err, /--from v0\.1\.5/);

  writeFileSync(join(root, RECORD_FILE), 'latest\n');
  const broken = runUpdate(root, '--to', 'v0.2.0', '--dry-run');
  assert.equal(broken.code, 1);
  assert.match(broken.err, /\.framework-release must hold one release/);
});

test('a release with nothing to apply still records the release and says what comes next', () => {
  const root = copyRepository({ changes: { ...REMOVE_VAMPI, [RECORD_FILE]: 'v0.2.0\n' } });
  const { code, out, err } = runUpdate(root, '--to', 'v0.2.1');
  assert.equal(code, 0, `${out}\n${err}`);
  assert.match(out, /Changes 0 file\(s\):\n {2}nothing/);
  assert.match(out, /Nothing to apply; \.framework-release now holds v0\.2\.1/);
  assert.match(out, /Next:[^]*Run `npm run gates`/);
  assert.equal(read(root, RECORD_FILE), 'v0.2.1\n');
  assert.equal(gitOut(root, 'diff', '--cached', '--name-only').trim(), RECORD_FILE);
});

test('a template copy starts from the framework commit its REPO-01 row records', () => {
  const root = copyRepository({ record: 'template', changes: REMOVE_VAMPI });
  const { code, out, err } = runUpdate(root, '--to', 'v0.2.0', '--dry-run');
  assert.equal(code, 0, `${out}\n${err}`);
  assert.match(out, new RegExp(`Framework framework commit ${framework().v1} -> v0\\.2\\.0`));
  const same = runUpdate(root, '--to', 'v0.1.0', '--dry-run');
  assert.equal(same.code, 1);
  assert.match(
    same.err,
    new RegExp(`--to v0\\.1\\.0 is not later than framework commit ${framework().v1}`),
  );
  const unknown = runUpdate(root, '--to', 'v0.2.0', '--from', 'deadbeef', '--dry-run');
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /Framework commit deadbeef is not in the history/);
});

test('without a record the command asks for --from, and runs with it', () => {
  const root = copyRepository({ record: 'none', changes: REMOVE_VAMPI });
  const before = stateOf(root);
  const missing = runUpdate(root, '--to', 'v0.2.0');
  assert.equal(missing.code, 1);
  assert.match(
    missing.err,
    /Cannot tell which framework release this copy is on.*--from v<x\.y\.z>/s,
  );
  assert.deepEqual(stateOf(root), before);
  const given = runUpdate(root, '--to', 'v0.2.0', '--from', 'v0.1.0');
  assert.equal(given.code, 0, `${given.out}\n${given.err}`);
  assert.match(given.out, /the start given with --from/);
});

test('a relative --remote works in a dry run as in an update', () => {
  const root = copyRepository({ changes: REMOVE_VAMPI });
  const local = relative(process.cwd(), framework().root);
  const dry = runUpdate(root, '--to', 'v0.2.0', '--dry-run', '--remote', local);
  assert.equal(dry.code, 0, dry.err);
  const { code, err } = runUpdate(root, '--to', 'v0.2.0', '--remote', local);
  assert.equal(code, 0, err);
});
