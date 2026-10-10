// The adapter contract against a real Allure TestOps instance (opt-in: `npm run tm:contract:live`).
// It needs ALLURE_ENDPOINT, ALLURE_PROJECT_ID and ALLURE_TOKEN, from the environment or the local
// env file, and skips when they are missing. Everything it creates is deleted afterwards: the
// launches, and the test cases TestOps created from their results.

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalEnv } from '../lib/env.mjs';
import { httpClient } from '../lib/http.mjs';
import { createAdapter } from '../tm/adapters/allure-testops/index.mjs';
import { describeAdapterContract } from '../tm/contract.mjs';

loadLocalEnv();
const configured = ['ALLURE_ENDPOINT', 'ALLURE_PROJECT_ID', 'ALLURE_TOKEN'].every((name) =>
  process.env[name]?.trim(),
);
const launches = new Set();

function liveAdapter(root = mkdtempSync(join(tmpdir(), 'tm-testops-live-'))) {
  const adapter = createAdapter({}, { root });
  const startRun = adapter.startRun;
  adapter.startRun = async (args) => {
    const run = await startRun({ ...args, name: `adapter contract: ${args.name}` });
    launches.add(run.id);
    return run;
  };
  return adapter;
}

if (!configured) {
  test('allure-testops live contract', (t) =>
    t.skip('set ALLURE_ENDPOINT, ALLURE_PROJECT_ID and ALLURE_TOKEN to run it'));
} else {
  describeAdapterContract('allure-testops (live)', () => liveAdapter());

  test('a real result file and its evidence reach TestOps under the identity', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tm-testops-live-files-'));
    mkdirSync(join(root, 'allure-results'));
    const now = Date.now();
    writeFileSync(
      join(root, 'allure-results', 'live1-result.json'),
      JSON.stringify({
        uuid: crypto.randomUUID(),
        name: 'TC-LIVE-01 a result with evidence',
        fullName: 'services/shop/specs/live.spec.ts:1:1',
        testCaseId: 'shop-v1-TC-LIVE-01',
        status: 'broken',
        stage: 'finished',
        start: now - 10,
        stop: now,
        labels: [{ name: 'host', value: 'stays-local' }],
        attachments: [
          { name: 'exchange', source: 'live1-attachment.json', type: 'application/json' },
        ],
        steps: [],
      }),
    );
    writeFileSync(join(root, 'allure-results', 'live1-attachment.json'), '{"status":500}');
    const adapter = liveAdapter(root);
    const run = await adapter.startRun({ name: 'files' });
    const { reported } = await adapter.reportResults(run, [
      { identity: 'shop-v1-TC-LIVE-01', status: 'broken', file: 'live1-result.json' },
    ]);
    assert.deepEqual(reported, ['shop-v1-TC-LIVE-01']);
    assert.deepEqual(await adapter.closeRun(run), { closed: true, alreadyClosed: false });
  });

  after(async () => {
    const request = httpClient({
      baseUrl: process.env.ALLURE_ENDPOINT.trim(),
      headers: { authorization: `Api-Token ${process.env.ALLURE_TOKEN.trim()}` },
    });
    const testCases = new Set();
    for (const id of launches) {
      const page = await request('GET', `api/testresult?launchId=${id}&page=0&size=100`);
      for (const row of page.json?.content ?? []) if (row.testCaseId) testCases.add(row.testCaseId);
      const deleted = await request('DELETE', `api/launch/${id}`);
      if (!deleted.ok) console.error(`could not delete launch ${id}: ${deleted.status}`);
    }
    for (const id of testCases) {
      const deleted = await request('DELETE', `api/testcase/${id}?force=true`);
      if (!deleted.ok) console.error(`could not delete test case ${id}: ${deleted.status}`);
    }
    console.log(`cleaned up ${launches.size} launches and ${testCases.size} test cases`);
  });
}
