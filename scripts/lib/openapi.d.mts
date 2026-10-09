// Types for scripts/lib/openapi.mjs, so TypeScript helpers can read the normalized model.

export type Format = 'swagger-2.0' | 'openapi-3.0' | 'openapi-3.1';

/** A JSON Schema 2020-12 schema, with references as `#/schemas/<Name>`. */
export type Schema = boolean | { [keyword: string]: unknown };

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  description: string | null;
  deprecated: boolean;
  schema: Schema;
  style?: string;
  explode?: boolean;
  allowEmptyValue?: boolean;
  collectionFormat?: string;
}

export interface RequestBody {
  required: boolean;
  description: string | null;
  /** Schema per media type (null when the media type declares none). */
  content: Record<string, Schema | null>;
  /** The JSON media type's schema, else the first one's. */
  schema: Schema | null;
}

export interface Response {
  /** `200`, `4XX` or `default`. */
  status: string;
  description: string | null;
  content: Record<string, Schema | null>;
  schema: Schema | null;
}

export interface Operation {
  /** `GET /pet/{petId}` */
  key: string;
  method: string;
  path: string;
  operationId: string | null;
  summary: string | null;
  description: string | null;
  tags: string[];
  deprecated: boolean;
  parameters: Parameter[];
  requestBody: RequestBody | null;
  responses: Response[];
  /** Alternatives, each a list of scheme names that must all be satisfied. Empty: no security. */
  security: string[][];
}

export interface SecurityScheme {
  type: string;
  in?: string;
  name?: string;
  scheme?: string;
  bearerFormat?: string;
  [key: string]: unknown;
}

export interface Problem {
  where: string;
  message: string;
}

export interface Model {
  format: Format;
  specVersion: string;
  info: { title: string | null; version: string | null };
  servers: string[];
  securitySchemes: Record<string, SecurityScheme>;
  schemas: Record<string, Schema>;
  operations: Operation[];
  problems: Problem[];
}

export const HTTP_METHODS: readonly string[];
export function parseDocument(text: string, name?: string): unknown;
export function loadDocument(source: string): Promise<unknown>;
export function loadModel(source: string): Promise<Model>;
export function detectFormat(doc: unknown): Format;
export function normalize(doc: unknown): Model;
export function resolveSchema(model: Model, schema: Schema): Schema;
export function objectShape(
  model: Model,
  schema: Schema,
): { properties: Record<string, Schema>; required: string[] };
export function refName(schema: Schema): string | null;
