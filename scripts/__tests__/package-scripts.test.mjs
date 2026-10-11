// The npm scripts themselves (CI-04, L-49): CI and the hooks call them, so a chain must stop at the
// first failure and end with its exit code. `a && b` does; `a; b` and `a || b` run on after a
// failure, `a | b` ends with the code of b, and `a & b` does not wait for a at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';

const SCRIPTS = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).scripts;

/** The command with quoted text blanked out, so operators inside quotes are not read as such. */
const unquoted = (command) => command.replace(/"[^"]*"|'[^']*'/g, (q) => ' '.repeat(q.length));

/** Why a script line can lose a failure, one reason per problem; [] when it cannot. */
function chainProblems(command) {
  const text = unquoted(command);
  const problems = [];
  if (text.includes(';')) problems.push('`;` runs the next command after a failure');
  if (text.includes('||')) problems.push('`||` turns a failure into whatever follows');
  if (/(^|[^|])\|([^|]|$)/.test(text))
    problems.push('`|` ends with the exit code of the last command');
  if (/(^|[^&])&([^&]|$)/.test(text)) problems.push('`&` runs a command without waiting for it');
  if (/\bexit\s+0\b|\btrue\s*$/.test(text)) problems.push('ends in success whatever ran before');
  return problems;
}

test('the chain check finds each way to lose a failure, and only those', () => {
  const lossy = {
    'a; b': 1,
    'a || true': 2,
    'a || echo failed': 1,
    'a | tee out.txt': 1,
    'a & b': 1,
    'a && exit 0': 1,
  };
  for (const [command, count] of Object.entries(lossy)) {
    assert.equal(chainProblems(command).length, count, command);
  }
  const sound = [
    'eslint .',
    'npm run lint && npm run format:check',
    'node --test "scripts/__tests__/*.test.mjs"',
    'node x.mjs --grep "a|b; c || d & e"',
    "node -e 'process.exit(0)'",
    'playwright test --project=api --grep @smoke',
  ];
  for (const command of sound) assert.deepEqual(chainProblems(command), [], command);
});

test('every npm script stops at the first failure and keeps its exit code', () => {
  const found = Object.entries(SCRIPTS).flatMap(([name, command]) =>
    chainProblems(command).map((problem) => `${name}: ${problem}`),
  );
  assert.deepEqual(found, []);
});

test('every `npm run` target and every script file a script names exists', () => {
  const missing = [];
  for (const [name, command] of Object.entries(SCRIPTS)) {
    for (const [, target] of command.matchAll(/\bnpm run (\S+)/g)) {
      if (!(target in SCRIPTS)) missing.push(`${name}: npm run ${target}`);
    }
    for (const [, file] of command.matchAll(/\bnode (scripts\/\S+\.mjs)/g)) {
      if (!existsSync(join(REPO_ROOT, file))) missing.push(`${name}: ${file}`);
    }
  }
  assert.deepEqual(missing, []);
});
