import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { combinations, decide, normalizeTable, tableProblems } from '../lib/decision-table.mjs';
import { processPack } from '../derive-decision-tables.mjs';

const table = () => ({
  title: 'Login',
  operation: 'GET /user/login',
  conditions: { user: ['known', 'unknown'], password: ['right', 'wrong'] },
  actions: ['status', 'session'],
  rules: [
    { id: 'R1', when: { user: 'known', password: 'right' }, then: { status: 200, session: true } },
    { id: 'R2', when: { user: 'known', password: 'wrong' }, then: { status: 400, session: false } },
    { id: 'R3', when: { user: 'unknown' }, then: { status: 400, session: false } },
  ],
});

test('a complete, consistent table has no problems and decides every combination', () => {
  assert.deepEqual(tableProblems(table()), []);
  assert.equal(combinations(table().conditions).length, 4);
  const normalized = normalizeTable(table());
  assert.equal(decide(normalized, { user: 'unknown', password: 'right' }).id, 'R3');
  assert.deepEqual(
    normalized.rules[2].when,
    { user: 'unknown' },
    'an omitted condition matches any class',
  );
});

test('a hole and a contradiction are both reported with the combination', () => {
  const holed = table();
  holed.rules.pop();
  assert.deepEqual(tableProblems(holed, 'login.yaml'), [
    'login.yaml: no rule covers user=unknown, password=right',
    'login.yaml: no rule covers user=unknown, password=wrong',
  ]);
  const contradicting = table();
  contradicting.rules.push({
    id: 'R4',
    when: { password: 'wrong' },
    then: { status: 401, session: false },
  });
  assert.deepEqual(tableProblems(contradicting, 'login.yaml'), [
    'login.yaml: rules R2, R4 disagree on user=known, password=wrong',
    'login.yaml: rules R3, R4 disagree on user=unknown, password=wrong',
  ]);
  const agreeing = table();
  agreeing.rules.push({
    id: 'R4',
    when: { user: 'unknown', password: 'wrong' },
    then: { status: 400, session: false },
  });
  assert.deepEqual(tableProblems(agreeing), [], 'overlapping rules that agree are allowed');
});

test('names, classes and actions are checked before completeness', () => {
  const broken = table();
  broken.conditions.user = ['known', 'known'];
  broken.rules[0] = {
    id: 'R1',
    when: { role: 'admin', password: 'maybe' },
    then: { status: 200, extra: 1 },
  };
  broken.rules[1].id = 'R3';
  assert.deepEqual(tableProblems(broken, 't'), [
    't: condition user lists a class twice',
    't: R1: unknown condition role',
    't: R1: password has no class "maybe"',
    't: R1: `then` does not state session',
    't: R1: `then` states extra, which is not an action',
    't: rule id R3 is used twice',
    't: R3: user has no class "unknown"',
  ]);
  assert.deepEqual(tableProblems(null), ['table: a decision table must be a mapping']);
  assert.match(
    tableProblems({ ...table(), operation: 'login' }).join(),
    /`operation` must look like/,
  );
});

test('the generator writes a module only for packs with tables, and flags a stale one', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dt-'));
  const pack = join(root, 'services', 'shop');
  mkdirSync(join(pack, 'rules'), { recursive: true });
  writeFileSync(
    join(pack, 'service.json'),
    JSON.stringify({ name: 'shop', version: 'v1', title: 'Shop' }),
  );
  const yaml = [
    'title: Login',
    'conditions: { user: [known, unknown] }',
    'actions: [status]',
    'rules:',
    '  - { id: R1, when: { user: known }, then: { status: 200 } }',
    '  - { id: R2, when: { user: unknown }, then: { status: 400 } }',
  ].join('\n');
  writeFileSync(join(pack, 'rules', 'login.yaml'), yaml);

  const first = await processPack('shop', { root });
  assert.equal(first.stale, true, 'a table without its module is stale');
  await processPack('shop', { root, write: true });
  const module = readFileSync(join(pack, 'generated', 'decision-tables.ts'), 'utf8');
  assert.match(module, /export const decisionTables = \{\n {2}"login": \{/);
  assert.equal((await processPack('shop', { root })).stale, false);

  writeFileSync(join(pack, 'rules', 'login.yaml'), yaml.replace('status: 400', 'status: 401'));
  assert.equal((await processPack('shop', { root })).stale, true, 'an edited table makes it stale');

  writeFileSync(join(pack, 'rules', 'login.yaml'), yaml.split('\n').slice(0, 5).join('\n'));
  const holed = await processPack('shop', { root, write: true });
  assert.deepEqual(holed.problems, ['rules/login.yaml: no rule covers user=unknown']);
  assert.match(
    readFileSync(join(pack, 'generated', 'decision-tables.ts'), 'utf8'),
    /"status": 400/,
    'a broken table writes nothing',
  );

  writeFileSync(join(pack, 'rules', 'login.yaml'), yaml);
  await processPack('shop', { root, write: true });
  const { rmSync } = await import('node:fs');
  rmSync(join(pack, 'rules'), { recursive: true });
  assert.equal(
    (await processPack('shop', { root })).stale,
    true,
    'a module without tables is stale',
  );
  await processPack('shop', { root, write: true });
  assert.ok(!existsSync(join(pack, 'generated', 'decision-tables.ts')));
});
