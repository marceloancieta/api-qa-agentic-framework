// One model for every API description this framework reads (ADR 0003). Swagger 2.0, OpenAPI 3.0.x
// and OpenAPI 3.1.x, as JSON or YAML, become the same plain-JSON structure, so contract tooling
// handles versions in one place instead of in every script.
//
// The model:
//   format, specVersion, info, servers, securitySchemes
//   schemas      named schemas, rewritten in JSON Schema 2020-12 form (the dialect of OpenAPI 3.1):
//                nullability as a `null` type, numeric exclusive bounds, `examples` arrays, and
//                every schema reference as `#/schemas/<Name>`; `xml` and `externalDocs` are dropped
//   operations   one entry per method and path, with parameters (path-level ones merged in),
//                request body and responses by content type, and the effective security
//   problems     content that could not be used as written (a pattern that does not compile, an
//                external reference); reported for the reader, never fatal
// A version other than the three supported ones is rejected outright.

import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];

const JSON_TYPES = /^application\/(.+\+)?json\b/i;

// ---------------------------------------------------------------------------------------------
// Loading

/** Parse a JSON or YAML document. */
export function parseDocument(text, name = 'document') {
  const trimmed = text.trimStart();
  try {
    return trimmed.startsWith('{') || trimmed.startsWith('[') ? JSON.parse(text) : parseYaml(text);
  } catch (error) {
    throw new Error(`${name} is neither valid JSON nor valid YAML: ${error.message}`, {
      cause: error,
    });
  }
}

/** Read a document from a file path or an http(s) URL. */
export async function loadDocument(source) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`${source} answered HTTP ${response.status}`);
    return parseDocument(await response.text(), source);
  }
  return parseDocument(readFileSync(source, 'utf8'), source);
}

export async function loadModel(source) {
  return normalize(await loadDocument(source));
}

/** `swagger-2.0`, `openapi-3.0` or `openapi-3.1`; anything else throws. */
export function detectFormat(doc) {
  const declared = String(doc?.openapi ?? doc?.swagger ?? '');
  if (declared === '2.0') return 'swagger-2.0';
  if (/^3\.0\.\d+$/.test(declared)) return 'openapi-3.0';
  if (/^3\.1\.\d+$/.test(declared)) return 'openapi-3.1';
  throw new Error(
    `Unsupported API description version "${declared || '(none)'}": ` +
      'expected Swagger 2.0, OpenAPI 3.0.x or OpenAPI 3.1.x.',
  );
}

// ---------------------------------------------------------------------------------------------
// References

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function unescapePointer(token) {
  return decodeURIComponent(token).replace(/~1/g, '/').replace(/~0/g, '~');
}

function pointerTarget(doc, ref) {
  if (!ref.startsWith('#')) return undefined;
  let node = doc;
  for (const token of ref.slice(1).split('/').filter(Boolean)) {
    if (node === null || typeof node !== 'object') return undefined;
    node = node[unescapePointer(token)];
  }
  return node;
}

// Follow `$ref` on a parameter, request body or response until a real object is reached.
function dereference(ctx, node, where) {
  const seen = new Set();
  let current = node;
  while (isObject(current) && typeof current.$ref === 'string') {
    if (seen.has(current.$ref)) {
      ctx.problems.push({ where, message: `circular reference ${current.$ref}` });
      return {};
    }
    seen.add(current.$ref);
    const target = pointerTarget(ctx.doc, current.$ref);
    if (target === undefined) {
      ctx.problems.push({ where, message: `unresolvable reference ${current.$ref}` });
      return {};
    }
    current = target;
  }
  return current ?? {};
}

// ---------------------------------------------------------------------------------------------
// Schemas

const PRESENTATION_ONLY = ['xml', 'externalDocs'];
const SCHEMA_MAPS = ['properties', 'patternProperties', 'dependentSchemas', '$defs', 'definitions'];
const SCHEMA_LISTS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const SCHEMA_SINGLES = [
  'additionalProperties',
  'not',
  'contains',
  'propertyNames',
  'if',
  'then',
  'else',
  'unevaluatedProperties',
  'unevaluatedItems',
];

function schemaRefPrefix(format) {
  return format === 'swagger-2.0' ? '#/definitions/' : '#/components/schemas/';
}

function rewriteRef(ctx, ref, where) {
  const prefix = schemaRefPrefix(ctx.format);
  if (ref.startsWith(prefix)) return `#/schemas/${ref.slice(prefix.length)}`;
  if (!ref.startsWith('#')) {
    ctx.problems.push({ where, message: `external reference ${ref} is not followed` });
    return null;
  }
  return undefined; // a local reference to something other than a named schema
}

function addNull(schema) {
  if (typeof schema.type === 'string') schema.type = [schema.type, 'null'];
  else if (Array.isArray(schema.type)) {
    if (!schema.type.includes('null')) schema.type = [...schema.type, 'null'];
  } else {
    return { anyOf: [schema, { type: 'null' }] };
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(null))
    schema.enum = [...schema.enum, null];
  return schema;
}

/** One schema (and everything nested in it) in 2020-12 form. */
function normalizeSchema(ctx, node, where, depth = 0) {
  if (!isObject(node)) return node; // `true` / `false` are valid schemas in 3.1
  if (depth > 64) {
    ctx.problems.push({ where, message: 'schema nesting deeper than 64 levels; truncated' });
    return {};
  }
  const next = (child, suffix) => normalizeSchema(ctx, child, `${where}${suffix}`, depth + 1);
  const out = {};

  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') {
      const rewritten = rewriteRef(ctx, value, where);
      if (rewritten) out.$ref = rewritten;
      else if (rewritten === undefined) {
        // Inline a local reference into some other part of the document.
        const target = pointerTarget(ctx.doc, value);
        if (target === undefined)
          ctx.problems.push({ where, message: `unresolvable reference ${value}` });
        else Object.assign(out, next(target, ` -> ${value}`));
      }
    } else if (SCHEMA_MAPS.includes(key) && isObject(value)) {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([name, child]) => [name, next(child, `.${key}.${name}`)]),
      );
    } else if (SCHEMA_LISTS.includes(key) && Array.isArray(value)) {
      out[key] = value.map((child, i) => next(child, `.${key}[${i}]`));
    } else if (SCHEMA_SINGLES.includes(key)) {
      out[key] = next(value, `.${key}`);
    } else if (key === 'items') {
      // Draft-04 style tuple `items: [...]` becomes `prefixItems`.
      if (Array.isArray(value))
        out.prefixItems = value.map((child, i) => next(child, `.items[${i}]`));
      else out.items = next(value, '.items');
    } else if (key === 'example') {
      if (!('examples' in node)) out.examples = [value];
    } else if (key === 'nullable' || key === 'x-nullable') {
      // Applied below.
    } else if (PRESENTATION_ONLY.includes(key)) {
      // Serialization hints and links: they never change what a value may be.
    } else if (key === 'pattern') {
      try {
        new RegExp(value, 'u');
        out.pattern = value;
      } catch (error) {
        out['x-invalid-pattern'] = value;
        ctx.problems.push({
          where,
          message: `pattern does not compile (${error.message}); not enforced`,
        });
      }
    } else {
      out[key] = value;
    }
  }

  for (const [bound, limit] of [
    ['exclusiveMinimum', 'minimum'],
    ['exclusiveMaximum', 'maximum'],
  ]) {
    if (typeof out[bound] === 'boolean') {
      if (out[bound] && limit in out) {
        out[bound] = out[limit];
        delete out[limit];
      } else {
        delete out[bound];
      }
    }
  }
  if (out.type === 'file') {
    out.type = 'string';
    out.format = 'binary';
  }

  const nullable = ctx.format === 'swagger-2.0' ? node['x-nullable'] : node.nullable;
  return nullable === true && ctx.format !== 'openapi-3.1' ? addNull(out) : out;
}

// ---------------------------------------------------------------------------------------------
// Parameters, bodies, responses

// Keys a Swagger 2.0 non-body parameter carries directly instead of inside `schema`.
const PARAMETER_SCHEMA_KEYS = [
  'type',
  'format',
  'items',
  'default',
  'maximum',
  'exclusiveMaximum',
  'minimum',
  'exclusiveMinimum',
  'maxLength',
  'minLength',
  'pattern',
  'maxItems',
  'minItems',
  'uniqueItems',
  'enum',
  'multipleOf',
  'x-nullable',
];

function parameterSchema(ctx, parameter, where) {
  if (ctx.format !== 'swagger-2.0') {
    if (parameter.schema) return normalizeSchema(ctx, parameter.schema, `${where}.schema`);
    const media = Object.values(parameter.content ?? {})[0];
    return media?.schema ? normalizeSchema(ctx, media.schema, `${where}.content`) : {};
  }
  const raw = Object.fromEntries(
    PARAMETER_SCHEMA_KEYS.filter((key) => key in parameter).map((key) => [key, parameter[key]]),
  );
  return normalizeSchema(ctx, raw, where);
}

function normalizeParameter(ctx, raw, where) {
  const parameter = dereference(ctx, raw, where);
  const out = {
    name: parameter.name,
    in: parameter.in,
    required: parameter.in === 'path' ? true : parameter.required === true,
    description: parameter.description ?? null,
    deprecated: parameter.deprecated === true,
    schema: parameterSchema(ctx, parameter, `${where} ${parameter.in}:${parameter.name}`),
  };
  for (const key of ['style', 'explode', 'allowEmptyValue', 'collectionFormat']) {
    if (key in parameter) out[key] = parameter[key];
  }
  return out;
}

// JSON first, so `schema` is the representation most tooling wants.
function preferred(content) {
  const types = Object.keys(content);
  const json = types.find((type) => JSON_TYPES.test(type));
  const chosen = json ?? types[0];
  return chosen === undefined ? null : content[chosen];
}

function mediaContent(ctx, content, where) {
  return Object.fromEntries(
    Object.entries(content ?? {}).map(([type, media]) => [
      type,
      media?.schema ? normalizeSchema(ctx, media.schema, `${where} ${type}`) : null,
    ]),
  );
}

function swaggerBody(ctx, parameters, consumes, where) {
  const body = parameters.find((p) => p.in === 'body');
  if (body) {
    const schema = normalizeSchema(ctx, body.schema ?? {}, `${where} body`);
    return {
      required: body.required === true,
      description: body.description ?? null,
      content: Object.fromEntries(consumes.map((type) => [type, schema])),
      schema,
    };
  }
  const form = parameters.filter((p) => p.in === 'formData');
  if (form.length === 0) return null;
  const schema = {
    type: 'object',
    properties: Object.fromEntries(
      form.map((p) => [p.name, parameterSchema(ctx, p, `${where} formData:${p.name}`)]),
    ),
    required: form.filter((p) => p.required === true).map((p) => p.name),
  };
  const formTypes = consumes.filter((type) => /form/i.test(type));
  const types =
    formTypes.length > 0
      ? formTypes
      : [
          form.some((p) => p.type === 'file')
            ? 'multipart/form-data'
            : 'application/x-www-form-urlencoded',
        ];
  return {
    required: form.some((p) => p.required === true),
    description: null,
    content: Object.fromEntries(types.map((type) => [type, schema])),
    schema,
  };
}

function openapiBody(ctx, raw, where) {
  if (!raw) return null;
  const body = dereference(ctx, raw, `${where} requestBody`);
  const content = mediaContent(ctx, body.content, `${where} requestBody`);
  return {
    required: body.required === true,
    description: body.description ?? null,
    content,
    schema: preferred(content),
  };
}

function normalizeResponses(ctx, operation, produces, where) {
  return Object.entries(operation.responses ?? {}).map(([status, raw]) => {
    const response = dereference(ctx, raw, `${where} ${status}`);
    let content;
    if (ctx.format === 'swagger-2.0') {
      const schema = response.schema
        ? normalizeSchema(ctx, response.schema, `${where} ${status}`)
        : null;
      content = schema ? Object.fromEntries(produces.map((type) => [type, schema])) : {};
    } else {
      content = mediaContent(ctx, response.content, `${where} ${status}`);
    }
    return {
      status: String(status),
      description: response.description ?? null,
      content,
      schema: preferred(content),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Document-level parts

function servers(doc, format) {
  if (format === 'swagger-2.0') {
    const basePath = doc.basePath ?? '';
    if (!doc.host) return basePath ? [basePath] : [];
    const schemes = doc.schemes?.length ? doc.schemes : ['https'];
    return schemes.map((scheme) => `${scheme}://${doc.host}${basePath}`);
  }
  return (doc.servers ?? []).map((server) =>
    String(server.url ?? '').replace(/\{([^}]+)\}/g, (match, name) =>
      String(server.variables?.[name]?.default ?? match),
    ),
  );
}

function securitySchemes(ctx) {
  const { doc, format } = ctx;
  if (format === 'swagger-2.0') {
    return Object.fromEntries(
      Object.entries(doc.securityDefinitions ?? {}).map(([name, scheme]) => {
        if (scheme.type === 'basic') return [name, { type: 'http', scheme: 'basic' }];
        if (scheme.type === 'apiKey')
          return [name, { type: 'apiKey', in: scheme.in, name: scheme.name }];
        const out = { type: scheme.type, flow: scheme.flow ?? null, scopes: scheme.scopes ?? {} };
        // 2.0 keeps one flow per scheme; its URLs stay as declared (3.x keeps them inside `flows`).
        for (const key of ['tokenUrl', 'authorizationUrl']) {
          if (key in scheme) out[key] = scheme[key];
        }
        return [name, out];
      }),
    );
  }
  return Object.fromEntries(
    Object.entries(doc.components?.securitySchemes ?? {}).map(([name, raw]) => {
      const scheme = dereference(ctx, raw, `securityScheme ${name}`);
      const out = { type: scheme.type };
      for (const key of ['in', 'name', 'scheme', 'bearerFormat', 'flows', 'openIdConnectUrl']) {
        if (key in scheme) out[key] = scheme[key];
      }
      return [name, out];
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// The model

export function normalize(doc) {
  const format = detectFormat(doc);
  const ctx = { doc, format, problems: [] };

  const rawSchemas = format === 'swagger-2.0' ? doc.definitions : doc.components?.schemas;
  const schemas = Object.fromEntries(
    Object.entries(rawSchemas ?? {}).map(([name, schema]) => [
      name,
      normalizeSchema(ctx, schema, `schema ${name}`),
    ]),
  );

  const operations = [];
  for (const [path, rawItem] of Object.entries(doc.paths ?? {})) {
    const item = dereference(ctx, rawItem, `path ${path}`);
    const shared = item.parameters ?? [];
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (!isObject(operation)) continue;
      const key = `${method.toUpperCase()} ${path}`;

      // Operation-level parameters override path-level ones with the same location and name.
      const byId = new Map();
      for (const raw of [...shared, ...(operation.parameters ?? [])]) {
        const parameter = dereference(ctx, raw, key);
        byId.set(`${parameter.in}:${parameter.name}`, parameter);
      }
      const all = [...byId.values()];

      let parameters;
      let requestBody;
      let produces = [];
      if (format === 'swagger-2.0') {
        const consumes = operation.consumes ?? doc.consumes ?? ['application/json'];
        produces = operation.produces ?? doc.produces ?? ['application/json'];
        parameters = all
          .filter((p) => p.in !== 'body' && p.in !== 'formData')
          .map((p) => normalizeParameter(ctx, p, key));
        requestBody = swaggerBody(ctx, all, consumes, key);
      } else {
        parameters = all.map((p) => normalizeParameter(ctx, p, key));
        requestBody = openapiBody(ctx, operation.requestBody, key);
      }

      operations.push({
        key,
        method: method.toUpperCase(),
        path,
        operationId: operation.operationId ?? null,
        summary: operation.summary ?? null,
        description: operation.description ?? null,
        tags: operation.tags ?? [],
        deprecated: operation.deprecated === true,
        parameters,
        requestBody,
        responses: normalizeResponses(ctx, operation, produces, key),
        security: (operation.security ?? doc.security ?? []).map((requirement) =>
          Object.keys(requirement),
        ),
      });
    }
  }

  return {
    format,
    specVersion: String(doc.openapi ?? doc.swagger),
    info: { title: doc.info?.title ?? null, version: doc.info?.version ?? null },
    servers: servers(doc, format),
    securitySchemes: securitySchemes(ctx),
    schemas,
    operations,
    problems: ctx.problems,
  };
}

// ---------------------------------------------------------------------------------------------
// Reading the model

/** The schema a `$ref` points at, following chains; the schema itself when it is not a reference. */
export function resolveSchema(model, schema) {
  const seen = new Set();
  let current = schema;
  while (
    isObject(current) &&
    typeof current.$ref === 'string' &&
    current.$ref.startsWith('#/schemas/')
  ) {
    if (seen.has(current.$ref)) return {};
    seen.add(current.$ref);
    current = pointerTarget({ schemas: model.schemas }, current.$ref) ?? {};
  }
  return current;
}

/**
 * The properties and required names of an object schema, with references followed and `allOf`
 * members merged. `oneOf`/`anyOf` alternatives are not merged: which one applies is a runtime fact.
 */
export function objectShape(model, schema, seen = new Set()) {
  const resolved = resolveSchema(model, schema);
  const shape = { properties: {}, required: [] };
  if (!isObject(resolved) || seen.has(resolved)) return shape;
  seen.add(resolved);
  for (const member of resolved.allOf ?? []) {
    const part = objectShape(model, member, seen);
    Object.assign(shape.properties, part.properties);
    shape.required.push(...part.required);
  }
  Object.assign(shape.properties, resolved.properties ?? {});
  shape.required.push(...(resolved.required ?? []));
  shape.required = [...new Set(shape.required)];
  return shape;
}

/** The name of a named schema reference (`#/schemas/Pet` -> `Pet`), or null. */
export function refName(schema) {
  const ref = isObject(schema) ? schema.$ref : undefined;
  return typeof ref === 'string' && ref.startsWith('#/schemas/')
    ? ref.slice('#/schemas/'.length)
    : null;
}
