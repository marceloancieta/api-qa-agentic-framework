import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalize } from '../lib/openapi.mjs';
import {
  apiName,
  authVariables,
  camelCase,
  describePlan,
  packVersion,
  planPack,
  suggestAuth,
  suggestCode,
  suggestPackEntry,
  writePlan,
} from '../scaffold-service.mjs';

const SPEC = join(import.meta.dirname, '..', '__fixtures__', 'openapi', 'petstore-v3.json');
const NOW = new Date('2026-10-09T12:00:00Z');

test('the plan names resources, clients, codes and files, and writes nothing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scaffold-'));
  const plan = await planPack({ name: 'shop', spec: SPEC, root, now: NOW });
  assert.equal(plan.version, 'v3', 'the version comes from the server path');
  assert.deepEqual(
    plan.resources.map((r) => [r.resource, r.className, r.fixture, r.code]),
    [
      ['pet', 'PetClient', 'pet', 'PET'],
      ['store', 'StoreClient', 'store', 'STORE'],
      ['user', 'UserClient', 'user', 'USER'],
    ],
  );
  // Most Petstore operations accept the OAuth2 scheme, so a bearer token is suggested.
  assert.deepEqual(plan.auth, { type: 'bearer', env: 'SHOP_TOKEN' });
  // The server is relative, so the suggested qa-config entry leaves the host to fill in.
  assert.deepEqual(plan.packEntry, {
    base_url: 'https://<host>/api/v3',
    auth: { type: 'bearer', env: 'SHOP_TOKEN' },
  });
  assert.match(
    describePlan(plan),
    /Suggested qa-config entry api\.environments\.<env>\.packs\.shop: \{"base_url":"https:\/\/<host>\/api\/v3","auth":\{"type":"bearer","env":"SHOP_TOKEN"\}\}/,
  );
  assert.ok(plan.files.has('services/shop/clients/pet-client.ts'));
  assert.ok(plan.files.has('.claude/skills/shop-api/SKILL.md'));
  assert.match(describePlan(plan), /Resources:\n {2}pet/);
  assert.ok(!existsSync(join(root, 'services')), 'planning writes nothing');
});

test('written files: clients per operation, fixtures, smoke for parameterless GETs, filled skill', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scaffold-'));
  const plan = await planPack({ name: 'shop', spec: SPEC, root, now: NOW });
  writePlan(plan, root);
  const read = (file) => readFileSync(join(root, file), 'utf8');

  const pet = read('services/shop/clients/pet-client.ts');
  assert.match(pet, /export class PetClient extends BaseClient/);
  assert.match(
    pet,
    /getPetById\(petId: number \| string, options: RequestOptions = \{\}\): Promise<APIResponse> \{\n {4}return this\.get\(this\.route\('pet\/\{petId\}', \{ petId \}\), options\);/,
  );
  assert.match(
    read('services/shop/fixtures.ts'),
    /pet: new PetClient\(request, auth, redaction\),/,
  );
  const smoke = read('services/shop/specs/smoke.spec.ts');
  assert.match(smoke, /GET \/store\/inventory answers a declared success status/);
  assert.doesNotMatch(
    smoke,
    /findPetsByStatus/,
    'operations with required parameters are left out',
  );

  const readme = read('services/shop/README.md');
  assert.match(
    readme,
    /`api\.environments\.<env>\.packs\.shop` in\s+`qa-config\.json`\. `base_url` and `auth` are required/,
  );
  assert.ok(
    readme.includes(JSON.stringify(plan.packEntry)),
    'the README shows the suggested entry',
  );
  assert.match(readme, /`QA_SHOP_BASE_URL` and `QA_SHOP_SPEC_URL` override the URLs for one run/);
  assert.match(readme, /npx playwright test --project=api-shop/);
  assert.doesNotMatch(readme, /api\.auth/, 'there is no global auth any more');

  const manifest = JSON.parse(read('services/shop/service.json'));
  assert.deepEqual(
    [manifest.name, manifest.version, manifest.spec],
    ['shop', 'v3', 'openapi.json'],
  );
  const skill = read('.claude/skills/shop-api/SKILL.md');
  assert.match(skill, /^---\nname: shop-api\n/);
  assert.doesNotMatch(skill, /\{\{[A-Z]+\}\}/, 'every template token is filled');
  assert.match(skill, /\| `pet` \| `PetClient` \| `pet` \| 8 \| `PET` \|/);

  assert.throws(
    () => writePlan(plan, root),
    /services\/shop already exists; a pack is never overwritten/,
  );
});

test('the suggested pack entry takes the first absolute server as base_url', () => {
  const auth = { type: 'none' };
  const entry = (servers) => suggestPackEntry({ servers }, auth);
  assert.deepEqual(entry(['/v1', 'https://api.example/v1', 'http://b.example']), {
    base_url: 'https://api.example/v1',
    auth,
  });
  assert.deepEqual(entry(['/v1']), { base_url: 'https://<host>/v1', auth });
  assert.deepEqual(entry([]), { base_url: 'https://<host>', auth });
});

test('names, versions and codes are derived safely', () => {
  assert.equal(camelCase('find-pets_by status'), 'findPetsByStatus');
  assert.equal(camelCase('2fa'), '_2fa');
  const model = (servers, version) => ({ servers, info: { version } });
  assert.equal(packVersion(model(['https://x.example/api/v2'], '9.0'), undefined), 'v2');
  assert.equal(packVersion(model([], '1.4.0'), undefined), 'v1');
  assert.equal(packVersion(model([], null), 'beta'), 'beta');
  const taken = new Set();
  assert.deepEqual(
    ['orders', 'Orders', 'x', '3d models'].map((name) => suggestCode(name, taken)),
    ['ORDERS', 'ORDER2', 'XX', 'R3DMOD'],
  );
});

test('the skill names the API once, whether or not its title ends in "API"', async () => {
  assert.equal(apiName('Shop'), 'Shop API');
  assert.equal(apiName('Swagger Petstore (OpenAPI 3.0)'), 'Swagger Petstore (OpenAPI 3.0) API');
  assert.equal(apiName('Keycloak Admin REST API'), 'Keycloak Admin REST API');
  assert.equal(apiName('Shop api '), 'Shop api', 'case and trailing space do not matter');
  assert.equal(apiName('Shop RAPI'), 'Shop RAPI API', 'only the whole word counts');
  const description = async (title) => {
    const plan = await planPack({ name: 'shop', spec: SPEC, title, now: NOW });
    return plan.files.get('.claude/skills/shop-api/SKILL.md');
  };
  const ending = await description('Shop Admin REST API');
  assert.match(ending, /about the Shop Admin REST API, tested by/);
  assert.doesNotMatch(ending, /API API/);
  assert.match(await description('Shop'), /about the Shop API, tested by/);
});

test('a bad name or a missing spec is refused before anything is read', async () => {
  await assert.rejects(planPack({ name: 'Shop', spec: SPEC }), /--name must match/);
  await assert.rejects(planPack({ name: 'shop' }), /--spec <file\|url> is required/);
});

test('--skill-only writes just the skill, and only for an existing pack', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scaffold-'));
  const plan = await planPack({ name: 'shop', spec: SPEC, root, now: NOW });
  assert.throws(() => writePlan(plan, root, { skillOnly: true }), /needs an existing pack/);
  mkdirSync(join(root, 'services', 'shop'), { recursive: true });
  assert.deepEqual(writePlan(plan, root, { skillOnly: true }), [
    '.claude/skills/shop-api/SKILL.md',
  ]);
  assert.ok(!existsSync(join(root, 'services', 'shop', 'service.json')), 'the pack is not touched');
});

const SHELTER_YAML = join(import.meta.dirname, '..', '__fixtures__', 'openapi', 'shelter-3.1.yaml');

test('service.json never carries the --spec value: no machine path, no host', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scaffold-'));
  const plan = await planPack({ name: 'shop', spec: SPEC, root, now: NOW });
  const manifest = JSON.parse(plan.files.get('services/shop/service.json'));
  assert.equal(
    manifest.description,
    'Swagger Petstore - OpenAPI 3.0, scaffolded on 2026-10-09 from its openapi.json.',
  );
  for (const content of plan.files.values()) {
    assert.ok(!content.includes(SPEC), 'no generated file names the source path');
  }
});

test('the plan lists every smoke operation, and --skip-smoke leaves one out', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scaffold-'));
  const all = await planPack({ name: 'shop', spec: SPEC, root, now: NOW });
  assert.match(
    describePlan(all),
    /Smoke tests: 3 GET operation\(s\)[^\n]*--skip-smoke[^\n]*\n {2}GET \/store\/inventory\n {2}GET \/user\/login\n {2}GET \/user\/logout/,
  );
  const trimmed = await planPack({
    name: 'shop',
    spec: SPEC,
    root,
    now: NOW,
    skipSmoke: ['GET  /user/logout'],
  });
  assert.deepEqual(
    trimmed.smoke.map(({ method }) => method.operation.key),
    ['GET /store/inventory', 'GET /user/login'],
  );
  assert.match(describePlan(trimmed), /left out: GET {2}\/user\/logout/);
  assert.doesNotMatch(trimmed.files.get('services/shop/specs/smoke.spec.ts'), /user\/logout/);
  await assert.rejects(
    planPack({ name: 'shop', spec: SPEC, root, now: NOW, skipSmoke: ['GET /user/logoff'] }),
    /--skip-smoke "GET \/user\/logoff" is not an operation of the contract/,
  );
});

test('the contract fixture parses YAML for a YAML contract and JSON otherwise', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scaffold-'));
  const yaml = await planPack({ name: 'shelter', spec: SHELTER_YAML, root, now: NOW });
  const yamlFixtures = yaml.files.get('services/shelter/fixtures.ts');
  assert.equal(yaml.specFile, 'openapi.yaml');
  assert.match(yamlFixtures, /import \{ parse as parseYaml \} from 'yaml';/);
  assert.match(
    yamlFixtures,
    /\.ya\?ml\$\/\.test\(file\) \? parseYaml\(text\) : JSON\.parse\(text\)/,
  );
  const json = await planPack({ name: 'shop', spec: SPEC, root, now: NOW });
  const jsonFixtures = json.files.get('services/shop/fixtures.ts');
  assert.doesNotMatch(jsonFixtures, /yaml/);
  assert.match(jsonFixtures, /JSON\.parse\(readFileSync\(file, 'utf8'\)\)/);
});

// Small contracts for the auth suggestion: `schemes` by name, one GET per entry of `uses`, each
// accepting the schemes it lists.
const openapi3 = (schemes, uses, servers = []) => ({
  openapi: '3.0.3',
  info: { title: 'Shop', version: '1.0.0' },
  servers: servers.map((url) => ({ url })),
  components: { securitySchemes: schemes },
  paths: Object.fromEntries(
    uses.map((names, index) => [
      `/r${index}`,
      {
        get: {
          security: names.map((name) => ({ [name]: [] })),
          responses: { 200: { description: 'OK' } },
        },
      },
    ]),
  ),
});
const swagger2 = (definitions, uses, { host, basePath } = {}) => ({
  swagger: '2.0',
  info: { title: 'Shop', version: '1.0.0' },
  ...(host ? { host } : {}),
  ...(basePath ? { basePath } : {}),
  securityDefinitions: definitions,
  paths: Object.fromEntries(
    uses.map((names, index) => [
      `/r${index}`,
      {
        get: {
          security: names.map((name) => ({ [name]: [] })),
          responses: { 200: { description: 'OK' } },
        },
      },
    ]),
  ),
});
const suggest = (doc) => suggestAuth(normalize(doc), 'shop');
const BASIC = { type: 'basic', username_env: 'SHOP_USERNAME', password_env: 'SHOP_PASSWORD' };
const clientCredentials = (tokenUrl) => ({
  type: 'oauth2_client_credentials',
  token_url: tokenUrl,
  client_id_env: 'SHOP_CLIENT_ID',
  client_secret_env: 'SHOP_CLIENT_SECRET',
});

test('an http basic scheme suggests basic auth, in OpenAPI 3.x and Swagger 2.0', () => {
  assert.deepEqual(
    suggest(openapi3({ creds: { type: 'http', scheme: 'Basic' } }, [['creds']])),
    BASIC,
  );
  assert.deepEqual(suggest(swagger2({ creds: { type: 'basic' } }, [['creds']])), BASIC);
});

test('an oauth2 client credentials grant suggests that grant, its token URL made absolute', () => {
  const flows = (tokenUrl) => ({
    oauth: {
      type: 'oauth2',
      flows: { clientCredentials: { tokenUrl, scopes: { 'read:items': 'read' } } },
    },
  });
  const uses = [['oauth']];
  assert.deepEqual(
    suggest(openapi3(flows('https://auth.example.test/oauth/token'), uses, ['/v1'])),
    clientCredentials('https://auth.example.test/oauth/token'),
    'an absolute token URL is kept as declared',
  );
  assert.deepEqual(
    suggest(openapi3(flows('/oauth/token'), uses, ['/v1', 'https://api.example.test/v1'])),
    clientCredentials('https://api.example.test/oauth/token'),
    'a relative token URL resolves against the first absolute server',
  );
  assert.deepEqual(
    suggest(openapi3(flows('oauth/token'), uses, ['https://api.example.test/v1/'])),
    clientCredentials('https://api.example.test/v1/oauth/token'),
  );
  assert.deepEqual(
    suggest(openapi3(flows('/oauth/token'), uses, ['/v1'])),
    clientCredentials('https://<host>/oauth/token'),
    'without an absolute server the host is left to fill in',
  );
  assert.deepEqual(
    suggest(openapi3(flows('/oauth/token'), uses)),
    clientCredentials('https://<host>/oauth/token'),
  );
  const suggested = suggest(openapi3(flows('/oauth/token'), uses));
  assert.ok(!('scope' in suggested), 'scopes are set by hand, never all of the declared ones');
});

test('a Swagger 2.0 oauth2 application flow suggests client credentials', () => {
  const application = (tokenUrl) => ({
    oauth: { type: 'oauth2', flow: 'application', tokenUrl, scopes: {} },
  });
  assert.deepEqual(
    suggest(swagger2(application('https://auth.example.test/token'), [['oauth']])),
    clientCredentials('https://auth.example.test/token'),
  );
  assert.deepEqual(
    suggest(
      swagger2(application('/token'), [['oauth']], { host: 'api.example.test', basePath: '/v2' }),
    ),
    clientCredentials('https://api.example.test/token'),
    'a relative token URL resolves against the host',
  );
});

test('other oauth2 grants, openIdConnect and http bearer still suggest a bearer token', () => {
  const bearer = { type: 'bearer', env: 'SHOP_TOKEN' };
  const implicit = {
    type: 'oauth2',
    flows: { implicit: { authorizationUrl: 'https://auth.example.test/authorize', scopes: {} } },
  };
  assert.deepEqual(suggest(openapi3({ oauth: implicit }, [['oauth']])), bearer);
  assert.deepEqual(
    suggest(
      swagger2(
        {
          oauth: {
            type: 'oauth2',
            flow: 'password',
            tokenUrl: 'https://auth.example.test/token',
            scopes: {},
          },
        },
        [['oauth']],
      ),
    ),
    bearer,
  );
  assert.deepEqual(
    suggest(
      openapi3(
        { oidc: { type: 'openIdConnect', openIdConnectUrl: 'https://auth.example.test/.wk' } },
        [['oidc']],
      ),
    ),
    bearer,
  );
  assert.deepEqual(
    suggest(openapi3({ jwt: { type: 'http', scheme: 'bearer' } }, [['jwt']])),
    bearer,
  );
});

test('the most used scheme wins between basic and an API key, declaration order breaks ties', () => {
  const schemes = {
    key: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
    creds: { type: 'http', scheme: 'basic' },
  };
  const apiKey = { type: 'api_key', in: 'header', name: 'X-Api-Key', env: 'SHOP_API_KEY' };
  assert.deepEqual(suggest(openapi3(schemes, [['creds'], ['creds'], ['key']])), BASIC);
  assert.deepEqual(suggest(openapi3(schemes, [['key'], ['key'], ['creds']])), apiKey);
  assert.deepEqual(suggest(openapi3(schemes, [['creds'], ['key']])), apiKey, 'tie: key first');
});

test('the plan, README and skill name both variables of the new auth types', async () => {
  assert.deepEqual(authVariables(BASIC), ['SHOP_USERNAME', 'SHOP_PASSWORD']);
  assert.deepEqual(authVariables(clientCredentials('https://a.example.test/t')), [
    'SHOP_CLIENT_ID',
    'SHOP_CLIENT_SECRET',
  ]);
  assert.deepEqual(authVariables({ type: 'bearer', env: 'SHOP_TOKEN' }), ['SHOP_TOKEN']);
  assert.deepEqual(authVariables({ type: 'none' }), []);

  const root = mkdtempSync(join(tmpdir(), 'scaffold-'));
  const spec = join(root, 'shop.json');
  const oauth = {
    type: 'oauth2',
    flows: { clientCredentials: { tokenUrl: '/oauth/token', scopes: {} } },
  };
  writeFileSync(
    spec,
    JSON.stringify(openapi3({ oauth }, [['oauth']], ['https://api.example.test/v1'])),
  );
  const plan = await planPack({ name: 'shop', spec, root, now: NOW });
  assert.deepEqual(plan.auth, clientCredentials('https://api.example.test/oauth/token'));
  assert.match(
    describePlan(plan),
    /\n {2}Set SHOP_CLIENT_ID and SHOP_CLIENT_SECRET in the environment or the local \.env, never in qa-config\.\n {2}Add scope \(space-separated\) by hand/,
  );
  const readme = plan.files.get('services/shop/README.md');
  assert.match(readme, /Set `SHOP_CLIENT_ID` and `SHOP_CLIENT_SECRET` in the environment/);
  assert.match(readme, /Add `scope` \(space-separated\) by hand/);
  const skill = plan.files.get('.claude/skills/shop-api/SKILL.md');
  assert.match(skill, /`oauth` \(oauth2, clientCredentials\)/);
  assert.ok(skill.includes(JSON.stringify(plan.auth)), 'the skill shows the suggested auth');

  writeFileSync(spec, JSON.stringify(swagger2({ creds: { type: 'basic' } }, [['creds']])));
  const basic = await planPack({ name: 'shop', spec, root, now: NOW });
  assert.match(
    basic.files.get('services/shop/README.md'),
    /Set `SHOP_USERNAME` and `SHOP_PASSWORD` in the environment/,
  );
  assert.doesNotMatch(describePlan(basic), /scope/);
});
