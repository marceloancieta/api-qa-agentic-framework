#!/usr/bin/env node
// Harness linter (GATE-01): defects in how a spec drives the test runner, the kind that make a case
// pass, skip or report itself wrongly while the API is never really checked. Every rule reads the
// TypeScript syntax tree (scripts/lib/corpus.mjs), never raw text, and prefers silence over a
// guess (L-03): each one names the exact shape it reports.
//
//   xfail-armed-early (L-13)
//     An armed expected failure accepts any error, so it must be armed right before the action
//     under test. A "step" is an awaited call that is not reading a response already received
//     (`json`, `text`, `body`, `headers`, `status`, `statusText`, `ok`) and not `knownGap`, or a
//     skip/precondition call (`skipUnless`, `requireData`, `test.skip`). Counting from the arm to
//     the first assertion after it (or to the end of the body), more than one step is a finding:
//     the one allowed step is the action itself. `test.fail('title', fn)` arms at the first line
//     of the body, and an arm in a describe callback or a hook arms a whole group: both are
//     findings whenever the body has more than one step before its first assertion (the group
//     form always).
//   known-gap-untracked (L-14)
//     An arm's reason must be the value of `knownGap(key, why)`: either `await knownGap(...)` as
//     the argument or a variable initialized with it. `test.fail()` and `test.fail(condition)`
//     carry no reason; `test.fail('title', fn)` cannot carry one. Tag and arm must agree: an
//     armed test needs the `@known-gap` tag (on itself or a describe), and a tagged test needs an
//     arm.
//   metadata-after-skip (L-16)
//     Identity comes from the title and the automatic `caseMeta` fixture, so what can still be
//     lost is metadata written in the body: `operation(...)`, `caseDescription(...)` or an
//     `allure.*` call that comes after `test.skip`/`test.fixme` with a condition, `skipUnless` or
//     `requireData` in the same test. A skip ends the case, and the metadata is never recorded.
//   optional-assertion (L-19)
//     An assertion (`expect(...)` or a helper named `expect<Something>`) that only runs when a
//     condition about the checked value holds:
//       - inside one branch of an `if` whose other branch asserts nothing, or after an
//         `if (...) return;`, or on the right of `&&`, when the condition reads the response
//         status (`.ok()`, `.status()`) or shares a root identifier with what is asserted;
//       - inside the arguments of an optional call (`items?.forEach(...)`);
//       - inside a `catch` when neither the `try` nor the `catch` throws (nothing fails when the
//         call does not throw; `await expect(promise).rejects` is the form that cannot pass empty).
//     An `if` whose two branches both assert is a discriminated check, not an optional one.
//   shared-fixture-mutation (L-18)
//     A write call - a method named create, update, upsert, patch, put, post, delete, remove,
//     replace or modify, optionally followed by a capitalized suffix - outside the callback of
//     `withResourceGuard`, whose target (its first argument) is shared data. Shared means: a
//     literal id (number, string other than a path, or a path with a numeric segment); a
//     module-level constant with a literal value or named SEED_*/SHARED_* (also when imported);
//     a variable whose initializer is a literal or mentions one of those (taint follows
//     declarations in source order; names are not scoped). Objects are inspected through their
//     id-like properties (`id`, `*Id`, `*_id`) and spreads. Ids taken from builders or from a
//     response are never shared. Later arguments (a new name, a status) are not inspected.
//   module-scope-io (L-24)
//     Code that runs while the spec is imported - module scope and describe callbacks, not test or
//     hook bodies - calling I/O or something that can throw: functions named `read*`/`load*`
//     followed by a capital letter (readFileSync, loadService, loadEnvFile...), fetch, newContext,
//     statSync, writeFileSync, mkdirSync, execSync, execFileSync, spawnSync, require, `JSON.parse`
//     of anything but a literal, or a top-level `await`. Calls inside local functions are only
//     seen where the function is defined, not where it is called.
//   unnormalized-comparison (L-19, L-20)
//     `expect(a).toBe/toEqual/toStrictEqual(b)` where either side is a bare property whose name
//     is date-time-like (ends in Date, At, Time or Timestamp, or is date/time/timestamp) and the
//     other side is not null/undefined. Raw strings of the same instant differ (`Z` vs `+00:00`);
//     compare through `normalize.instant` or `expectSameState`. Whole-object comparisons are not
//     inspected: the field models cover them.
//
// Findings about a whole test are reported on the line of its title.
//
// Usage:
//   node scripts/lint-harness.mjs [--service <pack>]   every spec of every pack, or one
//   node scripts/lint-harness.mjs --self-test          exact-set check against the fixtures
// Exit 1 on findings (or an inexact self-test).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyCall, literalText, loadCorpus, parseSpecSource, ts } from './lib/corpus.mjs';
import { parseCli, REPO_ROOT } from './lib/cli.mjs';
import { finding, report, selfTest } from './lib/lint.mjs';

export const TOOL = 'lint-harness';
export const FIXTURES = join(import.meta.dirname, '__fixtures__', 'lint-harness');
export const RULES = [
  'xfail-armed-early',
  'known-gap-untracked',
  'metadata-after-skip',
  'optional-assertion',
  'shared-fixture-mutation',
  'module-scope-io',
  'unnormalized-comparison',
];

const KNOWN_GAP_TAG = '@known-gap';
const RESPONSE_READERS = new Set(['json', 'text', 'body', 'headers', 'status', 'statusText', 'ok']);
const SKIP_HELPERS = new Set(['skipUnless', 'requireData']);
const METADATA_HELPERS = new Set(['operation', 'caseDescription']);
const WRITE_METHOD =
  /^(?:create|update|upsert|patch|put|post|delete|remove|replace|modify)(?:[A-Z]\w*)?$/;
const SHARED_NAME = /^(?:SEED|SHARED)_[A-Z0-9_]*$/;
const ID_PROPERTY = /^(?:id|\w+Id|\w+_id)$/;
const IO_CALLS = new Set([
  'fetch',
  'newContext',
  'statSync',
  'writeFileSync',
  'mkdirSync',
  'execSync',
  'execFileSync',
  'spawnSync',
  'require',
]);
const IO_PREFIX = /^(?:read|load)[A-Z]/;
const EQUALITY_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual']);
const DATE_TIME_NAME = /(?:Date|At|Time|Timestamp)$|^(?:date|time|timestamp)$/;
const GLOBALS = new Set([
  'Array',
  'Object',
  'Number',
  'String',
  'Boolean',
  'JSON',
  'Math',
  'Date',
  'undefined',
]);

// ---------------------------------------------------------------------------------------------
// Syntax helpers

function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function descendants(node, visit) {
  ts.forEachChild(node, (child) => {
    visit(child);
    descendants(child, visit);
  });
}

function collect(node, accept) {
  const found = [];
  descendants(node, (child) => {
    if (accept(child)) found.push(child);
  });
  return found;
}

/** `a.b.c` as ['a', 'b', 'c'] when the expression is a plain chain of names, else null. */
function nameChain(expression) {
  const node = unwrap(expression);
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isPropertyAccessExpression(node)) {
    const head = nameChain(node.expression);
    return head ? [...head, node.name.text] : null;
  }
  return null;
}

const calleeChain = (call) => nameChain(call.expression);
const lastName = (call) => calleeChain(call)?.at(-1) ?? null;

function isArm(node) {
  if (!ts.isCallExpression(node)) return false;
  const { kind, modifier } = classifyCall(node);
  return kind === 'other' && modifier === 'fail';
}

function isSkipCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const { kind, modifier } = classifyCall(node);
  if (kind === 'other' && (modifier === 'skip' || modifier === 'fixme')) return true;
  const chain = calleeChain(node);
  return chain?.length === 1 && SKIP_HELPERS.has(chain[0]);
}

/**
 * The call an assertion starts from: `expect(x)` (also `expect.soft(x)`, `expect.poll(x)`) or a
 * helper whose name is `expect` followed by a capital letter (`expectSameState(...)`).
 */
function isAssertionAnchor(node) {
  if (!ts.isCallExpression(node)) return false;
  const chain = calleeChain(node);
  if (!chain) return false;
  if (chain[0] === 'expect' && chain.length <= 2) return true;
  return /^expect[A-Z]/.test(chain.at(-1));
}

/** The whole assertion statement around an anchor: `await expect(x).not.toBe(y)`. */
function assertionExtent(anchor) {
  let node = anchor;
  for (;;) {
    const parent = node.parent;
    if (!parent) return node;
    if (
      (ts.isPropertyAccessExpression(parent) && parent.expression === node) ||
      (ts.isCallExpression(parent) && parent.expression === node) ||
      ts.isAwaitExpression(parent) ||
      ts.isParenthesizedExpression(parent)
    ) {
      node = parent;
      continue;
    }
    return node;
  }
}

/** Assertion anchors in a node, the node itself included. */
const assertionsIn = (node) =>
  (isAssertionAnchor(node) ? [node] : []).concat(collect(node, isAssertionAnchor));
const within = (inner, outer) => inner.getStart() >= outer.getStart() && inner.end <= outer.end;

/** Identifiers an expression reads at its roots: `body.items[0]` -> body; globals left out. */
function rootIdentifiers(node) {
  const roots = new Set();
  const visit = (current) => {
    if (ts.isIdentifier(current)) {
      const parent = current.parent;
      const isMemberName =
        (ts.isPropertyAccessExpression(parent) && parent.name === current) ||
        (ts.isPropertyAssignment(parent) && parent.name === current);
      if (!isMemberName && !GLOBALS.has(current.text)) roots.add(current.text);
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return roots;
}

/** Whether a condition reads a response status: `response.ok()`, `r.status() === 200`. */
function readsStatus(condition) {
  return collect(condition, (node) => ts.isCallExpression(node))
    .concat(ts.isCallExpression(condition) ? [condition] : [])
    .some((call) => ['ok', 'status'].includes(lastName(call)));
}

/** What an assertion checks: the argument of `expect(...)`, every argument of a helper. */
function assertionSubjects(anchor) {
  const chain = calleeChain(anchor);
  return chain[0] === 'expect' ? anchor.arguments.slice(0, 1) : [...anchor.arguments];
}

function guardedBy(condition, anchor) {
  if (readsStatus(condition)) return true;
  const guard = rootIdentifiers(condition);
  return assertionSubjects(anchor).some((subject) =>
    [...rootIdentifiers(subject)].some((name) => guard.has(name)),
  );
}

const functionArgument = (call) => [...call.arguments].reverse().find((a) => ts.isFunctionLike(a));

// ---------------------------------------------------------------------------------------------
// Rules

function xfailAndKnownGap(spec, add) {
  const sf = spec.sourceFile;
  const tracked = new Set(
    collect(sf, ts.isVariableDeclaration)
      .filter((d) => d.initializer && ts.isIdentifier(d.name) && isKnownGapValue(d.initializer))
      .map((d) => d.name.text),
  );
  const reasonTracked = (arm) => {
    const reason = arm.arguments[1];
    if (!reason) return false;
    const value = unwrap(reason);
    return isKnownGapValue(value) || (ts.isIdentifier(value) && tracked.has(value.text));
  };

  const arms = collect(sf, isArm);
  for (const arm of arms) {
    const owner = ownerOf(arm);
    if (!owner || owner.kind !== 'test') {
      const where = owner ? 'for a whole group' : 'outside a test body';
      add('xfail-armed-early', arm, `test.fail armed ${where}; arm it inside the case`);
    }
    if (!reasonTracked(arm)) {
      add(
        'known-gap-untracked',
        arm,
        'test.fail reason does not come from knownGap(key, why), so no issue is linked',
      );
    } else if (owner?.kind === 'test') {
      const test = spec.tests.find((t) => t.node === owner.call);
      if (test && !test.tags.includes(KNOWN_GAP_TAG)) {
        add('known-gap-untracked', arm, `armed case is not tagged ${KNOWN_GAP_TAG}`);
      }
    }
  }

  for (const test of spec.tests) {
    const fn = functionArgument(test.node);
    const body = fn?.body;
    const own = arms.filter((arm) => ownerOf(arm)?.call === test.node);
    if (test.modifier === 'fail') {
      add(
        'known-gap-untracked',
        test.node.arguments[0],
        'test.fail(title, fn) cannot carry a knownGap reason; arm with test.fail(true, reason) in the body',
      );
    } else if (own.length === 0 && test.tags.includes(KNOWN_GAP_TAG)) {
      add('known-gap-untracked', test.node.arguments[0], `tagged ${KNOWN_GAP_TAG} but never armed`);
    }
    if (!body) continue;
    const starts =
      test.modifier === 'fail' ? [{ node: test.node.arguments[0], end: body.pos, arm: null }] : [];
    for (const arm of own) starts.push({ node: arm, end: arm.end, arm });
    for (const start of starts) {
      const steps = stepsBeforeAssertion(body, start.end, start.arm);
      if (steps > 1) {
        add(
          'xfail-armed-early',
          start.node,
          `test.fail armed ${steps} steps before the asserted action; arm right before it`,
        );
      }
    }
  }
}

function isKnownGapValue(node) {
  const value = unwrap(node);
  const call = ts.isAwaitExpression(value) ? unwrap(value.expression) : value;
  return ts.isCallExpression(call) && calleeChain(call)?.join('.') === 'knownGap';
}

/** The test, describe or hook whose callback contains `node`, as { kind, call }. */
function ownerOf(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isFunctionLike(current) || !ts.isCallExpression(current.parent)) continue;
    const call = current.parent;
    const { kind } = classifyCall(call);
    if (kind === 'test' || kind === 'describe' || kind === 'hook') return { kind, call };
  }
  return null;
}

function stepsBeforeAssertion(body, from, arm) {
  const assertions = assertionsIn(body)
    .map(assertionExtent)
    .filter((extent) => extent.getStart() >= from);
  const limit = Math.min(body.end, ...assertions.map((extent) => extent.getStart()));
  const counted = (node) =>
    node.getStart() >= from &&
    node.end <= limit &&
    !(arm && within(node, arm)) &&
    !assertions.some((extent) => within(node, extent));
  let steps = 0;
  descendants(body, (node) => {
    if (!counted(node)) return;
    if (ts.isAwaitExpression(node)) {
      const operand = unwrap(node.expression);
      if (ts.isCallExpression(operand)) {
        const name = lastName(operand);
        if (RESPONSE_READERS.has(name) || name === 'knownGap') return;
      }
      steps += 1;
    } else if (isSkipCall(node) && !ts.isAwaitExpression(node.parent)) {
      steps += 1;
    }
  });
  return steps;
}

function metadataAfterSkip(spec, add) {
  for (const test of spec.tests) {
    const body = functionArgument(test.node)?.body;
    if (!body) continue;
    const skips = collect(body, isSkipCall);
    if (skips.length === 0) continue;
    const firstSkipEnd = Math.min(...skips.map((s) => s.end));
    for (const call of collect(body, ts.isCallExpression)) {
      const chain = calleeChain(call);
      if (!chain) continue;
      const metadata =
        (chain.length === 1 && METADATA_HELPERS.has(chain[0])) ||
        (chain[0] === 'allure' && chain.length === 2);
      if (metadata && call.getStart() >= firstSkipEnd) {
        add(
          'metadata-after-skip',
          call,
          `${chain.join('.')} runs after a skip; a skipped case would be reported without it`,
        );
      }
    }
  }
}

function optionalAssertion(spec, add) {
  const sf = spec.sourceFile;
  const flag = (anchor, why) => add('optional-assertion', anchor, `assertion runs only ${why}`);

  for (const statement of collect(sf, ts.isIfStatement)) {
    const branches = [statement.thenStatement, statement.elseStatement].filter(Boolean);
    const asserting = branches.map((b) => assertionsIn(b));
    if (asserting.length === 2 && asserting[0].length > 0 && asserting[1].length > 0) continue;
    for (const anchor of asserting.flat()) {
      if (guardedBy(statement.expression, anchor)) flag(anchor, 'when its own condition holds');
    }
    if (!statement.elseStatement && exitsEarly(statement.thenStatement)) {
      const block = statement.parent;
      if (!ts.isBlock(block) && !ts.isSourceFile(block)) continue;
      const later = block.statements.slice(block.statements.indexOf(statement) + 1);
      for (const anchor of later.flatMap((s) => assertionsIn(s))) {
        if (guardedBy(statement.expression, anchor))
          flag(anchor, 'when an early return is skipped');
      }
    }
  }

  for (const binary of collect(sf, ts.isBinaryExpression)) {
    if (binary.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) continue;
    for (const anchor of assertionsIn(binary.right)) {
      if (guardedBy(binary.left, anchor)) flag(anchor, 'when the left side of && is truthy');
    }
  }

  for (const call of collect(sf, ts.isCallExpression)) {
    if (!ts.isOptionalChain(call) || isAssertionAnchor(call)) continue;
    for (const argument of call.arguments) {
      for (const anchor of assertionsIn(argument)) flag(anchor, 'when an optional value exists');
    }
  }

  for (const statement of collect(sf, ts.isTryStatement)) {
    const handler = statement.catchClause;
    if (!handler) continue;
    const throws = (node) =>
      collect(node, ts.isThrowStatement).length > 0 ||
      collect(node, ts.isCallExpression).some((call) => lastName(call) === 'fail' && !isArm(call));
    if (throws(statement.tryBlock) || throws(handler.block)) continue;
    for (const anchor of assertionsIn(handler.block)) flag(anchor, 'when the try block throws');
  }
}

function exitsEarly(statement) {
  if (ts.isReturnStatement(statement)) return true;
  return (
    ts.isBlock(statement) &&
    statement.statements.length === 1 &&
    exitsEarly(statement.statements[0])
  );
}

function sharedFixtureMutation(spec, add) {
  const sf = spec.sourceFile;
  const shared = new Set();
  for (const statement of sf.statements) {
    if (ts.isImportDeclaration(statement)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          if (SHARED_NAME.test(element.name.text)) shared.add(element.name.text);
        }
      }
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      const name = declaration.name.text;
      if (SHARED_NAME.test(name) || isLiteralValue(declaration.initializer)) shared.add(name);
    }
  }

  // Taint, in source order: a local is shared when its value mentions shared data or is a literal.
  const mentionsShared = (node) => [...rootIdentifiers(node)].some((name) => shared.has(name));
  for (const declaration of collect(sf, ts.isVariableDeclaration)) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
    if (isLiteralValue(declaration.initializer) || mentionsShared(declaration.initializer)) {
      shared.add(declaration.name.text);
    }
  }

  const sharedArgument = (argument) => {
    const node = unwrap(argument);
    if (!node) return false;
    if (ts.isNumericLiteral(node) || isNegativeNumber(node)) return true;
    const text = literalText(node);
    if (text !== null) return text.startsWith('/') ? /\/\d+(?:[/?#]|$)/.test(text) : true;
    if (ts.isTemplateExpression(node)) {
      return /\/\d+(?:[/?#]|$)/.test(node.head.text) || mentionsShared(node);
    }
    if (ts.isObjectLiteralExpression(node)) {
      return node.properties.some((property) => {
        if (ts.isSpreadAssignment(property)) return mentionsShared(property.expression);
        const name = property.name && ts.isIdentifier(property.name) ? property.name.text : null;
        if (!name || !ID_PROPERTY.test(name)) return false;
        if (ts.isShorthandPropertyAssignment(property)) return shared.has(name);
        return ts.isPropertyAssignment(property) && sharedArgument(property.initializer);
      });
    }
    if (ts.isArrayLiteralExpression(node)) return node.elements.some(sharedArgument);
    return mentionsShared(node);
  };

  for (const call of collect(sf, ts.isCallExpression)) {
    if (!ts.isPropertyAccessExpression(call.expression)) continue;
    const method = call.expression.name.text;
    if (!WRITE_METHOD.test(method) || insideResourceGuard(call)) continue;
    if (!sharedArgument(call.arguments[0])) continue;
    const target = call.expression.expression.getText(sf);
    add(
      'shared-fixture-mutation',
      call,
      `${target}.${method} writes shared data outside withResourceGuard`,
    );
  }
}

function isNegativeNumber(node) {
  return (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  );
}

function isLiteralValue(node) {
  const value = unwrap(node);
  return Boolean(
    value && (ts.isNumericLiteral(value) || isNegativeNumber(value) || literalText(value) !== null),
  );
}

function insideResourceGuard(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (!ts.isFunctionLike(current) || !ts.isCallExpression(current.parent)) continue;
    if (lastName(current.parent) === 'withResourceGuard') return true;
  }
  return false;
}

function moduleScopeIo(spec, add) {
  const visit = (node) => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
    if (ts.isAwaitExpression(node)) {
      add('module-scope-io', node, 'top-level await runs while the spec is imported');
      return;
    }
    if (ts.isCallExpression(node)) {
      const { kind } = classifyCall(node);
      if (kind === 'test' || kind === 'hook') return;
      if (kind === 'describe') {
        for (const argument of node.arguments) {
          if (ts.isFunctionLike(argument) && argument.body) visit(argument.body);
        }
        return;
      }
      const reason = ioReason(node);
      if (reason) {
        add(
          'module-scope-io',
          node,
          `${reason} runs while the spec is imported; move it into a fixture`,
        );
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  spec.sourceFile.statements.forEach(visit);
}

function ioReason(call) {
  const chain = calleeChain(call);
  if (!chain) return null;
  const name = chain.at(-1);
  if (IO_CALLS.has(name) || IO_PREFIX.test(name)) return `${chain.join('.')}(...)`;
  if (chain.join('.') === 'JSON.parse' && !isLiteralValue(call.arguments[0]))
    return 'JSON.parse(...)';
  return null;
}

function unnormalizedComparison(spec, add) {
  for (const call of collect(spec.sourceFile, ts.isCallExpression)) {
    if (!ts.isPropertyAccessExpression(call.expression)) continue;
    if (!EQUALITY_MATCHERS.has(call.expression.name.text)) continue;
    const anchor = expectAnchorOf(call.expression.expression);
    if (!anchor) continue;
    const [actual] = anchor.arguments;
    const [expected] = call.arguments;
    if (!actual || !expected || isNullish(expected) || isNullish(actual)) continue;
    const field = dateTimeField(actual) ?? dateTimeField(expected);
    if (field) {
      add(
        'unnormalized-comparison',
        call,
        `${field} compared as raw text; compare instants (normalize.instant or expectSameState)`,
      );
    }
  }
}

function expectAnchorOf(expression) {
  let node = unwrap(expression);
  while (ts.isPropertyAccessExpression(node)) node = unwrap(node.expression);
  return ts.isCallExpression(node) && isAssertionAnchor(node) && calleeChain(node)[0] === 'expect'
    ? node
    : null;
}

function dateTimeField(node) {
  const value = unwrap(node);
  let name = null;
  if (ts.isPropertyAccessExpression(value)) name = value.name.text;
  else if (ts.isElementAccessExpression(value)) name = literalText(value.argumentExpression);
  return name && DATE_TIME_NAME.test(name) ? name : null;
}

function isNullish(node) {
  const value = unwrap(node);
  return (
    value.kind === ts.SyntaxKind.NullKeyword ||
    (ts.isIdentifier(value) && value.text === 'undefined')
  );
}

// ---------------------------------------------------------------------------------------------
// Driver

const RULE_FUNCTIONS = [
  xfailAndKnownGap,
  metadataAfterSkip,
  optionalAssertion,
  sharedFixtureMutation,
  moduleScopeIo,
  unnormalizedComparison,
];

/** Findings for one parsed spec (`parseSpecSource` output), deduplicated by line and rule. */
export function lintSpec(spec) {
  const sf = spec.sourceFile;
  const seen = new Map();
  const add = (rule, node, message) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    const key = `${line}:${rule}`;
    if (!seen.has(key)) seen.set(key, finding(rule, spec.file, line, message));
  };
  for (const rule of RULE_FUNCTIONS) rule(spec, add);
  return [...seen.values()];
}

export const lintSource = (text, file) => lintSpec(parseSpecSource(text, file));

/** Every spec of every pack (or one) under `root`. */
export function lintRepository(root = REPO_ROOT, service = null) {
  return loadCorpus(root, service).flatMap(lintSpec);
}

function tsFilesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFilesUnder(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

/** The fixture files, linted with paths relative to `dir` (as the self-test compares them). */
export function lintFixtures(dir = FIXTURES) {
  return tsFilesUnder(dir).flatMap((path) =>
    lintSource(readFileSync(path, 'utf8'), relative(dir, path).replace(/\\/g, '/')),
  );
}

function main() {
  const values = parseCli({ 'self-test': { type: 'boolean', default: false } });
  if (values['self-test']) {
    process.exitCode = selfTest(TOOL, FIXTURES, lintFixtures());
    return;
  }
  process.exitCode = report(TOOL, lintRepository(REPO_ROOT, values.service ?? null));
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
