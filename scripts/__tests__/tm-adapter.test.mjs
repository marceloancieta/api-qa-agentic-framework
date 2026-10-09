import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  adapterProblems,
  httpClient,
  idempotentClose,
  readBackDifferences,
  retryDelay,
} from '../tm/adapter.mjs';
import { createAdapter } from '../tm/adapters/local/index.mjs';
import { describeAdapterContract } from '../tm/contract.mjs';

describeAdapterContract('local', () =>
  createAdapter({ dir: 'store' }, { root: mkdtempSync(join(tmpdir(), 'tm-local-')) }),
);

test('adapterProblems names every missing part', () => {
  assert.deepEqual(adapterProblems(null), ['an adapter must be an object']);
  assert.deepEqual(
    adapterProblems({ name: 'x', capabilities: { definitions: true, runs: true } }),
    [
      'publishDefinitions() is missing',
      'startRun() is missing',
      'reportResults() is missing',
      'closeRun() is missing',
      'an adapter with definitions needs readDefinitions() to verify its writes',
      'an adapter with runs needs readRun() to verify its writes',
    ],
  );
});

test('read-back differences are listed per field', () => {
  assert.deepEqual(readBackDifferences({ a: 1, b: [1] }, { a: 1, b: [2] }, ['a', 'b', 'c']), [
    'b: wrote [1], read back [2]',
  ]);
});

test('retry delay honours Retry-After, else backs off exponentially', () => {
  assert.equal(retryDelay(1, '3', 500), 3000);
  assert.deepEqual(
    [1, 2, 3].map((n) => retryDelay(n, null, 500)),
    [500, 1000, 2000],
  );
});

// A fake fetch that answers from a script of responses and records the calls.
function scriptedFetch(script) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    const next = script.shift();
    if (next instanceof Error) throw next;
    return new Response(next.body ?? '', { status: next.status, headers: next.headers ?? {} });
  };
  return { calls, fetchImpl };
}

test('the HTTP client retries 429, 5xx and network errors, but not other 4xx', async () => {
  const waits = [];
  const { calls, fetchImpl } = scriptedFetch([
    { status: 429, headers: { 'retry-after': '2' } },
    new Error('socket hang up'),
    { status: 503 },
    { status: 200, body: '{"ok":true}' },
  ]);
  const request = httpClient({
    baseUrl: 'https://tm.example/api/',
    headers: { authorization: 'Bearer t' },
    fetchImpl,
    wait: async (ms) => waits.push(ms),
  });
  const response = await request('POST', '/runs', { name: 'r' });
  assert.deepEqual([response.status, response.json], [200, { ok: true }]);
  assert.deepEqual(waits, [2000, 1000, 2000]);
  assert.equal(calls.length, 4);
  assert.equal(calls[0].url, 'https://tm.example/api/runs');
  assert.equal(calls[0].body, '{"name":"r"}');

  const refused = scriptedFetch([{ status: 404, body: 'missing' }]);
  const once = await httpClient({ baseUrl: 'https://tm.example', fetchImpl: refused.fetchImpl })(
    'GET',
    'x',
  );
  assert.deepEqual([once.status, once.text, refused.calls.length], [404, 'missing', 1]);
});

test('the HTTP client gives up after its retries with the cause', async () => {
  const { fetchImpl } = scriptedFetch([new Error('down'), new Error('down'), new Error('down')]);
  const request = httpClient({
    baseUrl: 'https://tm.example',
    fetchImpl,
    retries: 2,
    wait: async () => {},
  });
  await assert.rejects(request('GET', 'x'), /failed after 3 attempts: down/);
});

test('idempotentClose closes a run once', async () => {
  let calls = 0;
  const close = idempotentClose(async () => {
    calls += 1;
    return { closed: true, alreadyClosed: false };
  });
  await close({ id: 'r1' });
  assert.deepEqual(await close({ id: 'r1' }), { closed: true, alreadyClosed: true });
  assert.equal(calls, 1);
});

function withoutTestContext() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

test('the contract fails an adapter that is not idempotent', () => {
  const run = spawnSync(
    process.execPath,
    [
      '--test',
      join(import.meta.dirname, '..', '__fixtures__', 'tm-contract', 'broken-adapter.test.mjs'),
    ],
    // Without the parent runner's context the child reports normally and exits with its own status.
    { encoding: 'utf8', env: withoutTestContext() },
  );
  assert.equal(run.status, 1, 'the broken adapter must fail the contract');
  assert.match(run.stdout, /not ok \d+ - publishing is scoped, read back and idempotent/);
  assert.match(run.stdout, /not ok \d+ - an edited case keeps its tool id/);
});
