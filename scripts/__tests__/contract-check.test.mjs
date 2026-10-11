// The contract check wrapper (CI-04, L-49): every check for every pack runs, and any check that
// fails, is killed or cannot start makes the wrapper exit 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, contractCheck } from '../contract-check.mjs';

const silent = () => {
  const lines = [];
  return { lines, log: (line) => lines.push(line), error: (line) => lines.push(line) };
};

/** A spawnSync stand-in: `outcome(script, pack)` gives the child's result. */
const fakeSpawn =
  (outcome, calls = []) =>
  (command, args) => {
    const script = args[0].split(/[\\/]/).at(-1);
    const pack = args[args.indexOf('--service') + 1];
    calls.push([script, pack, args.at(-1)]);
    return { stdout: null, stderr: null, signal: null, ...outcome(script, pack) };
  };

test('every check runs once per pack in --check mode, and all passing exits 0', () => {
  const calls = [];
  const out = silent();
  const code = contractCheck(['a', 'b'], { spawn: fakeSpawn(() => ({ status: 0 }), calls), out });
  assert.equal(code, 0);
  assert.deepEqual(
    calls,
    ['a', 'b'].flatMap((pack) => CHECKS.map((script) => [script, pack, '--check'])),
  );
});

test('a failed, killed or unstartable check exits 1 and names how it ended', () => {
  const error = Object.assign(new Error('spawnSync node ENOENT'), { code: 'ENOENT' });
  const outcomes = [
    [{ status: 1 }, 'exit 1'],
    [{ status: null, signal: 'SIGKILL' }, 'killed by SIGKILL'],
    [{ status: null, error }, 'could not run: spawnSync node ENOENT'],
  ];
  for (const [result, words] of outcomes) {
    const out = silent();
    const spawn = fakeSpawn((script) => (script === CHECKS[1] ? result : { status: 0 }));
    assert.equal(contractCheck(['a'], { spawn, out }), 1, words);
    assert.deepEqual(out.lines, [`contract-check: ${CHECKS[1]} --service a failed (${words}).`]);
  }
});

test('no pack is nothing to check', () => {
  const out = silent();
  assert.equal(contractCheck([], { spawn: () => assert.fail('nothing should run'), out }), 0);
  assert.match(out.lines[0], /no service packs/);
});
