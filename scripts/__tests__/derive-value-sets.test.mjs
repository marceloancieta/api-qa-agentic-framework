// Value set extraction and generated names (CON-08).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadModel, normalize } from '../lib/openapi.mjs';
import {
  baseNames,
  closedSet,
  deriveValueSets,
  keyHash,
  literalAlternatives,
  renderEnums,
} from '../derive-value-sets.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const OPENAPI = join(import.meta.dirname, '..', '__fixtures__', 'openapi');
const OWN = join(import.meta.dirname, '..', '__fixtures__', 'derive-value-sets');
const byKey = (sets) => Object.fromEntries(sets.map((set) => [set['key'], set]));

test('shelter in Swagger 2.0, OpenAPI 3.0 and 3.1 yields the same value sets', async () => {
  const [v2, v30, v31] = await Promise.all(
    ['shelter-2.0.json', 'shelter-3.0.json', 'shelter-3.1.yaml'].map((name) =>
      loadModel(join(OPENAPI, name)).then(deriveValueSets),
    ),
  );
  assert.deepEqual(v30, v2);
  assert.deepEqual(v31, v2);
  assert.deepEqual(
    v2.map((set) => [set['key'], set.values, set.typeName, set.constName]),
    [['Animal.status', ['active', 'adopted'], 'AnimalStatus', 'ANIMAL_STATUS_VALUES']],
  );
});

test('Petstore value sets come from schemas and from the findByStatus parameter', async () => {
  for (const name of ['petstore-v2.json', 'petstore-v3.json']) {
    const sets = byKey(deriveValueSets(await loadModel(join(OPENAPI, name))));
    assert.deepEqual(sets['Pet.status'].values, ['available', 'pending', 'sold']);
    assert.equal(sets['Pet.status'].typeName, 'PetStatus');
    assert.equal(sets['Order.status'].constName, 'ORDER_STATUS_VALUES');
    const param = Object.values(sets).find((set) => set.kind === 'parameter');
    assert.equal(param.operation, 'GET /pet/findByStatus');
    assert.equal(param.typeName, 'FindPetsByStatusStatusParam');
  }
});

test('only fully anchored alternations of plain literals are closed patterns', () => {
  assert.deepEqual(literalAlternatives('^(a|b|c)$'), ['a', 'b', 'c']);
  assert.deepEqual(literalAlternatives('^(?:x|y)$'), ['x', 'y']);
  assert.deepEqual(literalAlternatives('^(v1\\.0|v2\\.0)$'), ['v1.0', 'v2.0']);
  assert.deepEqual(literalAlternatives('^only$'), ['only']);
  for (const open of ['^a|b$', '^(a)|(b)$', '^[a-z]+$', '^(a|b)+$', '^\\d$', '(a|b)', '^a', 7]) {
    assert.equal(literalAlternatives(open), null, String(open));
  }
});

test('a closed set drops duplicates and turns a null member into nullability', () => {
  assert.deepEqual(closedSet({ enum: ['a', 'b', 'a', null] }), {
    source: 'enum',
    values: ['a', 'b'],
    nullable: true,
  });
  assert.deepEqual(closedSet({ const: 0 }), { source: 'const', values: [0], nullable: false });
  assert.deepEqual(closedSet({ type: ['string', 'null'], pattern: '^(on|off)$' }), {
    source: 'pattern',
    values: ['on', 'off'],
    nullable: true,
  });
  assert.equal(closedSet({ enum: [null] }), null);
  assert.equal(closedSet({ type: 'string' }), null);
});

test('sets are found in nested properties, items, maps, compositions, parameters and inline bodies', async () => {
  const sets = byKey(deriveValueSets(await loadModel(join(OWN, 'kinds.json'))));
  assert.deepEqual(Object.keys(sets), [
    'Owner.allOf[0].role',
    'Shipment.flags{}',
    'Shipment.parcel.kind',
    'Shipment.size',
    'Shipment.status',
    'Shipment.tags[]',
    'Shipment.version',
    'ShipmentStatus',
    'Shipment["x.y"]',
    'GET /labels header:format',
    'POST /shipments/{carrier} body.priority',
    'POST /shipments/{carrier} path:carrier',
    'POST /shipments/{carrier} query:speed[]',
    'POST /shipments/{carrier} response 200.state',
  ]);
  assert.equal(sets['Shipment.size'].nullable, true);
  assert.deepEqual(sets['POST /shipments/{carrier} body.priority'].values, [1, 2, 3]);
  assert.equal(sets['Owner.allOf[0].role'].typeName, 'OwnerRole', 'structural steps add no words');
  assert.equal(sets['Shipment["x.y"]'].typeName, 'ShipmentXY');
  assert.equal(sets['GET /labels header:format'].typeName, 'GetLabelsFormatParam');
  assert.equal(sets['POST /shipments/{carrier} path:carrier'].source, 'pattern');
});

test('clashing names all carry the hash of their own key', async () => {
  const sets = byKey(deriveValueSets(await loadModel(join(OWN, 'kinds.json'))));
  const property = sets['Shipment.status'];
  const named = sets['ShipmentStatus'];
  assert.equal(property.typeName, `ShipmentStatus_${keyHash('Shipment.status')}`);
  assert.equal(named.typeName, `ShipmentStatus_${keyHash('ShipmentStatus')}`);
  assert.equal(
    named.constName,
    `SHIPMENT_STATUS_${keyHash('ShipmentStatus').toUpperCase()}_VALUES`,
  );
  const all = Object.values(sets);
  assert.equal(new Set(all.map((set) => set.typeName)).size, all.length);
  assert.equal(new Set(all.map((set) => set.constName)).size, all.length);
});

test('names depend on keys, not on the order of the document', () => {
  const schemas = {
    B: { type: 'object', properties: { kind: { enum: ['x'] } } },
    A: { type: 'object', properties: { kind: { enum: ['y'] } } },
  };
  const reversed = Object.fromEntries(Object.entries(schemas).reverse());
  const derive = (components) =>
    deriveValueSets(
      normalize({ openapi: '3.1.0', paths: {}, components: { schemas: components } }),
    );
  assert.deepEqual(derive(reversed), derive(schemas));
  assert.deepEqual(baseNames(['HTTPStatus', 'code']), {
    typeName: 'HttpStatusCode',
    constName: 'HTTP_STATUS_CODE_VALUES',
  });
  assert.deepEqual(baseNames(['2fa', 'mode']).typeName, 'N2faMode');
  assert.deepEqual(baseNames(['--']).constName, 'VALUE_VALUES');
});

test('the generated module exports a constant and a union per set', () => {
  const text = renderEnums(
    [
      {
        key: 'Pet.status',
        source: 'enum',
        values: ['a', 'b'],
        nullable: false,
        typeName: 'PetStatus',
        constName: 'PET_STATUS_VALUES',
      },
    ],
    'api.json',
  );
  assert.match(text, /^\/\/ Generated by scripts\/derive-value-sets\.mjs from api\.json\./);
  assert.match(text, /export const PET_STATUS_VALUES = \["a", "b"\] as const;/);
  assert.match(text, /export type PetStatus = \(typeof PET_STATUS_VALUES\)\[number\];/);
});

test('the committed Petstore files are current', () => {
  const run = spawnSync(
    process.execPath,
    ['scripts/derive-value-sets.mjs', '--service', 'petstore', '--check'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stderr);
  const generated = JSON.parse(
    readFileSync(join(ROOT, 'services', 'petstore', 'generated', 'value-sets.json'), 'utf8'),
  );
  assert.deepEqual(
    generated.valueSets.map((set) => set.typeName),
    ['OrderStatus', 'PetStatus', 'FindPetsByStatusStatusParam'],
  );
});
