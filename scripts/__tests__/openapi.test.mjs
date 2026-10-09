// Normalizer tests (CON-01) and the cross-version equivalence self-test (CON-02).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  loadModel,
  normalize,
  objectShape,
  parseDocument,
  refName,
  resolveSchema,
} from '../lib/openapi.mjs';

const FIXTURES = join(import.meta.dirname, '..', '__fixtures__', 'openapi');
const fixture = (name) => loadModel(join(FIXTURES, name));
const withoutOrigin = ({ format: _format, specVersion: _version, ...rest }) => rest;
const operation = (model, id) => model.operations.find((op) => op['key'] === id);

test('the same resource in Swagger 2.0, OpenAPI 3.0 and OpenAPI 3.1 (YAML) yields the same model', async () => {
  const v2 = await fixture('shelter-2.0.json');
  const v30 = await fixture('shelter-3.0.json');
  const v31 = await fixture('shelter-3.1.yaml');
  assert.deepEqual(
    [v2.format, v30.format, v31.format],
    ['swagger-2.0', 'openapi-3.0', 'openapi-3.1'],
  );
  assert.deepEqual(withoutOrigin(v30), withoutOrigin(v2));
  assert.deepEqual(withoutOrigin(v31), withoutOrigin(v2));
});

test('the shared model has the expected shape', async () => {
  const model = await fixture('shelter-3.0.json');
  assert.deepEqual(model.servers, ['https://api.example.test/v1']);
  assert.deepEqual(model.securitySchemes, {
    apiKey: { type: 'apiKey', in: 'header', name: 'X-Api-Key' },
  });
  assert.deepEqual(model.problems, []);

  const create = operation(model, 'POST /animals');
  assert.deepEqual(create.security, [['apiKey']], 'inherits document security');
  assert.equal(create.requestBody.required, true);
  assert.deepEqual(create.requestBody.schema, { $ref: '#/schemas/Animal' });
  assert.deepEqual(
    create.responses.map((r) => r.status),
    ['201', '400'],
  );
  assert.deepEqual(
    create.responses[1].schema,
    { $ref: '#/schemas/Error' },
    'response $ref followed',
  );

  const read = operation(model, 'GET /animals/{animalId}');
  assert.deepEqual(read.security, [], 'an empty operation security overrides the document');
  assert.deepEqual(
    read.parameters.map((p) => [p.in, p.name, p.required]),
    [
      ['path', 'animalId', true],
      ['query', 'verbose', false],
    ],
  );
  assert.deepEqual(read.responses[1], {
    status: '404',
    description: 'Not found',
    content: {},
    schema: null,
  });

  const animal = model.schemas.Animal;
  assert.deepEqual(animal.properties.nickname, { type: ['string', 'null'] });
  assert.deepEqual(animal.properties.weight, { type: 'number', exclusiveMinimum: 0 });
  assert.deepEqual(animal.properties.name.examples, ['Rex']);
  assert.deepEqual(animal.properties.tags.items, { $ref: '#/schemas/Tag' });
});

test('YAML and JSON documents parse to the same object', () => {
  assert.deepEqual(parseDocument('openapi: 3.1.0\ninfo: { title: T }'), {
    openapi: '3.1.0',
    info: { title: 'T' },
  });
  assert.deepEqual(parseDocument('{"openapi":"3.1.0"}'), { openapi: '3.1.0' });
  assert.throws(
    () => parseDocument('{ broken', 'spec.json'),
    /spec\.json is neither valid JSON nor valid YAML/,
  );
});

test('versions other than 2.0, 3.0.x and 3.1.x are rejected', () => {
  for (const doc of [{ openapi: '3.2.0' }, { swagger: '1.2' }, {}, null]) {
    assert.throws(() => normalize(doc), /Unsupported API description version/);
  }
});

test('invalid content is reported as a problem, never fatal', () => {
  const model = normalize({
    openapi: '3.0.0',
    paths: {},
    components: {
      schemas: {
        Code: { type: 'string', pattern: '(unclosed' },
        Remote: { $ref: 'https://example.test/schemas.json#/Remote' },
      },
    },
  });
  assert.deepEqual(model.schemas.Code, { type: 'string', 'x-invalid-pattern': '(unclosed' });
  assert.deepEqual(model.schemas.Remote, {});
  assert.deepEqual(
    model.problems.map((p) => p.where),
    ['schema Code', 'schema Remote'],
  );
  assert.match(model.problems[0].message, /pattern does not compile/);
  assert.match(model.problems[1].message, /external reference/);
});

test('OpenAPI 3.0 nullability and bounds become 2020-12 keywords', () => {
  const model = normalize({
    openapi: '3.0.0',
    paths: {},
    components: {
      schemas: {
        Ref: { $ref: '#/components/schemas/Other', nullable: true },
        Choice: { type: 'string', enum: ['a', 'b'], nullable: true },
        Inclusive: { type: 'number', minimum: 1, exclusiveMinimum: false },
        Keywords: { type: 'object', properties: { nullable: { type: 'boolean' } } },
        Other: { type: 'string' },
      },
    },
  });
  assert.deepEqual(model.schemas.Ref, { anyOf: [{ $ref: '#/schemas/Other' }, { type: 'null' }] });
  assert.deepEqual(model.schemas.Choice, { type: ['string', 'null'], enum: ['a', 'b', null] });
  assert.deepEqual(model.schemas.Inclusive, { type: 'number', minimum: 1 });
  assert.deepEqual(
    model.schemas.Keywords.properties,
    { nullable: { type: 'boolean' } },
    'a property name is not a keyword',
  );
});

test('operation parameters override path-level ones with the same location and name', () => {
  const model = normalize({
    openapi: '3.0.0',
    paths: {
      '/items': {
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', maximum: 10 } }],
        get: {
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', maximum: 50 } }],
          responses: {},
        },
      },
    },
  });
  assert.deepEqual(
    operation(model, 'GET /items').parameters.map((p) => p.schema.maximum),
    [50],
  );
});

test('Swagger 2.0 form data becomes a request body; a file field means multipart', () => {
  const model = normalize({
    swagger: '2.0',
    paths: {
      '/upload': {
        post: {
          consumes: [],
          parameters: [
            { name: 'note', in: 'formData', type: 'string' },
            { name: 'file', in: 'formData', type: 'file', required: true },
          ],
          responses: { 200: { description: 'ok' } },
        },
      },
    },
  });
  const body = operation(model, 'POST /upload').requestBody;
  assert.deepEqual(Object.keys(body.content), ['multipart/form-data']);
  assert.deepEqual(body.schema, {
    type: 'object',
    properties: { note: { type: 'string' }, file: { type: 'string', format: 'binary' } },
    required: ['file'],
  });
});

test('objectShape follows references and merges allOf', () => {
  const model = normalize({
    openapi: '3.1.0',
    paths: {},
    components: {
      schemas: {
        Base: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
        Dog: {
          allOf: [
            { $ref: '#/components/schemas/Base' },
            { required: ['bark'], properties: { bark: { type: 'string' } } },
          ],
        },
      },
    },
  });
  const shape = objectShape(model, { $ref: '#/schemas/Dog' });
  assert.deepEqual(Object.keys(shape.properties), ['id', 'bark']);
  assert.deepEqual(shape.required, ['id', 'bark']);
  assert.equal(refName({ $ref: '#/schemas/Dog' }), 'Dog');
  assert.equal(refName({ type: 'string' }), null);
  assert.deepEqual(resolveSchema(model, { $ref: '#/schemas/Base' }).required, ['id']);
});

test('the Petstore documents normalize without problems', async () => {
  const v2 = await fixture('petstore-v2.json');
  const v3 = await fixture('petstore-v3.json');
  assert.deepEqual([v2.operations.length, v3.operations.length], [20, 19]);
  assert.deepEqual([v2.problems, v3.problems], [[], []]);
  assert.deepEqual(v2.servers, ['https://petstore.swagger.io/v2', 'http://petstore.swagger.io/v2']);
  assert.deepEqual(v3.servers, ['/api/v3']);
  for (const model of [v2, v3]) {
    assert.deepEqual(objectShape(model, model.schemas.Pet).required, ['name', 'photoUrls']);
  }
});
