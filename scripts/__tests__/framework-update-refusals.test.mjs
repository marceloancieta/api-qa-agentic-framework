// framework-update (FUT-14): what stops an update, and what a stopped one leaves behind, run on the
// synthetic repositories of framework-update-repos.mjs. The command's suites are split by file so
// they run in parallel (GATE-31).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RECORD_FILE } from '../framework-update.mjs';
import {
  REMOVE_VAMPI,
  copyRepository,
  framework,
  gitOut,
  lines,
  read,
  runUpdate,
  stateOf,
  tempDir,
} from './framework-update-repos.mjs';

test('an ignored file where the release adds one blocks the update, and the refusal takes back the fetch', () => {
  // One ignored file at an added path, one where an added file's directory goes.
  const root = copyRepository({
    changes: {
      ...REMOVE_VAMPI,
      '.gitignore': lines('node_modules/', 'docs/new.md', 'packages/create-api-qa/lib'),
    },
  });
  writeFileSync(join(root, 'docs/new.md'), 'my local file\n');
  writeFileSync(join(root, 'packages/create-api-qa/lib'), 'a file, not a directory\n');
  const refs = () => ({
    refs: gitOut(root, 'for-each-ref'),
    remotes: gitOut(root, 'remote', '-v'),
    status: gitOut(root, 'status', '--porcelain'),
  });
  const before = refs();

  const dry = runUpdate(root, '--to', 'v0.2.0', '--dry-run');
  assert.equal(dry.code, 0, dry.err);
  assert.match(
    dry.out,
    /Blocked, 2 file\(s\)[^\n]*\n\s+docs\/new\.md\n\s+packages\/create-api-qa\/lib\/new\.mjs/,
  );

  const { code, err } = runUpdate(root, '--to', 'v0.2.0');
  assert.equal(code, 1);
  assert.match(err, /Refused: 2 blocked change\(s\), listed above\. Nothing changed/);
  assert.deepEqual(refs(), before, 'no remote, no framework tags, no change');
  assert.equal(read(root, 'docs/new.md'), 'my local file\n');

  // The same holds for any refusal after the fetch: an unknown release.
  const unknown = runUpdate(root, '--to', 'v0.9.0');
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /--to v0\.9\.0 is not a framework release/);
  assert.deepEqual(refs(), before);
});

test('conflicts are left as git leaves them, listed, and the exit code says so', () => {
  // The copy's own name and version conflict with the release's version line in package.json.
  const root = copyRepository({
    renamed: true,
    changes: {
      ...REMOVE_VAMPI,
      // The release changes line 2; the copy changes line 2 (a conflict) of the guide and line 6
      // of the tool, which the release leaves alone (a clean merge).
      'docs/guide.md': lines('one', 'two, my way', 'three', 'four', 'five', 'six', 'seven'),
      'scripts/tool.mjs': lines('export const a = 1;', '', '', '', '', 'export const b = 3;'),
      // The release adds a file the copy already has: an add/add conflict.
      'docs/new.md': lines('my own new.md'),
    },
  });
  const { code, out, err } = runUpdate(root, '--to', 'v0.2.0');
  assert.equal(code, 2, `${out}\n${err}`);
  assert.match(out, /modified {2}docs\/guide\.md {2}\(changed here too\)/);
  assert.match(out, /added {5}docs\/new\.md {2}\(this copy has its own\)/);
  assert.match(
    err,
    /Applied with conflicts in 3 file\(s\)[^\n]*\n {2}docs\/guide\.md\n {2}docs\/new\.md\n {2}package\.json/,
  );
  assert.match(
    read(root, 'docs/new.md'),
    /<<<<<<< ours\nmy own new\.md\n=======\nnew in v0\.2\.0\n>>>>>>> theirs/,
  );
  assert.equal(read(root, RECORD_FILE), 'v0.2.0\n', 'recorded with conflicts too');
  assert.match(
    read(root, 'docs/guide.md'),
    /<<<<<<< ours\ntwo, my way\n=======\ntwo, as of v0\.2\.0\n>>>>>>> theirs/,
  );
  assert.equal(
    read(root, 'scripts/tool.mjs'),
    lines('export const a = 10;', '', '', '', '', 'export const b = 3;'),
  );
  assert.match(out, /Resolve the conflicts/);
  assert.match(out, /`git reset --hard` undoes the whole update/);
  assert.deepEqual(gitOut(root, 'diff', '--name-only', '--diff-filter=U').trim().split('\n'), [
    'docs/guide.md',
    'docs/new.md',
    'package.json',
  ]);
});

test('it refuses a dirty tree, an unknown release and a release that is not later', () => {
  const root = copyRepository({ changes: { ...REMOVE_VAMPI } });
  const before = stateOf(root);
  const refused = (argv, pattern) => {
    const { code, err } = runUpdate(root, ...argv);
    assert.equal(code, 1, argv.join(' '));
    assert.match(err, pattern, argv.join(' '));
  };
  refused(['--to', '0.2.0'], /--to v<x\.y\.z> \(got 0\.2\.0\)/);
  refused(['--to', 'v0.2'], /--to v<x\.y\.z>/);
  refused([], /--to v<x\.y\.z> \(got nothing\)/);
  refused(['--to', 'v0.2.0', '--from', 'latest'], /--from takes a release/);
  refused(['--to', 'v0.2.0', '--bogus'], /Unknown option '--bogus'/);
  refused(
    ['--to', 'v0.9.0', '--dry-run'],
    /--to v0\.9\.0 is not a framework release; the latest are v0\.1\.0, v0\.2\.0, v0\.2\.1/,
  );
  refused(['--to', 'v0.1.0', '--dry-run'], /--to v0\.1\.0 is not later than v0\.1\.0/);
  refused(
    ['--to', 'v0.1.0', '--from', 'v0.2.0', '--dry-run'],
    /--to v0\.1\.0 is not later than v0\.2\.0/,
  );
  refused(
    ['--to', 'v0.2.0', '--from', 'v0.0.9', '--dry-run'],
    /--from v0\.0\.9 is not a framework release/,
  );
  assert.deepEqual(stateOf(root), before);

  writeFileSync(join(root, 'docs/guide.md'), 'edited\n');
  refused(['--to', 'v0.2.0'], /working tree has changes[^]*docs\/guide\.md/);
  gitOut(root, 'checkout', '--', 'docs/guide.md');
  writeFileSync(join(root, 'untracked.md'), 'mine\n');
  refused(['--to', 'v0.2.0'], /working tree has changes[^]*untracked\.md/);
  rmSync(join(root, 'untracked.md'));
  assert.deepEqual(stateOf(root), before);

  // Look-alike: an ignored file is not a change, and the update runs.
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'node_modules/x.js'), '\n');
  assert.equal(runUpdate(root, '--to', 'v0.2.0').code, 0);
});

test('a framework repository that does not answer stops the update and leaves no remote', () => {
  const root = copyRepository({ changes: REMOVE_VAMPI });
  const before = stateOf(root);
  const missing = join(tempDir('framework-update-none-'), 'nothing-here');
  const { code, err } = runUpdate(root, '--to', 'v0.2.0', '--remote', missing);
  assert.equal(code, 1);
  assert.match(
    err,
    /Could not fetch the framework's releases from .*nothing-here[^]*Nothing changed/,
  );
  assert.deepEqual(stateOf(root), before);
  // A remote added by an earlier update is kept, and a different --remote is refused.
  gitOut(root, 'remote', 'add', 'framework', framework().root);
  const other = runUpdate(root, '--to', 'v0.2.0', '--remote', missing);
  assert.equal(other.code, 1);
  assert.match(other.err, /The "framework" remote points to .*git remote set-url/);
  assert.equal(
    runUpdate(root, '--to', 'v0.2.0', '--remote', `${framework().root}/`).code,
    0,
    'the remote that exists is used, whatever its spelling',
  );
});
