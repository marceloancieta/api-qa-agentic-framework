import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCorpus, parseSpecSource, specFiles } from '../lib/corpus.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';

const SOURCE = `
import { test, expect } from '../fixtures';

// test('commented out', async () => {});
const text = "test('inside a string', () => {})";

test.describe('pets', { tag: '@regression' }, () => {
  test('TC-PET-01 create a pet @smoke probe:p-0123456789', async ({ pets }) => {
    test.skip(false, 'not a declaration');
    expect(1).toBe(1);
  });

  test.describe.serial('nested', () => {
    test.fixme('TC-PET-02 pending', { tag: ['@negative', '@slow'] }, async () => {});
  });
});

test(\`template title\`, async () => {});
test(dynamicTitle(), async () => {});
test.beforeEach(async () => {});
`;

test('tests are read from the syntax tree, with describe path, tags, ids and probes', () => {
  const parsed = parseSpecSource(SOURCE, 'services/x/specs/pets.spec.ts');
  assert.deepEqual(
    parsed.tests.map((t) => ({
      title: t.title,
      line: t.line,
      describePath: t.describePath,
      modifier: t.modifier,
      tags: t.tags,
      caseId: t.caseId,
      probes: t.probes,
    })),
    [
      {
        title: 'TC-PET-01 create a pet @smoke probe:p-0123456789',
        line: 8,
        describePath: ['pets'],
        modifier: null,
        tags: ['@regression', '@smoke'],
        caseId: 'TC-PET-01',
        probes: ['p-0123456789'],
      },
      {
        title: 'TC-PET-02 pending',
        line: 14,
        describePath: ['pets', 'nested'],
        modifier: 'fixme',
        tags: ['@regression', '@negative', '@slow'],
        caseId: 'TC-PET-02',
        probes: [],
      },
      {
        title: 'template title',
        line: 18,
        describePath: [],
        modifier: null,
        tags: [],
        caseId: null,
        probes: [],
      },
      {
        title: null,
        line: 19,
        describePath: [],
        modifier: null,
        tags: [],
        caseId: null,
        probes: [],
      },
    ],
  );
  assert.deepEqual(parsed.probeRefs, ['p-0123456789']);
});

test('the Petstore pack specs are found and parsed', () => {
  const files = specFiles(REPO_ROOT, 'petstore');
  assert.ok(files.includes('services/petstore/specs/pet.spec.ts'));
  const corpus = loadCorpus(REPO_ROOT, 'petstore');
  const pets = corpus.find((spec) => spec.file.endsWith('/pet.spec.ts'));
  assert.ok(pets.tests.length >= 2);
  assert.ok(pets.tests.every((t) => t.caseId?.startsWith('TC-PET-')));
  assert.ok(pets.tests.some((t) => t.tags.includes('@smoke')));
});
