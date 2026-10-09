// Response validation against the schemas of an API description. The document goes through the
// normalizer first (scripts/lib/openapi.mjs, ADR 0003), which rewrites Swagger 2.0 and OpenAPI 3.0
// schemas in the JSON Schema 2020-12 form OpenAPI 3.1 uses, so every version is validated by one
// 2020-12 validator. Unsupported versions are rejected by the normalizer.

import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { normalize, type Format, type Problem } from '../scripts/lib/openapi.mjs';

export interface SchemaValidator {
  readonly format: Format;
  /** Names of the schemas the document defines. */
  readonly names: readonly string[];
  /** Content the normalizer could not use as written (e.g. a pattern that does not compile). */
  readonly problems: readonly Problem[];
  /** Every mismatch between `data` and schema `name`; empty when it conforms. */
  validate(name: string, data: unknown): string[];
}

// Formats OpenAPI defines on top of JSON Schema.
function addOpenApiFormats(ajv: Ajv2020): void {
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

const MODEL_ID = 'model';

export function createSchemaValidator(doc: unknown): SchemaValidator {
  const model = normalize(doc);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  addOpenApiFormats(ajv);
  ajv.addSchema({ $id: MODEL_ID, schemas: model.schemas });

  const names = Object.keys(model.schemas);
  const compiled = new Map<string, ReturnType<Ajv2020['compile']>>();
  return {
    format: model.format,
    names,
    problems: model.problems,
    validate(name, data) {
      if (!names.includes(name)) {
        throw new Error(`Schema "${name}" is not defined. Known: ${names.join(', ') || '(none)'}.`);
      }
      let check = compiled.get(name);
      if (!check) {
        check = ajv.compile({ $ref: `${MODEL_ID}#/schemas/${name}` });
        compiled.set(name, check);
      }
      return check(data) ? [] : describe(check.errors);
    },
  };
}
