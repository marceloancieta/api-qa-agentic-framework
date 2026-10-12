import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { runHook, tempProject } from './harness.mjs';

const AUTH = { type: 'api_key', in: 'header', name: 'api_key', env: 'API_KEY' };

/** A qa-config whose `local` environment configures `packs` ({ name: baseUrl }). */
const configFor = (packs) => ({
  project: { name: 'probe-test' },
  api: {
    default_environment: 'local',
    environments: {
      local: {
        packs: Object.fromEntries(
          Object.entries(packs).map(([name, baseUrl]) => [name, { base_url: baseUrl, auth: AUTH }]),
        ),
      },
    },
  },
  test_management: { provider: 'local' },
});

function context(result) {
  assert.equal(result.code, 0);
  assert.equal(result.output.hookSpecificOutput.hookEventName, 'SessionStart');
  return result.output.hookSpecificOutput.additionalContext;
}

async function listening() {
  const server = createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return server;
}

async function closedPort() {
  const server = await listening();
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('reports UP when the API port accepts connections', async () => {
  const server = await listening();
  try {
    const dir = tempProject({
      config: configFor({ petstore: `http://127.0.0.1:${server.address().port}/api/v3` }),
    });
    const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
    assert.match(text, /API \[local\] petstore \S+: UP/);
    assert.doesNotMatch(text, /qa-config\.json is missing/);
  } finally {
    server.close();
  }
});

test('reports DOWN with the docker hint naming the pack when a local API is not running', async () => {
  const port = await closedPort();
  const dir = tempProject({ config: configFor({ petstore: `http://localhost:${port}/api/v3` }) });
  const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
  assert.match(text, /API \[local\] petstore \S+: DOWN/);
  assert.match(text, /local API of petstore is not running/);
  assert.match(text, /docker compose up -d <service>/);
});

test('reports one line per pack of the environment', async () => {
  const server = await listening();
  try {
    const port = await closedPort();
    const dir = tempProject({
      config: configFor({
        petstore: `http://127.0.0.1:${server.address().port}/api/v3`,
        'order-api': `http://localhost:${port}/orders`,
      }),
    });
    const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
    assert.match(text, /API \[local\] petstore \S+: UP/);
    assert.match(text, /API \[local\] order-api \S+: DOWN/);
    assert.match(text, /local API of order-api is not running/);
    assert.doesNotMatch(text, /local API of petstore/);
  } finally {
    server.close();
  }
});

test('QA_<PACK>_BASE_URL overrides the base URL of that pack only', async () => {
  const dir = tempProject({
    config: configFor({ petstore: 'http://127.0.0.1:1/api', 'order-api': 'also not a url' }),
  });
  const text = context(
    await runHook(
      'session-probe.mjs',
      {},
      { projectDir: dir, env: { QA_PETSTORE_BASE_URL: 'not a url' } },
    ),
  );
  assert.match(text, /API \[local\] petstore not a url: UNKNOWN \(base_url is not a valid URL\)/);
  assert.match(text, /API \[local\] order-api also not a url: UNKNOWN/);
});

test('hyphens in a pack name become underscores in its override variable', async () => {
  const dir = tempProject({ config: configFor({ 'order-api': 'http://127.0.0.1:1/orders' }) });
  const text = context(
    await runHook(
      'session-probe.mjs',
      {},
      { projectDir: dir, env: { QA_ORDER_API_BASE_URL: 'not a url' } },
    ),
  );
  assert.match(text, /API \[local\] order-api not a url: UNKNOWN/);
});

test('QA_ENV selects the environment; one without packs is reported', async () => {
  const dir = tempProject({ config: configFor({ petstore: 'http://127.0.0.1:1/api' }) });
  const text = context(
    await runHook('session-probe.mjs', {}, { projectDir: dir, env: { QA_ENV: 'other' } }),
  );
  assert.match(text, /API \[other\]: UNKNOWN \(no packs configured for this environment\)/);
  assert.doesNotMatch(text, /petstore/);
});

test('missing config and dependencies are reported, never fatal', async () => {
  const dir = tempProject();
  const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
  assert.match(text, /no qa-config found/i);
  assert.match(text, /npm ci/);
  assert.match(text, /API \[no environment\]: UNKNOWN/);
});
