// Response validation against the schemas of an OpenAPI document, with the JSON Schema dialect the
// document's version implies (ADR 0003):
//   OpenAPI 3.1  - its schemas are JSON Schema 2020-12; validated as written.
//   OpenAPI 3.0  - a JSON Schema variant: `nullable`, boolean `exclusiveMinimum`/`exclusiveMaximum`;
//                  converted to draft-07 first.
//   Swagger 2.0  - the same conversion, with `x-nullable` and schemas under `definitions`.
// Anything else is rejected rather than validated half-right.

import Ajv, { type ErrorObject } from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

export type SpecVersion = '2.0' | '3.0' | '3.1';

type Schema = Record<string, unknown>;

export interface SchemaValidator {
  readonly version: SpecVersion;
  /** Names of the schemas the document defines. */
  readonly names: readonly string[];
  /** Every mismatch between `data` and schema `name`; empty when it conforms. */
  validate(name: string, data: unknown): string[];
}

export function specVersion(doc: Record<string, unknown>): SpecVersion {
  const declared = String(doc.openapi ?? doc.swagger ?? '');
  if (declared === '2.0') return '2.0';
  if (/^3\.0\.\d+$/.test(declared)) return '3.0';
  if (/^3\.1\.\d+$/.test(declared)) return '3.1';
  throw new Error(
    `Unsupported API description version "${declared || '(none)'}": expected Swagger 2.0, OpenAPI 3.0 or 3.1.`,
  );
}

const isObject = (value: unknown): value is Schema =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Rewrite one 3.0 / 2.0 schema (and the schemas nested in it) as draft-07. */
export function toDraft07(schema: unknown, nullableKey: 'nullable' | 'x-nullable'): unknown {
  if (Array.isArray(schema)) return schema.map((item) => toDraft07(item, nullableKey));
  if (!isObject(schema)) return schema;

  const out: Schema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'properties' || key === 'patternProperties' || key === 'definitions') {
      out[key] = isObject(value)
        ? Object.fromEntries(
            Object.entries(value).map(([name, child]) => [name, toDraft07(child, nullableKey)]),
          )
        : value;
    } else if (['items', 'additionalProperties', 'not', 'allOf', 'anyOf', 'oneOf'].includes(key)) {
      out[key] = toDraft07(value, nullableKey);
    } else {
      out[key] = value;
    }
  }

  for (const [bound, limit] of [
    ['exclusiveMinimum', 'minimum'],
    ['exclusiveMaximum', 'maximum'],
  ] as const) {
    if (typeof out[bound] === 'boolean') {
      if (out[bound] === true && limit in out) out[bound] = out[limit];
      else delete out[bound];
      if (bound in out) delete out[limit];
    }
  }

  if (out[nullableKey] === true) {
    delete out[nullableKey];
    if (typeof out.type === 'string') return { ...out, type: [out.type, 'null'] };
    return { anyOf: [out, { type: 'null' }] };
  }
  delete out[nullableKey];
  return out;
}

// Formats OpenAPI defines on top of JSON Schema.
function addOpenApiFormats(ajv: Ajv): void {
  ajv.addFormat('int32', {
    type: 'number',
    validate: (n: number) => Number.isInteger(n) && n >= -(2 ** 31) && n <= 2 ** 31 - 1,
  });
  ajv.addFormat('int64', { type: 'number', validate: (n: number) => Number.isInteger(n) });
  ajv.addFormat('float', { type: 'number', validate: () => true });
  ajv.addFormat('double', { type: 'number', validate: () => true });
  ajv.addFormat('byte', /^[A-Za-z0-9+/]*={0,2}$/);
  ajv.addFormat('binary', true);
  ajv.addFormat('password', true);
}

function describe(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => {
    const where = error.instancePath || '(root)';
    const detail =
      error.keyword === 'additionalProperties'
        ? `: "${String((error.params as { additionalProperty?: string }).additionalProperty)}"`
        : error.keyword === 'enum'
          ? `: ${JSON.stringify((error.params as { allowedValues?: unknown }).allowedValues)}`
          : '';
    return `${where} ${error.message ?? error.keyword}${detail}`;
  });
}

const DOCUMENT_ID = 'openapi';

function convertEach(
  schemas: Record<string, unknown>,
  nullableKey: 'nullable' | 'x-nullable',
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [name, toDraft07(schema, nullableKey)]),
  );
}

export function createSchemaValidator(doc: Record<string, unknown>): SchemaValidator {
  const version = specVersion(doc);
  const options = { allErrors: true, strict: false };
  const ajv = version === '3.1' ? new Ajv2020(options) : new Ajv(options);
  addFormats(ajv);
  addOpenApiFormats(ajv);

  let container: string;
  let schemas: Record<string, unknown>;
  if (version === '2.0') {
    container = '#/definitions';
    schemas = (doc.definitions as Record<string, unknown>) ?? {};
    ajv.addSchema({ $id: DOCUMENT_ID, definitions: convertEach(schemas, 'x-nullable') });
  } else {
    container = '#/components/schemas';
    const components = (doc.components as { schemas?: Record<string, unknown> }) ?? {};
    schemas = components.schemas ?? {};
    const converted = version === '3.0' ? convertEach(schemas, 'nullable') : schemas;
    ajv.addSchema({ $id: DOCUMENT_ID, components: { schemas: converted } });
  }

  const names = Object.keys(schemas);
  const compiled = new Map<string, ReturnType<Ajv['compile']>>();
  return {
    version,
    names,
    validate(name, data) {
      if (!names.includes(name)) {
        throw new Error(`Schema "${name}" is not defined. Known: ${names.join(', ') || '(none)'}.`);
      }
      let check = compiled.get(name);
      if (!check) {
        check = ajv.compile({ $ref: `${DOCUMENT_ID}${container}/${name}` });
        compiled.set(name, check);
      }
      return check(data) ? [] : describe(check.errors);
    },
  };
}
