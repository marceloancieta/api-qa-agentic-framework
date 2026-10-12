#!/usr/bin/env node
// Layer linter (GATE-16): the boundaries of ADR 0007, read through the TypeScript syntax tree. They
// held by convention and review alone; a second pack is where a break would first appear. Each rule
// names the exact shape it reports and stays silent on anything computed (L-03).
//
//   core-imports-pack
//     A file of the core - `helpers/`, `fixtures/` or `scripts/`, outside `__fixtures__/` - whose
//     import resolves into `services/`: `import ... from`, `export ... from`, `import()` or
//     `require()` with a literal relative specifier. The core serves every pack and knows none, so
//     it reads a pack's files by path at run time instead. A computed specifier is not inspected.
//   spec-sends-request
//     A spec (`services/<pack>/specs/**/*.spec.ts`) that sends a request without a client: it uses
//     the `request` fixture (destructured in a test or hook), imports `request` from
//     `@playwright/test` or a package that speaks HTTP (`axios`, `got`, `node-fetch`, `undici`,
//     `superagent`, `http`, `https`), calls the global `fetch` (one the file does not declare) or
//     opens a context with `<x>.request.newContext()`. Requests go through a client over
//     `BaseClient`, which records the evidence and applies auth and redaction.
//
// Usage:
//   node scripts/lint-layers.mjs [--root <dir>]   the repository (or another tree)
//   node scripts/lint-layers.mjs --self-test      exact-set check against the fixture tree
// Exit 1 on findings (or an inexact self-test).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCall, literalText, ts } from './lib/corpus.mjs';
import { parseCli, REPO_ROOT } from './lib/cli.mjs';
import { finding, report, selfTest } from './lib/lint.mjs';

export const TOOL = 'lint-layers';
export const FIXTURES = join(import.meta.dirname, '__fixtures__', 'lint-layers');
export const RULES = ['core-imports-pack', 'spec-sends-request'];

const CORE_DIRS = ['helpers', 'fixtures', 'scripts'];
const CODE_FILE = /\.(?:ts|mts|cts|js|mjs|cjs)$/;
const SPEC_FILE = /^services\/[^/]+\/specs\/.+\.spec\.ts$/;
const HTTP_PACKAGES = new Set([
  'axios',
  'got',
  'node-fetch',
  'undici',
  'superagent',
  'http',
  'https',
  'node:http',
  'node:https',
]);

/** Code files under `root`, as forward-slash paths relative to it; no dependencies or fixtures. */
function codeFiles(root, dir = '') {
  const here = join(root, dir);
  if (!existsSync(here)) return [];
  return readdirSync(here, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '__fixtures__', '.git'].includes(entry.name)) return [];
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return codeFiles(root, rel);
    return CODE_FILE.test(entry.name) ? [rel] : [];
  });
}

function parse(text, file) {
  const kind = /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
}

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

/** Every literal module specifier of a file: `{ node, specifier }`. */
function moduleSpecifiers(sf) {
  const found = [];
  visit(sf, (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push({ node, specifier: node.moduleSpecifier.text });
    } else if (ts.isCallExpression(node)) {
      const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const required = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      const specifier = literalText(node.arguments[0]);
      if ((dynamic || required) && specifier !== null) found.push({ node, specifier });
    }
  });
  return found;
}

function coreImportsPack(sf, file, add) {
  for (const { node, specifier } of moduleSpecifiers(sf)) {
    if (!specifier.startsWith('.')) continue;
    const target = posix.normalize(posix.join(posix.dirname(file), specifier));
    if (target === 'services' || target.startsWith('services/')) {
      add(
        'core-imports-pack',
        node,
        `imports "${specifier}" from a service pack; the core reads pack files by path, never by import`,
      );
    }
  }
}

/** Names the file declares itself: functions, variables, parameters and import bindings. */
function declaredNames(sf) {
  const names = new Set();
  visit(sf, (node) => {
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isImportSpecifier(node) ||
        ts.isImportClause(node) ||
        ts.isNamespaceImport(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      names.add(node.name.text);
    }
  });
  return names;
}

function specSendsRequest(sf, add) {
  const reason = 'send requests through a client over BaseClient';
  for (const { node, specifier } of moduleSpecifiers(sf)) {
    if (HTTP_PACKAGES.has(specifier)) {
      add('spec-sends-request', node, `imports "${specifier}"; ${reason}`);
    }
  }
  const declared = declaredNames(sf);
  visit(sf, (node) => {
    if (
      ts.isImportSpecifier(node) &&
      (node.propertyName ?? node.name).text === 'request' &&
      literalText(node.parent.parent.parent.moduleSpecifier) === '@playwright/test'
    ) {
      add('spec-sends-request', node, `imports the Playwright request API; ${reason}`);
    }
    if (!ts.isCallExpression(node)) return;
    const { kind } = classifyCall(node);
    if (kind === 'test' || kind === 'hook') {
      for (const callback of node.arguments.filter((argument) => ts.isFunctionLike(argument))) {
        const fixtures = callback.parameters[0]?.name;
        if (!fixtures || !ts.isObjectBindingPattern(fixtures)) continue;
        for (const element of fixtures.elements) {
          const name = element.propertyName ?? element.name;
          if (ts.isIdentifier(name) && name.text === 'request') {
            add('spec-sends-request', element, `uses the request fixture; ${reason}`);
          }
        }
      }
    }
    const callee = node.expression;
    if (ts.isIdentifier(callee) && callee.text === 'fetch' && !declared.has('fetch')) {
      add('spec-sends-request', node, `calls fetch(); ${reason}`);
    }
    if (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === 'newContext' &&
      ts.isPropertyAccessExpression(callee.expression) &&
      callee.expression.name.text === 'request'
    ) {
      add('spec-sends-request', node, `opens a request context; ${reason}`);
    }
  });
}

/** Findings for one file, by its path relative to the tree root; one per line and rule. */
export function lintFile(text, file) {
  const core = CORE_DIRS.includes(file.split('/')[0]);
  const spec = SPEC_FILE.test(file);
  if (!core && !spec) return [];
  const sf = parse(text, file);
  const seen = new Map();
  const add = (rule, node, message) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const key = `${line}:${rule}`;
    if (!seen.has(key)) seen.set(key, finding(rule, file, line, message));
  };
  if (core) coreImportsPack(sf, file, add);
  if (spec) specSendsRequest(sf, add);
  return [...seen.values()];
}

/** Every core file and spec under `root`. */
export function lintLayers(root = REPO_ROOT) {
  return [...CORE_DIRS, 'services']
    .flatMap((dir) => codeFiles(root, dir))
    .flatMap((file) => lintFile(readFileSync(join(root, file), 'utf8'), file));
}

function main() {
  const values = parseCli({
    'self-test': { type: 'boolean', default: false },
    root: { type: 'string' },
  });
  if (values['self-test']) {
    process.exitCode = selfTest(TOOL, FIXTURES, lintLayers(FIXTURES));
    return;
  }
  process.exitCode = report(TOOL, lintLayers(resolve(values['root'] ?? REPO_ROOT)));
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
