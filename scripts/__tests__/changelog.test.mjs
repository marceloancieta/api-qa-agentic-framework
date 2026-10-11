import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  changelog,
  groupCommits,
  insertSection,
  latestVersionTag,
  nextVersion,
  parseCommit,
  renderEntry,
  renderSection,
} from '../changelog.mjs';

const SCRIPT = join(import.meta.dirname, '..', 'changelog.mjs');

/** A parsed commit as `changelog` builds it from `git log`. */
const commit = (short, message) => ({ short, message, ...parseCommit(message) });

const silentLog = () => {
  const lines = [];
  const record = (level) => (message, fields) => lines.push({ level, message, fields });
  return { lines, info: record('info'), warn: record('warn'), error: record('error') };
};

test('a conforming subject gives type, scope, ids and summary', () => {
  assert.deepEqual(parseCommit('feat(core): CORE-04 actor fixture bound to a credential'), {
    conforming: true,
    type: 'feat',
    scope: 'core',
    breaking: false,
    note: null,
    ids: ['CORE-04'],
    summary: 'actor fixture bound to a credential',
    subject: 'feat(core): CORE-04 actor fixture bound to a credential',
  });
  const unscoped = parseCommit('fix: GATE-02 lint-suite reads probe ids');
  assert.equal(unscoped.scope, null);
  assert.equal(unscoped.type, 'fix');
});

test('several ids and id ranges are read until the first word that is not an id', () => {
  const several = parseCommit('ci(github): CI-02 CI-05 supply chain and the CI-07 review');
  assert.deepEqual(several.ids, ['CI-02', 'CI-05']);
  assert.equal(several.summary, 'supply chain and the CI-07 review');
  const ranges = parseCommit('feat(process): PROC-01..05 PROC-09..14 rules and skills');
  assert.deepEqual(ranges.ids, ['PROC-01..05', 'PROC-09..14']);
});

test('a breaking change is marked by `!` or by a BREAKING CHANGE footer', () => {
  const bang = parseCommit('feat(tm)!: TM-08 rename the adapter interface');
  assert.equal(bang.breaking, true);
  assert.equal(bang.note, null);
  assert.equal(parseCommit('refactor!: CORE-20 drop Node 20').breaking, true);

  const footer = parseCommit(
    'feat(core): CORE-21 new fixture names\r\n\r\nLonger body.\r\n\r\nBREAKING CHANGE: `actor` is now\r\n`actorFor`\r\n\r\nRefs: CORE-21',
  );
  assert.equal(footer.breaking, true);
  assert.equal(footer.note, '`actor` is now `actorFor`');
  assert.equal(parseCommit('fix: CORE-22 x\n\nBREAKING-CHANGE: y').breaking, true);
  assert.equal(
    parseCommit('fix: CORE-22 x\n\nmentions BREAKING CHANGE: mid-line').breaking,
    false,
    'only a footer line counts',
  );
});

test('non-conforming messages are reported with a reason, never parsed loosely', () => {
  const reasons = {
    'Add pets endpoint': 'subject is not `type(scope): summary`',
    'feat(core) CORE-01 missing colon': 'subject is not `type(scope): summary`',
    'feature(core): CORE-01 wrong type': 'unknown type "feature"',
    'docs: reword lessons and the backlog': 'no backlog id after the colon',
    'docs(adr): ADR 0008 branching model': 'no backlog id after the colon',
    'fix(gates): GATE-03': 'no summary after the backlog ids',
  };
  for (const [message, reason] of Object.entries(reasons)) {
    assert.deepEqual(
      parseCommit(message),
      { conforming: false, subject: message, reason },
      message,
    );
  }
});

test('groups come in a fixed order, empty ones left out, breaking commits only under breaking', () => {
  // Newest first, as git log lists them.
  const commits = [
    commit('a000009', 'Add a thing'),
    commit('a000008', 'docs(backlog): DOC-01 record a commit'),
    commit('a000007', 'feat(core)!: CORE-03 rename the fixtures'),
    commit('a000006', 'ci: CI-01 workflows'),
    commit('a000005', 'fix(tm): TM-02 retry uploads'),
    commit('a000004', 'feat(core): CORE-02 second core feature'),
    commit('a000003', 'feat: CORE-09 unscoped feature'),
    commit('a000002', 'feat(api): API-01 api feature'),
    commit('a000001', 'feat(core): CORE-01 first core feature'),
  ];
  const groups = groupCommits(commits);
  assert.deepEqual(
    groups.map((g) => [g.title, g.commits.map((c) => c.short)]),
    [
      ['Breaking changes', ['a000007']],
      // Unscoped first, then by scope, oldest first within a scope.
      ['Features', ['a000003', 'a000002', 'a000001', 'a000004']],
      ['Fixes', ['a000005']],
      ['Other', ['a000006', 'a000008']],
      ['Not conventional', ['a000009']],
    ],
  );
});

test('entries carry the label, summary, ids and short hash', () => {
  assert.equal(
    renderEntry(commit('abc1234', 'feat(core): CORE-01 CORE-02 the core'), 'feat'),
    '- **core:** the core (CORE-01, CORE-02) `abc1234`',
  );
  assert.equal(
    renderEntry(commit('abc1234', 'fix: GATE-01 unscoped fix'), 'fix'),
    '- unscoped fix (GATE-01) `abc1234`',
  );
  assert.equal(
    renderEntry(commit('abc1234', 'docs(adr): DOC-02 the decision'), 'other'),
    '- **docs(adr):** the decision (DOC-02) `abc1234`',
  );
  assert.equal(
    renderEntry(
      commit('abc1234', 'feat(tm): TM-08 new API\n\nBREAKING CHANGE: old one removed'),
      'breaking',
    ),
    '- **feat(tm):** new API (TM-08) `abc1234`\n  - BREAKING CHANGE: old one removed',
  );
  assert.equal(
    renderEntry(commit('abc1234', 'Fix stuff'), 'unconventional'),
    '- Fix stuff `abc1234` (subject is not `type(scope): summary`)',
  );
});

test('a section has the version heading and one heading per non-empty group', () => {
  const section = renderSection({
    version: '0.2.0',
    date: '2026-10-11',
    commits: [
      commit('bbb2222', 'fix(tm): TM-02 retry uploads'),
      commit('aaa1111', 'feat(core): CORE-01 the core'),
    ],
  });
  assert.equal(
    section,
    [
      '## [0.2.0] - 2026-10-11',
      '',
      '### Features',
      '',
      '- **core:** the core (CORE-01) `aaa1111`',
      '',
      '### Fixes',
      '',
      '- **tm:** retry uploads (TM-02) `bbb2222`',
      '',
    ].join('\n'),
  );
});

test('the latest version tag is the highest vX.Y.Z, other tags ignored', () => {
  assert.equal(latestVersionTag([]), null);
  assert.equal(latestVersionTag(['v0.9.0', 'v0.10.0', 'v0.2.1']), 'v0.10.0');
  assert.equal(latestVersionTag(['v1.0.0', 'v2.0.0-rc.1', 'release-3', 'v1.0']), 'v1.0.0');
});

test('the next version follows the commits since the latest tag', () => {
  const fix = [commit('a', 'fix: X-1 f')];
  const perf = [commit('a', 'perf: X-1 p')];
  const feat = [commit('a', 'feat: X-1 f'), ...fix];
  const breaking = [commit('a', 'fix!: X-1 b'), ...feat];
  const other = [commit('a', 'docs: X-1 d'), commit('b', 'not conventional')];
  const next = (tag, commits) => nextVersion(tag, commits).version;

  assert.deepEqual(nextVersion(null, feat), {
    version: '0.1.0',
    bump: 'initial',
    reason: 'no version tag yet',
  });
  // Initial development: a breaking change raises the minor version, like a feature.
  assert.equal(next('v0.1.0', fix), '0.1.1');
  assert.equal(next('v0.1.0', perf), '0.1.1');
  assert.equal(next('v0.1.3', feat), '0.2.0');
  assert.equal(next('v0.1.3', breaking), '0.2.0');
  assert.equal(next('v0.1.3', other), '0.1.4');
  // From 1.0.0 on.
  assert.equal(next('v1.2.3', fix), '1.2.4');
  assert.equal(next('v1.2.3', feat), '1.3.0');
  assert.equal(next('v1.2.3', breaking), '2.0.0');
  assert.equal(next('v1.2.3', [commit('a', 'docs: X-1 d\n\nBREAKING CHANGE: moved')]), '2.0.0');
  assert.equal(next('v1.2.3', other), '1.2.4');
  assert.throws(() => nextVersion('release-1', fix), /not a vX\.Y\.Z/);
});

test('a section goes above the newest version, after the header and Unreleased', () => {
  const section = '## [0.2.0] - 2026-10-11\n\n### Fixes\n\n- x (A-1) `aaa1111`\n';
  const created = insertSection(null, section, '0.2.0');
  assert.match(created, /^# Changelog\n\nAll notable changes/);
  assert.ok(created.endsWith(`.\n\n${section}`), created);

  const existing =
    '# Changelog\n\nIntro.\n\n## [Unreleased]\n\n- soon\n\n## [0.1.0] - 2026-10-01\n\n- first\n';
  assert.equal(
    insertSection(existing, section, '0.2.0'),
    `# Changelog\n\nIntro.\n\n## [Unreleased]\n\n- soon\n\n${section}\n## [0.1.0] - 2026-10-01\n\n- first\n`,
  );
});

test('a version already in the changelog is refused', () => {
  const existing = '# Changelog\n\n## [0.1.0] - 2026-10-01\n\n- first\n';
  assert.throws(
    () => insertSection(existing, '## [0.1.0] - 2026-10-11\n', '0.1.0'),
    (error) => error.refused === true && /0\.1\.0 is already in the changelog/.test(error.message),
  );
  // A version that only shares a prefix is not a duplicate.
  assert.doesNotThrow(() => insertSection(existing, '## [0.1.0] - x\n', '0.1'));
});

test('usage errors are reported before git is read', () => {
  const log = silentLog();
  assert.throws(() => changelog({ log }), /exactly one of --version X\.Y\.Z and --next/);
  assert.throws(() => changelog({ log, next: true, version: '1.0.0' }), /exactly one/);
  assert.throws(() => changelog({ log, version: '1.0' }), /not X\.Y\.Z/);
  assert.throws(() => changelog({ log, next: true, date: '11/10/2026' }), /not YYYY-MM-DD/);
});

/** A throwaway repository with its own identity; the working repository is never touched. */
function tempRepository() {
  const dir = mkdtempSync(join(tmpdir(), 'changelog-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.name', 'Changelog Test');
  git('config', 'user.email', 'changelog-test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  const commitWith = (...paragraphs) =>
    git('commit', '-q', '--allow-empty', '--no-verify', ...paragraphs.flatMap((p) => ['-m', p]));
  return { dir, git, commitWith };
}

test('end to end: commits since the tag, next version, write once, refuse twice', () => {
  const { dir, git, commitWith } = tempRepository();
  commitWith('chore: E0-01 scaffold');
  commitWith('feat(core): CORE-01 first release feature');
  git('tag', 'v0.1.0');
  commitWith('fix(tm): TM-02 retry uploads');
  commitWith('feat(core): CORE-02 CORE-03 actor fixture');
  commitWith('Quick fix without convention');
  commitWith('perf(core)!: CORE-04 stream large bodies', 'BREAKING CHANGE: bodies are streams');

  const file = join(dir, 'CHANGELOG.md');
  const log = silentLog();
  const outcome = changelog({ cwd: dir, next: true, date: '2026-10-11', write: true, file, log });
  assert.equal(outcome.version, '0.2.0');
  assert.equal(outcome.from, 'v0.1.0');
  assert.equal(outcome.commits.length, 4, 'only the commits after the tag');
  assert.deepEqual(
    log.lines.filter((l) => l.level === 'warn').map((l) => l.fields.subject),
    ['Quick fix without convention'],
    'the non-conforming commit is reported',
  );

  const hash = (subject) => git('log', '--format=%h', `--grep=${subject}`, '-F').trim();
  const written = readFileSync(file, 'utf8');
  assert.ok(
    written.endsWith(
      [
        '## [0.2.0] - 2026-10-11',
        '',
        '### Breaking changes',
        '',
        `- **perf(core):** stream large bodies (CORE-04) \`${hash('stream large bodies')}\``,
        '  - BREAKING CHANGE: bodies are streams',
        '',
        '### Features',
        '',
        `- **core:** actor fixture (CORE-02, CORE-03) \`${hash('actor fixture')}\``,
        '',
        '### Fixes',
        '',
        `- **tm:** retry uploads (TM-02) \`${hash('retry uploads')}\``,
        '',
        '### Not conventional',
        '',
        `- Quick fix without convention \`${hash('Quick fix')}\` (subject is not \`type(scope): summary\`)`,
        '',
      ].join('\n'),
    ),
    written,
  );

  // The CLI: the section on stdout, the log on stderr, and a duplicate refused with exit 1.
  const run = (...args) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
  const printed = run('--next', '--date', '2026-10-11', '--from', 'v0.1.0');
  assert.equal(printed.status, 0, printed.stderr);
  assert.equal(printed.stdout, written.slice(written.indexOf('## [0.2.0]')));
  assert.match(printed.stderr, /changelog warn {2}commit does not follow the convention/);

  const again = run('--version', '0.2.0', '--write', '--file', file);
  assert.equal(again.status, 1);
  assert.match(again.stderr, /0\.2\.0 is already in the changelog/);
  assert.equal(readFileSync(file, 'utf8'), written, 'the file is unchanged');

  // Without a tag the whole history counts and the first version is 0.1.0.
  git('tag', '-d', 'v0.1.0');
  const whole = run('--next', '--date', '2026-10-11');
  assert.equal(whole.status, 0, whole.stderr);
  assert.match(whole.stdout, /^## \[0\.1\.0\] - 2026-10-11\n/);
  assert.match(whole.stdout, /first release feature \(CORE-01\)/);
  assert.match(whole.stdout, /\*\*chore:\*\* scaffold \(E0-01\)/);
});

test('an empty range is refused and writes nothing', () => {
  const { dir, git, commitWith } = tempRepository();
  commitWith('feat: CORE-01 only commit');
  git('tag', 'v0.1.0');
  const file = join(dir, 'CHANGELOG.md');
  assert.throws(
    () => changelog({ cwd: dir, next: true, write: true, file, log: silentLog() }),
    (error) => error.refused === true && /nothing to release/.test(error.message),
  );
  assert.ok(!existsSync(file));
});
