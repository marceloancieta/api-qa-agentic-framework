// framework-update (FUT-14): what an update applies and what it leaves out, run on the synthetic
// repositories of framework-update-repos.mjs. The command's suites are split by file so they run in
// parallel (GATE-31).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RECORD_FILE } from '../framework-update.mjs';
import {
  REMOVE_VAMPI,
  atRelease,
  backlogOf,
  copyRepository,
  framework,
  gitOut,
  lines,
  read,
  runUpdate,
  stateOf,
} from './framework-update-repos.mjs';

test('a dry run lists what would change and what stays out, and changes nothing', () => {
  const root = copyRepository({
    changes: { ...REMOVE_VAMPI, '.github/workflows/codeql.yml': null },
  });
  const before = stateOf(root);
  const { code, out } = runUpdate(root, '--to', 'v0.2.0', '--dry-run');
  assert.equal(code, 0, out);
  assert.deepEqual(stateOf(root), before);
  assert.match(out, /Framework v0\.1\.0 -> v0\.2\.0 \(the start recorded in docs\/backlog\.md\)/);
  assert.match(out, /Would change \d+ file\(s\):/);
  assert.match(out, /added {5}docs\/new\.md/);
  assert.match(out, /removed {3}docs\/old\.md/);
  assert.match(out, /modified {2}docs\/guide\.md/);
  assert.match(out, /modified {2}services\/vampi-admin\/specs\/a\.spec\.ts/);
  assert.match(
    out,
    /pack vampi, removed from this copy:\n(\s+\S+\s+\S+\n)*\s+added {5}services\/vampi\/specs\/b\.spec\.ts/,
  );
  assert.match(out, /CHANGELOG\.md, docs\/backlog\.md and \.framework-release: this copy's own/);
  assert.match(out, /not in this copy any more:\n\s+modified {2}\.github\/workflows\/codeql\.yml/);
  assert.match(out, /Dry run: nothing changed/);
  // A dry run reads a working tree with changes too, and still changes nothing.
  writeFileSync(join(root, 'docs/guide.md'), 'edited\n');
  const dirty = stateOf(root);
  assert.equal(runUpdate(root, '--to', 'v0.2.0', '--dry-run').code, 0);
  assert.deepEqual(stateOf(root), dirty);
});

test('an update applies the release and leaves out a removed pack and the adopted files', () => {
  const root = copyRepository({
    changes: { ...REMOVE_VAMPI, '.github/workflows/codeql.yml': null },
  });
  const { code, out, err } = runUpdate(root, '--to', 'v0.2.0');
  assert.equal(code, 0, `${out}\n${err}`);
  for (const path of [
    'docs/guide.md',
    'docs/new.md',
    'scripts/tool.mjs',
    'services/petstore/specs/a.spec.ts',
    'services/vampi-admin/specs/a.spec.ts',
    '.claude/skills/vampi-admin-api/SKILL.md',
    'docs/discovery/vampi-admin-digest.json',
  ])
    assert.equal(read(root, path), atRelease(path), path);
  assert.deepEqual(
    readFileSync(join(root, 'image.png')),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]),
  );
  for (const path of [
    'docs/old.md',
    'docs/notes.md',
    'services/vampi',
    '.claude/skills/vampi-api',
    'docs/discovery/vampi-digest.json',
    '.github/workflows/codeql.yml',
  ])
    assert.ok(!existsSync(join(root, path)), `${path} stays out`);
  assert.equal(read(root, 'docs/backlog.md'), backlogOf('npm'));
  assert.equal(read(root, 'CHANGELOG.md'), lines('# Changelog'));
  // The release's tags under their own namespace; the copy's own v0.1.0 is untouched.
  assert.equal(
    gitOut(root, 'rev-parse', 'refs/framework/tags/v0.2.0^{commit}').trim(),
    framework().v2,
  );
  assert.notEqual(gitOut(root, 'rev-parse', 'refs/tags/v0.1.0^{commit}').trim(), framework().v1);
  assert.equal(
    gitOut(root, 'remote', 'get-url', 'framework').trim(),
    pathToFileURL(framework().root).href,
  );
  assert.match(out, /Applied v0\.2\.0; the changes are staged/);
  assert.match(out, /git show refs\/framework\/tags\/v0\.2\.0:CHANGELOG\.md/);
  assert.equal(gitOut(root, 'diff', '--name-only', '--diff-filter=U'), '');
  // A file added for the removed pack is applied and marked, with a step to decide on it.
  assert.equal(read(root, '.github/workflows/vampi-dast.yml'), lines('name: dast (vampi)'));
  assert.match(
    out,
    /added {5}\.github\/workflows\/vampi-dast\.yml {2}\(named for pack vampi, removed from this copy\)/,
  );
  assert.match(out, /Decide on each added file named for a pack you removed \(vampi;/);
  // The release the copy is now on is recorded and staged, and the next update starts from it.
  assert.equal(read(root, RECORD_FILE), 'v0.2.0\n');
  assert.ok(gitOut(root, 'diff', '--cached', '--name-only').split('\n').includes(RECORD_FILE));
  assert.match(out, /\.framework-release now holds v0\.2\.0 and is staged/);
  const again = runUpdate(root, '--to', 'v0.2.1', '--dry-run');
  assert.equal(again.code, 0, again.err);
  assert.match(
    again.out,
    /Framework v0\.2\.0 -> v0\.2\.1 \(the start recorded in \.framework-release\)/,
  );
});

test('a file the release adds under a directory the copy deleted stays out', () => {
  // Without packages/create-api-qa/ the copy has no URL of its own: --remote names the framework.
  const root = copyRepository({
    changes: { ...REMOVE_VAMPI, 'packages/create-api-qa': null },
  });
  const { code, out, err } = runUpdate(root, '--to', 'v0.2.0', '--remote', framework().root);
  assert.equal(code, 0, `${out}\n${err}`);
  assert.ok(!existsSync(join(root, 'packages/create-api-qa')));
  assert.match(
    out,
    /not in this copy any more:\n\s+added {5}packages\/create-api-qa\/lib\/new\.mjs/,
  );
  assert.equal(read(root, 'docs/new.md'), atRelease('docs/new.md'));
});

test('without a removed pack, its files are updated like the others', () => {
  const root = copyRepository();
  const { code, out, err } = runUpdate(root, '--to', 'v0.2.0');
  assert.equal(code, 0, `${out}\n${err}`);
  for (const path of [
    'services/vampi/specs/a.spec.ts',
    'services/vampi/specs/b.spec.ts',
    '.claude/skills/vampi-api/SKILL.md',
    'docs/discovery/vampi-digest.json',
    '.github/workflows/codeql.yml',
  ])
    assert.equal(read(root, path), atRelease(path), path);
});

test('a file the release deletes and the copy changed stays, and the rest still applies', () => {
  const root = copyRepository({ changes: { ...REMOVE_VAMPI, 'docs/notes.md': lines('my notes') } });
  const { code, out, err } = runUpdate(root, '--to', 'v0.2.0');
  assert.equal(code, 0, `${out}\n${err}`);
  assert.match(
    out,
    /deleted by the release and changed in this copy[^\n]*\n\s+removed {3}docs\/notes\.md/,
  );
  assert.equal(read(root, 'docs/notes.md'), lines('my notes'));
  assert.ok(!existsSync(join(root, 'docs/old.md')));
  assert.match(out, /Decide on each file the release deletes and this copy changed/);
});
