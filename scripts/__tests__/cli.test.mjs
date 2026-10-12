import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  activeEnvironment,
  liveSpecUrl,
  packEnvironment,
  packVariable,
  parseCli,
  readTextIfExists,
  resolveSpecSource,
  servicePacks,
} from '../lib/cli.mjs';

test('readTextIfExists reads a file, answers null for a missing one and rethrows other errors', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cli-read-'));
  writeFileSync(join(dir, 'a.txt'), 'content');
  assert.equal(readTextIfExists(join(dir, 'a.txt')), 'content');
  assert.equal(readTextIfExists(join(dir, 'missing.txt')), null);
  assert.throws(
    () => readTextIfExists(dir),
    (error) => error.code !== 'ENOENT',
  );
});

function repoWith(packs, config) {
  const root = mkdtempSync(join(tmpdir(), 'cli-'));
  for (const [name, manifest] of Object.entries(packs)) {
    mkdirSync(join(root, 'services', name), { recursive: true });
    writeFileSync(join(root, 'services', name, 'service.json'), JSON.stringify(manifest));
  }
  if (config) writeFileSync(join(root, 'qa-config.example.json'), JSON.stringify(config));
  return root;
}

const pack = (name, specUrl) => ({
  base_url: `http://${name}.test/api/`,
  ...(specUrl ? { spec_url: specUrl } : {}),
  auth: { type: 'none' },
});

const config = {
  api: {
    default_environment: 'local',
    environments: {
      local: { packs: { shop: pack('shop', 'http://localhost:1/openapi.json') } },
      shared: {
        packs: {
          shop: pack('shop', 'https://shared.test/openapi.json'),
          'my-bank': pack('my-bank'),
        },
      },
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

test('--spec wins; --live reads the pack in the active environment; both together fail', () => {
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

test('--live needs a pack: --service, or the only one', () => {
  const root = repoWith({ shop: { name: 'shop' }, 'my-bank': { name: 'my-bank' } }, config);
  assert.throws(
    () => resolveSpecSource({ live: true }, root, {}),
    /--live needs --service <name> \(packs: my-bank, shop\)/,
  );
  assert.equal(
    resolveSpecSource({ live: true, service: 'shop' }, root, {}).source,
    'http://localhost:1/openapi.json',
  );
});

test('QA_<PACK>_SPEC_URL overrides the pack spec_url for --live, and only that pack', () => {
  const root = repoWith({ shop: { name: 'shop' } }, config);
  const env = { QA_ENV: 'shared', QA_SHOP_SPEC_URL: 'http://host.test:8080/openapi.json' };
  assert.equal(resolveSpecSource({ live: true }, root, env).source, env.QA_SHOP_SPEC_URL);
  assert.equal(liveSpecUrl('shop', root, env), env.QA_SHOP_SPEC_URL);
  assert.equal(
    resolveSpecSource({}, root, env).source,
    join(root, 'services', 'shop', 'openapi.json'),
    'without --live the tracked contract is the source',
  );
  assert.equal(
    liveSpecUrl('my-bank', root, { QA_ENV: 'shared', QA_MY_BANK_SPEC_URL: 'http://b.test/o.json' }),
    'http://b.test/o.json',
    'a hyphen in the pack name becomes an underscore',
  );
  assert.throws(
    () => liveSpecUrl('my-bank', root, { QA_ENV: 'shared', QA_SHOP_SPEC_URL: 'http://x.test' }),
    /qa-config\.example\.json: pack "my-bank" in environment "shared" has no spec_url\./,
  );
});

test('a pack the environment does not configure is an error naming the environment and its packs', () => {
  const root = repoWith({ shop: { name: 'shop' } }, config);
  const missing =
    /qa-config\.example\.json: environment "local" has no entry for pack "my-bank" \(api\.environments\.local\.packs\.my-bank\)\. Configured packs: shop\./;
  assert.throws(() => packEnvironment('my-bank', root, {}), missing);
  assert.throws(() => liveSpecUrl('my-bank', root, {}), missing);
  assert.throws(
    () =>
      resolveSpecSource(
        { live: true, service: 'my-bank' },
        repoWith({ 'my-bank': { name: 'my-bank' } }, config),
        {},
      ),
    missing,
  );
  assert.throws(
    () => activeEnvironment(root, { QA_ENV: 'nope' }),
    /environment "nope" is not defined/,
  );
});

test('packEnvironment: the entry as written, the base URL without trailing slash, and the overrides', () => {
  const root = repoWith({}, config);
  assert.deepEqual(activeEnvironment(root, {}), {
    source: 'qa-config.example.json',
    name: 'local',
    packs: config.api.environments.local.packs,
  });
  const shop = packEnvironment('shop', root, {});
  assert.deepEqual(
    [shop.source, shop.name, shop.pack, shop.baseUrl, shop.specUrl],
    [
      'qa-config.example.json',
      'local',
      'shop',
      'http://shop.test/api',
      'http://localhost:1/openapi.json',
    ],
  );
  assert.deepEqual(shop.config, config.api.environments.local.packs.shop);
  const bank = packEnvironment('my-bank', root, {
    QA_ENV: 'shared',
    QA_MY_BANK_BASE_URL: 'http://override.test//',
  });
  assert.deepEqual([bank.baseUrl, bank.specUrl], ['http://override.test', null]);
  assert.equal(packVariable('my-bank', 'BASE_URL'), 'QA_MY_BANK_BASE_URL');
  assert.equal(packVariable('shop', 'SPEC_URL'), 'QA_SHOP_SPEC_URL');
});

test('unknown flags fail', () => {
  assert.throws(() => parseCli({}, ['--nope']), /Unknown option/);
  assert.deepEqual(parseCli({ out: { type: 'string' } }, ['--out', 'f.json', '--live']), {
    live: true,
    out: 'f.json',
  });
});
