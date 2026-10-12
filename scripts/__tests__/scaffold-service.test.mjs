import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  camelCase,
  describePlan,
  packVersion,
  planPack,
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
