import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { httpClient } from '../lib/http.mjs';
import {
  attachmentSources,
  createAdapter,
  synthesizedResult,
} from '../tm/adapters/allure-testops/index.mjs';
import { describeAdapterContract } from '../tm/contract.mjs';
import { fakeTestOps } from '../__fixtures__/tm/fake-testops.mjs';

const noWait = async () => {};

function adapterOver(fake, { root = mkdtempSync(join(tmpdir(), 'tm-testops-')), ...options } = {}) {
  return createAdapter(
    { endpoint: 'https://testops.example/', project_id: fake.projectId, poll_ms: 0, ...options },
    { root, env: { ALLURE_TOKEN: fake.token }, fetchImpl: fake.fetchImpl, wait: noWait },
  );
}

describeAdapterContract('allure-testops (fake API)', () => adapterOver(fakeTestOps()));

// A results directory as a test run leaves it: an attributed result with evidence in a step, and
// an anonymous one from a test that never started.
function resultsRoot() {
  const root = mkdtempSync(join(tmpdir(), 'tm-testops-results-'));
  const dir = join(root, 'allure-results');
  mkdirSync(dir);
  writeFileSync(
    join(dir, 'a1-result.json'),
    JSON.stringify({
      uuid: 'a1',
      name: 'TC-ITEM-01 an item can be created',
      fullName: 'services/shop/specs/items.spec.ts:7:5',
      testCaseId: 'shop-v1-TC-ITEM-01',
      status: 'passed',
      start: 1,
      stop: 2,
      labels: [
        { name: 'host', value: 'my-laptop' },
        { name: 'thread', value: 'pid-1-worker-0' },
        { name: 'suite', value: 'items' },
      ],
      attachments: [],
      steps: [
        { name: 'POST /items', attachments: [{ name: 'exchange', source: 'ev1-attachment.json' }] },
      ],
    }),
  );
  writeFileSync(join(dir, 'ev1-attachment.json'), '{"status":201}');
  return root;
}

test('uploads the result file and its evidence, keyed by identity, without machine labels', async () => {
  const fake = fakeTestOps();
  const adapter = adapterOver(fake, { root: resultsRoot() });
  const run = await adapter.startRun({ name: 'items', runId: 'ab12cd34' });
  assert.deepEqual(
    [...fake.launches.get(run.id).tags.map((tag) => tag.name)],
    ['run-ab12cd34'],
    'the launch carries the run id',
  );
  const outcome = await adapter.reportResults(run, [
    {
      identity: 'shop-v1-TC-ITEM-01',
      status: 'passed',
      name: 'TC-ITEM-01 an item can be created',
      file: 'a1-result.json',
    },
    { identity: null, status: 'unknown', name: 'a test that never started' },
  ]);
  assert.deepEqual(outcome.reported, ['shop-v1-TC-ITEM-01']);
  assert.deepEqual(outcome.skipped, [
    { identity: 'a test that never started', reason: 'no case identity (L-17)' },
  ]);
  assert.deepEqual(fake.uploads, [
    { launchId: run.id, names: ['a1-result.json', 'ev1-attachment.json'] },
  ]);

  const stored = await adapter.readRun(run);
  assert.equal(stored.results['shop-v1-TC-ITEM-01'].status, 'passed');
  assert.equal(
    stored.results['shop-v1-TC-ITEM-01'].testCaseId,
    1,
    'TestOps keyed a test case by identity',
  );
});

test('the uploaded copy drops host and thread and takes the identity as fullName', async () => {
  const fake = fakeTestOps();
  let sent;
  const spy = async (url, init) => {
    if (init.body instanceof FormData) {
      sent = JSON.parse(await init.body.getAll('file')[0].text());
    }
    return fake.fetchImpl(url, init);
  };
  const adapter = createAdapter(
    { endpoint: 'https://testops.example', project_id: fake.projectId, poll_ms: 0 },
    { root: resultsRoot(), env: { ALLURE_TOKEN: fake.token }, fetchImpl: spy, wait: noWait },
  );
  const run = await adapter.startRun({ name: 'labels' });
  await adapter.reportResults(run, [
    { identity: 'shop-v1-TC-ITEM-01', status: 'passed', file: 'a1-result.json' },
  ]);
  assert.equal(sent.fullName, 'shop-v1-TC-ITEM-01');
  assert.equal(sent.testCaseId, 'shop-v1-TC-ITEM-01');
  assert.deepEqual(
    sent.labels.map((label) => label.name),
    ['suite'],
  );
});

test('an upload TestOps never finishes processing fails the read-back by identity (L-04)', async () => {
  const fake = fakeTestOps({ processingReads: 1000 });
  const adapter = adapterOver(fake, { wait_seconds: 0 });
  const run = await adapter.startRun({ name: 'slow import' });
  await assert.rejects(
    adapter.reportResults(run, [{ identity: 'shop-v1-TC-ITEM-01', status: 'failed' }]),
    /shop-v1-TC-ITEM-01: wrote failed, read back nothing/,
  );
});

test('configuration is required, and a refused token is never echoed', async () => {
  const fake = fakeTestOps();
  const context = { env: {}, fetchImpl: fake.fetchImpl, wait: noWait };
  assert.throws(() => createAdapter({}, context), /endpoint or ALLURE_ENDPOINT/);
  assert.throws(
    () => createAdapter({ endpoint: 'https://testops.example', project_id: 'abc' }, context),
    /numeric .*project_id or ALLURE_PROJECT_ID/,
  );
  assert.throws(
    () => createAdapter({ endpoint: 'https://testops.example', project_id: 7 }, context),
    /needs the environment variable ALLURE_TOKEN/,
  );
  const wrong = 'not-the-token-0123456789';
  const adapter = createAdapter(
    { endpoint: 'https://testops.example', project_id: 7, token_env: 'MY_TESTOPS_TOKEN' },
    { ...context, env: { MY_TESTOPS_TOKEN: wrong } },
  );
  const error = await adapter.startRun({ name: 'x' }).catch((caught) => caught);
  assert.match(error.message, /create a launch failed with 401/);
  assert.ok(!error.message.includes(wrong), 'the token is not in the error');
});

test('a result with no file behind it is uploaded as a minimal result', () => {
  const result = synthesizedResult(
    {
      identity: 'shop-v1-TC-ITEM-02',
      status: 'failed',
      durationMs: 80,
      issues: ['BUG-7'],
      run: 'r1',
    },
    1000,
  );
  assert.equal(result.fullName, 'shop-v1-TC-ITEM-02');
  assert.equal(result.name, 'shop-v1-TC-ITEM-02');
  assert.deepEqual([result.start, result.stop], [920, 1000]);
  assert.deepEqual(result.links, [{ type: 'issue', name: 'BUG-7' }]);
  assert.deepEqual(result.labels, [{ name: 'run', value: 'r1' }]);
});

test('attachments are collected from steps at any depth', () => {
  assert.deepEqual(
    attachmentSources({
      attachments: [{ source: 'a' }],
      steps: [{ attachments: [], steps: [{ attachments: [{ source: 'b' }] }] }],
    }),
    ['a', 'b'],
  );
});

test('httpClient sends FormData as multipart, leaving the content type to fetch', async () => {
  let seen;
  const request = httpClient({
    baseUrl: 'https://x.example',
    fetchImpl: async (url, init) => {
      seen = init;
      return new Response('{}', { status: 202 });
    },
  });
  const form = new FormData();
  form.append('info', '{}');
  await request('POST', 'upload', form);
  assert.equal(seen.body, form);
  assert.equal(seen.headers['content-type'], undefined);
});
