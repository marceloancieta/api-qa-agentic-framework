import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import { loadModel } from '../lib/openapi.mjs';
import { compareStates } from '../lib/state-compare.mjs';
import {
  answerDifferences,
  bodyDifferences,
  diffLane,
  differenceLine,
  mediaType,
  parseLaneArgs,
  planRequests,
  readDiffFile,
  sides,
  verdict,
} from '../diff-lane.mjs';

const FIXTURES = join(REPO_ROOT, 'scripts', '__fixtures__', 'diff-lane');
// The fixture key: short, so no real secret looks like it.
const KEY = 'k7x';
const ENV = { SHOP_KEY: KEY };
const SHOP = {
  service: 'shop',
  reference: 'previous',
  candidate: null,
  actor: 'default',
  out: 'shop',
};
const REFERENCE = 'http://localhost:7002/api';
const CANDIDATE = 'http://localhost:7001/api';
const SPECS = {
  [`${REFERENCE}/openapi.json`]: join(FIXTURES, 'previous-openapi.json'),
  [`${CANDIDATE}/openapi.json`]: join(FIXTURES, 'services', 'shop', 'openapi.json'),
};

/** A scratch copy of the fixture tree, so the lane's report never lands in the repo. */
function scratchRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'diff-lane-'));
  cpSync(FIXTURES, root, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const text = (body, status = 400) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain' } });

/**
 * Answers per side, keyed by the path after the base. Both sides answer the same unless
 * `candidate` overrides a path; the default reproduces the fixture's accepted difference.
 */
function fakeApi({ candidate = {}, reference = {}, down = null } = {}) {
  const calls = [];
  const same = {
    '/items?kind=book': () => json([{ id: 1, name: 'a' }]),
    '/items/7': () => json({ id: 7, name: 'b', updatedAt: 'now', tags: ['x', 'y'] }),
  };
  const sides = {
    [REFERENCE]: { ...same, '/items': () => text('No kind given'), ...reference },
    [CANDIDATE]: {
      ...same,
      '/items': () => json({ code: 400, message: 'kind is required' }, 400),
      ...candidate,
    },
  };
  const impl = async (url, init) => {
    calls.push({ url, headers: init.headers });
    const base = url.startsWith(REFERENCE) ? REFERENCE : CANDIDATE;
    if (base === down) throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    const answer = sides[base][url.slice(base.length)];
    if (!answer) throw new Error(`unexpected request ${url}`);
    return answer();
  };
  return { impl, calls };
}

async function lane(t, options = SHOP, { api = fakeApi(), env = ENV } = {}) {
  const root = scratchRoot(t);
  const lines = [];
  const code = await diffLane(options, {
    root,
    env,
    fetchImpl: api.impl,
    loadSpec: (url) => loadModel(SPECS[url]),
    log: (line) => lines.push(line),
  });
  return { code, lines, root, output: lines.join('\n') };
}

// ---------------------------------------------------------------------------------------------
// Arguments, sides and the pack's file

test('arguments: --service and --reference are required, --out defaults to the pack', () => {
  assert.deepEqual(parseLaneArgs(['--service', 'shop', '--reference', 'previous'], FIXTURES), SHOP);
  assert.equal(
    parseLaneArgs(['--service', 'shop', '--reference', 'p', '--candidate', 'c'], FIXTURES)
      .candidate,
    'c',
  );
  assert.throws(() => parseLaneArgs(['--reference', 'previous'], FIXTURES), /--service <name>/);
  assert.throws(() => parseLaneArgs(['--service', 'shop'], FIXTURES), /--reference <env>/);
  assert.throws(
    () => parseLaneArgs(['--service', 'shop', '--reference', 'p', '--out', '../x'], FIXTURES),
    /--out must be a plain file name/,
  );
});

test('the candidate is the active environment with its overrides; the reference never takes them', () => {
  const both = sides(SHOP, FIXTURES, {});
  assert.equal(both.reference.name, 'previous');
  assert.equal(both.reference.baseUrl, REFERENCE);
  assert.equal(both.candidate.name, 'local');

  const overridden = sides(SHOP, FIXTURES, { QA_SHOP_BASE_URL: 'http://127.0.0.1:9999/api' });
  assert.equal(overridden.candidate.baseUrl, 'http://127.0.0.1:9999/api');
  assert.equal(overridden.reference.baseUrl, REFERENCE, 'the override is the candidate only');

  assert.throws(
    () => sides(SHOP, FIXTURES, { QA_ENV: 'previous' }),
    /both environment "previous"/,
    'QA_ENV selects the candidate',
  );
});

test('the same environment on both sides, a side without spec_url or the pack are errors', () => {
  assert.throws(
    () => sides({ ...SHOP, candidate: 'previous' }, FIXTURES, {}),
    /the reference and the candidate are both environment "previous"/,
  );
  assert.throws(
    () => sides({ ...SHOP, reference: 'nospec' }, FIXTURES, {}),
    /pack "shop" in environment "nospec" has no spec_url; the lane compares both contracts/,
  );
  assert.throws(
    () => sides({ ...SHOP, reference: 'ghost' }, FIXTURES, {}),
    /environment "ghost" is not defined/,
  );
});

test("the pack's diff.json is read and checked; every problem is named", (t) => {
  assert.deepEqual(readDiffFile('shop', FIXTURES).accepted, {
    'contract parameters GET /items query:kind': 'SN-01: kind became required',
    'GET /items without kind': 'SN-01: the refusal became JSON',
  });
  const root = scratchRoot(t);
  rmSync(join(root, 'services', 'shop', 'diff.json'));
  assert.deepEqual(readDiffFile('shop', root), { models: {}, accepted: {} });
  writeFileSync(
    join(root, 'services', 'shop', 'diff.json'),
    JSON.stringify({
      models: {
        'GET /a': { x: 'random', y: { bucket: 'business', normalize: 'sideways' } },
        'GET /b': 'volatile',
      },
      accepted: { 'GET /a': ' ' },
      extra: 1,
    }),
  );
  assert.throws(
    () => readDiffFile('shop', root),
    (error) => {
      for (const part of [
        'unknown key "extra"',
        'models["GET /a"]["x"]: bucket must be one of identity, business, provenance, volatile',
        'models["GET /a"]["y"]: normalize must be one of instant, unordered',
        'models["GET /b"] must map field paths to buckets',
        'accepted["GET /a"] must give its reason as text',
      ]) {
        assert.ok(error.message.includes(part), `${part} in: ${error.message}`);
      }
      return true;
    },
  );
});

// ---------------------------------------------------------------------------------------------
// The plan and the comparison

test('every planned GET, then the same request without each required query parameter', async () => {
  const model = await loadModel(join(FIXTURES, 'services', 'shop', 'openapi.json'));
  const plan = planRequests(model, readPackFileOf(), { actor: 'default', authenticated: true });
  assert.deepEqual(plan.requests, [
    { name: 'GET /items', path: '/items?kind=book', operation: 'GET /items' },
    { name: 'GET /items without kind', path: '/items', operation: 'GET /items' },
    { name: 'GET /items/{itemId}', path: '/items/7', operation: 'GET /items/{itemId}' },
  ]);
});

function readPackFileOf() {
  return { params: { itemId: 7 }, anonymous: {}, exclude: {} };
}

test('bodies: fields are business unless the model says otherwise; arrays item by item', () => {
  const model = { updatedAt: 'volatile', tags: { bucket: 'business', normalize: 'unordered' } };
  const item = { id: 7, name: 'b', updatedAt: 'then', tags: ['y', 'x'] };
  assert.deepEqual(
    bodyDifferences(item, { ...item, updatedAt: 'now', tags: ['x', 'y'] }, model),
    [],
    'volatile skipped, tags compared as a set',
  );
  assert.deepEqual(bodyDifferences(item, { ...item, name: 'c', extra: 1 }, model), [
    'name',
    'extra',
  ]);
  assert.deepEqual(bodyDifferences([item], [item, item], model), ['[length]']);
  assert.deepEqual(bodyDifferences([item, { id: 1 }], [item, { id: 2 }], model), ['[1].id']);
  assert.deepEqual(bodyDifferences(['a', 'b'], ['a', 'c']), ['[1]']);
  assert.deepEqual(bodyDifferences('No kind', 'No kind'), []);
  assert.deepEqual(bodyDifferences('No kind', { code: 400 }), ['$body']);
  assert.deepEqual(bodyDifferences('session 1', 'session 2', { $body: 'volatile' }), []);
});

test('answers: status and media type as reference -> candidate, body as field paths', () => {
  assert.equal(mediaType('Application/JSON; charset=utf-8'), 'application/json');
  assert.equal(mediaType(null), null);
  const difference = answerDifferences(
    { status: 400, type: 'text/plain', body: 'No kind' },
    { status: 422, type: 'application/json', body: { code: 422 } },
  );
  assert.deepEqual(difference, {
    status: [400, 422],
    type: ['text/plain', 'application/json'],
    body: ['$body'],
  });
  assert.equal(
    differenceLine('GET /items without kind', difference),
    'GET /items without kind: status 400 -> 422; type text/plain -> application/json; body fields $body',
  );
});

test('the verdict: open, accepted and stale differences', () => {
  assert.deepEqual(verdict(['a', 'b'], { b: 'why', c: 'gone' }), {
    open: ['a'],
    accepted: ['b'],
    stale: ['c'],
  });
});

test('a fallback bucket compares unclassified fields; a named normalizer applies', () => {
  assert.deepEqual(compareStates({ a: 1 }, { a: 2 }, {}).unclassified, ['a']);
  assert.deepEqual(compareStates({ a: 1 }, { a: 2 }, {}, { fallback: 'business' }).business, ['a']);
  assert.deepEqual(
    compareStates(
      { at: '2026-10-09T10:00:00.000Z' },
      { at: '2026-10-09T10:00:00.000+00:00' },
      { at: { bucket: 'business', normalize: 'instant' } },
    ).business,
    [],
  );
  assert.throws(
    () => compareStates({ a: 1 }, { a: 1 }, { a: { bucket: 'business', normalize: 'x' } }),
    /unknown normalizer "x" \(known: instant, unordered\)/,
  );
});

// ---------------------------------------------------------------------------------------------
// The lane

test('only accepted differences: exit 0, each listed with its reason, and nothing secret in the report', async (t) => {
  const api = fakeApi();
  const { code, output, root } = await lane(t, SHOP, { api });
  assert.equal(code, 0, output);
  assert.match(
    output,
    /reference environment "previous": http:\/\/localhost:7002\/api \(contract version 1\.0\.0\), actor "default" sends its api_key credential/,
  );
  assert.match(
    output,
    /candidate environment "local": http:\/\/localhost:7001\/api \(contract version 2\.0\.0\)/,
  );
  assert.match(
    output,
    /accepted {2}contract parameters GET \/items query:kind: string -> string required \(SN-01: kind became required\)/,
  );
  assert.match(
    output,
    /accepted {2}GET \/items without kind: type text\/plain -> application\/json; body fields \$body \(SN-01: the refusal became JSON\)/,
  );
  assert.match(
    output,
    /3 request\(s\), 2 answered the same; 1 contract change\(s\); 0 difference\(s\) not accepted, 2 accepted, 0 stale/,
  );
  assert.match(output, /passed \(every difference is accepted\)/);
  assert.equal(api.calls.length, 6, 'three requests, each to both sides');
  assert.ok(
    api.calls.every((call) => call.headers['X-Key'] === KEY),
    'the credential goes to both',
  );
  assert.ok(api.calls.every((call) => call.headers.accept === 'application/json'));
  const report = readFileSync(join(root, 'reports', 'diff', 'shop.json'), 'utf8');
  assert.ok(!report.includes(KEY), 'the report never holds the credential');
  assert.ok(!report.includes('kind is required'), 'nor a body value');
  assert.deepEqual(JSON.parse(report).verdict, {
    open: [],
    accepted: ['contract parameters GET /items query:kind', 'GET /items without kind'],
    stale: [],
  });
});

test('a difference nobody accepted fails with 1 and names the fields, never their values', async (t) => {
  const api = fakeApi({
    candidate: {
      '/items/7': () => json({ id: 7, name: 'renamed', updatedAt: 'later', tags: ['y', 'x'] }),
    },
  });
  const { code, output } = await lane(t, SHOP, { api });
  assert.equal(code, 1);
  assert.match(output, /differs {3}GET \/items\/\{itemId\}: body fields name$/m);
  assert.doesNotMatch(output, /renamed/);
  assert.match(output, /1 difference\(s\) not accepted, 2 accepted, 0 stale/);
  assert.match(output, /failed \(a difference nobody accepted, or an accepted one that is gone\)/);
});

test('an accepted difference that no longer shows up is stale, and fails with 1', async (t) => {
  const api = fakeApi({ candidate: { '/items': () => text('No kind given') } });
  const { code, output } = await lane(t, SHOP, { api });
  assert.equal(code, 1);
  assert.match(
    output,
    /stale {5}GET \/items without kind: accepted in services\/shop\/diff\.json but not found; the change it describes is gone/,
  );
});

test('a side that does not answer or a missing credential stops the lane with 2', async (t) => {
  const down = await lane(t, SHOP, { api: fakeApi({ down: CANDIDATE }) });
  assert.equal(down.code, 2);
  assert.match(
    down.output,
    /the candidate \(environment "local"\) did not answer GET \/items at http:\/\/localhost:7001\/api\/items\?kind=book \(ECONNREFUSED\); check that the service is up/,
  );

  const api = fakeApi();
  const missing = await lane(t, SHOP, { api, env: {} });
  assert.equal(missing.code, 2);
  assert.match(
    missing.output,
    /reference "previous", actor "default": Auth "api_key" needs the environment variable SHOP_KEY, which is not set; the lane did not run/,
  );
  assert.equal(api.calls.length, 0);

  const anonymous = await lane(t, { ...SHOP, actor: 'anonymous' }, { api: fakeApi(), env: {} });
  assert.equal(anonymous.code, 0, 'anonymous needs no variable');
  assert.match(anonymous.output, /actor "anonymous" sends no credential/);
});
