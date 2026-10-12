import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
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

test('the hint names the npm script that starts the pack when package.json has one', async () => {
  const port = await closedPort();
  const dir = tempProject({
    config: configFor({ shop: `http://localhost:${port}/api` }),
    files: { 'package.json': JSON.stringify({ scripts: { 'shop:up': 'docker compose up -d' } }) },
  });
  const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
  assert.match(text, /local API of shop is not running\. Start it \(`npm run shop:up`\)/);
});

/** A project whose scripts/coverage-status.mjs runs `body` (the real script is not copied). */
function withCoverageScript(body) {
  const dir = tempProject({ config: configFor({ petstore: 'http://127.0.0.1:1/api' }) });
  mkdirSync(join(dir, 'scripts'));
  writeFileSync(join(dir, 'scripts', 'coverage-status.mjs'), body);
  return dir;
}

test('the coverage line sums the registries of coverage-status --json --report-only', async () => {
  const status = {
    packs: [
      { registries: [{ cases: 10, automated: 6, byStatus: { published: 4 } }] },
      { registries: [{ cases: 5, automated: 5, byStatus: { published: 0 } }] },
    ],
    findings: [{ rule: 'below-floor' }],
  };
  const dir = withCoverageScript(
    `if (!process.argv.includes('--json') || !process.argv.includes('--report-only')) process.exit(2);\n` +
      `console.log(${JSON.stringify(JSON.stringify(status))});\n`,
  );
  const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
  assert.match(
    text,
    /Coverage \(scripts\/coverage-status\.mjs\): 15 designed, 11 automated, 4 published in 2 registries; 1 finding\(s\)/,
  );
});

test('a coverage-status that fails is reported as unknown, never left out', async () => {
  const dir = withCoverageScript('process.exit(2);\n');
  const text = context(await runHook('session-probe.mjs', {}, { projectDir: dir }));
  assert.match(
    text,
    /Coverage \(scripts\/coverage-status\.mjs\): unknown \(coverage-status failed\)/,
  );
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
