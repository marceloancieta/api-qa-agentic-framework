// Every closed set of values an API description allows, taken from the normalized model (CON-08).
// Hand-picked literals drift from the contract and can be illegal, which turns a correct rejection
// into a false finding (L-36); builders, case design and generated types read these sets instead.
//
// A closed set is a schema that admits a fixed list of values:
//   enum                      the listed values (a `null` member only marks the set nullable)
//   const                     a single value
//   pattern  ^(a|b|c)$        a fully anchored alternation of plain literals (also `(?:...)`, or a
//                             single literal `^abc$`); anything with a quantifier, class or wildcard
//                             is an open pattern and is ignored
//
// Where the sets are looked for, and the key each one gets:
//   named schemas        `Pet.status`, nested `Pet.category.kind`, array items `Pet.tags[].kind`,
//                        map values `Pet.labels{}`, tuple members `Pair[0]`, composition members
//                        `Dog.allOf[1].bark`; a schema that is itself a set is keyed by its name
//   parameters           `GET /pet/findByStatus query:status` (array items add `[]`)
//   inline bodies        `POST /pet body.kind`, inline responses `GET /pet response 200.kind`
// References are not followed: the named schema is visited once under its own name. A property
// name that is not a plain identifier is quoted (`Pet["x.y"]`), so keys never collide.
//
// Generated names (written with --write to services/<pack>/generated/enums.ts):
//   1. Words: a schema set uses the schema name and its property names; a parameter set uses the
//      operationId (else the method and path), the parameter name and `Param`; a body set adds
//      `Body`, a response set `Response` and the status. Structural steps (`[]`, `{}`, `[0]`,
//      `allOf[1]`) add no words. Each name splits on case changes and non-alphanumerics.
//   2. The type is the words in PascalCase (`PetStatus`), the constant the words in UPPER_SNAKE
//      plus `_VALUES` (`PET_STATUS_VALUES`); a name starting with a digit gets the prefix `N`.
//   3. When two keys would share a type or constant name, every one of them gets the first six hex
//      digits of the SHA-256 of its key appended (`PetStatus_1a2b3c`, `PET_STATUS_1A2B3C_VALUES`).
//      Names therefore depend only on the key, never on the order of the document.
//
// Usage:
//   node scripts/derive-value-sets.mjs [--service <pack> | --spec <file|url> | --live] [--json]
//   node scripts/derive-value-sets.mjs --service <pack> --write    writes generated/ in the pack
//   node scripts/derive-value-sets.mjs --service <pack> --check    exit 1 when generated/ is stale

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel } from './lib/openapi.mjs';
import { parseCli, readTextIfExists, REPO_ROOT, resolveSpecSource } from './lib/cli.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// ---------------------------------------------------------------------------------------------
// Closed sets

const REGEX_SYNTAX = new Set([...'\\^$.|?*+()[]{}']);

/** Split on `|` outside groups; null when the text is not a plain literal list. */
function literalList(text) {
  const values = [''];
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '\\') {
      const escaped = text[i + 1];
      // `\d`, `\w`, `\b`... are classes or assertions; only an escaped punctuation mark is literal.
      if (escaped === undefined || /[A-Za-z0-9]/.test(escaped)) return null;
      values[values.length - 1] += escaped;
      i += 1;
    } else if (char === '|') {
      values.push('');
    } else if (REGEX_SYNTAX.has(char)) {
      return null;
    } else {
      values[values.length - 1] += char;
    }
  }
  return values;
}

/** The values of `^(a|b)$`, `^(?:a|b)$` or `^a$`; null for any other pattern. */
export function literalAlternatives(pattern) {
  if (typeof pattern !== 'string' || !pattern.startsWith('^') || !pattern.endsWith('$')) {
    return null;
  }
  const body = pattern.slice(1, -1);
  const group = /^\((\?:)?(.*)\)$/s.exec(body);
  if (group) {
    const inner = group[2];
    // `^(a)|(b)$` also starts and ends with parentheses; the inner text must not close the group.
    return inner.includes('(') || inner.includes(')') ? null : literalList(inner);
  }
  const values = literalList(body);
  // Without a group, `^a|b$` means "starts with a or ends with b": not a closed set.
  return values && values.length === 1 ? values : null;
}

/** `{ source, values, nullable }` when the schema admits a fixed list of values, else null. */
export function closedSet(schema) {
  if (!isObject(schema)) return null;
  let source;
  let raw;
  if (Array.isArray(schema.enum)) {
    source = 'enum';
    raw = schema.enum;
  } else if ('const' in schema) {
    source = 'const';
    raw = [schema.const];
  } else {
    const values = literalAlternatives(schema.pattern);
    if (!values) return null;
    source = 'pattern';
    raw = values;
  }
  const values = [];
  const seen = new Set();
  for (const value of raw) {
    const id = JSON.stringify(value);
    if (value === null || seen.has(id)) continue;
    seen.add(id);
    values.push(value);
  }
  if (values.length === 0) return null;
  const nullable =
    raw.includes(null) ||
    schema.type === 'null' ||
    (Array.isArray(schema.type) && schema.type.includes('null'));
  return { source, values, nullable };
}

// ---------------------------------------------------------------------------------------------
// Walking the model

const PLAIN_NAME = /^[A-Za-z_$][\w$-]*$/;
const COMPOSITIONS = ['allOf', 'anyOf', 'oneOf'];

// A step is `{ text, words }`: `text` extends the key, `words` feed the generated name.
const propertyStep = (name) => ({
  text: PLAIN_NAME.test(name) ? `.${name}` : `[${JSON.stringify(name)}]`,
  words: [name],
});
const structuralStep = (text) => ({ text, words: [] });

function walk(node, steps, visit) {
  if (!isObject(node) || typeof node.$ref === 'string') return;
  const set = closedSet(node);
  if (set) visit(steps, set);
  for (const [name, child] of Object.entries(node.properties ?? {})) {
    walk(child, [...steps, propertyStep(name)], visit);
  }
  if (node.items !== undefined) walk(node.items, [...steps, structuralStep('[]')], visit);
  (node.prefixItems ?? []).forEach((child, i) =>
    walk(child, [...steps, structuralStep(`[${i}]`)], visit),
  );
  if (node.additionalProperties !== undefined) {
    walk(node.additionalProperties, [...steps, structuralStep('{}')], visit);
  }
  for (const keyword of COMPOSITIONS) {
    (node[keyword] ?? []).forEach((child, i) =>
      walk(child, [...steps, structuralStep(`.${keyword}[${i}]`)], visit),
    );
  }
}

function operationWords(operation) {
  if (operation.operationId) return [operation.operationId];
  return [operation.method.toLowerCase(), operation.path.replace(/[{}]/g, '')];
}

/**
 * Every closed value set of the model, sorted: named schemas first, then operations, each by key.
 * Entries carry `key`, `kind` (`schema` | `parameter` | `body` | `response`), where they were
 * found, the set itself and the generated `typeName` / `constName`.
 */
export function deriveValueSets(model) {
  const found = [];
  const collect = (root, place) =>
    walk(place.schema, [], (steps, set) => {
      found.push({
        key: root.text + steps.map((step) => step.text).join(''),
        ...place.where,
        path: steps.map((step) => step.text).join(''),
        ...set,
        words: [...root.words, ...steps.flatMap((step) => step.words)],
      });
    });

  for (const [name, schema] of Object.entries(model.schemas)) {
    collect({ text: name, words: [name] }, { schema, where: { kind: 'schema', schema: name } });
  }
  for (const operation of model.operations) {
    const opWords = operationWords(operation);
    for (const parameter of operation.parameters) {
      collect(
        {
          text: `${operation.key} ${parameter.in}:${parameter.name}`,
          words: [...opWords, parameter.name, 'Param'],
        },
        {
          schema: parameter.schema,
          where: {
            kind: 'parameter',
            operation: operation.key,
            in: parameter.in,
            name: parameter.name,
          },
        },
      );
    }
    if (operation.requestBody?.schema) {
      collect(
        { text: `${operation.key} body`, words: [...opWords, 'Body'] },
        {
          schema: operation.requestBody.schema,
          where: { kind: 'body', operation: operation.key },
        },
      );
    }
    for (const response of operation.responses) {
      collect(
        {
          text: `${operation.key} response ${response.status}`,
          words: [...opWords, 'Response', response.status],
        },
        {
          schema: response.schema,
          where: { kind: 'response', operation: operation.key, status: response.status },
        },
      );
    }
  }

  const order = (entry) => (entry.kind === 'schema' ? 0 : 1);
  found.sort((a, b) => order(a) - order(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return assignNames(found);
}

// ---------------------------------------------------------------------------------------------
// Names

function splitWords(words) {
  return words.flatMap((word) =>
    String(word)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean),
  );
}

/** `{ typeName, constName }` for a list of words, before any collision suffix. */
export function baseNames(words) {
  let parts = splitWords(words);
  if (parts.length === 0) parts = ['Value'];
  if (/^\d/.test(parts[0])) parts = ['N', ...parts];
  const typeName = parts.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join('');
  const constName = `${parts.map((p) => p.toUpperCase()).join('_')}_VALUES`;
  return { typeName, constName };
}

export function keyHash(key) {
  return createHash('sha256').update(key).digest('hex').slice(0, 6);
}

/** Give every entry its names; entries whose names would clash all get their key's hash. */
export function assignNames(entries) {
  const named = entries.map(({ words, ...entry }) => ({ ...entry, ...baseNames(words) }));
  const count = (field) => {
    const tally = new Map();
    for (const entry of named) tally.set(entry[field], (tally.get(entry[field]) ?? 0) + 1);
    return tally;
  };
  const types = count('typeName');
  const constants = count('constName');
  for (const entry of named) {
    if (types.get(entry.typeName) > 1 || constants.get(entry.constName) > 1) {
      const hash = keyHash(entry.key);
      entry.typeName = `${entry.typeName}_${hash}`;
      entry.constName = entry.constName.replace(/_VALUES$/, `_${hash.toUpperCase()}_VALUES`);
    }
  }
  return named;
}

// ---------------------------------------------------------------------------------------------
// Output

function generatedHeader(sourceLabel, service) {
  const pack = service ? ` --service ${service}` : '';
  const command = `node scripts/derive-value-sets.mjs${pack} --write`;
  return [
    `// Generated by scripts/derive-value-sets.mjs from ${sourceLabel}.`,
    `// Do not edit by hand; regenerate with \`${command}\`.`,
    '// Names: PascalCase type and UPPER_SNAKE `_VALUES` constant from the schema and property names',
    '// (parameters: operation, parameter name, `Param`); clashing names carry a hash of their key.',
    '// A `null` enum member is not listed: such sets are marked nullable in value-sets.json.',
  ].join('\n');
}

export function renderEnums(sets, sourceLabel, service = null) {
  const blocks = sets.map((set) => {
    const values = set.values.map((value) => JSON.stringify(value)).join(', ');
    return [
      `/** ${set.key} (${set.source}${set.nullable ? ', nullable' : ''}) */`,
      `export const ${set.constName} = [${values}] as const;`,
      `export type ${set.typeName} = (typeof ${set.constName})[number];`,
    ].join('\n');
  });
  return `${[generatedHeader(sourceLabel, service), ...blocks].join('\n\n')}\n`;
}

export function renderValueSets(sets, sourceLabel) {
  return `${JSON.stringify(
    { generatedBy: 'scripts/derive-value-sets.mjs', source: sourceLabel, valueSets: sets },
    null,
    2,
  )}\n`;
}

// Prettier is a development dependency; when it is present the files match `npm run format:check`.
async function formatted(text, file) {
  try {
    const prettier = await import('prettier');
    const options = (await prettier.resolveConfig(file)) ?? {};
    return await prettier.format(text, { ...options, filepath: file });
  } catch {
    return text;
  }
}

const repoPath = (file) => relative(REPO_ROOT, resolve(file)).split('\\').join('/');

function sourceLabel(source) {
  return /^https?:\/\//i.test(source) ? source : repoPath(source);
}

function table(sets) {
  const rows = sets.map((set) => [
    set.key,
    set.source + (set.nullable ? '?' : ''),
    set.values.map((value) => JSON.stringify(value)).join(' | '),
    set.typeName,
  ]);
  const header = ['value set', 'from', 'values', 'type'];
  const widths = header.map((title, i) => Math.max(title.length, ...rows.map((r) => r[i].length)));
  const line = (cells) =>
    cells
      .map((cell, i) => cell.padEnd(widths[i]))
      .join('  ')
      .trimEnd();
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

async function main() {
  const values = parseCli({
    json: { type: 'boolean', default: false },
    write: { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
  });
  const { source, service } = resolveSpecSource(values);
  const sets = deriveValueSets(await loadModel(source));
  const label = sourceLabel(source);

  if (values.write || values.check) {
    if (!service) throw new Error('--write and --check need a service pack (--service <name>).');
    const dir = join(service.dir, 'generated');
    const files = [
      [join(dir, 'value-sets.json'), renderValueSets(sets, label)],
      [join(dir, 'enums.ts'), renderEnums(sets, label, service.name)],
    ];
    let stale = 0;
    for (const [file, raw] of files) {
      const text = await formatted(raw, file);
      const current = readTextIfExists(file);
      if (values.check) {
        if (current !== text) {
          stale += 1;
          console.error(`${repoPath(file)} is out of date; run with --write.`);
        }
      } else if (current !== text) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, text);
        console.log(`wrote ${repoPath(file)}`);
      }
    }
    if (values.check) {
      if (stale === 0) console.log(`${sets.length} value sets; generated files are current.`);
      process.exitCode = stale ? 1 : 0;
    }
    return;
  }

  if (values.json) {
    process.stdout.write(renderValueSets(sets, label));
    return;
  }
  console.log(`${label}: ${sets.length} closed value sets\n`);
  if (sets.length) console.log(table(sets));
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
