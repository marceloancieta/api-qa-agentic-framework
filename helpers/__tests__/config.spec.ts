import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  REPO_ROOT,
  actorAuth,
  configuredPacks,
  loadRuntime,
  loadSettings,
  missingEnvVars,
  packVariable,
  requiredEnvVars,
} from '../config';

function configDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'qa-config-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(content));
  }
  return dir;
}

const bearer = { type: 'bearer', env: 'TOKEN' };

const sample = {
  api: {
    default_environment: 'local',
    environments: {
      local: {
        packs: {
          shop: {
            base_url: 'http://localhost:1/api/',
            allow_writes: true,
            auth: bearer,
            actors: { user: { type: 'api_key', in: 'header', name: 'k', env: 'USER_KEY' } },
          },
          'order-desk': { base_url: 'http://localhost:2/', auth: { type: 'none' } },
        },
      },
      shared: {
        packs: {
          shop: { base_url: 'https://shared.example/api', auth: bearer },
        },
      },
    },
  },
  test_management: { provider: 'local' },
  tracker: { key_pattern: 'LOCAL-\\d+', issue_url: 'issues.json#{key}' },
};

const example = () => configDir({ 'qa-config.example.json': sample });

test.describe('loadSettings', () => {
  test('reads the environment and the tools without naming a pack', () => {
    expect(loadSettings({}, example())).toEqual({
      source: 'qa-config.example.json',
      environment: 'local',
      testManagement: 'local',
      tracker: { keyPattern: 'LOCAL-\\d+', issueUrl: 'issues.json#{key}' },
    });
  });

  test('qa-config.json takes precedence over the example', () => {
    const local = { ...sample, api: { ...sample.api, default_environment: 'shared' } };
    const dir = configDir({ 'qa-config.example.json': sample, 'qa-config.json': local });
    expect(loadSettings({}, dir)).toMatchObject({
      source: 'qa-config.json',
      environment: 'shared',
    });
  });

  test('an unknown environment fails and lists the known ones', () => {
    expect(() => loadSettings({ QA_ENV: 'prod' }, example())).toThrow(/"prod".*local, shared/);
  });
});

test.describe('configuredPacks', () => {
  test('lists the packs of the active environment', () => {
    expect(configuredPacks({}, example())).toEqual(['shop', 'order-desk']);
    expect(configuredPacks({ QA_ENV: 'shared' }, example())).toEqual(['shop']);
  });
});

test.describe('loadRuntime', () => {
  test("reads the pack's entry in the default environment and trims trailing slashes", () => {
    expect(loadRuntime('shop', {}, example())).toMatchObject({
      source: 'qa-config.example.json',
      environment: 'local',
      pack: 'shop',
      baseUrl: 'http://localhost:1/api',
      specUrl: null,
      allowWrites: true,
      recovery: null,
      auth: bearer,
      testManagement: 'local',
    });
  });

  test('QA_ENV selects another environment, where writes default to off', () => {
    const qa = loadRuntime('shop', { QA_ENV: 'shared' }, example());
    expect(qa.baseUrl).toBe('https://shared.example/api');
    expect(qa.allowWrites).toBe(false);
    expect(qa.actors).toEqual({});
  });

  test('QA_<PACK>_BASE_URL and QA_<PACK>_SPEC_URL override only their own pack', () => {
    const env = {
      QA_ORDER_DESK_BASE_URL: 'http://other/',
      QA_ORDER_DESK_SPEC_URL: 'http://other/openapi.json',
    };
    const dir = example();
    expect(loadRuntime('order-desk', env, dir)).toMatchObject({
      baseUrl: 'http://other',
      specUrl: 'http://other/openapi.json',
    });
    expect(loadRuntime('shop', env, dir).baseUrl).toBe('http://localhost:1/api');
  });

  test('the old global API_BASE_URL is ignored', () => {
    expect(loadRuntime('shop', { API_BASE_URL: 'http://other' }, example()).baseUrl).toBe(
      'http://localhost:1/api',
    );
  });

  test('a pack the environment does not configure fails with its path and the known packs', () => {
    expect(() => loadRuntime('order-desk', { QA_ENV: 'shared' }, example())).toThrow(
      'qa-config.example.json: environment "shared" has no entry for pack "order-desk" ' +
        '(api.environments.shared.packs.order-desk). Configured packs: shop.',
    );
  });
});

test.describe('packVariable', () => {
  const names: Array<[string, 'BASE_URL' | 'SPEC_URL', string]> = [
    ['petstore', 'BASE_URL', 'QA_PETSTORE_BASE_URL'],
    ['order-desk', 'SPEC_URL', 'QA_ORDER_DESK_SPEC_URL'],
    ['a-b-c2', 'BASE_URL', 'QA_A_B_C2_BASE_URL'],
  ];

  test('upper-cases the pack and turns hyphens into underscores', () => {
    for (const [pack, setting, expected] of names) {
      expect(packVariable(pack, setting)).toBe(expected);
    }
  });

  test('applies the same rule as the contract tools (scripts/lib/cli.mjs)', async () => {
    // A computed specifier: cli.mjs ships no type declarations, so only its one export is typed here.
    const cliUrl = pathToFileURL(join(REPO_ROOT, 'scripts', 'lib', 'cli.mjs')).href;
    const cli = (await import(cliUrl)) as { packVariable: typeof packVariable };
    for (const [pack, setting] of names) {
      expect(cli.packVariable(pack, setting)).toBe(packVariable(pack, setting));
    }
  });
});

test.describe('environment variables', () => {
  test('required names come from the auth config', () => {
    expect(requiredEnvVars({ type: 'none' })).toEqual([]);
    expect(requiredEnvVars({ type: 'bearer', env: 'TOKEN' })).toEqual(['TOKEN']);
    expect(
      requiredEnvVars({ type: 'login', path: 'login', username_env: 'U', password_env: 'P' }),
    ).toEqual(['U', 'P']);
    expect(requiredEnvVars({ type: 'basic', username_env: 'U', password_env: 'P' })).toEqual([
      'U',
      'P',
    ]);
    expect(
      requiredEnvVars({
        type: 'oauth2_client_credentials',
        token_url: 'https://idp.example.test/token',
        client_id_env: 'CID',
        client_secret_env: 'CSEC',
      }),
    ).toEqual(['CID', 'CSEC']);
  });

  test('blank values count as missing', () => {
    expect(missingEnvVars(['A', 'B', 'C'], { A: 'x', B: ' ' })).toEqual(['B', 'C']);
  });
});

test.describe('actorAuth', () => {
  const qa = () => loadRuntime('shop', {}, example());

  test("default is the pack's auth and anonymous sends nothing", () => {
    expect(actorAuth(qa(), 'default')).toEqual(bearer);
    expect(actorAuth(qa(), 'anonymous')).toEqual({ type: 'none' });
  });

  test("a named actor comes from the pack's actors", () => {
    expect(actorAuth(qa(), 'user')).toMatchObject({ type: 'api_key', env: 'USER_KEY' });
  });

  test("an unknown actor fails with the pack's actors path and the known names", () => {
    expect(() => actorAuth(qa(), 'admin')).toThrow(
      'Actor "admin" is not defined in qa-config.example.json ' +
        'api.environments.local.packs.shop.actors. Known: default, anonymous, user.',
    );
  });
});
