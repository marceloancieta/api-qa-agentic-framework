import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { PS_ARGS } from '../lib/container.mjs';
import { loadModel } from '../lib/openapi.mjs';
import {
  DEFAULT_LOAD,
  derivePlan,
  k6Args,
  parseLaneArgs,
  perfLane,
  preflight,
  readPackFile,
  resolveBase,
  successStatus,
  summaryLines,
} from '../perf-lane.mjs';
import { k6Latency } from '../quality-gate.mjs';

const FIXTURES = join(REPO_ROOT, 'scripts', '__fixtures__', 'perf-lane');
const PS_LINES = readFileSync(
  join(REPO_ROOT, 'scripts', '__fixtures__', 'container', 'compose-ps-lines.txt'),
  'utf8',
);
const SUMMARY = JSON.parse(
  readFileSync(
    join(REPO_ROOT, 'scripts', '__fixtures__', 'quality-gate', 'k6-summary.json'),
    'utf8',
  ),
);
const LOAD = { rate: 5, duration: '2s', vus: 2 };
const DEMO = { service: 'demo', base: null, out: 'demo', load: LOAD };
const PLAIN = { service: 'plain', base: null, out: 'plain', load: LOAD };

/** The fixture summary with every check passing. */
function passingSummary() {
  const summary = structuredClone(SUMMARY);
  for (const [name, metric] of Object.entries(summary.metrics)) {
    if (name.startsWith('checks')) metric.values = { ...metric.values, fails: 0, rate: 1 };
  }
  return summary;
}

/** A scratch copy of the fixture tree, so the lane's reports directory never lands in the repo. */
function scratchRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'perf-lane-'));
  cpSync(FIXTURES, root, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

/** A fetch that answers every URL with `status`, or throws `error`; it records the URLs. */
function fakeFetch({ status = 200, error } = {}) {
  const urls = [];
  const impl = async (url) => {
    urls.push(url);
    if (error) throw error;
    return new Response('', { status });
  };
  return { impl, urls };
}

/**
 * A docker runner that records its calls. `compose ps` prints `ps`; the k6 run writes `summary`
 * (when given) where k6 would and exits `status`.
 */
function fakeRunner({ status = 0, summary, ps = PS_LINES, ...rest } = {}) {
  const calls = [];
  const run = (args, { cwd, capture }) => {
    calls.push({ args, cwd, capture: Boolean(capture) });
    if (args[1] === 'ps') return { status: 0, signal: null, stdout: ps, stderr: '' };
    const target = args.find((arg) => arg.startsWith('SUMMARY=')).slice('SUMMARY=/perf/'.length);
    if (summary !== undefined) {
      const text = typeof summary === 'string' ? summary : JSON.stringify(summary);
      writeFileSync(join(cwd, 'reports', 'perf', target), text);
    }
    return { status, signal: null, ...rest };
  };
  return { run, calls, k6: () => calls.find((call) => call.args[1] === 'run') };
}

async function lane(t, options, runner, { fetcher = fakeFetch(), root = scratchRoot(t) } = {}) {
  const lines = [];
  const code = await perfLane(options, {
    root,
    env: {},
    run: runner.run,
    fetchImpl: fetcher.impl,
    log: (line) => lines.push(line),
  });
  return { code, root, output: lines.join('\n'), fetcher };
}

// ---------------------------------------------------------------------------------------------
// Arguments

test('arguments: defaults, overrides and the pack name as the report name', () => {
  assert.deepEqual(parseLaneArgs(['--service', 'demo'], FIXTURES), {
    service: 'demo',
    base: null,
    out: 'demo',
    load: { ...DEFAULT_LOAD },
  });
  assert.deepEqual(
    parseLaneArgs(
      ['--service', 'demo', '--out', 'demo-2', '--rate', '50', '--duration', '2m', '--vus', '4'],
      FIXTURES,
    ),
    { service: 'demo', base: null, out: 'demo-2', load: { rate: 50, duration: '2m', vus: 4 } },
  );
});

test('arguments: a missing pack, a bad report name or a bad load is refused with the reason', () => {
  assert.throws(() => parseLaneArgs([], FIXTURES), /--service <name> \(packs: demo, plain\)/);
  assert.throws(() => parseLaneArgs(['--service', 'demo', '--out', '../x'], FIXTURES), /--out/);
  for (const [flag, value] of [
    ['--rate', '0'],
    ['--rate', '2.5'],
    ['--vus', '-1'],
  ]) {
    assert.throws(
      () => parseLaneArgs(['--service', 'demo', `${flag}=${value}`], FIXTURES),
      new RegExp(`${flag} must be a positive integer`),
    );
  }
  for (const duration of ['30', '0s', '1d', 's']) {
    assert.throws(
      () => parseLaneArgs(['--service', 'demo', '--duration', duration], FIXTURES),
      /--duration must be a k6 duration/,
      duration,
    );
  }
});

test('the base comes from --base or from the pack in the active environment', () => {
  assert.deepEqual(resolveBase(DEMO, FIXTURES, {}), {
    baseUrl: 'http://localhost:9000/api',
    baseFrom: 'base_url of "demo" in environment "local"',
  });
  assert.deepEqual(resolveBase({ ...DEMO, base: 'https://api.example.test/' }, FIXTURES, {}), {
    baseUrl: 'https://api.example.test',
    baseFrom: '--base',
  });
  assert.equal(
    resolveBase(DEMO, FIXTURES, { QA_DEMO_BASE_URL: 'http://127.0.0.1:9100' }).baseUrl,
    'http://127.0.0.1:9100',
  );
  assert.throws(() => resolveBase({ ...DEMO, base: 'ftp://x.test' }, FIXTURES, {}), /http\(s\)/);
  assert.throws(
    () => resolveBase({ ...DEMO, service: 'other' }, FIXTURES, {}),
    /no entry for pack/,
  );
});

// ---------------------------------------------------------------------------------------------
// The pack's file

test("a pack without perf.json has empty settings; a pack's file is read as written", () => {
  assert.deepEqual(readPackFile('plain', FIXTURES), { params: {}, anonymous: {}, exclude: {} });
  const demo = readPackFile('demo', FIXTURES);
  assert.deepEqual(demo.params, { id: 7, tag: ['a', 'b'], username: 'a b' });
  assert.deepEqual(demo.exclude, { 'GET /reset': 'it resets the data' });
});

test('a perf.json with an unknown key, a bad value or no reason is refused with every problem', (t) => {
  const root = scratchRoot(t);
  const file = join(root, 'services', 'plain', 'perf.json');
  writeFileSync(file, '{ "params": ');
  assert.throws(() => readPackFile('plain', root), /perf\.json is not valid JSON/);
  writeFileSync(file, '[]');
  assert.throws(() => readPackFile('plain', root), /must hold an object/);
  writeFileSync(
    file,
    JSON.stringify({
      include: {},
      params: { id: { nested: 1 }, list: [] },
      anonymous: { 'GET /x': '' },
      exclude: [],
    }),
  );
  assert.throws(
    () => readPackFile('plain', root),
    (error) =>
      [
        /unknown key "include"/,
        /"exclude" must be an object/,
        /params\.id must be a string, number, boolean or a list of them/,
        /params\.list must be/,
        /anonymous\["GET \/x"\] must give its reason as text/,
      ].every((pattern) => pattern.test(error.message)),
  );
});

// ---------------------------------------------------------------------------------------------
// The plan

test('the plan fills required parameters from the pack, an example, a default or an enum', async () => {
  const model = await loadModel(join(FIXTURES, 'services', 'demo', 'openapi.json'));
  const { requests } = derivePlan(model, readPackFile('demo', FIXTURES));
  assert.deepEqual(requests, [
    { name: 'GET /items', path: '/items?status=open', status: 200 },
    { name: 'GET /items/{id}', path: '/items/7', status: 200 },
    { name: 'GET /lookup/{name}', path: '/lookup/ex1?size=20', status: 200 },
    { name: 'GET /tags', path: '/tags?tag=a&tag=b', status: 200 },
    { name: 'GET /users/{username}', path: '/users/a%20b', status: 200 },
    {
      name: 'GET /open-secret',
      path: '/open-secret',
      status: 200,
      note: 'sent without credentials: the key is not checked',
    },
    { name: 'GET /optional', path: '/optional', status: 200 },
  ]);
});

test('every operation left out of the plan carries its reason', async () => {
  const model = await loadModel(join(FIXTURES, 'services', 'demo', 'openapi.json'));
  assert.deepEqual(derivePlan(model, readPackFile('demo', FIXTURES)).skipped, [
    {
      name: 'GET /secret',
      reason: 'the contract requires credentials (bearer or key); the lane sends none yet',
    },
    { name: 'GET /reset', reason: 'excluded by perf.json: it resets the data' },
    {
      name: 'GET /no-success',
      reason: 'the contract declares no 2xx response, so there is no success to check',
    },
    {
      name: 'GET /needs-header',
      reason:
        'it requires the header parameter "X-Trace"; the lane sends path and query parameters only',
    },
    {
      name: 'GET /unfilled/{ref}',
      reason: 'no value for the required path parameter "ref"; give one in perf.json "params"',
    },
  ]);
});

test('without a pack file, secured operations are left out and the rest is planned', async () => {
  const model = await loadModel(join(FIXTURES, 'services', 'plain', 'openapi.yaml'));
  assert.deepEqual(derivePlan(model), {
    requests: [{ name: 'GET /health', path: '/health', status: 200 }],
    skipped: [
      {
        name: 'GET /private',
        reason: 'the contract requires credentials (bearer); the lane sends none yet',
      },
    ],
  });
});

test('a pack file that names an operation the contract lacks is refused, never ignored', async () => {
  const model = await loadModel(join(FIXTURES, 'services', 'plain', 'openapi.yaml'));
  assert.throws(
    () =>
      derivePlan(model, {
        params: {},
        anonymous: { 'GET /gone': 'renamed' },
        exclude: { 'POST /health': 'not a GET' },
      }),
    /not GET operations of the contract: anonymous\["GET \/gone"\], exclude\["POST \/health"\]/,
  );
});

test('the success status is the lowest declared 2xx', () => {
  const op = (...statuses) => ({ responses: statuses.map((status) => ({ status })) });
  assert.equal(successStatus(op('404', '204', '200')), 200);
  assert.equal(successStatus(op('201', 'default')), 201);
  assert.equal(successStatus(op('2XX', 'default', '302')), null);
});

// ---------------------------------------------------------------------------------------------
// The run and its report

test('the k6 command runs the fixed script with the plan and the summary under /perf', () => {
  assert.deepEqual(k6Args('demo'), [
    'compose',
    'run',
    '--rm',
    'k6',
    'run',
    '-e',
    'PLAN=/perf/demo-plan.json',
    '-e',
    'SUMMARY=/perf/demo.json',
    '/k6/smoke.js',
  ]);
});

test('preflight: any HTTP status is an answer; a connection failure is not', async () => {
  assert.equal(await preflight('http://x.test/a', fakeFetch({ status: 500 }).impl), null);
  const refused = Object.assign(new TypeError('fetch failed'), {
    cause: { code: 'ECONNREFUSED' },
  });
  assert.equal(
    await preflight('http://x.test/a', fakeFetch({ error: refused }).impl),
    'http://x.test/a did not answer (ECONNREFUSED)',
  );
});

test('summary lines give the overall figures, then each operation, slowest first', () => {
  assert.deepEqual(summaryLines(k6Latency(SUMMARY)), [
    '120 requests, p95 42.5 ms, max 95.3 ms; 2 iteration(s) dropped: --vus could not keep --rate, latency is high',
    '  GET /items/{id}: 60 requests, p95 61.5 ms, max 95.3 ms, 3 with an unexpected status',
    '  GET /items: 60 requests, p95 15.8 ms, max 20.5 ms',
  ]);
});

// ---------------------------------------------------------------------------------------------
// The lane

test('the lane writes the plan with the address k6 reaches, runs k6 and passes', async (t) => {
  const runner = fakeRunner({ summary: passingSummary() });
  const { code, root, output, fetcher } = await lane(t, DEMO, runner);
  assert.equal(code, 0);
  assert.deepEqual(fetcher.urls, ['http://localhost:9000/api/items?status=open'], 'host preflight');
  assert.deepEqual(
    runner.calls.map((call) => [call.args.slice(0, 2), call.capture]),
    [
      [PS_ARGS.slice(0, 2), true],
      [['compose', 'run'], false],
    ],
  );
  assert.deepEqual(runner.k6().args, k6Args('demo'));
  assert.equal(runner.k6().cwd, root);
  const plan = JSON.parse(readFileSync(join(root, 'reports', 'perf', 'demo-plan.json'), 'utf8'));
  assert.equal(plan.pack, 'demo');
  assert.equal(plan.base, 'http://demo-api:8000/api');
  assert.deepEqual(plan.load, LOAD);
  assert.equal(plan.requests.length, 7);
  assert.equal(plan.skipped.length, 5);
  assert.match(output, /GET \/open-secret sent without credentials: the key is not checked/);
  assert.match(output, /left out GET \/reset: excluded by perf\.json: it resets the data/);
  assert.match(output, /rewritten to http:\/\/demo-api:8000\/api: compose service "demo-api"/);
  assert.match(output, /7 operation\(s\) at 5 requests\/s for 2s \(at most 2 VUs\)/);
  assert.match(output, /120 requests, p95 42\.5 ms/);
  assert.match(output, /summary in reports\/perf\/demo\.json/);
  assert.match(output, /passed \(every request answered its expected status\)/);
});

test('a remote base is used as it is, without asking compose', async (t) => {
  const runner = fakeRunner({ summary: passingSummary() });
  const { code, root, fetcher } = await lane(t, PLAIN, runner);
  assert.equal(code, 0);
  assert.deepEqual(fetcher.urls, ['https://api.example.test/v1/health']);
  assert.deepEqual(
    runner.calls.map((call) => call.args[1]),
    ['run'],
  );
  const plan = JSON.parse(readFileSync(join(root, 'reports', 'perf', 'plain-plan.json'), 'utf8'));
  assert.equal(plan.base, 'https://api.example.test/v1');
});

test('requests that answer an unexpected status fail the lane and are named', async (t) => {
  const { code, output } = await lane(t, DEMO, fakeRunner({ summary: SUMMARY }));
  assert.equal(code, 1);
  assert.match(
    output,
    /failed: requests answered an unexpected status: GET \/items\/\{id\} \(expected 200, 3 of 60 did not\)/,
  );
});

test('an API that does not answer stops the lane before Docker', async (t) => {
  const runner = fakeRunner({ summary: passingSummary() });
  const error = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
  const { code, output } = await lane(t, DEMO, runner, { fetcher: fakeFetch({ error }) });
  assert.equal(code, 2);
  assert.deepEqual(runner.calls, []);
  assert.match(output, /did not answer \(ENOTFOUND\); check that the service is up/);
});

test('nothing left to measure stops the lane', async (t) => {
  const root = scratchRoot(t);
  writeFileSync(
    join(root, 'services', 'plain', 'perf.json'),
    JSON.stringify({ exclude: { 'GET /health': 'not today' } }),
  );
  const runner = fakeRunner({ summary: passingSummary() });
  const { code, output } = await lane(t, PLAIN, runner, { root });
  assert.equal(code, 2);
  assert.deepEqual(runner.calls, []);
  assert.match(output, /no GET operation left to measure; the lane did not run/);
});

test('a k6 run that did not complete is exit 2, whatever is left on disk', async (t) => {
  // A runner without `summary` writes none, so a summary left on disk could only be the stale one.
  const outcomes = [
    [fakeRunner({ status: 107 }), /k6 exit 107: the run did not complete/],
    [
      fakeRunner({ status: null, error: new Error('spawn docker ENOENT') }),
      /docker could not run: spawn docker ENOENT/,
    ],
    [fakeRunner(), /k6 wrote no reports\/perf\/demo\.json; the run did not complete/],
    [fakeRunner({ summary: '{ not json' }), /reports\/perf\/demo\.json is not a k6 summary/],
    [fakeRunner({ summary: { site: [] } }), /is not a k6 summary \(not a k6 summary/],
    [fakeRunner({ summary: { metrics: {} } }), /k6 sent no request/],
  ];
  for (const [runner, message] of outcomes) {
    const root = scratchRoot(t);
    const dir = join(root, 'reports', 'perf');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'demo.json'), JSON.stringify(passingSummary())); // a stale pass
    const { code, output } = await lane(t, DEMO, runner, { root });
    assert.equal(code, 2, String(message));
    assert.match(output, message);
  }
  const root = scratchRoot(t);
  const stale = join(root, 'reports', 'perf', 'demo.json');
  mkdirSync(join(root, 'reports', 'perf'), { recursive: true });
  writeFileSync(stale, JSON.stringify(passingSummary()));
  await lane(t, DEMO, fakeRunner(), { root });
  assert.equal(existsSync(stale), false, 'the stale summary was removed before the run');
});

test('compose ps that cannot tell where the API is stops the lane', async (t) => {
  const runner = fakeRunner({ ps: 'not json' });
  const { code, output } = await lane(t, DEMO, runner);
  assert.equal(code, 2);
  assert.match(output, /docker compose ps printed no JSON/);
  assert.equal(runner.k6(), undefined);
});
