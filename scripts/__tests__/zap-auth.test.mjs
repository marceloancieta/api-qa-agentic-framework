import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULE, addRuleParams, startZapAuth, zapApiUrl } from '../lib/zap-auth.mjs';

const PORT = 18089;
const VERSION = 'core/view/version';
const ADD = 'replacer/action/addRule';
const REMOVE = 'replacer/action/removeRule';

/** Let pending promise chains (fake fetches, response bodies) run. */
async function settle() {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

/** A clock and timers the test moves by hand: `fire()` runs the next timer at its time. */
function fakeClock(start = 1_000_000) {
  const clock = { now: start, pending: [] };
  clock.timers = {
    setTimeout: (fn, ms) => {
      const timer = { fn, ms, at: clock.now + ms };
      clock.pending.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      clock.pending = clock.pending.filter((pending) => pending !== timer);
    },
  };
  clock.fire = async () => {
    clock.pending.sort((a, b) => a.at - b.at);
    const next = clock.pending.shift();
    clock.now = next.at;
    next.fn();
    await settle();
    return next.ms;
  };
  return clock;
}

/**
 * ZAP's API: `core/view/version` refuses the connection for its first `downFor` calls; `answer`
 * may replace the answer to any call. Calls are recorded without the host.
 */
function fakeZap({ downFor = 0, answer } = {}) {
  const calls = [];
  let versions = 0;
  const impl = async (raw, { signal } = {}) => {
    const url = new URL(raw);
    assert.equal(url.origin, `http://127.0.0.1:${PORT}`);
    const path = url.pathname.replace(/^\/JSON\/|\/$/g, '');
    if (path === VERSION && (versions += 1) <= downFor) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    calls.push({ path, params: Object.fromEntries(url.searchParams) });
    const custom = answer?.(path, calls.length, signal);
    if (custom) return custom;
    return Response.json(path === VERSION ? { version: '2.17.0' } : { Result: 'OK' });
  };
  return { impl, calls, rules: () => calls.filter((call) => call.path.startsWith('replacer/')) };
}

/**
 * Credentials `Sv1`, `Sv2`, ... each due `every` ms after it is issued (never with null); renewing into number
 * `failAt` throws. `obtained` counts the calls of `obtain`.
 */
function issuer(clock, { every = 50_000, failAt = Infinity } = {}) {
  const issuer = { obtained: 0 };
  const make = (n) => ({
    type: 'login',
    header: 'Authorization',
    value: `Sv${n}`,
    renewAt: every === null ? undefined : clock.now + every,
    renew: async () => {
      if (n + 1 >= failAt) throw new Error('Login at /login answered 401.');
      return make(n + 1);
    },
  });
  issuer.obtain = async () => {
    issuer.obtained += 1;
    return make(1);
  };
  return issuer;
}

function start(clock, zap, credentials, options = {}) {
  const lines = [];
  const auth = startZapAuth({
    port: PORT,
    obtain: credentials.obtain,
    log: (line) => lines.push(line),
    fetchImpl: zap.impl,
    now: () => clock.now,
    timers: clock.timers,
    pollMs: 2_000,
    readyTimeoutMs: 10_000,
    ...options,
  });
  return { auth, lines };
}

test("ZAP's API URL and the replacer rule that puts the header on every request", () => {
  assert.equal(zapApiUrl(PORT, VERSION), `http://127.0.0.1:${PORT}/JSON/core/view/version/`);
  assert.equal(
    zapApiUrl(PORT, REMOVE, { description: RULE }),
    `http://127.0.0.1:${PORT}/JSON/replacer/action/removeRule/?description=qa-auth`,
  );
  assert.deepEqual(addRuleParams({ header: 'X-Key', value: 'k 1' }), {
    description: 'qa-auth',
    enabled: 'true',
    matchType: 'REQ_HEADER',
    matchRegex: 'false',
    matchString: 'X-Key',
    replacement: 'k 1',
    initiators: '',
  });
});

test("the credential is obtained only once ZAP's API answers, then the rule goes in", async () => {
  const clock = fakeClock();
  const zap = fakeZap({ downFor: 2 });
  const credentials = issuer(clock);
  const { auth, lines } = start(clock, zap, credentials);
  await settle();
  assert.equal(credentials.obtained, 0, 'not while the API is down');
  assert.equal(await clock.fire(), 2_000, 'polled every pollMs');
  assert.equal(credentials.obtained, 0);
  await clock.fire();
  assert.equal(credentials.obtained, 1);
  assert.deepEqual(
    zap.calls.map((call) => call.path),
    [VERSION, ADD],
  );
  assert.equal(zap.calls[1].params.matchString, 'Authorization');
  assert.equal(zap.calls[1].params.replacement, 'Sv1');
  assert.deepEqual(auth.state, {
    credential: { type: 'login', header: 'Authorization' },
    setAt: 4,
    renewals: 0,
    failure: null,
  });
  assert.deepEqual(lines, ["credential set in ZAP's replacer 4 s into the scan"]);
  await auth.stop();
  assert.deepEqual(clock.pending, [], 'no timer left');
});

test('at renewAt the credential is renewed and the rule swapped: removeRule, then addRule', async () => {
  const clock = fakeClock();
  const zap = fakeZap();
  const { auth, lines } = start(clock, zap, issuer(clock));
  await settle();
  assert.equal(await clock.fire(), 50_000, 'the timer waits until renewAt');
  assert.deepEqual(
    zap.rules().map((call) => [call.path, call.params.description, call.params.replacement]),
    [
      [ADD, RULE, 'Sv1'],
      [REMOVE, RULE, undefined],
      [ADD, RULE, 'Sv2'],
    ],
  );
  await clock.fire();
  assert.equal(zap.rules().at(-1).params.replacement, 'Sv3');
  assert.equal(auth.state.renewals, 2);
  assert.equal(auth.state.failure, null);
  assert.equal(lines.length, 1, 'renewals are counted, not logged one by one');
  await auth.stop();
});

test('a credential already due is renewed after minRenewMs, and one with no renewAt never is', async () => {
  const due = fakeClock();
  const late = start(due, fakeZap(), issuer(due, { every: -5_000 }), { minRenewMs: 1_000 });
  await settle();
  assert.equal(due.pending[0].ms, 1_000);
  await late.auth.stop();

  const fixed = fakeClock();
  const zap = fakeZap();
  const key = start(fixed, zap, issuer(fixed, { every: null }));
  await settle();
  assert.equal(zap.rules().length, 1);
  assert.deepEqual(fixed.pending, [], 'nothing scheduled');
  assert.equal(key.auth.state.setAt, 0);
  await key.auth.stop();
});

test('a renewal that fails is logged once, kept for the verdict and ends the renewals', async () => {
  const clock = fakeClock();
  const zap = fakeZap();
  const { auth, lines } = start(clock, zap, issuer(clock, { failAt: 3 }));
  await settle();
  await clock.fire();
  await clock.fire();
  assert.deepEqual(auth.state.failure, {
    stage: 'renewal',
    at: 100,
    reason: 'Login at /login answered 401',
  });
  assert.equal(auth.state.renewals, 1);
  assert.deepEqual(lines.slice(1), [
    'renewal 2 of the credential failed 100 s into the scan (Login at /login answered 401); no further renewal',
  ]);
  assert.deepEqual(clock.pending, [], 'no retry');
  assert.equal(zap.rules().length, 3, 'the rule is left as it was');
  await auth.stop();
});

test('a rule ZAP refuses during a renewal is a renewal failure, named without the value', async () => {
  const clock = fakeClock();
  let adds = 0;
  const zap = fakeZap({
    answer: (path) =>
      path === ADD && (adds += 1) > 1
        ? Response.json({ code: 'bad_action' }, { status: 400 })
        : null,
  });
  const { auth, lines } = start(clock, zap, issuer(clock));
  await settle();
  await clock.fire();
  assert.equal(auth.state.failure.stage, 'renewal');
  assert.equal(
    auth.state.failure.reason,
    `ZAP's API replacer/action/addRule answered 400 "bad_action"`,
  );
  assert.doesNotMatch(lines.join('\n'), /Sv\d/);
  await auth.stop();
});

test('a credential that cannot be obtained, or a first rule ZAP refuses, leaves it unset', async () => {
  const clock = fakeClock();
  const broken = {
    obtain: async () => {
      throw new Error('Auth "login" needs the environment variable U, which is not set.');
    },
  };
  const obtained = start(clock, fakeZap(), broken);
  await settle();
  assert.deepEqual(obtained.auth.state.failure, {
    stage: 'credential',
    at: 0,
    reason: 'Auth "login" needs the environment variable U, which is not set',
  });
  assert.equal(obtained.auth.state.setAt, null);
  assert.deepEqual(obtained.lines, [
    'the credential could not be set in ZAP 0 s into the scan (Auth "login" needs the environment variable U, which is not set)',
  ]);

  const refusing = fakeZap({
    answer: (path) => (path === ADD ? new Response('', { status: 500 }) : null),
  });
  const refused = start(fakeClock(), refusing, issuer(clock));
  await settle();
  assert.equal(refused.auth.state.failure.stage, 'rule');
  assert.equal(refused.auth.state.failure.reason, "ZAP's API replacer/action/addRule answered 500");
  assert.equal(refused.auth.state.setAt, null);
  assert.equal(refused.auth.state.credential.header, 'Authorization');
});

test("ZAP's API that does not answer in time is a failure; a scan that ends first is not", async () => {
  const clock = fakeClock();
  const credentials = issuer(clock);
  const { auth, lines } = start(clock, fakeZap({ downFor: Infinity }), credentials);
  await settle();
  while (clock.pending.length > 0) await clock.fire();
  assert.deepEqual(auth.state.failure, {
    stage: 'ready',
    at: 10,
    reason: "ZAP's API did not answer within 10 s",
  });
  assert.equal(credentials.obtained, 0);
  assert.equal(lines.length, 1);

  const early = fakeClock();
  const stopped = start(early, fakeZap({ downFor: Infinity }), issuer(early));
  await settle();
  await early.fire();
  await stopped.auth.stop();
  assert.deepEqual(stopped.auth.state, {
    credential: null,
    setAt: null,
    renewals: 0,
    failure: null,
  });
  assert.deepEqual(stopped.lines, []);
  assert.deepEqual(early.pending, []);
});

test('stop() ends a request in flight and the renewals without recording a failure', async () => {
  const clock = fakeClock();
  const zap = fakeZap({
    answer: (path, _n, signal) =>
      path === VERSION
        ? new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
        : null,
  });
  const { auth } = start(clock, zap, issuer(clock));
  await settle();
  await auth.stop();
  assert.equal(auth.state.failure, null);
  assert.deepEqual(clock.pending, []);
});
