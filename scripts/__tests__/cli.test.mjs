import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCli, resolveSpecSource, servicePacks } from '../lib/cli.mjs';

function repoWith(packs, config) {
  const root = mkdtempSync(join(tmpdir(), 'cli-'));
  for (const [name, manifest] of Object.entries(packs)) {
    mkdirSync(join(root, 'services', name), { recursive: true });
    writeFileSync(join(root, 'services', name, 'service.json'), JSON.stringify(manifest));
  }
  if (config) writeFileSync(join(root, 'qa-config.example.json'), JSON.stringify(config));
  return root;
}

const config = {
  api: {
    default_environment: 'local',
    environments: {
      local: { spec_url: 'http://localhost:1/openapi.json' },
      shared: { spec_url: 'https://shared.test/openapi.json' },
    },
  },
};

test('the only pack is the default and its spec file is the source', () => {
  const root = repoWith({ shop: { name: 'shop', spec: 'api.yaml' } });
  assert.deepEqual(servicePacks(root), ['shop']);
  const { source, service } = resolveSpecSource({}, root);
  assert.equal(source, join(root, 'services', 'shop', 'api.yaml'));
  assert.equal(service.name, 'shop');
});

test('with several packs one must be named', () => {
  const root = repoWith({ a: { name: 'a' }, b: { name: 'b' } });
  assert.throws(() => resolveSpecSource({}, root), /--service <name> \(packs: a, b\)/);
  assert.equal(
    resolveSpecSource({ service: 'b' }, root).source,
    join(root, 'services', 'b', 'openapi.json'),
  );
});

test('--spec wins; --live reads the active environment; both together fail', () => {
  const root = repoWith({ shop: { name: 'shop' } }, config);
  assert.equal(resolveSpecSource({ spec: 'x.json' }, root).source, 'x.json');
  assert.equal(
    resolveSpecSource({ live: true }, root, {}).source,
    'http://localhost:1/openapi.json',
  );
  assert.equal(
    resolveSpecSource({ live: true }, root, { QA_ENV: 'shared' }).source,
    'https://shared.test/openapi.json',
  );
  assert.throws(() => resolveSpecSource({ spec: 'x', live: true }, root), /only one of/);
});

test('API_SPEC_URL overrides the environment spec_url for --live, as API_BASE_URL does for runs', () => {
  const root = repoWith({ shop: { name: 'shop' } }, config);
  const env = { QA_ENV: 'shared', API_SPEC_URL: 'http://host.test:8080/openapi.json' };
  assert.equal(resolveSpecSource({ live: true }, root, env).source, env.API_SPEC_URL);
  assert.equal(
    resolveSpecSource({}, root, env).source,
    join(root, 'services', 'shop', 'openapi.json'),
  );
});

test('unknown flags fail', () => {
  assert.throws(() => parseCli({}, ['--nope']), /Unknown option/);
  assert.deepEqual(parseCli({ out: { type: 'string' } }, ['--out', 'f.json', '--live']), {
    live: true,
    out: 'f.json',
  });
});
