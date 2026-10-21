// The release check (GATE-24): each check reports exactly its own failures, look-alikes that are
// correct pass, and the command stops at the first failure without running what follows.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { latestRelease } from '../changelog.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';
import {
  AUDIT,
  backlogProblems,
  FRAMEWORK_NAME,
  PACKAGE_FILE,
  releaseCheck,
  SCANS,
  treeProblems,
  versionProblems,
} from '../release-check.mjs';

const temporary = [];
after(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

const lines = (...rows) => `${rows.join('\n')}\n`;

// A changelog whose header and older sections name other versions: only the first version
// heading below an Unreleased section is the latest release.
const CHANGELOG = lines(
  '# Changelog',
  '',
  'The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow',
  '[Semantic Versioning](https://semver.org/spec/v2.0.0.html).',
  '',
  '## [Unreleased]',
  '',
  '- planned for 0.6.0',
  '',
  '## [0.5.0] - 2026-10-16',
  '',
  '### Upgrading from 0.4.0',
  '',
  '- nothing before 0.6.0',
  '',
  '## [0.4.0] - 2026-10-15',
);
const HEADER_ONLY = lines(
  '# Changelog',
  '',
  'Versions follow semver 2.0.0.',
  '',
  '## [Unreleased]',
);

const OPEN_TABLE = ['| Id | Item | Origin | Status |', '|---|---|---|---|'];

/** A backlog with a released v0.4.0, the given v0.5.0 section, open v0.6.0 work and Done. */
const backlog = (...section) =>
  lines(
    '# Backlog',
    '',
    '## v0.4.0',
    '',
    'Every item is in **Done**. Released as `v0.4.0`.',
    '',
    ...section,
    '## v0.6.0',
    '',
    ...OPEN_TABLE,
    '| GATE-30 | Open work that mentions v0.5.0: Released as `v0.5.0` is not its section. | exp | todo |',
    '',
    '## Done',
    '',
    '| Id | Item | Closed by |',
    '|---|---|---|',
    '| GATE-21 | Closed in v0.5.0. Released as `v0.5.0`. | `abc1234` |',
    "| TM-09 | **Won't do.** Dropped from v0.5.0 by the commit that decided it. | `def5678` |",
  );

// The statement wraps across a line, as prose wrapped at 100 columns does.
const RELEASED = [
  '## v0.5.0',
  '',
  'Gates and tracker. Every item is in **Done**: GATE-21 and TM-09. Released',
  'as `v0.5.0`.',
  '',
];

test('the latest release is the first version heading, whatever versions the text names', () => {
  assert.equal(latestRelease(CHANGELOG), '0.5.0');
  assert.equal(latestRelease(HEADER_ONLY), null);
  assert.equal(latestRelease(null), null);
});

test('versions: equal versions pass, in the framework and in a copy', () => {
  const changelog = CHANGELOG;
  assert.deepEqual(
    versionProblems({ rootVersion: '0.5.0', packageVersion: '0.5.0', changelog }),
    [],
  );
  // A copy does not compare create-api-qa, whose version stays the framework's.
  const copy = CHANGELOG.replace('[0.5.0]', '[0.1.0]');
  assert.deepEqual(versionProblems({ rootVersion: '0.1.0', changelog: copy }), []);
});

test('versions: each disagreement and each missing source is one finding', () => {
  const changelog = CHANGELOG;
  const cases = [
    [
      { rootVersion: '0.4.0', packageVersion: '0.4.0', changelog },
      [
        /^package\.json is 0\.4\.0 but the latest CHANGELOG\.md section is 0\.5\.0: .*step 2.*step 3\)$/,
      ],
    ],
    [
      { rootVersion: '0.6.0', packageVersion: '0.6.0', changelog },
      [/^package\.json is 0\.6\.0 but the latest CHANGELOG\.md section is 0\.5\.0/],
    ],
    [
      { rootVersion: '0.5.0', packageVersion: '0.4.0', changelog },
      [/^packages\/create-api-qa\/package\.json is 0\.4\.0 but package\.json is 0\.5\.0: /],
    ],
    [
      { rootVersion: '0.6.0', packageVersion: '0.4.0', changelog },
      [
        /^package\.json is 0\.6\.0 but the latest/,
        /^packages\/create-api-qa\/package\.json is 0\.4\.0 but package\.json is 0\.6\.0/,
      ],
    ],
    [
      { rootVersion: '0.5.0', changelog: null },
      [/^CHANGELOG\.md is missing: npm run changelog:write creates it/],
    ],
    [{ rootVersion: '0.5.0', changelog: HEADER_ONLY }, [/^CHANGELOG\.md has no release section/]],
    [
      { rootVersion: 'v0.5.0', changelog },
      [/^package\.json has no x\.y\.z version \(found "v0\.5\.0"\)$/],
    ],
    [
      { rootVersion: undefined, changelog },
      [/^package\.json has no x\.y\.z version \(found null\)$/],
    ],
  ];
  for (const [input, expected] of cases) {
    const problems = versionProblems(input);
    assert.equal(problems.length, expected.length, JSON.stringify(problems));
    expected.forEach((pattern, index) => assert.match(problems[index], pattern));
  }
});

test('backlog: a closed and released section passes, whatever other sections and Done say', () => {
  assert.deepEqual(backlogProblems(backlog(...RELEASED), '0.5.0'), []);
  // A heading with a title after the version is the same section.
  const titled = [`${RELEASED[0]} - gates`, ...RELEASED.slice(1)];
  assert.deepEqual(backlogProblems(backlog(...titled), '0.5.0'), []);
  // v0.5.10 is another version: its open row is not v0.5.1's.
  const later = backlog(
    '## v0.5.1',
    '',
    'Released as `v0.5.1`.',
    '',
    '## v0.5.10',
    '',
    ...OPEN_TABLE,
    '| GATE-31 | Open. | exp | todo |',
    '',
  );
  assert.deepEqual(backlogProblems(later, '0.5.1'), []);
});

test('backlog: each failure is exactly its findings', () => {
  const where = 'the ## v0.5.0 section of docs/backlog.md';
  const rows = [
    ...OPEN_TABLE,
    '| GATE-24 | Still open. | exp | todo |',
    '| DOC-11 | Also open. | exp | in-progress |',
    '',
  ];
  const cases = [
    [
      'rows left in the section',
      backlog(...RELEASED, ...rows),
      [
        `${where} still has 2 row(s): GATE-24, DOC-11; move each finished item to Done with its ` +
          "closing commit, each item that will not be done to Done as **Won't do.** with the " +
          'commit that decided it, and any other to a later version',
      ],
    ],
    [
      'the statement names another version',
      backlog('## v0.5.0', '', 'Every item is in **Done**. Released as `v0.4.0`.', ''),
      [`${where} does not say "Released as \`v0.5.0\`"`],
    ],
    [
      'the statement only in a code block',
      backlog('## v0.5.0', '', '```text', 'Released as `v0.5.0`', '```', ''),
      [`${where} does not say "Released as \`v0.5.0\`"`],
    ],
    [
      'rows left and no statement',
      backlog('## v0.5.0', '', 'Gates and tracker.', '', ...rows),
      [`${where} still has 2 row(s)`, `${where} does not say`],
    ],
    [
      'no section for the version',
      backlog(),
      ['docs/backlog.md has no ## v0.5.0 section: the release pull request says there'],
    ],
    [
      "a copy's backlog with one Open section",
      lines('# Backlog', '', '## Open', '', ...OPEN_TABLE, '| REPO-01 | Adopt. | plan | todo |'),
      ['docs/backlog.md has no ## v0.5.0 section'],
    ],
    ['no backlog', null, ['docs/backlog.md is missing']],
  ];
  for (const [name, text, expected] of cases) {
    const problems = backlogProblems(text, '0.5.0');
    assert.equal(problems.length, expected.length, `${name}: ${JSON.stringify(problems)}`);
    expected.forEach((start, index) => assert.ok(problems[index].startsWith(start), name));
  }
});

test('tree: changed tracked files are one finding that names them', () => {
  assert.deepEqual(treeProblems(''), []);
  assert.deepEqual(treeProblems('\n'), []);
  const problems = treeProblems(' M package.json\nM  docs/backlog.md\n');
  assert.equal(problems.length, 1);
  assert.match(
    problems[0],
    /^2 tracked file\(s\) changed and not committed \(package\.json, docs\/backlog\.md\): /,
  );
  const many = Array.from({ length: 12 }, (_, i) => ` M f${i}.md`).join('\n');
  assert.match(treeProblems(many)[0], /^12 tracked file\(s\).*f9\.md, \.\.\.\): /);
});

test('the scans run exactly the commands of their npm scripts', () => {
  const scripts = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts;
  for (const scan of SCANS) assert.equal(scripts[scan.script], `node ${scan.args.join(' ')}`);
  assert.equal(scripts['release:check'], 'node scripts/release-check.mjs');
});

// ---------------------------------------------------------------------------------------------
// The command over a repository on disk, with git and the scans faked.

/** A repository root at a release of `version`; `files` replaces or removes (null) any file. */
function repository(version, files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'release-check-'));
  temporary.push(root);
  const all = {
    'package.json': JSON.stringify({ name: FRAMEWORK_NAME, version }),
    [PACKAGE_FILE]: JSON.stringify({ name: 'create-api-qa', version }),
    'CHANGELOG.md': CHANGELOG.replace('[0.5.0]', `[${version}]`),
    'docs/backlog.md': backlog(...RELEASED.map((line) => line.replaceAll('0.5.0', version))),
    ...files,
  };
  for (const [file, text] of Object.entries(all)) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}

/**
 * A spawnSync stand-in: `git status` prints `status`, `npm audit` ends as `audit` says and a scan
 * as `scans[script]` says.
 */
function fakeSpawn({ status = '', audit = {}, scans = {} } = {}) {
  const calls = [];
  const spawn = (command, args) => {
    if (command === 'git') {
      calls.push(`git ${args[0]}`);
      return { status: 0, stdout: status, stderr: '', signal: null };
    }
    if (command === 'npm') {
      calls.push(`npm ${args.join(' ')}`);
      return { status: 0, signal: null, ...audit };
    }
    const script = args[0];
    calls.push(script);
    return { status: 0, signal: null, ...scans[script] };
  };
  return { calls, spawn };
}

const capture = () => {
  const printed = [];
  return { printed, log: (line) => printed.push(line), error: (line) => printed.push(line) };
};

function check(root, { spawn, hasDenylist = () => true }) {
  const out = capture();
  const code = releaseCheck({ root, spawn, out, hasDenylist });
  return { code, printed: out.printed };
}

const SECRET = SCANS[0].args[0];
const DENYLIST = SCANS[1].args[0];
const NPM_AUDIT = 'npm audit --audit-level=critical';

test('a release whose checks all pass runs every check in order and exits 0', () => {
  const fake = fakeSpawn();
  const { code, printed } = check(repository('0.5.0'), fake);
  assert.equal(code, 0);
  assert.deepEqual(fake.calls, ['git status', NPM_AUDIT, SECRET, DENYLIST]);
  assert.deepEqual(printed, [
    'release-check: tree passed: no uncommitted change',
    `release-check: versions passed: 0.5.0 in package.json, ${PACKAGE_FILE} and CHANGELOG.md`,
    'release-check: backlog passed: ## v0.5.0 has no row left and says it was released',
    `release-check: dependency audit passed: ${NPM_AUDIT}`,
    'release-check: secret scan passed: node scripts/secret-scan.mjs --history',
    'release-check: denylist scan passed: node scripts/scan-denylist.mjs --history',
    'release-check: v0.5.0 is ready to tag',
  ]);
});

test('without a denylist the denylist scan is reported as skipped, never as passed', () => {
  const fake = fakeSpawn();
  const { code, printed } = check(repository('0.5.0'), { ...fake, hasDenylist: () => false });
  assert.equal(code, 0);
  assert.deepEqual(fake.calls, ['git status', NPM_AUDIT, SECRET], 'the denylist scan did not run');
  assert.match(
    printed.at(-2),
    /^release-check: denylist scan SKIPPED: no \.git\/info\/denylist, so the history was NOT scanned/,
  );
  assert.equal(printed.at(-1), 'release-check: v0.5.0 is ready to tag (skipped: denylist scan)');
  assert.equal(
    printed.some((line) => /denylist scan passed/.test(line)),
    false,
  );
});

test('a copy compares its own version with its changelog, not the create-api-qa package', () => {
  const root = repository('0.1.0', {
    'package.json': JSON.stringify({ name: 'my-api-tests', version: '0.1.0' }),
    [PACKAGE_FILE]: JSON.stringify({ name: 'create-api-qa', version: '0.5.0' }),
  });
  const { code, printed } = check(root, fakeSpawn());
  assert.equal(code, 0, printed.join('\n'));
  assert.equal(
    printed[1],
    'release-check: versions passed: 0.1.0 in package.json and CHANGELOG.md',
  );
});

test('the first failure stops the check and names what did not run', () => {
  const cases = [
    {
      name: 'tree',
      root: repository('0.5.0'),
      fake: fakeSpawn({ status: ' M package.json\n' }),
      calls: ['git status'],
      failed: [
        /^release-check: tree FAILED: 1 tracked file\(s\) changed and not committed \(package\.json\)/,
      ],
      rest: 'versions, backlog, dependency audit, secret scan, denylist scan',
    },
    {
      name: 'versions',
      root: repository('0.5.0', { [PACKAGE_FILE]: JSON.stringify({ version: '0.4.0' }) }),
      fake: fakeSpawn(),
      calls: ['git status'],
      failed: [
        /^release-check: versions FAILED: packages\/create-api-qa\/package\.json is 0\.4\.0/,
      ],
      rest: 'backlog, dependency audit, secret scan, denylist scan',
    },
    {
      name: 'backlog',
      root: repository('0.5.0', {
        'docs/backlog.md': backlog(
          ...RELEASED,
          ...OPEN_TABLE,
          '| GATE-24 | Open. | exp | todo |',
          '',
        ),
      }),
      fake: fakeSpawn(),
      calls: ['git status'],
      failed: [
        /^release-check: backlog FAILED: the ## v0\.5\.0 section of docs\/backlog\.md still has 1 row\(s\): GATE-24;/,
      ],
      rest: 'dependency audit, secret scan, denylist scan',
    },
    {
      name: 'backlog file',
      root: repository('0.5.0', { 'docs/backlog.md': null }),
      fake: fakeSpawn(),
      calls: ['git status'],
      failed: [/^release-check: backlog FAILED: docs\/backlog\.md is missing$/],
      rest: 'dependency audit, secret scan, denylist scan',
    },
    {
      name: 'dependency audit',
      root: repository('0.5.0'),
      fake: fakeSpawn({ audit: { status: 1 } }),
      calls: ['git status', NPM_AUDIT],
      failed: [
        /^release-check: dependency audit FAILED: npm audit --audit-level=critical failed \(exit 1\): take the patched release/,
      ],
      rest: 'secret scan, denylist scan',
    },
    {
      name: 'secret scan',
      root: repository('0.5.0'),
      fake: fakeSpawn({ scans: { [SECRET]: { status: 1 } } }),
      calls: ['git status', NPM_AUDIT, SECRET],
      failed: [
        /^release-check: secret scan FAILED: node scripts\/secret-scan\.mjs --history failed \(exit 1\): revoke a real secret first/,
      ],
      rest: 'denylist scan',
    },
    {
      name: 'denylist scan',
      root: repository('0.5.0'),
      fake: fakeSpawn({ scans: { [DENYLIST]: { status: 1 } } }),
      calls: ['git status', NPM_AUDIT, SECRET, DENYLIST],
      failed: [
        /^release-check: denylist scan FAILED: node scripts\/scan-denylist\.mjs --history failed \(exit 1\): a denylisted term/,
      ],
      rest: null,
    },
  ];
  for (const { name, root, fake, calls, failed, rest } of cases) {
    const { code, printed } = check(root, fake);
    assert.equal(code, 1, name);
    assert.deepEqual(fake.calls, calls, name);
    const failures = printed.filter((line) => line.includes(' FAILED: '));
    assert.equal(failures.length, failed.length, `${name}: ${printed.join('\n')}`);
    failed.forEach((pattern, index) => assert.match(failures[index], pattern, name));
    const stopped = printed.filter((line) => line.startsWith('release-check: stopped'));
    assert.deepEqual(stopped, rest ? [`release-check: stopped; not run: ${rest}`] : [], name);
    assert.equal(
      printed.some((line) => /ready to tag/.test(line)),
      false,
      name,
    );
  }
});

test('a scan that is killed or cannot start fails like one that finds something (L-49)', () => {
  const error = Object.assign(new Error('spawnSync node ENOENT'), { code: 'ENOENT' });
  const outcomes = [
    [{ status: null, signal: 'SIGKILL' }, 'killed by SIGKILL'],
    [{ status: null, error }, 'could not run: spawnSync node ENOENT'],
  ];
  for (const [result, words] of outcomes) {
    const fake = fakeSpawn({ scans: { [SECRET]: result } });
    const { code, printed } = check(repository('0.5.0'), fake);
    assert.equal(code, 1, words);
    assert.ok(
      printed.some((line) => line.includes(`--history failed (${words})`)),
      words,
    );
    assert.deepEqual(fake.calls, ['git status', NPM_AUDIT, SECRET]);
  }
  // An audit that cannot reach the registry, or cannot start, fails too: it did not run.
  for (const [result, words] of outcomes) {
    const fake = fakeSpawn({ audit: result });
    const { code, printed } = check(repository('0.5.0'), fake);
    assert.equal(code, 1, words);
    assert.ok(
      printed.some((line) => line.includes(`critical failed (${words})`)),
      words,
    );
    assert.deepEqual(fake.calls, ['git status', NPM_AUDIT]);
  }
});

test('the audit fails on a critical advisory only, with the arguments npm takes', () => {
  assert.deepEqual(AUDIT.args, ['audit', '--audit-level=critical']);
});

test('a git status that fails is a failure of the tree check, not a clean tree', () => {
  const spawn = () => ({
    status: 128,
    stdout: '',
    stderr: 'fatal: not a git repository',
    signal: null,
  });
  const { code, printed } = check(repository('0.5.0'), { spawn });
  assert.equal(code, 1);
  assert.equal(
    printed[0],
    'release-check: tree FAILED: git status failed: fatal: not a git repository',
  );
});

test('no package.json is an error of the command itself', () => {
  const root = repository('0.5.0', { 'package.json': null });
  assert.throws(() => check(root, fakeSpawn()), /no package\.json in /);
});
