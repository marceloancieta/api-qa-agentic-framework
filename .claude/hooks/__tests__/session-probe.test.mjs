import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { runHook, tempProject } from './harness.mjs';

const configFor = (baseUrl) => ({
  project: { name: 'probe-test' },
  api: {
    default_environment: 'local',
    environments: { local: { base_url: baseUrl } },
    auth: { type: 'none' },
  },
  test_management: { provider: 'local' },
});

function context(result) {
  assert.equal(result.code, 0);
  assert.equal(result.output.hookSpecificOutput.hookEventName, 'SessionStart');
  return result.output.hookSpecificOutput.additionalContext;
}

test('reports UP when the API port accepts connections', async () => {
  const server = createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const dir = tempProject({
      config: configFor(`http://127.0.0.1:${server.address().port}/api/v3`),
    });
    const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
    assert.match(text, /API \[local\] \S+: UP/);
    assert.doesNotMatch(text, /qa-config\.json is missing/);
  } finally {
    server.close();
  }
});

test('reports DOWN with the docker hint when a local API is not running', async () => {
  const server = createServer().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const dir = tempProject({ config: configFor(`http://localhost:${port}/api/v3`) });
  const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
  assert.match(text, /: DOWN/);
  assert.match(text, /docker compose up -d petstore/);
});

test('QA_ENV selects the environment and API_BASE_URL overrides it', async () => {
  const dir = tempProject({ config: configFor('http://127.0.0.1:1/api') });
  const text = context(
    await runHook(
      'session-probe.mjs',
      {},
      { projectDir: dir, env: { QA_ENV: 'other', API_BASE_URL: 'not a url' } },
    ),
  );
  assert.match(text, /API \[other\] .*: UNKNOWN/);
});

test('missing config and dependencies are reported, never fatal', async () => {
  const dir = tempProject();
  const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
  assert.match(text, /no qa-config found/i);
  assert.match(text, /npm ci/);
  assert.match(text, /UNKNOWN/);
});
