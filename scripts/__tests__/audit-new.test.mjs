// The comparison of two lockfile audits (GATE-32): what counts as a new advisory, what never does,
// and that an audit that did not run never passes. `npm` and `git` are stand-ins: no registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNew, AUDIT_ARGS, AUDIT_FILES } from '../audit-new.mjs';
import { advisoriesOf, AUDIT_LEVEL, newAdvisories } from '../lib/audit.mjs';

const ROOT = join('repo', 'root');

const advisory = (name, severity, id = name) => ({
  name,
  severity,
  title: `${name} is unsafe`,
  url: `https://github.com/advisories/GHSA-${id}`,
});

/** A parsed `npm audit --json` report holding `advisories`, and a package that only brings one in. */
const report = (...advisories) => ({
  vulnerabilities: Object.fromEntries([
    ...advisories.map((item) => [item.name, { name: item.name, via: [item] }]),
    ['carrier', { name: 'carrier', via: advisories.map((item) => item.name) }],
  ]),
  metadata: {},
});

/** Runs `auditNew` with `base` and `head` as the two audits; `git` overrides `git show`. */
function run({ base = report(), head = report(), git = {}, audit = {}, revision = 'abc123' } = {}) {
  const lines = { log: [], error: [] };
  const calls = [];
  const seen = {};
  const spawn = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd });
    if (command === 'git') {
      return { status: 0, signal: null, stdout: `{"from":"${args[1]}"}`, ...git };
    }
    const isHead = options.cwd === ROOT;
    if (!isHead) {
      seen.files = AUDIT_FILES.map((file) => readFileSync(join(options.cwd, file), 'utf8'));
      seen.dir = options.cwd;
    }
    const stdout = JSON.stringify(isHead ? head : base);
    return { status: 1, signal: null, stdout, ...(isHead ? audit : {}) };
  };
  const out = {
    log: (line) => lines.log.push(line),
    error: (line) => lines.error.push(line),
  };
  const code = auditNew({ base: revision, root: ROOT, spawn, out });
  return { code, lines, calls, seen };
}

test('the audit level is the one a release and a pull request share', () => {
  assert.equal(AUDIT_LEVEL, 'high');
});

test('advisoriesOf keeps the level and above, and skips the names of packages that bring one in', () => {
  const found = advisoriesOf(
    report(advisory('a', 'critical'), advisory('b', 'high'), advisory('c', 'moderate')),
  );
  assert.deepEqual(
    [...found.values()].map((item) => item.name),
    ['a', 'b'],
  );
});

test('advisoriesOf refuses a report with no vulnerabilities: that audit did not run', () => {
  assert.throws(
    () => advisoriesOf({ message: 'request failed' }),
    /no audit report: request failed/,
  );
  assert.throws(() => advisoriesOf({ error: { summary: 'no lockfile' } }), /no lockfile/);
  assert.throws(() => advisoriesOf(null), /no audit report/);
});

test('newAdvisories returns what only head has, the most severe first', () => {
  const shared = advisory('shared', 'high');
  const found = newAdvisories(
    advisoriesOf(report(shared)),
    advisoriesOf(report(shared, advisory('b', 'high'), advisory('a', 'critical'))),
  );
  assert.deepEqual(
    found.map((item) => item.name),
    ['a', 'b'],
  );
});

test('a second advisory on a package that already had one is new', () => {
  const found = newAdvisories(
    advisoriesOf(report(advisory('a', 'high', 'one'))),
    advisoriesOf({
      vulnerabilities: {
        a: { via: [advisory('a', 'high', 'one'), advisory('a', 'high', 'two')] },
      },
    }),
  );
  assert.deepEqual(
    found.map((item) => item.url),
    ['https://github.com/advisories/GHSA-two'],
  );
});

test('a lockfile that brings an advisory in fails and names it', () => {
  const { code, lines } = run({ head: report(advisory('dompurify', 'critical')) });
  assert.equal(code, 1);
  assert.match(lines.error[0], /^audit-new: critical dompurify: dompurify is unsafe \(https:/);
  assert.match(lines.error[1], /^audit-new: 1 new against abc123: take the patched release/);
});

test('an advisory the base has too does not fail: it has nothing to do with this change', () => {
  const both = report(advisory('published-today', 'critical'));
  const { code, lines } = run({ base: both, head: both });
  assert.equal(code, 0);
  assert.deepEqual(lines.log, ['audit-new: no new high or critical advisory against abc123']);
  assert.deepEqual(lines.error, []);
});

test('a new advisory below the audit level does not fail', () => {
  assert.equal(run({ head: report(advisory('minimatch', 'moderate')) }).code, 0);
});

test('a lockfile that removes an advisory passes', () => {
  assert.equal(run({ base: report(advisory('zod', 'high')) }).code, 0);
});

test('the base is audited from its own files in a temporary folder, removed afterwards', () => {
  const { calls, seen } = run();
  assert.deepEqual(
    calls.filter(({ command }) => command === 'git').map(({ args }) => args),
    AUDIT_FILES.map((file) => ['show', `abc123:${file}`]),
  );
  assert.deepEqual(seen.files, [
    '{"from":"abc123:package.json"}',
    '{"from":"abc123:package-lock.json"}',
  ]);
  const audits = calls.filter(({ command }) => command === 'npm');
  assert.deepEqual(
    audits.map(({ args }) => args),
    [AUDIT_ARGS, AUDIT_ARGS],
  );
  assert.deepEqual(
    audits.map(({ cwd }) => cwd),
    [seen.dir, ROOT],
  );
  assert.equal(existsSync(seen.dir), false);
});

for (const [name, revision] of [
  ['missing', null],
  ['empty', ''],
  ['an option', '--output=x'],
]) {
  test(`--base ${name} is refused before anything runs`, () => {
    const { code, calls, lines } = run({ revision });
    assert.equal(code, 2);
    assert.deepEqual(calls, []);
    assert.match(lines.error[0], /--base <commit>/);
  });
}

test('a base without the lockfile exits 2 and says so', () => {
  const { code, lines } = run({ git: { status: 128, stdout: '' } });
  assert.equal(code, 2);
  assert.deepEqual(lines.error, [
    'audit-new: git show abc123:package.json failed (exit 128); the comparison did not run',
  ]);
});

for (const [name, audit, message] of [
  ['killed', { status: null, signal: 'SIGTERM' }, /npm audit killed by SIGTERM/],
  ['without a report', { stdout: 'npm error' }, /did not print a report/],
  ['with an error report', { stdout: '{"message":"offline"}' }, /no audit report: offline/],
]) {
  test(`an audit ${name} exits 2, never 0`, () => {
    const { code, lines } = run({ audit });
    assert.equal(code, 2);
    assert.match(lines.error[0], message);
    assert.match(lines.error[0], /the comparison did not run$/);
  });
}
