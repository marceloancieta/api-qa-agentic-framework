// framework-update (FUT-14): where a copy starts from and what a release leaves out are checked on
// their own, then the command runs on synthetic repositories in a temporary directory: a
// "framework" with two release tags and the example packs `vampi` and `vampi-admin` (a look-alike
// that must never be taken for `vampi`), and "copies" made from the older tag the way a template
// copy is, a single commit with the adoption applied. Every remote is a local path: no network.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../lib/cli.mjs';
import { gitEnv } from '../lib/git.mjs';
import {
  caseRenames,
  classify,
  compareVersions,
  frameworkUpdate,
  frameworkUrl,
  packsIn,
  RECORD_FILE,
  recordedRelease,
  releaseInRecord,
  remoteLocation,
  sameRepository,
  URL_OWNER,
} from '../framework-update.mjs';

const temporary = [];
const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
};
after(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// Where a copy starts from

const row = (id, item) => `| ${id} | ${item} | plan | todo |`;

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

// ---------------------------------------------------------------------------------------------
// Synthetic repositories

const git = (cwd, ...args) =>
  spawnSync(
    'git',
    [
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.invalid',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, env: gitEnv(), encoding: 'utf8' },
  );
const gitOut = (cwd, ...args) => {
  const result = git(cwd, ...args);
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
};

function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path);
    if (content === null) rmSync(file, { force: true, recursive: true });
    else {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
  }
}
const commitAll = (root, message) => {
  gitOut(root, 'add', '-A');
  gitOut(root, 'commit', '-q', '-m', message);
};
const lines = (...items) => `${items.join('\n')}\n`;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const pack = (name, release) => ({
  [`services/${name}/service.json`]: json({ name }),
  [`services/${name}/specs/a.spec.ts`]: `// ${name} ${release}\n`,
  [`.claude/skills/${name}-api/SKILL.md`]: `# ${name} ${release}\n`,
  [`docs/discovery/${name}-digest.json`]: json({ pack: name, release }),
});

const GUIDE_V1 = lines('one', 'two', 'three', 'four', 'five', 'six', 'seven');
const GUIDE_V2 = lines('one', 'two, as of v0.2.0', 'three', 'four', 'five', 'six', 'seven');

/** The framework: v0.1.0, then v0.2.0 changing, adding and deleting files of every kind. */
function frameworkRepository() {
  const root = tempDir('framework-update-framework-');
  gitOut(root, 'init', '-q');
  writeFiles(root, {
    // Its eol=lf keeps checkouts LF where git is set to core.autocrlf.
    '.gitattributes': readFileSync(join(REPO_ROOT, '.gitattributes')),
    '.gitignore': lines('node_modules/'),
    'package.json': json({ name: 'framework', version: '0.1.0', private: true }),
    [URL_OWNER]: json({ name: 'create', repository: { url: `git+${pathToFileURL(root).href}` } }),
    'CHANGELOG.md': lines('# Changelog', '', '## [0.1.0]', '', '- first'),
    'docs/backlog.md': lines('# Backlog', '', row('GATE-01', 'the framework’s own row')),
    'docs/guide.md': GUIDE_V1,
    'docs/notes.md': lines('notes'),
    'docs/old.md': lines('obsolete'),
    'scripts/tool.mjs': lines('export const a = 1;', '', '', '', '', 'export const b = 2;'),
    '.github/workflows/codeql.yml': lines('name: codeql'),
    '.github/workflows/ci.yml': lines('name: ci'),
    'image.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]),
    ...pack('petstore', 'v0.1.0'),
    ...pack('vampi', 'v0.1.0'),
    ...pack('vampi-admin', 'v0.1.0'),
  });
  commitAll(root, 'v0.1.0');
  gitOut(root, 'tag', 'v0.1.0');
  writeFiles(root, {
    'package.json': json({ name: 'framework', version: '0.2.0', private: true }),
    'CHANGELOG.md': lines('# Changelog', '', '## [0.2.0]', '', '- second', '', '## [0.1.0]'),
    'docs/backlog.md': lines('# Backlog', '', row('GATE-02', 'another framework row')),
    'docs/guide.md': GUIDE_V2,
    'docs/notes.md': null,
    'docs/old.md': null,
    'docs/new.md': lines('new in v0.2.0'),
    'scripts/tool.mjs': lines('export const a = 10;', '', '', '', '', 'export const b = 2;'),
    '.github/workflows/codeql.yml': lines('name: codeql', 'on: push'),
    'image.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]),
    ...pack('petstore', 'v0.2.0'),
    ...pack('vampi', 'v0.2.0'),
    'services/vampi/specs/b.spec.ts': '// new vampi spec\n',
    ...pack('vampi-admin', 'v0.2.0'),
    'packages/create-api-qa/lib/new.mjs': lines('export const created = true;'),
    '.github/workflows/vampi-dast.yml': lines('name: dast (vampi)'),
  });
  commitAll(root, 'v0.2.0');
  gitOut(root, 'tag', 'v0.2.0');
  // v0.2.1 changes only what a copy keeps as its own: nothing to apply.
  writeFiles(root, {
    'CHANGELOG.md': lines('# Changelog', '', '## [0.2.1]', '', '- third', '', '## [0.2.0]'),
  });
  commitAll(root, 'v0.2.1');
  gitOut(root, 'tag', 'v0.2.1');
  const commit = (tag) => gitOut(root, 'rev-parse', `${tag}^{commit}`).trim();
  return { root, v1: commit('v0.1.0'), v2: commit('v0.2.0') };
}

const FRAMEWORK = frameworkRepository();

const backlogOf = (record) => {
  const item = {
    npm: `Adopt the framework with \`npm create api-qa\` from release \`v0.1.0\`, framework commit \`${FRAMEWORK.v1}\`.`,
    template: `Adopt the framework from its template, starting from framework commit \`${FRAMEWORK.v1}\`.`,
    none: 'Adopt the framework from its template, starting from framework commit `<commit>`.',
  }[record];
  return lines(
    '# Backlog',
    '',
    '| Id | Item | Origin | Status |',
    '|---|---|---|---|',
    row('REPO-01', item),
  );
};

/**
 * A copy of the framework at `tag`, as a template copy holds it: the release's files in one commit
 * of its own, no framework tags or remotes, with its own backlog and changelog (adoption, step 3)
 * and, when `renamed`, its own name and version; then `changes` in a second commit, as the
 * adopter's own work.
 */
function copyRepository({ tag = 'v0.1.0', record = 'npm', renamed = false, changes = {} } = {}) {
  const root = tempDir('framework-update-copy-');
  gitOut(root, 'init', '-q');
  gitOut(root, 'fetch', '-q', '--no-tags', FRAMEWORK.root, `refs/tags/${tag}`);
  gitOut(root, 'read-tree', '-u', '--reset', 'FETCH_HEAD');
  rmSync(join(root, '.git', 'FETCH_HEAD'));
  writeFiles(root, {
    'docs/backlog.md': backlogOf(record),
    'CHANGELOG.md': lines('# Changelog'),
    ...(renamed
      ? { 'package.json': json({ name: 'my-tests', version: '0.0.0', private: true }) }
      : {}),
  });
  commitAll(root, 'Initial commit');
  // The copy's own first release: a tag named like the framework's, which must not be read.
  gitOut(root, 'tag', 'v0.1.0');
  if (Object.keys(changes).length > 0) {
    writeFiles(root, changes);
    commitAll(root, 'my changes');
  }
  return root;
}

const REMOVE_VAMPI = {
  'services/vampi': null,
  '.claude/skills/vampi-api': null,
  'docs/discovery/vampi-digest.json': null,
};

function runUpdate(root, ...argv) {
  const out = [];
  const err = [];
  const code = frameworkUpdate(argv, {
    root,
    log: (line) => out.push(line),
    warn: (line) => err.push(line),
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

/** Everything an update could change in a copy besides its files. */
const stateOf = (root) => ({
  head: gitOut(root, 'rev-parse', 'HEAD'),
  status: gitOut(root, 'status', '--porcelain'),
  refs: gitOut(root, 'for-each-ref'),
  remotes: gitOut(root, 'remote', '-v'),
  objects: gitOut(root, 'count-objects', '-v'),
});
const read = (root, path) => readFileSync(join(root, path), 'utf8');
const atRelease = (path) => gitOut(FRAMEWORK.root, 'show', `v0.2.0:${path}`);

// ---------------------------------------------------------------------------------------------
// The command

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
    FRAMEWORK.v2,
  );
  assert.notEqual(gitOut(root, 'rev-parse', 'refs/tags/v0.1.0^{commit}').trim(), FRAMEWORK.v1);
  assert.equal(
    gitOut(root, 'remote', 'get-url', 'framework').trim(),
    pathToFileURL(FRAMEWORK.root).href,
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
  const { code, out, err } = runUpdate(root, '--to', 'v0.2.0', '--remote', FRAMEWORK.root);
  assert.equal(code, 0, `${out}\n${err}`);
  assert.ok(!existsSync(join(root, 'packages/create-api-qa')));
  assert.match(
    out,
    /not in this copy any more:\n\s+added {5}packages\/create-api-qa\/lib\/new\.mjs/,
  );
  assert.equal(read(root, 'docs/new.md'), atRelease('docs/new.md'));
});

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

test('a relative --remote works in a dry run as in an update', () => {
  const root = copyRepository({ changes: REMOVE_VAMPI });
  const local = relative(process.cwd(), FRAMEWORK.root);
  const dry = runUpdate(root, '--to', 'v0.2.0', '--dry-run', '--remote', local);
  assert.equal(dry.code, 0, dry.err);
  const { code, err } = runUpdate(root, '--to', 'v0.2.0', '--remote', local);
  assert.equal(code, 0, err);
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

test('a template copy starts from the framework commit its REPO-01 row records', () => {
  const root = copyRepository({ record: 'template', changes: REMOVE_VAMPI });
  const { code, out, err } = runUpdate(root, '--to', 'v0.2.0', '--dry-run');
  assert.equal(code, 0, `${out}\n${err}`);
  assert.match(out, new RegExp(`Framework framework commit ${FRAMEWORK.v1} -> v0\\.2\\.0`));
  const same = runUpdate(root, '--to', 'v0.1.0', '--dry-run');
  assert.equal(same.code, 1);
  assert.match(
    same.err,
    new RegExp(`--to v0\\.1\\.0 is not later than framework commit ${FRAMEWORK.v1}`),
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
  gitOut(root, 'remote', 'add', 'framework', FRAMEWORK.root);
  const other = runUpdate(root, '--to', 'v0.2.0', '--remote', missing);
  assert.equal(other.code, 1);
  assert.match(other.err, /The "framework" remote points to .*git remote set-url/);
  assert.equal(
    runUpdate(root, '--to', 'v0.2.0', '--remote', `${FRAMEWORK.root}/`).code,
    0,
    'the remote that exists is used, whatever its spelling',
  );
});
