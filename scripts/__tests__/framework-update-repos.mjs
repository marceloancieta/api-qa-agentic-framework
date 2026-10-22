// Synthetic repositories for the framework-update suites (FUT-14): temporary directories removed
// after the suite, a "framework" with release tags v0.1.0, v0.2.0 and v0.2.1 and the example packs
// `petstore`, `vampi` and `vampi-admin` (a look-alike that must never be taken for `vampi`),
// and "copies" made from a tag the way a template copy is. Every remote is a local path: no network.
// The command suites are split by file so the test runner runs them in parallel (GATE-31).
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../lib/cli.mjs';
import { gitEnv } from '../lib/git.mjs';
import { frameworkUpdate, URL_OWNER } from '../framework-update.mjs';

const temporary = [];
export const tempDir = (prefix) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
};
after(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

export const row = (id, item) => `| ${id} | ${item} | plan | todo |`;

export const git = (cwd, ...args) =>
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
export const gitOut = (cwd, ...args) => {
  const result = git(cwd, ...args);
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
};

export function writeFiles(root, files) {
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
export const lines = (...items) => `${items.join('\n')}\n`;
export const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export const pack = (name, release) => ({
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

let built;
/** The synthetic framework, built on first use: `{ root, v1, v2 }`. */
export const framework = () => (built ??= frameworkRepository());

export const backlogOf = (record) => {
  const item = {
    npm: `Adopt the framework with \`npm create api-qa\` from release \`v0.1.0\`, framework commit \`${framework().v1}\`.`,
    template: `Adopt the framework from its template, starting from framework commit \`${framework().v1}\`.`,
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
export function copyRepository({
  tag = 'v0.1.0',
  record = 'npm',
  renamed = false,
  changes = {},
} = {}) {
  const root = tempDir('framework-update-copy-');
  gitOut(root, 'init', '-q');
  gitOut(root, 'fetch', '-q', '--no-tags', framework().root, `refs/tags/${tag}`);
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

export const REMOVE_VAMPI = {
  'services/vampi': null,
  '.claude/skills/vampi-api': null,
  'docs/discovery/vampi-digest.json': null,
};

export function runUpdate(root, ...argv) {
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
export const stateOf = (root) => ({
  head: gitOut(root, 'rev-parse', 'HEAD'),
  status: gitOut(root, 'status', '--porcelain'),
  refs: gitOut(root, 'for-each-ref'),
  remotes: gitOut(root, 'remote', '-v'),
  objects: gitOut(root, 'count-objects', '-v'),
});
export const read = (root, path) => readFileSync(join(root, path), 'utf8');
export const atRelease = (path) => gitOut(framework().root, 'show', `v0.2.0:${path}`);
