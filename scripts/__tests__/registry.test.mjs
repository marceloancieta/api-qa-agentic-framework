import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COLUMNS, loadRegistries, parseRegistry } from '../lib/registry.mjs';

const header = `| ${COLUMNS.join(' | ')} |\n|${COLUMNS.map(() => '---').join('|')}|`;
const front = [
  '---',
  'feature: PET',
  'title: Pets',
  'endpoints:',
  '  - POST /pet',
  '  - GET /pet/{petId}',
  'requirements:',
  '  - { id: REQ-PET-01, text: A pet can be created }',
  '---',
].join('\n');

const registry = (rows) =>
  `${front}\n\n# PET\n\nNotes.\n\n## Cases\n\n${header}\n${rows.join('\n')}\n`;

test('a well-formed registry parses into cases with line numbers', () => {
  const parsed = parseRegistry(
    registry([
      '| TC-PET-01 | create a pet | REQ-PET-01 | equivalence-partition | high | automated | specs/pet.spec.ts | |',
      '| TC-PET-02 | name with a \\| pipe |  | boundary-value | low | draft |  |  |',
    ]),
  );
  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.meta.feature, 'PET');
  assert.deepEqual(
    parsed.cases.map((c) => [c.id, c.status, c.spec, c.line]),
    [
      ['TC-PET-01', 'automated', 'specs/pet.spec.ts', 19],
      ['TC-PET-02', 'draft', '', 20],
    ],
  );
  assert.equal(parsed.cases[1].title, 'name with a | pipe');
});

test('a malformed row is skipped and reported, never read with shifted columns', () => {
  const parsed = parseRegistry(
    registry([
      '| TC-PET-01 | missing cells | high | automated |',
      '| TC-PET-02 | ok |  | pairwise | medium | approved |  |  |',
    ]),
  );
  assert.deepEqual(
    parsed.cases.map((c) => c.id),
    ['TC-PET-02'],
  );
  assert.match(parsed.problems[0].message, /row has 4 cells, expected 8; row skipped/);
  assert.equal(parsed.problems[0].line, 19);
});

test('enums, ids, duplicates and requirement references are checked', () => {
  const parsed = parseRegistry(
    registry([
      '| TC-PET-01 | a | REQ-PET-09 | guessing | urgent | done |  |  |',
      '| TC-PET-01 | b |  | pairwise | low | draft |  |  |',
      '| TC-USR-03 | c |  | pairwise | low | draft |  |  |',
    ]),
  );
  const messages = parsed.problems.map((p) => p.message);
  assert.deepEqual(messages, [
    'TC-PET-01: status "done" is not one of draft, approved, automated, published, blocked',
    'TC-PET-01: technique "guessing" is not one of equivalence-partition, boundary-value, decision-table, state-transition, pairwise, error-guessing, use-case',
    'TC-PET-01: priority "urgent" is not one of high, medium, low',
    'TC-PET-01: requirement REQ-PET-09 is not declared in the front matter',
    'duplicate case id TC-PET-01',
    'case id "TC-USR-03" must be TC-PET-NN',
  ]);
});

test('missing front matter, header or section are reported', () => {
  assert.deepEqual(
    parseRegistry('# nothing').problems.map((p) => p.message),
    [
      'missing YAML front matter (--- ... ---)',
      'front matter `feature` must be 2-10 capitals/digits, e.g. PET',
      'front matter `title` is required',
      'front matter `endpoints` must list at least one "METHOD /path"',
      'missing "## Cases" section',
    ],
  );
  const wrongHeader = `${front}\n## Cases\n| ID | Title |\n|---|---|\n`;
  assert.match(parseRegistry(wrongHeader).problems.at(-1).message, /header must be/);
});

test('loadRegistries reads every pack registry with repository-relative paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'reg-'));
  mkdirSync(join(root, 'services', 'shop', 'registry'), { recursive: true });
  writeFileSync(join(root, 'services', 'shop', 'registry', 'PET.md'), registry([]));
  const [loaded] = loadRegistries(root);
  assert.equal(loaded.pack, 'shop');
  assert.equal(loaded.file, 'services/shop/registry/PET.md');
  assert.deepEqual(loaded.problems, []);
});
