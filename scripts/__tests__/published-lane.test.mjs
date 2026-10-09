import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import {
  buildGrep,
  changedOperations,
  classifyCase,
  escapeRegExp,
  loadInputs,
  normalizeEndpoint,
  runPublished,
  selectPublished,
} from '../published-lane.mjs';

const FIXTURES = join(REPO_ROOT, 'scripts', '__fixtures__', 'published-lane');
const PROJECT = join(FIXTURES, 'project');
const tracked = JSON.parse(readFileSync(join(FIXTURES, 'tracked-digest.json'), 'utf8'));

test('changed operations include those reached through a changed named schema', () => {
  const current = structuredClone(tracked);
  current.schemas.Author['$.name'] = 'string maxLength=40'; // Author -> Book -> two operations
  current.operations['GET /shelves'].parameters['query:limit'] = 'integer maximum=50';
  current.operations['GET /authors'] = structuredClone(current.operations['GET /shelves']);
  assert.deepEqual(changedOperations(tracked, current), [
    'GET /authors',
    'GET /books/{bookId}',
    'GET /shelves',
    'POST /books',
  ]);
});

test('changed operation text counts; an identical digest changes nothing', () => {
  const current = structuredClone(tracked);
  current.descriptions['DELETE /books/{bookId}'] = '2222222222222222';
  assert.deepEqual(changedOperations(tracked, current), ['DELETE /books/{bookId}']);
  assert.deepEqual(changedOperations(tracked, structuredClone(tracked)), []);
});

test('registry endpoints are compared in the digest key format', () => {
  assert.equal(normalizeEndpoint('  get   /books/{bookId} '), 'GET /books/{bookId}');
});

test('the grep selects exactly the given ids at the start of a title', () => {
  const grep = buildGrep(['TC-BOOK-02', 'TC-BOOK-01', 'TC-BOOK-01']);
  assert.equal(grep, '(?:^|\\s)(?:TC-BOOK-01|TC-BOOK-02)(?![\\w-])');
  const re = new RegExp(grep);
  assert.ok(re.test('api shelf/specs/books.spec.ts TC-BOOK-01 a case'));
  assert.ok(re.test('TC-BOOK-02'));
  assert.ok(!re.test('api books.spec.ts TC-BOOK-010 a case'));
  assert.ok(!re.test('api XTC-BOOK-01 a case'));
  assert.ok(!re.test('api TC-BOOK-01-b a case'));
  assert.equal(escapeRegExp('a.b(c)|[d]*'), 'a\\.b\\(c\\)\\|\\[d\\]\\*');
  assert.doesNotThrow(() => new RegExp(buildGrep(['TC-A-01']), 'u'));
  assert.throws(() => buildGrep([]), /at least one/);
});

test('published rows map to the tests carrying their ids, narrowed by changed operations', () => {
  const { registries, corpusByPack } = loadInputs(PROJECT);
  assert.deepEqual(registries[0].problems, []);
  const all = selectPublished(registries, corpusByPack);
  assert.deepEqual(
    all.map((s) => [s.id, s.tests.length, s.quarantined]),
    [
      ['TC-BOOK-01', 1, false],
      ['TC-BOOK-02', 1, false],
      ['TC-BOOK-04', 0, false],
      ['TC-BOOK-05', 1, true],
    ],
  );
  const hit = new Map([['shelf', new Set(['GET /books/{bookId}'])]]);
  const miss = new Map([['shelf', new Set(['GET /shelves'])]]);
  assert.equal(selectPublished(registries, corpusByPack, hit).length, 4);
  assert.equal(selectPublished(registries, corpusByPack, miss).length, 0);
});

test('a repository without registries selects nothing', () => {
  const { registries, corpusByPack } = loadInputs(REPO_ROOT);
  assert.deepEqual(selectPublished(registries, corpusByPack), []);
});

test('each case gets one verdict from the records', () => {
  const one = { id: 'TC-X-01', tests: [{ tags: [] }], quarantined: false };
  const rec = (outcome, expectedStatus = 'passed') => ({
    title: 'TC-X-01 t',
    outcome,
    expectedStatus,
    attempts: [{ status: 'failed', errors: ['Error: no'] }],
  });
  assert.equal(classifyCase({ ...one, tests: [] }, []).verdict, 'missing');
  assert.equal(classifyCase({ ...one, quarantined: true }, []).verdict, 'quarantined');
  assert.equal(classifyCase(one, [{ ...rec('expected'), title: 'TC-X-010 t' }]).verdict, 'not-run');
  assert.equal(classifyCase(one, [rec('expected')]).verdict, 'passed');
  assert.equal(classifyCase(one, [rec('expected', 'failed')]).verdict, 'known-gap');
  assert.deepEqual(classifyCase(one, [rec('unexpected')]), {
    verdict: 'failed',
    detail: 'Error: no',
  });
  assert.equal(classifyCase(one, [rec('skipped')]).verdict, 'skipped');
});

test('end to end: one zero-retry run over the published cases of an offline project', () => {
  const { registries, corpusByPack } = loadInputs(PROJECT);
  const { results, records } = runPublished(selectPublished(registries, corpusByPack), {
    scanRoot: PROJECT,
    runRoot: REPO_ROOT,
    project: 'api',
    config: 'scripts/__fixtures__/published-lane/project/playwright.config.mjs',
  });
  assert.deepEqual(
    results.map((r) => [r.id, r.verdict]),
    [
      ['TC-BOOK-01', 'passed'],
      ['TC-BOOK-02', 'failed'],
      ['TC-BOOK-04', 'missing'],
      ['TC-BOOK-05', 'quarantined'],
    ],
  );
  assert.deepEqual(records.map((r) => r.title.split(' ')[0]).sort(), ['TC-BOOK-01', 'TC-BOOK-02']);
});
