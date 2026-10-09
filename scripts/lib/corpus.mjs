// The spec corpus as data: which specs exist and which tests they declare, read through the
// TypeScript syntax tree rather than with regular expressions, so a title inside a comment or a
// string is never mistaken for a test (precision first, L-03). Linters and status reports share it.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

export { ts };

const CASE_ID = /^(TC-[A-Z][A-Z0-9]*-\d+)\b/;
const TITLE_TAG = /(?:^|\s)(@[a-z][\w-]*)/g;
const PROBE_REF = /probe:(p-[0-9a-f]{10})\b/g;
const TEST_MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail', 'slow']);
const DESCRIBE_MODIFIERS = new Set(['only', 'skip', 'fixme', 'serial', 'parallel']);

function walkFiles(dir, accept, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(path, accept, found);
    else if (accept(entry.name)) found.push(path);
  }
  return found;
}

/** Spec files of every pack (or one), as paths relative to `root` with forward slashes. */
export function specFiles(root, pack = null) {
  const services = join(root, 'services');
  if (!existsSync(services)) return [];
  const packs = pack
    ? [pack]
    : readdirSync(services, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
  return packs
    .flatMap((name) =>
      walkFiles(join(services, name, 'specs'), (file) => file.endsWith('.spec.ts')),
    )
    .map((file) => relative(root, file).replace(/\\/g, '/'))
    .sort();
}

/** A string literal's text, or null when the expression is computed. */
export function literalText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/**
 * How a call relates to Playwright's `test`: `{ kind: 'test' | 'describe' | 'hook' | 'other', modifier }`.
 * `test('t', fn)`, `test.skip('t', fn)`, `test.describe.serial('d', fn)`, `test.beforeEach(fn)`.
 */
export function classifyCall(call) {
  const chain = [];
  let expression = call.expression;
  while (ts.isPropertyAccessExpression(expression)) {
    chain.unshift(expression.name.text);
    expression = expression.expression;
  }
  if (!ts.isIdentifier(expression) || expression.text !== 'test')
    return { kind: 'other', modifier: null };
  if (chain.length === 0) return { kind: 'test', modifier: null };
  if (chain[0] === 'describe') {
    const modifier = chain[1] ?? null;
    return DESCRIBE_MODIFIERS.has(modifier) || modifier === null
      ? { kind: 'describe', modifier }
      : { kind: 'other', modifier: null };
  }
  if (['beforeAll', 'beforeEach', 'afterAll', 'afterEach'].includes(chain[0])) {
    return { kind: 'hook', modifier: chain[0] };
  }
  // `test.skip(title, fn)` declares a test; `test.skip(condition, reason)` inside a body does not.
  if (chain.length === 1 && TEST_MODIFIERS.has(chain[0])) {
    const declares =
      literalText(call.arguments[0]) !== null && call.arguments.some((a) => ts.isFunctionLike(a));
    return declares ? { kind: 'test', modifier: chain[0] } : { kind: 'other', modifier: chain[0] };
  }
  return { kind: 'other', modifier: null };
}

function tagsOf(call, title) {
  const tags = new Set([...(title ?? '').matchAll(TITLE_TAG)].map((match) => match[1]));
  for (const argument of call.arguments) {
    if (!ts.isObjectLiteralExpression(argument)) continue;
    for (const property of argument.properties) {
      if (!ts.isPropertyAssignment(property) || property.name.getText() !== 'tag') continue;
      const value = property.initializer;
      const values = ts.isArrayLiteralExpression(value) ? value.elements : [value];
      for (const element of values) {
        const text = literalText(element);
        if (text) tags.add(text);
      }
    }
  }
  return [...tags];
}

const lineOf = (sourceFile, node) =>
  sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

/** Parse one spec's source. `tests` lists every declared test with its describe path and tags. */
export function parseSpecSource(text, file) {
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const tests = [];
  const visit = (node, describes) => {
    if (ts.isCallExpression(node)) {
      const { kind, modifier } = classifyCall(node);
      if (kind === 'describe') {
        const title = literalText(node.arguments[0]);
        const scope = { title, tags: tagsOf(node, title), modifier };
        node.arguments.forEach((argument) => visit(argument, [...describes, scope]));
        return;
      }
      if (kind === 'test') {
        const title = literalText(node.arguments[0]);
        tests.push({
          title,
          line: lineOf(sourceFile, node),
          describePath: describes.map((scope) => scope.title),
          modifier,
          tags: [...new Set([...describes.flatMap((scope) => scope.tags), ...tagsOf(node, title)])],
          caseId: title ? (CASE_ID.exec(title)?.[1] ?? null) : null,
          probes: title ? [...title.matchAll(PROBE_REF)].map((match) => match[1]) : [],
          node,
        });
      }
    }
    ts.forEachChild(node, (child) => visit(child, describes));
  };
  visit(sourceFile, []);
  return {
    file,
    sourceFile,
    tests,
    probeRefs: [...new Set([...text.matchAll(PROBE_REF)].map((m) => m[1]))],
  };
}

export function parseSpecFile(root, file) {
  return parseSpecSource(readFileSync(join(root, file), 'utf8'), file);
}

/** Every spec of every pack (or one), parsed. */
export function loadCorpus(root, pack = null) {
  return specFiles(root, pack).map((file) => parseSpecFile(root, file));
}
