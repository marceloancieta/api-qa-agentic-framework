import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

test('the header contract: known keys only, actors, placeholders, beyond-floor ids', () => {
  const head = (extra) => front.replace('\n---', '').replace(/---$/, '') + `\n${extra}\n---`;
  const parse = (extra, rows = []) =>
    parseRegistry(`${head(extra)}\n\n## Cases\n\n${header}\n${rows.join('\n')}\n`).problems.map(
      (p) => p.message,
    );
  const row = '| TC-PET-01 | a |  | pairwise | low | draft |  |  |';

  assert.deepEqual(
    parse(
      [
        'contract: docs/features/pets.md',
        'auth: [default, anonymous]',
        'test_data:',
        '  <PET_ID>: a pet the case creates',
        'beyond_floor: [TC-PET-01]',
      ].join('\n'),
      [row],
    ),
    [],
  );
  assert.deepEqual(
    parse(
      [
        'floor: 12',
        'contract: pets.txt',
        'auth: [Default]',
        'test_data:',
        '  PET_ID: a pet',
        '  <OWNER>: ""',
        'beyond_floor: [TC-PET-09]',
      ].join('\n'),
      [row],
    ),
    [
      'front matter key `floor` is not one of feature, title, endpoints, requirements, contract, auth, test_data, beyond_floor',
      'front matter `contract` must be the path of a Markdown file, relative to the pack',
      'front matter `auth` must list actor names, e.g. [default, anonymous]',
      'test_data placeholder "PET_ID" must look like <UPPER_SNAKE>',
      'test_data placeholder <OWNER> needs a description',
      'beyond_floor names TC-PET-09, which is not a case of this registry',
    ],
  );
});

test('a contract doc named by a registry must exist in its pack', () => {
  const root = mkdtempSync(join(tmpdir(), 'reg-contract-'));
  const dir = join(root, 'services', 'shop', 'registry');
  mkdirSync(dir, { recursive: true });
  const text = registry([]).replace(
    'requirements:',
    'contract: docs/features/pets.md\nrequirements:',
  );
  writeFileSync(join(dir, 'PET.md'), text);
  assert.deepEqual(
    loadRegistries(root)[0].problems.map((p) => p.message),
    ['contract docs/features/pets.md does not exist in services/shop/'],
  );
  mkdirSync(join(root, 'services', 'shop', 'docs', 'features'), { recursive: true });
  writeFileSync(join(root, 'services', 'shop', 'docs', 'features', 'pets.md'), '# Pets\n');
  assert.deepEqual(loadRegistries(root)[0].problems, []);
});

test('the registry template parses once its placeholders are filled in', () => {
  const template = readFileSync(
    join(import.meta.dirname, '..', '..', 'docs', 'templates', 'registry.md'),
    'utf8',
  );
  const filled = template
    .replaceAll('<FEATURE>', 'PET')
    .replaceAll('<Feature title>', 'Pets')
    .replaceAll('<METHOD /path>', 'GET /pet/{petId}')
    .replaceAll('<PLACEHOLDER>', '<PET_ID>')
    .replace(/<[a-z][^<>\n]*>/g, 'text');
  const parsed = parseRegistry(filled, 'docs/templates/registry.md');
  assert.deepEqual(parsed.problems, []);
  assert.deepEqual(
    parsed.cases.map((c) => c.id),
    ['TC-PET-01'],
  );
});
