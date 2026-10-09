import { test, expect } from '@playwright/test';
import { createSchemaValidator, specVersion, toDraft07 } from '../schema';

// The same resource described in each supported version.
const pet = (nullable: Record<string, unknown>) => ({
  type: 'object',
  required: ['name'],
  properties: {
    id: { type: 'integer', format: 'int64' },
    name: { type: 'string' },
    status: { type: 'string', enum: ['available', 'sold'] },
    nickname: { type: 'string', ...nullable },
    weight: { type: 'number', minimum: 0, exclusiveMinimum: true },
  },
});

const docs = {
  '2.0': { swagger: '2.0', definitions: { Pet: pet({ 'x-nullable': true }) } },
  '3.0': { openapi: '3.0.4', components: { schemas: { Pet: pet({ nullable: true }) } } },
  '3.1': {
    openapi: '3.1.0',
    components: {
      schemas: {
        Pet: {
          ...pet({}),
          properties: {
            ...pet({}).properties,
            nickname: { type: ['string', 'null'] },
            weight: { type: 'number', exclusiveMinimum: 0 },
          },
        },
      },
    },
  },
};

test.describe('createSchemaValidator', () => {
  for (const [version, doc] of Object.entries(docs)) {
    test(`${version}: same verdicts for the same resource`, () => {
      const validator = createSchemaValidator(doc);
      expect(validator.version).toBe(version);
      expect(validator.names).toEqual(['Pet']);
      expect(validator.validate('Pet', { id: 1, name: 'rex', nickname: null, weight: 1 })).toEqual(
        [],
      );
      const problems = validator.validate('Pet', { status: 'lost', weight: 0, id: 1.5 });
      expect(problems.join('\n')).toMatch(/must have required property 'name'/);
      expect(problems.join('\n')).toMatch(/\/status must be equal to one of the allowed values/);
      expect(problems.join('\n')).toMatch(/\/weight must be > 0/);
      expect(problems.join('\n')).toMatch(/\/id must be integer/);
    });
  }

  test('references between schemas resolve', () => {
    const validator = createSchemaValidator({
      openapi: '3.0.3',
      components: {
        schemas: {
          Tag: { type: 'object', properties: { name: { type: 'string' } } },
          Pet: {
            type: 'object',
            properties: { tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } } },
          },
        },
      },
    });
    expect(validator.validate('Pet', { tags: [{ name: 'a' }] })).toEqual([]);
    expect(validator.validate('Pet', { tags: [{ name: 1 }] })).toEqual([
      '/tags/0/name must be string',
    ]);
  });

  test('an unknown schema name fails and lists the known ones', () => {
    expect(() => createSchemaValidator(docs['3.0']).validate('Dog', {})).toThrow(/Known: Pet/);
  });

  test('int32 is range-checked', () => {
    const validator = createSchemaValidator({
      openapi: '3.0.0',
      components: { schemas: { N: { type: 'integer', format: 'int32' } } },
    });
    expect(validator.validate('N', 2 ** 31 - 1)).toEqual([]);
    expect(validator.validate('N', 2 ** 31)).not.toEqual([]);
  });
});

test.describe('specVersion', () => {
  test('rejects what it does not support', () => {
    expect(() => specVersion({ openapi: '4.0.0' })).toThrow(/Unsupported.*4\.0\.0/);
    expect(() => specVersion({})).toThrow(/\(none\)/);
  });
});

test.describe('toDraft07', () => {
  test('nullable without a type becomes anyOf with null', () => {
    expect(toDraft07({ $ref: '#/x', nullable: true }, 'nullable')).toEqual({
      anyOf: [{ $ref: '#/x' }, { type: 'null' }],
    });
  });

  test('a property named like a keyword is left alone', () => {
    const schema = { type: 'object', properties: { nullable: { type: 'boolean' } } };
    expect(toDraft07(schema, 'nullable')).toEqual(schema);
  });

  test('exclusiveMinimum false keeps the inclusive minimum', () => {
    expect(toDraft07({ minimum: 1, exclusiveMinimum: false }, 'nullable')).toEqual({ minimum: 1 });
  });
});
