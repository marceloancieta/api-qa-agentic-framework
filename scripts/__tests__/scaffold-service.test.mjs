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
