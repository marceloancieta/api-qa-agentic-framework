import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import {
  PS_ARGS,
  containerBase,
  freeLoopbackPort,
  httpUrl,
  parseComposePs,
  reachableBase,
  spawnAsync,
  stoppableSleep,
  watchLiveness,
} from '../lib/container.mjs';
import { describeExit, exitCodeOf, spawnFailure } from '../lib/spawn.mjs';

const FIXTURES = join(REPO_ROOT, 'scripts', '__fixtures__', 'container');
const PS_LINES = readFileSync(join(FIXTURES, 'compose-ps-lines.txt'), 'utf8');
const PS_ARRAY = readFileSync(join(FIXTURES, 'compose-ps-array.json'), 'utf8');
const ZAP = { name: 'ZAP', service: 'zap' };

test('only http(s) URLs are accepted, and the message names the URL', () => {
  assert.equal(httpUrl('http://localhost:8080/api', 'the base URL').port, '8080');
  assert.throws(
    () => httpUrl('ftp://example.test', 'the base URL'),
    /the base URL must be an http/,
  );
  assert.throws(() => httpUrl('not a url', 'the spec URL'), /got "not a url"/);
});

test('compose ps output is read as one object per line or as an array', () => {
  assert.deepEqual(
    parseComposePs(PS_LINES).map((s) => s.Service),
    ['zap', 'stopped-api', 'demo-api', 'db'],
  );
  assert.deepEqual(
    parseComposePs(PS_ARRAY).map((s) => s.Service),
    ['staging-api'],
  );
  assert.deepEqual(parseComposePs(''), []);
  assert.deepEqual(parseComposePs('\r\n'), []);
});

test('a loopback base becomes the running compose service that publishes its port', () => {
  const services = parseComposePs(PS_LINES);
  const base = containerBase('http://localhost:9000/api', services, ZAP);
  assert.equal(base.url, 'http://demo-api:8000/api', 'the target port, not the stopped service');
  assert.match(base.note, /compose service "demo-api" publishes port 9000; ZAP reaches it/);
  assert.equal(containerBase('http://127.0.0.1:15432', services, ZAP).url, 'http://db:5432');
  const array = containerBase('http://127.0.0.1:9001', parseComposePs(PS_ARRAY));
  assert.equal(array.url, 'http://staging-api:5000');
});

test("the tool's own compose service is never the target", () => {
  const ps = [
    {
      Service: 'k6',
      State: 'running',
      Publishers: [{ TargetPort: 6565, PublishedPort: 9000 }],
    },
  ];
  const tool = { name: 'k6', service: 'k6' };
  assert.equal(
    containerBase('http://localhost:9000', ps, tool).url,
    'http://host.docker.internal:9000',
  );
  assert.equal(containerBase('http://localhost:9000', ps).url, 'http://k6:6565', 'another tool');
});

test('without a compose service on the port the base goes through host.docker.internal', () => {
  const base = containerBase('http://localhost:9999/v1', parseComposePs(PS_LINES), ZAP);
  assert.equal(base.url, 'http://host.docker.internal:9999/v1');
  assert.match(
    base.note,
    /no running compose service publishes port 9999, so ZAP goes through.*Linux.*beyond 127.0.0.1/,
  );
  assert.equal(containerBase('http://localhost', []).url, 'http://host.docker.internal');
  assert.deepEqual(containerBase('https://api.example.test/v1', []), {
    url: 'https://api.example.test/v1',
    note: null,
  });
});

test('a remote base is returned without asking compose', () => {
  const calls = [];
  const run = (args) => calls.push(args);
  assert.deepEqual(reachableBase('https://api.example.test/v1', { root: '.', run, tool: ZAP }), {
    url: 'https://api.example.test/v1',
    note: null,
  });
  assert.deepEqual(calls, []);
});

test('a loopback base asks compose ps, captured, in the root', () => {
  const calls = [];
  const run = (args, options) => {
    calls.push({ args, options });
    return { status: 0, signal: null, stdout: PS_LINES, stderr: '' };
  };
  const base = reachableBase('http://localhost:9000/api', { root: 'here', run, tool: ZAP });
  assert.equal(base.url, 'http://demo-api:8000/api');
  assert.deepEqual(calls, [{ args: [...PS_ARGS], options: { cwd: 'here', capture: true } }]);
});

test('compose ps that fails or prints no JSON is an error, never a guess', () => {
  const failing = () => ({ status: 1, signal: null, stdout: '', stderr: 'boom\nno daemon' });
  assert.deepEqual(reachableBase('http://localhost:9000', { root: '.', run: failing, tool: ZAP }), {
    error: 'docker compose ps exit 1: no daemon; cannot tell which service publishes the port',
  });
  const garbage = () => ({ status: 0, signal: null, stdout: 'not json', stderr: '' });
  assert.match(
    reachableBase('http://localhost:9000', { root: '.', run: garbage, tool: ZAP }).error,
    /^docker compose ps printed no JSON/,
  );
  const missing = () => ({ error: new Error('spawn docker ENOENT'), status: null, signal: null });
  assert.match(
    reachableBase('http://localhost:9000', { root: '.', run: missing, tool: ZAP }).error,
    /could not run: spawn docker ENOENT/,
  );
});

test('an async run resolves like a spawnSync result, and never rejects', async () => {
  const exited = await spawnAsync(process.execPath, ['-e', 'process.exit(3)'], { cwd: REPO_ROOT });
  assert.deepEqual(exited, { status: 3, signal: null });
  assert.equal(exitCodeOf(exited), 3);
  assert.equal(describeExit(exited), 'exit 3');
  const missing = await spawnAsync('no-such-command-qa', [], { cwd: REPO_ROOT });
  assert.equal(missing.status, null);
  assert.match(spawnFailure(missing), /^could not run: spawn no-such-command-qa ENOENT/);
  assert.equal(exitCodeOf(missing), 1);
});

test('a free loopback port can be listened on', async () => {
  const port = await freeLoopbackPort();
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536, String(port));
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => server.close(resolve));
});

test('a stoppable sleep ends at once on cancel and leaves no timer', async () => {
  const pending = new Set();
  const timers = {
    setTimeout: (fn, ms) => {
      const timer = { fn, ms };
      pending.add(timer);
      return timer;
    },
    clearTimeout: (timer) => pending.delete(timer),
  };
  const clock = stoppableSleep(timers);
  const slept = clock.sleep(60_000);
  assert.equal(pending.size, 1);
  clock.cancel();
  await slept;
  assert.equal(pending.size, 0);
  clock.cancel(); // nothing to cancel: a no-op
});

/** A fetch whose answer to call n (from 1) is `answer(n)`: a status, or an error to throw. */
function scripted(answer) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, redirect: init.redirect });
    const outcome = answer(calls.length);
    if (outcome instanceof Error) throw outcome;
    return new Response('x', { status: outcome });
  };
  return { impl, calls };
}

const refused = () => new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
const until = async (condition) => {
  while (!condition()) await new Promise((resolve) => setTimeout(resolve, 2));
};

test('the API is down after the set number of checks in a row without an answer', async () => {
  const fetcher = scripted(refused);
  const downs = [];
  const watch = watchLiveness('http://localhost:9000/api', {
    fetchImpl: fetcher.impl,
    intervalMs: 2,
    misses: 3,
    onDown: (state) => downs.push({ ...state }),
  });
  await until(() => watch.state.down);
  await watch.stop();
  assert.deepEqual(downs, [{ down: true, misses: 3, checks: 3, reason: 'ECONNREFUSED' }]);
  assert.equal(fetcher.calls.length, 3, 'no check after the verdict');
  assert.deepEqual(fetcher.calls[0], { url: 'http://localhost:9000/api', redirect: 'manual' });
});

test('any HTTP answer counts, and an answer resets the misses', async () => {
  const fetcher = scripted((n) => (n % 3 === 0 ? 500 : refused()));
  const watch = watchLiveness('http://localhost:9000', {
    fetchImpl: fetcher.impl,
    intervalMs: 2,
    misses: 3,
    onDown: () => assert.fail('never down'),
  });
  await until(() => fetcher.calls.length >= 9);
  await watch.stop();
  assert.equal(watch.state.down, false);
  assert.ok(watch.state.misses < 3);
});

test('a check that gets no answer in time is a miss, and stop() ends the watch at once', async () => {
  const hanging = async (_url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  const slow = watchLiveness('http://localhost:9000', {
    fetchImpl: hanging,
    intervalMs: 1,
    timeoutMs: 10,
    misses: 2,
  });
  await until(() => slow.state.down);
  assert.equal(slow.state.reason, 'no answer within 0.01 s');
  await slow.stop();

  const idle = watchLiveness('http://localhost:9000', { fetchImpl: hanging, intervalMs: 60_000 });
  await idle.stop();
  assert.deepEqual(idle.state, { down: false, misses: 0, checks: 0, reason: null });
});
