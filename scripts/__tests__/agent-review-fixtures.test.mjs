// The api-spec-reviewer agent and its evaluation fixtures (AGT-01) describe the same checks. The
// agent's prompt catalogues the check ids; the fixtures seed each one with an `expect-review:`
// marker and list the expected findings in their README. A check added to one side only would
// leave the agent untested on it, or the fixtures testing a check the agent no longer knows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { parseRegistry } from '../lib/registry.mjs';
import { escapeRegExp } from '../lib/text.mjs';
import { lintFixtures as lintHarness } from '../lint-harness.mjs';
import { lintFixtures as lintSuite } from '../lint-suite.mjs';

const AGENT = join(REPO_ROOT, '.claude', 'agents', 'api-spec-reviewer.md');
const FIXTURES = join(REPO_ROOT, 'scripts', '__fixtures__', 'agents', 'api-spec-reviewer');
const MARKER = /expect-review:\s*([a-z][a-z0-9-]*(?:\s*,\s*[a-z][a-z0-9-]*)*)/;
const CASE_ID = /\bTC-[A-Z][A-Z0-9]{1,9}-\d{2,}\b/;
const RANK = { blocker: 3, major: 2, minor: 1 };

/** The bullet ids (`- \`id\``) of one `## <heading>` section of the agent prompt. */
function sectionIds(text, heading) {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.ok(start >= 0, `the agent prompt has a "## ${heading}" section`);
  const body = text.slice(start + heading.length + 5).split(/\n## /)[0];
  return [...body.matchAll(/^- `([a-z][a-z0-9-]*)`/gm)].map((match) => match[1]);
}

const prompt = readFileSync(AGENT, 'utf8').replace(/\r\n/g, '\n');
const specFiles = readdirSync(FIXTURES).filter((name) => name.endsWith('.spec.ts'));

/**
 * Every marker with the case it belongs to: the case of the `test(` call on the next line for a
 * marker alone on its line, otherwise the case of the last `test(` call above it.
 */
function markers() {
  const found = [];
  for (const file of specFiles) {
    const lines = readFileSync(join(FIXTURES, file), 'utf8').split(/\r?\n/);
    let current = null;
    lines.forEach((line, index) => {
      if (/\btest\(/.test(line) && CASE_ID.test(line)) current = CASE_ID.exec(line)[0];
      const match = MARKER.exec(line);
      if (!match) return;
      const alone = /^\s*\/\/\s*expect-review:/.test(line);
      const next = lines[index + 1] ?? '';
      const caseId = alone && /\btest\(/.test(next) ? CASE_ID.exec(next)?.[0] : current;
      for (const check of match[1].split(',').map((id) => id.trim())) {
        found.push({ file, line: index + 1, caseId, check, alone, next });
      }
    });
  }
  return found;
}

/**
 * The expected-findings rows of the README: case, check, accepted severities and file. A borderline
 * finding accepts two grades (`major or blocker`): runs of the agent differ on it, and the README
 * says so instead of pinning one of them.
 */
function readmeRows(readme) {
  const pattern = /^\| (TC-[A-Z0-9]+-\d+) \| `([a-z-]+)` \| (\w+(?: or \w+)?) \| `([^`]+)` \|/gm;
  return [...readme.matchAll(pattern)].map(([, caseId, check, severity, file]) => ({
    caseId,
    check,
    severities: severity.split(' or '),
    file,
  }));
}

const readme = readFileSync(join(FIXTURES, 'README.md'), 'utf8').replace(/\r\n/g, '\n');

test('the agent catalogues its checks once each, with the three severities', () => {
  const checks = sectionIds(prompt, 'Checks');
  assert.ok(checks.length > 0, 'the Checks section lists ids as "- `id`" lines');
  assert.equal(new Set(checks).size, checks.length, 'no check id is listed twice');
  assert.deepEqual(sectionIds(prompt, 'Severity and verdict'), Object.keys(RANK));
  assert.match(prompt, /^Verdict: approve \| changes \| block$/m);
});

test('the markers and the catalogue name the same set of checks', () => {
  const catalogued = new Set(sectionIds(prompt, 'Checks'));
  const found = markers();
  assert.ok(found.length > 0, 'the fixtures carry expect-review markers');
  const unknown = found.filter((m) => !catalogued.has(m.check));
  assert.deepEqual(
    unknown.map((m) => `${m.file}:${m.line}:${m.check}`),
    [],
    'every marker names a catalogued check',
  );
  const seeded = new Set(found.map((m) => m.check));
  assert.deepEqual(
    [...catalogued].filter((check) => !seeded.has(check)),
    [],
    'every catalogued check is seeded at least once',
  );
});

test('every marker points at code inside a designed case', () => {
  for (const m of markers()) {
    assert.ok(m.caseId, `${m.file}:${m.line} belongs to a TC case`);
    if (m.alone) assert.match(m.next, /\S/, `${m.file}:${m.line} is followed by the line it marks`);
  }
});

test('the README expects exactly the seeded findings, and its verdicts follow from them', () => {
  const key = (r) => `${r.file} ${r.caseId} ${r.check}`;
  const rows = readmeRows(readme);
  assert.deepEqual(rows.map(key).sort(), markers().map(key).sort());
  for (const row of rows) {
    for (const severity of row.severities) {
      assert.ok(RANK[severity], `${key(row)}: severity ${severity}`);
    }
  }

  // The verdict must follow from the severities whichever grade a borderline finding gets.
  const verdictOf = (worst) =>
    worst === RANK.blocker ? 'block' : worst === RANK.major ? 'changes' : 'approve';
  for (const file of specFiles) {
    const own = rows.filter((r) => r.file === file);
    const low = Math.max(0, ...own.map((r) => Math.min(...r.severities.map((s) => RANK[s]))));
    const high = Math.max(0, ...own.map((r) => Math.max(...r.severities.map((s) => RANK[s]))));
    assert.equal(
      verdictOf(low),
      verdictOf(high),
      `${file}: the verdict depends on a borderline grade`,
    );
    const verdict = verdictOf(high);
    assert.match(readme, new RegExp(`^- \`${escapeRegExp(file)}\`: \`${verdict}\`$`, 'm'));
  }
});

test('the registry parses and every one of its cases has exactly one test', () => {
  const registry = parseRegistry(readFileSync(join(FIXTURES, 'pet-review.md'), 'utf8'));
  assert.deepEqual(registry.problems, []);
  const titles = specFiles.flatMap((file) =>
    readFileSync(join(FIXTURES, file), 'utf8')
      .split(/\r?\n/)
      .filter((line) => /\btest\(/.test(line) && CASE_ID.test(line))
      .map((line) => CASE_ID.exec(line)[0]),
  );
  assert.deepEqual([...titles].sort(), registry.cases.map((c) => c.id).sort());
});

test('no linter reports anything in the fixtures: every seeded defect is semantic', () => {
  assert.deepEqual(lintHarness(FIXTURES), []);
  assert.deepEqual(lintSuite(FIXTURES), []);
});
