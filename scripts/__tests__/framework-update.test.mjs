// framework-update (FUT-14): where a copy starts from and what a release leaves out, checked on
// their own. The command itself runs on synthetic repositories (framework-update-repos.mjs) in
// framework-update-apply, -records and -refusals, split so the runner takes them in parallel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../lib/cli.mjs';
import {
  caseRenames,
  classify,
  compareVersions,
  frameworkUrl,
  packsIn,
  RECORD_FILE,
  recordedRelease,
  releaseInRecord,
  remoteLocation,
  sameRepository,
  URL_OWNER,
} from '../framework-update.mjs';
import { row, tempDir } from './framework-update-repos.mjs';

// ---------------------------------------------------------------------------------------------
// Where a copy starts from

test('the REPO-01 row names the release a copy started from; other rows and prose do not', () => {
  const npm = row(
    'REPO-01',
    'Adopt the framework with `npm create api-qa` from release `v0.5.0`, framework commit `abc1234` (`docs/guides/adopt-the-template.md`).',
  );
  const template = row(
    'REPO-01',
    'Adopt the framework from its template, starting from framework commit `abc1234def` (`docs/guides/adopt-the-template.md`).',
  );
  assert.deepEqual(recordedRelease(npm), { kind: 'tag', tag: 'v0.5.0', source: 'docs/backlog.md' });
  assert.deepEqual(recordedRelease(template), {
    kind: 'commit',
    commit: 'abc1234def',
    source: 'docs/backlog.md',
  });

  // Look-alikes: a row that plans a release (open or done), another row naming a framework commit,
  // the template's placeholder, the copy's own release, the phrases in prose.
  const plans = [
    row('REPO-07', 'Take `npm create api-qa` from release `v0.10.0` into a second copy.'),
    row('REPO-04', 'Take framework release `v0.9.0`, from framework commit `fedcba9`.'),
  ];
  assert.deepEqual(recordedRelease([template, ...plans].join('\n')), recordedRelease(template));
  assert.deepEqual(recordedRelease([...plans, npm].join('\n')), recordedRelease(npm));
  assert.equal(recordedRelease(plans.join('\n')), null);
  const placeholder = row(
    'REPO-01',
    'Adopt the framework from its template, starting from framework commit `<commit>`.',
  );
  assert.equal(recordedRelease(placeholder), null);
  assert.equal(recordedRelease(row('DOC-02', 'Release `v0.3.0` of this project.')), null);
  assert.equal(recordedRelease('REPO-01: `npm create api-qa` from release `v0.2.0`.'), null);
  assert.equal(recordedRelease(null), null);
  // Two framework commits in REPO-01 and no release: ambiguous.
  assert.throws(
    () =>
      recordedRelease(row('REPO-01', 'framework commit `abc1234def`, framework commit `fedcba9`')),
    /several framework commits \(abc1234def, fedcba9\).*--from/,
  );
});

test('the release file names the release a copy is on, and nothing else', () => {
  assert.deepEqual(releaseInRecord('v0.6.0\n'), {
    kind: 'tag',
    tag: 'v0.6.0',
    source: RECORD_FILE,
  });
  assert.deepEqual(releaseInRecord('  v1.20.3  '), {
    kind: 'tag',
    tag: 'v1.20.3',
    source: RECORD_FILE,
  });
  assert.equal(releaseInRecord(null), null);
  for (const text of ['', '0.6.0', 'v0.6', 'latest', 'v0.6.0\nv0.7.0'])
    assert.throws(() => releaseInRecord(text), /must hold one release v<x\.y\.z>.*--from/);
});

test('a local --remote is made absolute; URLs and spellings of one repository are kept apart', () => {
  const here = tempDir('framework-update-remote-');
  assert.equal(remoteLocation(relative(process.cwd(), here)), here);
  for (const url of [
    'https://example.invalid/f.git',
    'file:///c/f',
    'git@example.invalid:o/f.git',
    'no-such-directory',
  ])
    assert.equal(remoteLocation(url), url);
  assert.ok(sameRepository('https://example.invalid/f.git', 'https://example.invalid/f/'));
  assert.ok(sameRepository('C:\\repos\\f', 'C:/repos/f/'));
  assert.ok(!sameRepository('https://example.invalid/f', 'https://example.invalid/g'));
  assert.ok(!sameRepository('https://example.invalid/f', 'https://example.invalid/f2'));
});

// The rows the adoption writes, from their owners: the backlog template a template copy fills in,
// and `adoptBacklog` of create-api-qa, while the copy still holds that package.
test('the REPO-01 row of either adoption is read back', async () => {
  const template = readFileSync(join(REPO_ROOT, 'docs/templates/backlog.md'), 'utf8');
  assert.equal(recordedRelease(template), null, 'the template holds only the placeholder');
  assert.deepEqual(recordedRelease(template.replace('`<commit>`', '`0123abc`')), {
    kind: 'commit',
    commit: '0123abc',
    source: 'docs/backlog.md',
  });
  const create = join(REPO_ROOT, 'packages/create-api-qa/lib/create.mjs');
  if (!existsSync(create)) return;
  const { adoptBacklog } = await import(pathToFileURL(create).href);
  const adopted = adoptBacklog(template, { version: '1.2.3', commit: '0123abc' });
  assert.deepEqual(recordedRelease(adopted), {
    kind: 'tag',
    tag: 'v1.2.3',
    source: 'docs/backlog.md',
  });
});

test('releases are ordered by version, not as text', () => {
  assert.ok(compareVersions('v0.10.0', 'v0.9.0') > 0);
  assert.ok(compareVersions('v1.0.0', 'v0.99.99') > 0);
  assert.equal(compareVersions('v0.2.0', 'v0.2.0'), 0);
  assert.deepEqual(['v0.10.0', 'v0.2.0', 'v0.9.1'].sort(compareVersions), [
    'v0.2.0',
    'v0.9.1',
    'v0.10.0',
  ]);
});

test('the framework repository comes from the package that names it', () => {
  const root = tempDir('framework-update-url-');
  assert.equal(frameworkUrl(root), null, 'a copy that deleted the package has none');
  mkdirSync(join(root, dirname(URL_OWNER)), { recursive: true });
  writeFileSync(
    join(root, URL_OWNER),
    JSON.stringify({ repository: { type: 'git', url: 'git+https://example.invalid/f.git' } }),
  );
  assert.equal(frameworkUrl(root), 'https://example.invalid/f.git');
  writeFileSync(join(root, URL_OWNER), JSON.stringify({ repository: 'https://example.invalid/g' }));
  assert.equal(frameworkUrl(root), 'https://example.invalid/g');
  // This repository's own owner file has that shape, while it still holds the package.
  if (existsSync(join(REPO_ROOT, URL_OWNER)))
    assert.match(frameworkUrl(REPO_ROOT), /^https:\/\/\S+\.git$/);
});

// ---------------------------------------------------------------------------------------------
// What a release leaves out

test('a release leaves out the adopted files, removed packs and what the copy deleted or changed', () => {
  const changes = [
    ['M', 'CHANGELOG.md'],
    ['M', 'docs/backlog.md'],
    ['M', 'docs/backlog-guide.md'],
    ['M', 'services/vampi/specs/a.spec.ts'],
    ['A', 'services/vampi/specs/new.spec.ts'],
    ['M', '.claude/skills/vampi-api/SKILL.md'],
    ['M', 'docs/discovery/vampi-digest.json'],
    ['M', 'services/vampi-admin/specs/a.spec.ts'],
    ['M', '.claude/skills/vampi-admin-api/SKILL.md'],
    ['M', 'docs/discovery/vampi-admin-digest.json'],
    ['M', 'services/vampi.md'],
    ['M', '.github/workflows/codeql.yml'],
    ['M', '.github/workflows/ci.yml'],
    ['D', 'docs/gone.md'],
    ['D', 'docs/obsolete.md'],
    ['D', 'docs/edited-then-deleted.md'],
    ['M', 'docs/guide.md'],
    ['M', 'docs/edited.md'],
    ['A', 'docs/new.md'],
    ['A', 'docs/mine-too.md'],
    ['A', 'packages/create/lib/new.mjs'],
    ['A', 'packages/create/new-dir/x.mjs'],
    ['A', 'packages/other/new.mjs'],
    ['A', 'docs/brand-new/x.md'],
    ['A', '.github/workflows/vampi-dast.yml'],
    ['A', '.github/workflows/vampi-admin-dast.yml'],
    ['A', 'docs/vampires.md'],
    ['A', '.github/workflows/keycloak-vampi-diff.yml'],
    ['A', '.framework-release'],
  ].map(([status, path]) => ({ status, path }));
  const oldBlobs = new Map(
    changes.filter(({ status }) => status !== 'A').map(({ path }) => [path, `old:${path}`]),
  );
  // The copy deleted packages/create/ whole, and keeps packages/ through another package.
  oldBlobs.set('packages/create/package.json', 'old');
  oldBlobs.set('packages/create/lib/a.mjs', 'old');
  oldBlobs.set('packages/kept/package.json', 'old');
  const copyBlobs = new Map(oldBlobs);
  for (const gone of [
    'services/vampi/specs/a.spec.ts',
    '.claude/skills/vampi-api/SKILL.md',
    'docs/discovery/vampi-digest.json',
    '.github/workflows/codeql.yml',
    'docs/gone.md',
    'packages/create/package.json',
    'packages/create/lib/a.mjs',
  ])
    copyBlobs.delete(gone);
  copyBlobs.set('docs/edited.md', 'mine');
  copyBlobs.set('docs/edited-then-deleted.md', 'mine');
  copyBlobs.set('docs/mine-too.md', 'mine');

  const { apply, leftOut } = classify({
    changes,
    oldBlobs,
    copyBlobs,
    removedPacks: ['vampi'],
    packs: ['keycloak', 'petstore', 'vampi', 'vampi-admin'],
  });
  const reasons = Object.fromEntries(leftOut.map(({ path, reason }) => [path, reason]));
  assert.deepEqual(reasons, {
    'CHANGELOG.md': 'adopted',
    'docs/backlog.md': 'adopted',
    '.framework-release': 'adopted',
    'services/vampi/specs/a.spec.ts': 'pack',
    'services/vampi/specs/new.spec.ts': 'pack',
    '.claude/skills/vampi-api/SKILL.md': 'pack',
    'docs/discovery/vampi-digest.json': 'pack',
    '.github/workflows/codeql.yml': 'deleted',
    'docs/gone.md': 'deleted',
    'docs/edited-then-deleted.md': 'changed',
    'packages/create/lib/new.mjs': 'deleted',
    'packages/create/new-dir/x.mjs': 'deleted',
  });
  assert.ok(
    leftOut.filter(({ reason }) => reason === 'pack').every(({ pack }) => pack === 'vampi'),
  );
  // Look-alikes that are applied: another pack whose name starts with the removed one, a file
  // named like the pack, a backlog-like name, a deletion of an unchanged file, an addition beside a
  // deleted directory and one in a directory that is new. An added file named for the removed pack
  // is applied and marked, also beside a kept pack's name; one named for its look-alike, or with
  // the name inside a word, is not.
  assert.deepEqual(
    apply.map(
      ({ status, path, yours, names }) =>
        `${status} ${path}${yours ? ' yours' : ''}${names ? ` names:${names}` : ''}`,
    ),
    [
      'M docs/backlog-guide.md',
      'M services/vampi-admin/specs/a.spec.ts',
      'M .claude/skills/vampi-admin-api/SKILL.md',
      'M docs/discovery/vampi-admin-digest.json',
      'M services/vampi.md',
      'M .github/workflows/ci.yml',
      'D docs/obsolete.md',
      'M docs/guide.md',
      'M docs/edited.md yours',
      'A docs/new.md',
      'A docs/mine-too.md yours',
      'A packages/other/new.mjs',
      'A docs/brand-new/x.md',
      'A .github/workflows/vampi-dast.yml names:vampi',
      'A .github/workflows/vampi-admin-dast.yml',
      'A docs/vampires.md',
      'A .github/workflows/keycloak-vampi-diff.yml names:vampi',
    ],
  );
  // Without a removed pack, its files are applied like any other.
  assert.ok(
    classify({ changes, oldBlobs, copyBlobs: oldBlobs }).apply.some(
      ({ path }) => path === 'services/vampi/specs/a.spec.ts',
    ),
  );
});

test('a directory emptied by removing packs still takes a new pack’s files', () => {
  // docs/discovery/ and services/ held only the removed pack's files; the release adds a pack.
  const oldBlobs = new Map([
    ['services/vampi/service.json', 'old'],
    ['docs/discovery/vampi-digest.json', 'old'],
    ['README.md', 'old'],
  ]);
  const copyBlobs = new Map([['README.md', 'old']]);
  const changes = [
    { status: 'A', path: 'services/keycloak/service.json' },
    { status: 'A', path: 'docs/discovery/keycloak-digest.json' },
  ];
  const { apply, leftOut } = classify({
    changes,
    oldBlobs,
    copyBlobs,
    removedPacks: ['vampi'],
    packs: ['keycloak', 'vampi'],
  });
  assert.deepEqual(
    apply.map(({ path }) => path),
    changes.map(({ path }) => path),
  );
  assert.deepEqual(leftOut, []);
});

// git apply cannot make these where the file system ignores case; planUpdate blocks them there.
test('a rename that changes only the case of a path is found; other renames are not', () => {
  const apply = [
    { status: 'D', path: 'docs/guide.md' },
    { status: 'A', path: 'docs/Guide.md' },
    { status: 'D', path: 'docs/old-name.md' },
    { status: 'A', path: 'docs/new-name.md' },
    { status: 'M', path: 'docs/README.md' },
    { status: 'A', path: 'docs/readme.md' },
  ];
  assert.deepEqual(caseRenames(apply), [{ from: 'docs/guide.md', to: 'docs/Guide.md' }]);
  assert.deepEqual(caseRenames([]), []);
});

test('the packs of a release are the directories under services/ with a service.json', () => {
  assert.deepEqual(
    packsIn([
      'services/vampi/service.json',
      'services/petstore/service.json',
      'services/petstore/specs/service.json',
      'services/README.md',
      'docs/services/x/service.json',
    ]),
    ['petstore', 'vampi'],
  );
});
