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
import {
  containerName,
  dastLane,
  excludePatterns,
  falsePositives,
  rulesWithFalsePositives,
  failRuleIds,
  fetchSpec,
  mapZapExit,
  parseLaneArgs,
  resolveUrls,
  rulesPath,
  scanAuth,
  summarize,
  summaryLines,
  zapArgs,
  withoutExcluded,
  zapConfig,
} from '../dast-lane.mjs';

const FIXTURES = join(REPO_ROOT, 'scripts', '__fixtures__', 'dast-lane');
const fixtureText = (name) => readFileSync(join(FIXTURES, name), 'utf8');
const readFixture = (name) => JSON.parse(fixtureText(name));
const RULES = fixtureText(join('services', 'demo', 'dast-rules.tsv'));
const PS_LINES = readFileSync(
  join(REPO_ROOT, 'scripts', '__fixtures__', 'container', 'compose-ps-lines.txt'),
  'utf8',
);
const SPEC_JSON = JSON.stringify({ openapi: '3.0.1', info: {}, servers: [{ url: '' }], paths: {} });
const SPEC_YAML = 'openapi: 3.0.1\ninfo:\n  title: demo\npaths: {}\n';
const DEMO = { service: 'demo', target: null, base: null, out: 'demo', actor: 'default' };
const PLAIN = { service: 'plain', target: null, base: null, out: 'plain', actor: 'default' };

/** A scratch copy of the fixture tree, so the lane's reports directory never lands in the repo. */
function scratchRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'dast-lane-'));
  cpSync(FIXTURES, root, { recursive: true });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

/** A fetch that answers every URL with `body` and `status`, and records the URLs. */
function fakeFetch(body = SPEC_JSON, status = 200) {
  const urls = [];
  const impl = async (url) => {
    urls.push(url);
    return new Response(body, { status });
  };
  return { impl, urls };
}

/**
 * A docker runner that records its calls. `compose ps` prints `ps`; the scan writes `report` (when
 * given) as ZAP would and exits `status`.
 */
function fakeRunner({ status = 0, report, html = true, ps = PS_LINES, psResult, ...rest }) {
  const calls = [];
  const run = (args, { cwd, capture }) => {
    calls.push({ args, cwd, capture: Boolean(capture) });
    if (args[1] === 'ps') return psResult ?? { status: 0, signal: null, stdout: ps, stderr: '' };
    const out = args[args.indexOf('-J') + 1].replace(/\.json$/, '');
    if (report !== undefined) {
      const text = typeof report === 'string' ? report : JSON.stringify(report);
      writeFileSync(join(cwd, 'reports', 'dast', `${out}.json`), text);
    }
    if (html) writeFileSync(join(cwd, 'reports', 'dast', `${out}.html`), '<html></html>');
    return { status, signal: null, ...rest };
  };
  return { run, calls, scan: () => calls.find((call) => call.args[1] === 'run') };
}

async function lane(t, options, runner, { env = {}, fetcher = fakeFetch() } = {}) {
  const root = scratchRoot(t);
  const lines = [];
  const code = await dastLane(options, {
    root,
    env,
    run: runner.run,
    fetchImpl: fetcher.impl,
    log: (line) => lines.push(line),
  });
  return { code, lines, root, output: lines.join('\n') };
}

// ---------------------------------------------------------------------------------------------
// Arguments and URLs

test('arguments: --service is required, --out defaults to the pack and must be a plain name', () => {
  assert.deepEqual(parseLaneArgs(['--service', 'demo'], FIXTURES), DEMO);
  assert.deepEqual(
    parseLaneArgs(
      [
        '--service',
        'demo',
        '--target',
        'http://x.test/o.json',
        '--base',
        'http://x.test',
        '--out',
        'demo-2',
        '--actor',
        'user',
      ],
      FIXTURES,
    ),
    {
      service: 'demo',
      target: 'http://x.test/o.json',
      base: 'http://x.test',
      out: 'demo-2',
      actor: 'user',
    },
  );
  assert.throws(
    () => parseLaneArgs([], FIXTURES),
    /--service <name> \(packs: demo, nospec, plain\)/,
  );
  assert.throws(
    () => parseLaneArgs(['--service', 'demo', '--out', '../x'], FIXTURES),
    /plain file name/,
  );
  assert.throws(() => parseLaneArgs(['--service', 'demo', '--bogus'], FIXTURES), /Unknown option/);
});

test('by default the spec and base URLs are the pack entry of the active environment', () => {
  assert.deepEqual(resolveUrls(DEMO, FIXTURES, {}), {
    specUrl: 'http://localhost:9000/api/openapi.json',
    specFrom: 'spec_url of "demo" in environment "local"',
    baseUrl: 'http://localhost:9000/api',
    baseFrom: 'base_url of "demo" in environment "local"',
  });
});

test('QA_ENV selects the environment; QA_<PACK>_SPEC_URL and QA_<PACK>_BASE_URL override it', () => {
  const staging = resolveUrls(DEMO, FIXTURES, { QA_ENV: 'staging' });
  assert.equal(staging.specUrl, 'http://127.0.0.1:9001/openapi.json');
  assert.equal(staging.baseUrl, 'http://127.0.0.1:9001');
  assert.equal(staging.baseFrom, 'base_url of "demo" in environment "staging"');
  const override = resolveUrls(DEMO, FIXTURES, {
    QA_DEMO_SPEC_URL: 'https://other.example.test/openapi.json',
    QA_DEMO_BASE_URL: 'https://other.example.test/v2',
  });
  assert.equal(override.specUrl, 'https://other.example.test/openapi.json');
  assert.equal(override.baseUrl, 'https://other.example.test/v2');
});

test('--target overrides the spec URL and --base the base URL; with both, qa-config is not read', () => {
  const urls = resolveUrls(
    { ...DEMO, target: 'http://127.0.0.1:5001/openapi.json', base: 'http://127.0.0.1:5001/' },
    FIXTURES,
    { QA_ENV: 'no-such-environment' },
  );
  assert.deepEqual(urls, {
    specUrl: 'http://127.0.0.1:5001/openapi.json',
    specFrom: '--target',
    baseUrl: 'http://127.0.0.1:5001',
    baseFrom: '--base',
  });
  const targetOnly = resolveUrls({ ...DEMO, target: 'https://x.test/o.yaml' }, FIXTURES, {});
  assert.equal(
    targetOnly.baseUrl,
    'http://localhost:9000/api',
    'the base still comes from the entry',
  );
  assert.throws(
    () => resolveUrls({ ...DEMO, target: 'openapi.json' }, FIXTURES, {}),
    /spec URL must be an http\(s\) URL/,
  );
  assert.throws(
    () => resolveUrls({ ...DEMO, base: 'file:///x' }, FIXTURES, {}),
    /base URL must be an http\(s\) URL/,
  );
});

test('an unknown pack, a pack the environment does not configure and a missing spec_url are errors', () => {
  assert.throws(
    () =>
      resolveUrls(
        { ...DEMO, service: 'ghost', target: 'http://x.test/o.json', base: 'http://x.test' },
        FIXTURES,
        {},
      ),
    /No service pack "ghost"/,
  );
  assert.throws(
    () => resolveUrls(PLAIN, FIXTURES, { QA_ENV: 'staging' }),
    /environment "staging" has no entry for pack "plain"/,
  );
  assert.throws(
    () => resolveUrls({ ...PLAIN, service: 'nospec' }, FIXTURES, {}),
    /pack "nospec" in environment "local" has no spec_url; set it or pass --target/,
  );
});

// ---------------------------------------------------------------------------------------------
// The definition

test('the definition is fetched on the host and kept as received, JSON or YAML', async () => {
  assert.deepEqual(await fetchSpec('http://x.test/o.json', fakeFetch(SPEC_JSON).impl), {
    text: SPEC_JSON,
    ext: 'json',
  });
  assert.deepEqual(await fetchSpec('http://x.test/o.yaml', fakeFetch(SPEC_YAML).impl), {
    text: SPEC_YAML,
    ext: 'yaml',
  });
  assert.equal(
    (await fetchSpec('http://x.test/s', fakeFetch('{"swagger":"2.0"}').impl)).ext,
    'json',
  );
});

test('a spec URL that does not answer, answers non-2xx or returns no OpenAPI document is refused', async () => {
  const refused = async () => {
    throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
  };
  await assert.rejects(
    fetchSpec('http://x.test/o.json', refused),
    /http:\/\/x.test\/o.json did not answer \(ECONNREFUSED\)/,
  );
  await assert.rejects(
    fetchSpec('http://x.test/o.json', fakeFetch('nope', 404).impl),
    /answered 404/,
  );
  for (const body of ['<html><body>hello</body></html>', '{"paths":{}}', '[1, 2]', 'a: [b', '']) {
    await assert.rejects(
      fetchSpec('http://x.test/o.json', fakeFetch(body).impl),
      /did not return an OpenAPI document in JSON or YAML/,
      JSON.stringify(body),
    );
  }
});

// ---------------------------------------------------------------------------------------------
// The scan

test('the docker command, with the pack rules file and without one', () => {
  const base = [
    'compose',
    'run',
    '--rm',
    'zap',
    'zap-api-scan.py',
    '-t',
    'demo-openapi.json',
    '-f',
    'openapi',
    '-O',
    'http://demo-api:8000/api',
    '-J',
    'demo.json',
    '-r',
    'demo.html',
    '-I',
    '-z',
    '-config scanner.injectable=19',
  ];
  const scan = {
    definition: 'demo-openapi.json',
    base: 'http://demo-api:8000/api',
    out: 'demo',
    pack: 'demo',
  };
  assert.ok(rulesPath('demo', FIXTURES));
  assert.equal(rulesPath('plain', FIXTURES), null);
  assert.deepEqual(zapArgs({ ...scan, rules: rulesPath('demo', FIXTURES) }), [
    ...base,
    '-c',
    '/zap/services/demo/dast-rules.tsv',
  ]);
  assert.deepEqual(zapArgs({ ...scan, rules: null }), base);
  assert.deepEqual(
    zapArgs({ ...scan, rules: null, container: 'qa-dast-demo-abc123' }),
    [...base.slice(0, 3), '--name', 'qa-dast-demo-abc123', ...base.slice(3)],
    'without a credential only the container name is added',
  );
  assert.equal(
    containerName('demo', () => 'abc123'),
    'qa-dast-demo-abc123',
  );
  assert.match(containerName('nightly.1'), /^qa-dast-nightly\.1-[0-9a-f]{6}$/);
});

test("with a credential ZAP's API port is published on loopback only and ZAP listens on it", () => {
  const args = zapArgs({
    definition: 'demo-openapi.json',
    base: 'http://demo-api:8000/api',
    out: 'demo',
    pack: 'demo',
    rules: null,
    container: 'qa-dast-demo-abc123',
    apiPort: 18089,
  });
  assert.deepEqual(args.slice(0, 8), [
    'compose',
    'run',
    '--rm',
    '--name',
    'qa-dast-demo-abc123',
    '-p',
    '127.0.0.1:18089:18089',
    'zap',
  ]);
  assert.deepEqual(args.slice(args.indexOf('-I'), args.indexOf('-I') + 4), [
    '-I',
    '-P',
    '18089',
    '-z',
  ]);
});

test('ZAP injects into the URL path too, and a pack keeps URLs out of the scan', () => {
  assert.equal(zapConfig(), '-config scanner.injectable=19');
  assert.equal(
    zapConfig(['^https?://[^/]+/reset.*$', '.*/logout$']),
    '-config scanner.injectable=19' +
      ' -config globalexcludeurl.url_list.url(0).regex=^https?://[^/]+/reset.*$' +
      ' -config globalexcludeurl.url_list.url(0).enabled=true' +
      ' -config globalexcludeurl.url_list.url(1).regex=.*/logout$' +
      ' -config globalexcludeurl.url_list.url(1).enabled=true',
  );
  const root = mkdtempSync(join(tmpdir(), 'dast-exclude-'));
  mkdirSync(join(root, 'services', 'shop'), { recursive: true });
  assert.deepEqual(excludePatterns('shop', root), [], 'no file: nothing excluded');
  writeFileSync(
    join(root, 'services', 'shop', 'dast-exclude.txt'),
    '# resets the data\n^https?://[^/]+/reset.*$\n\r\n  .*/logout$  \n',
  );
  assert.deepEqual(excludePatterns('shop', root), ['^https?://[^/]+/reset.*$', '.*/logout$']);
  const args = zapArgs({
    definition: 'shop-openapi.json',
    base: 'http://shop:80',
    out: 'shop',
    pack: 'shop',
    rules: null,
    excludes: excludePatterns('shop', root),
  });
  assert.equal(args[args.indexOf('-z') + 1], zapConfig(excludePatterns('shop', root)));
});

const SHOP_PATHS = {
  '/reset': { get: {} },
  '/resets/history': { get: {} },
  '/users/{id}': { delete: {}, get: {} },
  '/users/{id}/orders': { get: {} },
};

test("excluded paths leave the definition, because ZAP's import ignores the global exclusions", () => {
  const json = { text: JSON.stringify({ openapi: '3.0.1', paths: SHOP_PATHS }), ext: 'json' };
  const excludes = ['^https?://[^/]+/api/reset$', '.*/users/\\{id\\}$'];
  const filtered = withoutExcluded(json, 'http://shop:80/api/', excludes);
  assert.deepEqual(filtered.removed, ['/reset', '/users/{id}']);
  assert.deepEqual(
    Object.keys(JSON.parse(filtered.text).paths),
    ['/resets/history', '/users/{id}/orders'],
    'look-alikes that the patterns do not match stay',
  );

  const yaml = {
    text: 'openapi: 3.0.1\npaths:\n  /reset:\n    get: {}\n  /items:\n    get: {}\n',
    ext: 'yaml',
  };
  const fromYaml = withoutExcluded(yaml, 'http://shop:80/api', excludes);
  assert.deepEqual(fromYaml.removed, ['/reset']);
  assert.match(fromYaml.text, /^openapi: 3\.0\.1\npaths:\n {2}\/items:/, 'written back as YAML');

  assert.deepEqual(withoutExcluded(json, 'http://shop:80/api', []), {
    text: json.text,
    removed: [],
  });
  assert.deepEqual(
    withoutExcluded(json, 'http://shop:80/api', ['.*/nothing$']),
    { text: json.text, removed: [] },
    'nothing matches: the text is kept as received',
  );
  assert.throws(() => withoutExcluded(json, 'http://shop:80/api', ['(unclosed']));
});

test('the lane saves the definition without the excluded paths and says which went', async (t) => {
  const runner = fakeRunner({ report: readFixture('zap-site-object.json') });
  const spec = JSON.stringify({ openapi: '3.0.1', info: {}, paths: SHOP_PATHS });
  const root = scratchRoot(t);
  writeFileSync(
    join(root, 'services', 'demo', 'dast-exclude.txt'),
    '# resets the data\n^https?://[^/]+/api/reset$\n',
  );
  const lines = [];
  const code = await dastLane(DEMO, {
    root,
    env: {},
    run: runner.run,
    fetchImpl: fakeFetch(spec).impl,
    log: (line) => lines.push(line),
  });
  assert.equal(code, 0);
  const saved = JSON.parse(
    readFileSync(join(root, 'reports', 'dast', 'demo-openapi.json'), 'utf8'),
  );
  assert.deepEqual(Object.keys(saved.paths), [
    '/resets/history',
    '/users/{id}',
    '/users/{id}/orders',
  ]);
  assert.match(
    lines.join('\n'),
    /removed from the definition, so ZAP's import never calls them: \/reset/,
  );
  const z = runner.scan().args[runner.scan().args.indexOf('-z') + 1];
  assert.match(
    z,
    /globalexcludeurl\.url_list\.url\(0\)\.regex=\^https\?:\/\/\[\^\/\]\+\/api\/reset\$/,
  );
});

test('a pattern that is not a regular expression stops the lane with 2 before the scan', async (t) => {
  const runner = fakeRunner({});
  const root = scratchRoot(t);
  writeFileSync(join(root, 'services', 'demo', 'dast-exclude.txt'), '(unclosed\n');
  const lines = [];
  const code = await dastLane(DEMO, {
    root,
    env: {},
    run: runner.run,
    fetchImpl: fakeFetch().impl,
    log: (line) => lines.push(line),
  });
  assert.equal(code, 2);
  assert.equal(runner.scan(), undefined);
  assert.match(
    lines.join('\n'),
    /dast-exclude\.txt holds a pattern that is not a regular expression/,
  );
});

test('the lane saves the definition, rewrites a loopback base through compose ps and runs the scan', async (t) => {
  const runner = fakeRunner({ report: readFixture('zap-site-object.json') });
  const fetcher = fakeFetch(SPEC_YAML);
  const { code, root, output } = await lane(t, DEMO, runner, { fetcher });
  assert.equal(code, 0);
  assert.deepEqual(
    fetcher.urls,
    ['http://localhost:9000/api/openapi.json'],
    'fetched on the host, as configured',
  );
  assert.equal(readFileSync(join(root, 'reports', 'dast', 'demo-openapi.yaml'), 'utf8'), SPEC_YAML);
  assert.deepEqual(
    runner.calls.map((c) => [c.args.slice(0, 2), c.capture]),
    [
      [PS_ARGS.slice(0, 2), true],
      [['compose', 'run'], false],
    ],
  );
  assert.deepEqual(runner.calls[0].args, [...PS_ARGS]);
  const scan = runner.scan();
  assert.equal(scan.cwd, root);
  assert.deepEqual(scan.args.slice(2, 4), ['--rm', '--name'], 'the lane names its container');
  assert.match(scan.args[4], /^qa-dast-demo-[0-9a-f]{6}$/);
  assert.deepEqual(scan.args.slice(7, 13), [
    '-t',
    'demo-openapi.yaml',
    '-f',
    'openapi',
    '-O',
    'http://demo-api:8000/api',
  ]);
  assert.deepEqual(scan.args.slice(-2), ['-c', '/zap/services/demo/dast-rules.tsv']);
  assert.match(
    output,
    /definition http:\/\/localhost:9000\/api\/openapi.json \(spec_url of "demo" in environment "local"\), saved as reports\/dast\/demo-openapi.yaml/,
  );
  assert.match(output, /API base http:\/\/localhost:9000\/api \(base_url of "demo"/);
  assert.match(
    output,
    /rewritten to http:\/\/demo-api:8000\/api: compose service "demo-api" publishes port 9000/,
  );
});

test('a loopback base no compose service publishes goes through host.docker.internal, and says so', async (t) => {
  const runner = fakeRunner({ report: readFixture('zap-site-object.json'), ps: '' });
  const { code, output } = await lane(t, DEMO, runner);
  assert.equal(code, 0);
  assert.equal(
    runner.scan().args[runner.scan().args.indexOf('-O') + 1],
    'http://host.docker.internal:9000/api',
  );
  assert.match(
    output,
    /rewritten to http:\/\/host.docker.internal:9000\/api: no running compose service/,
  );
});

test('a remote base is used as it is, without asking compose', async (t) => {
  const runner = fakeRunner({ report: readFixture('zap-site-object.json') });
  const { output } = await lane(t, PLAIN, runner);
  assert.equal(runner.calls.length, 1, 'no compose ps');
  assert.equal(
    runner.scan().args[runner.scan().args.indexOf('-O') + 1],
    'https://api.example.test/v1',
  );
  assert.equal(runner.scan().args.includes('-c'), false);
  assert.doesNotMatch(output, /rewritten/);
  assert.match(output, /no dast-rules.tsv in services\/plain; every alert is a warning/);
});

test('a definition that cannot be fetched or a compose ps that fails stops the lane with 2 before the scan', async (t) => {
  const notFound = fakeRunner({});
  const missing = await lane(t, PLAIN, notFound, { fetcher: fakeFetch('gone', 404) });
  assert.equal(missing.code, 2);
  assert.match(missing.output, /answered 404; the scan did not run/);
  assert.equal(notFound.calls.length, 0);

  const psDown = fakeRunner({
    psResult: { status: null, error: new Error('spawnSync docker ENOENT') },
  });
  const noDocker = await lane(t, DEMO, psDown);
  assert.equal(noDocker.code, 2);
  assert.match(noDocker.output, /docker compose ps could not run: spawnSync docker ENOENT/);
  assert.equal(psDown.scan(), undefined);

  const psFails = fakeRunner({
    psResult: { status: 1, signal: null, stdout: '', stderr: 'no configuration file\n' },
  });
  const failed = await lane(t, DEMO, psFails);
  assert.equal(failed.code, 2);
  assert.match(failed.output, /docker compose ps exit 1: no configuration file/);
});

// ---------------------------------------------------------------------------------------------
// Exit mapping

test('ZAP exit codes map to the lane exit: 0 and 2 pass, 1 fails, anything else did not complete', () => {
  assert.deepEqual(mapZapExit(0), { code: 0, note: 'no alert of a FAIL rule' });
  assert.deepEqual(mapZapExit(1), { code: 1, note: 'an alert of a FAIL rule' });
  assert.deepEqual(mapZapExit(2), { code: 0, note: 'warnings only' });
  for (const other of [3, 125, 137]) {
    assert.equal(mapZapExit(other).code, 2, `exit ${other}`);
    assert.match(
      mapZapExit(other).note,
      new RegExp(`ZAP exited ${other}: the scan did not complete`),
    );
  }
});

test('exit 0 and exit 2 with a report pass; exit 2 says warnings only', async (t) => {
  const report = readFixture('zap-site-object.json');
  const clean = await lane(t, PLAIN, fakeRunner({ status: 0, report }));
  assert.equal(clean.code, 0);
  assert.match(clean.output, /passed \(no alert of a FAIL rule\)/);
  const warned = await lane(t, PLAIN, fakeRunner({ status: 2, report }));
  assert.equal(warned.code, 0);
  assert.match(warned.output, /passed \(warnings only\)/);
});

test('exit 1 fails and names the alerts of FAIL rules', async (t) => {
  const result = await lane(
    t,
    DEMO,
    fakeRunner({ status: 1, report: readFixture('zap-site-array.json') }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /FAIL rule alert\(s\): 40018 SQL Injection$/m);
  assert.match(result.output, /failed \(an alert of a FAIL rule\)/);
});

test('exit 1 without a matching rule still fails, and says ZAP reported it', async (t) => {
  const result = await lane(
    t,
    PLAIN,
    fakeRunner({ status: 1, report: readFixture('zap-site-object.json') }),
  );
  assert.equal(result.code, 1);
  assert.match(result.output, /ZAP reported an alert of a FAIL rule/);
});

test('any other ZAP exit, a docker that cannot start and a missing or broken report end with 2', async (t) => {
  const report = readFixture('zap-site-object.json');
  const other = await lane(t, PLAIN, fakeRunner({ status: 3, report }));
  assert.equal(other.code, 2);
  assert.match(other.output, /ZAP exited 3: the scan did not complete/);
  assert.doesNotMatch(other.output, /passed/);

  const noDocker = await lane(
    t,
    PLAIN,
    fakeRunner({ status: null, error: new Error('spawnSync docker ENOENT') }),
  );
  assert.equal(noDocker.code, 2);
  assert.match(
    noDocker.output,
    /docker could not run: spawnSync docker ENOENT; the scan did not complete/,
  );

  const killed = await lane(t, PLAIN, fakeRunner({ status: null, signal: 'SIGKILL', report }));
  assert.equal(killed.code, 2);
  assert.match(killed.output, /killed by SIGKILL/);

  const missing = await lane(t, PLAIN, fakeRunner({ status: 0 }));
  assert.equal(missing.code, 2);
  assert.match(
    missing.output,
    /ZAP exit 0 but wrote no reports\/dast\/plain.json; the scan did not complete/,
  );

  const broken = await lane(t, PLAIN, fakeRunner({ status: 0, report: '{ not json' }));
  assert.equal(broken.code, 2);
  assert.match(broken.output, /reports\/dast\/plain.json is not a ZAP JSON report/);

  const wrongShape = await lane(t, PLAIN, fakeRunner({ status: 0, report: { alerts: [] } }));
  assert.equal(wrongShape.code, 2);
  assert.match(wrongShape.output, /not a ZAP JSON report \(no "site"\)/);
});

test('stale reports and definitions from an earlier scan never stand in for missing ones', async (t) => {
  const root = scratchRoot(t);
  const dir = join(root, 'reports', 'dast');
  mkdirSync(dir, { recursive: true });
  cpSync(join(FIXTURES, 'zap-site-object.json'), join(dir, 'plain.json'));
  writeFileSync(join(dir, 'plain-openapi.yaml'), SPEC_YAML);
  const code = await dastLane(PLAIN, {
    root,
    env: {},
    run: fakeRunner({ status: 0, html: false }).run,
    fetchImpl: fakeFetch(SPEC_JSON).impl,
    log: () => {},
  });
  assert.equal(code, 2);
  assert.equal(existsSync(join(dir, 'plain.json')), false);
  assert.equal(
    existsSync(join(dir, 'plain-openapi.yaml')),
    false,
    'only the definition just fetched',
  );
  assert.equal(existsSync(join(dir, 'plain-openapi.json')), true);
});

// ---------------------------------------------------------------------------------------------
// Report

test('FAIL rule ids come from the rules file; comments, IGNORE and WARN lines are not FAIL', () => {
  assert.deepEqual([...failRuleIds(RULES)], ['40018', '90019']);
  assert.deepEqual([...failRuleIds('1\tFAIL\t(x)\r\n2\tWARN\t(y)\r\n')], ['1']);
  assert.equal(failRuleIds('').size, 0);
});

test('summary of a report whose site is an array: counts per risk, names once, FAIL alerts', () => {
  const summary = summarize(readFixture('zap-site-array.json'), failRuleIds(RULES));
  assert.deepEqual(summary.counts, { informational: 1, low: 3, medium: 1, high: 1 });
  assert.deepEqual(summary.names, {
    informational: ['Storable and Cacheable Content'],
    low: ['X-Content-Type-Options Header Missing', 'Server Leaks Version'],
    medium: ['Content Security Policy (CSP) Header Not Set'],
    high: ['SQL Injection'],
  });
  assert.deepEqual(summary.failing, ['40018 SQL Injection']);
  assert.deepEqual(summaryLines(summary), [
    'alerts by risk: high 1, medium 1, low 3, informational 1',
    '  high: SQL Injection',
    '  medium: Content Security Policy (CSP) Header Not Set',
    '  low: X-Content-Type-Options Header Missing, Server Leaks Version',
    '  informational: Storable and Cacheable Content',
  ]);
});

test('summary of a report whose site is an object', () => {
  const summary = summarize(readFixture('zap-site-object.json'));
  assert.deepEqual(summary.counts, { informational: 1, low: 1, medium: 0, high: 0 });
  assert.deepEqual(summaryLines(summary), [
    'alerts by risk: high 0, medium 0, low 1, informational 1',
    '  low: Server Leaks Version',
    '  informational: Storable and Cacheable Content',
  ]);
  assert.deepEqual(summary.failing, []);
});

test('the lane prints the summary and where the reports landed', async (t) => {
  const result = await lane(
    t,
    { ...DEMO, out: 'nightly' },
    fakeRunner({ status: 0, report: readFixture('zap-site-object.json') }),
  );
  assert.equal(result.code, 0);
  assert.ok(
    result.lines.includes('dast-lane: alerts by risk: high 0, medium 0, low 1, informational 1'),
  );
  assert.ok(
    result.lines.includes(
      'dast-lane: reports in reports/dast/nightly.json and reports/dast/nightly.html',
    ),
  );
});

// ---------------------------------------------------------------------------------------------
// Authentication and liveness

const ZAP_PORT = 18089;
/** Timings short enough for a test; the guard needs 3 checks in a row without an answer. */
const FAST = {
  pollMs: 2,
  readyTimeoutMs: 5_000,
  requestTimeoutMs: 1_000,
  minRenewMs: 5,
  livenessMs: 3,
  livenessTimeoutMs: 500,
  livenessMisses: 3,
};

/** Wait until `condition()` holds, checking every few ms; fails after `ms`. */
async function until(condition, what, ms = 3_000) {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

/**
 * Everything one scan talks to, behind one fetch: the definition, ZAP's API on ZAP_PORT (answering
 * once `zap.up`, recording its calls) and the API under test (`api(url)`, which may throw).
 */
function network({ zapUp = true, api = () => new Response('ok') } = {}) {
  const zap = { up: zapUp, calls: [] };
  const apiCalls = [];
  const impl = async (raw) => {
    const url = new URL(raw);
    if (url.port === String(ZAP_PORT)) {
      if (!zap.up) throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
      zap.calls.push({ path: url.pathname, params: Object.fromEntries(url.searchParams) });
      return url.pathname === '/JSON/core/view/version/'
        ? Response.json({ version: '2.17.0' })
        : Response.json({ Result: 'OK' });
    }
    if (url.pathname.endsWith('/openapi.json')) return new Response(SPEC_JSON);
    apiCalls.push(url.href);
    return api(url);
  };
  const rules = () => zap.calls.filter((call) => call.path.startsWith('/JSON/replacer/'));
  return { impl, zap, apiCalls, rules };
}

/**
 * A scan that runs until the test ends it with `finish(result)`, writing the report as ZAP would
 * for exits 0 to 2. `run` answers compose ps, and a `docker stop` ends the scan as Docker does,
 * without a report.
 */
function liveScan({ report = readFixture('zap-site-object.json') } = {}) {
  let finish;
  const ended = new Promise((resolve) => {
    finish = resolve;
  });
  const scan = {
    args: null,
    stops: [],
    finish: (result = { status: 0, signal: null }) => finish(result),
  };
  scan.runAsync = async (args, { cwd }) => {
    scan.args = args;
    const result = await ended;
    if ([0, 1, 2].includes(result.status)) {
      const json = args[args.indexOf('-J') + 1];
      writeFileSync(join(cwd, 'reports', 'dast', json), JSON.stringify(report));
    }
    return result;
  };
  scan.run = (args) => {
    if (args[1] === 'ps') return { status: 0, signal: null, stdout: PS_LINES, stderr: '' };
    scan.stops.push(args);
    finish({ status: 137, signal: null });
    return { status: 0, signal: null, stdout: '', stderr: '' };
  };
  return scan;
}

/** A JWT whose `exp` has passed, so it is due for renewal at once; `n` tells them apart. */
const expiredJwt = (n) =>
  ['e30', Buffer.from(JSON.stringify({ exp: 1, n })).toString('base64url'), 'x'].join('.');

/**
 * A login endpoint for `post`: call n (from 1) answers `issue(n)` in `auth_token`, and every call
 * from `refuseFrom` on answers 401.
 */
function loginEndpoint(issue, { refuseFrom = Infinity } = {}) {
  const calls = [];
  const post = async (url) => {
    calls.push(url);
    if (calls.length >= refuseFrom) return { ok: false, status: 401, body: null };
    return { ok: true, status: 200, body: { auth_token: issue(calls.length) } };
  };
  return { post, calls };
}

/** Start the lane against `net` and `scan`; the test ends the scan and awaits `done`. */
function liveLane(
  t,
  options,
  { env = {}, net = network(), scan = liveScan(), post, timing = FAST },
) {
  const root = scratchRoot(t);
  const lines = [];
  t.after(() => scan.finish()); // a failed assertion must not leave the lane waiting
  const done = dastLane(options, {
    root,
    env,
    run: scan.run,
    runAsync: scan.runAsync,
    fetchImpl: net.impl,
    post,
    freePort: async () => ZAP_PORT,
    timing,
    log: (line) => lines.push(line),
  });
  return { done, lines, output: () => lines.join('\n') };
}

const USER = { ...DEMO, actor: 'user' };
const USER_ENV = { U: 'u1', P: 'Pz9' };

test('the actor comes from the pack entry; with --target and --base only default and anonymous, sending nothing', () => {
  assert.deepEqual(scanAuth(DEMO, FIXTURES, {}), {
    actor: 'default',
    auth: { type: 'none' },
    note: null,
  });
  assert.equal(scanAuth({ ...DEMO, actor: 'anonymous' }, FIXTURES, {}).auth.type, 'none');
  assert.equal(scanAuth(USER, FIXTURES, {}).auth.type, 'login');
  assert.throws(
    () => scanAuth({ ...DEMO, actor: 'ghost' }, FIXTURES, {}),
    /Actor "ghost" is not defined in qa-config\.example\.json api\.environments\.local\.packs\.demo\.actors\. Known: default, anonymous, user, keyed, queried\./,
  );
  const both = { target: 'http://x.test/o.json', base: 'http://x.test' };
  assert.deepEqual(scanAuth({ ...DEMO, ...both }, FIXTURES, { QA_ENV: 'no-such-environment' }), {
    actor: 'default',
    auth: { type: 'none' },
    note: 'qa-config is not read with both --target and --base',
  });
  assert.equal(scanAuth({ ...DEMO, ...both, actor: 'anonymous' }, FIXTURES, {}).auth.type, 'none');
  assert.throws(
    () => scanAuth({ ...USER, ...both }, FIXTURES, {}),
    /--actor "user" comes from the pack's qa-config entry, which the lane does not read when both --target and --base are given/,
  );
});

test('an unknown actor stops the lane before anything runs, listing the known names', async (t) => {
  const scan = liveScan();
  const { done } = liveLane(t, { ...DEMO, actor: 'ghost' }, { scan });
  await assert.rejects(done, /Known: default, anonymous, user, keyed, queried\./);
  assert.equal(scan.args, null);
});

test('without a credential the scan publishes no API port and the lane never calls ZAP', async (t) => {
  for (const actor of ['default', 'anonymous']) {
    const net = network();
    const scan = liveScan();
    const { done, lines } = liveLane(t, { ...DEMO, actor }, { net, scan });
    await until(() => scan.args, 'the scan');
    scan.finish();
    assert.equal(await done, 0, actor);
    assert.equal(scan.args.includes('-p'), false);
    assert.equal(scan.args.includes('-P'), false);
    assert.deepEqual(net.zap.calls, []);
    assert.ok(lines.includes(`dast-lane: actor "${actor}" sends no credential (auth none)`));
    assert.doesNotMatch(lines.join('\n'), /renewed/);
  }
});

test("the rule goes in when ZAP's API answers, with the header name and a value obtained then", async (t) => {
  const net = network({ zapUp: false });
  const scan = liveScan();
  const login = loginEndpoint((n) => `Xq${n}`);
  const { done, output } = liveLane(t, USER, { env: USER_ENV, net, scan, post: login.post });
  await until(() => scan.args, 'the scan');
  assert.deepEqual(scan.args.slice(5, 7), ['-p', `127.0.0.1:${ZAP_PORT}:${ZAP_PORT}`]);
  assert.deepEqual(scan.args.slice(scan.args.indexOf('-P'), scan.args.indexOf('-P') + 2), [
    '-P',
    String(ZAP_PORT),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(net.rules(), [], 'no rule while the API does not answer');
  assert.equal(login.calls.length, 1, 'only the check before the scan');

  net.zap.up = true;
  await until(() => net.rules().length === 1, 'the rule');
  assert.equal(login.calls.length, 2, 'a second credential, obtained when the API answered');
  assert.equal(
    login.calls[1],
    'http://localhost:9000/users/v1/login',
    "the host's view of the base URL, not the container's",
  );
  assert.deepEqual(net.rules()[0], {
    path: '/JSON/replacer/action/addRule/',
    params: {
      description: 'qa-auth',
      enabled: 'true',
      matchType: 'REQ_HEADER',
      matchRegex: 'false',
      matchString: 'Authorization',
      replacement: 'Bearer Xq2',
      initiators: '',
    },
  });
  scan.finish();
  assert.equal(await done, 0);
  assert.match(
    output(),
    /actor "user" sends its credential \(login\) in the Authorization header, set on every request ZAP sends through its replacer/,
  );
  assert.match(output(), /credential set in ZAP's replacer \d+ s into the scan/);
  assert.match(output(), /credential of actor "user" renewed 0 time\(s\)/);
  assert.match(output(), /passed/);
  assert.doesNotMatch(output(), /Xq|Pz9|u1/, 'no credential value in the log');
});

test('a renewal swaps the rule when the token is due: removeRule, then addRule with the new value', async (t) => {
  const net = network();
  const scan = liveScan();
  const login = loginEndpoint(expiredJwt);
  const { done, output } = liveLane(t, USER, { env: USER_ENV, net, scan, post: login.post });
  await until(() => net.rules().length >= 5, 'two renewals');
  scan.finish();
  assert.equal(await done, 0);
  const [first, remove, second, , third] = net.rules();
  assert.equal(first.params.replacement, `Bearer ${expiredJwt(2)}`);
  assert.deepEqual(remove, {
    path: '/JSON/replacer/action/removeRule/',
    params: { description: 'qa-auth' },
  });
  assert.equal(second.path, '/JSON/replacer/action/addRule/');
  assert.equal(second.params.replacement, `Bearer ${expiredJwt(3)}`);
  assert.equal(third.params.replacement, `Bearer ${expiredJwt(4)}`);
  assert.match(output(), /credential of actor "user" renewed [1-9]\d* time\(s\)/);
  assert.match(output(), /, renewed before it expires/);
  assert.doesNotMatch(output(), /e30\./, 'no token in the log');
});

test('a renewal that fails makes the scan untrusted: exit 2, with when, why and what to exclude', async (t) => {
  const net = network();
  const scan = liveScan();
  const login = loginEndpoint(expiredJwt, { refuseFrom: 3 });
  const { done, lines, output } = liveLane(t, USER, {
    env: USER_ENV,
    net,
    scan,
    post: login.post,
  });
  await until(() => /no further renewal/.test(output()), 'the failed renewal');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(login.calls.length, 3, 'no retry after the failure');
  scan.finish();
  assert.equal(await done, 2);
  assert.equal(lines.filter((line) => /no further renewal/.test(line)).length, 1, 'logged once');
  assert.match(
    output(),
    /renewal 1 of the credential failed \d+ s into the scan \(Login at \/users\/v1\/login as the user in U answered 401 without a "auth_token" string; check the credentials in U and P\), so from then on ZAP sent a stale credential and the scan is not trusted/,
  );
  assert.match(
    output(),
    /An operation the scan attacked may have changed or removed the credentials of actor "user"; keep it out of the scan with services\/demo\/dast-exclude\.txt/,
  );
  assert.doesNotMatch(output(), /passed|alerts by risk/);
});

test('a ZAP API that never answers leaves the credential unset: exit 2, whether the scan ends or the wait does', async (t) => {
  const ended = liveScan();
  const early = liveLane(t, USER, {
    env: USER_ENV,
    net: network({ zapUp: false }),
    scan: ended,
    post: loginEndpoint((n) => `Xq${n}`).post,
  });
  await until(() => ended.args, 'the scan');
  await new Promise((resolve) => setTimeout(resolve, 10));
  ended.finish();
  assert.equal(await early.done, 2);
  assert.match(
    early.output(),
    /the scan ended before ZAP's API answered, so the credential was never set and the scan is not trusted/,
  );

  const waited = liveScan();
  const late = liveLane(t, USER, {
    env: USER_ENV,
    net: network({ zapUp: false }),
    scan: waited,
    post: loginEndpoint((n) => `Xq${n}`).post,
    timing: { ...FAST, readyTimeoutMs: 20 },
  });
  await until(() => /could not be set/.test(late.output()), 'the timeout');
  waited.finish();
  assert.equal(await late.done, 2);
  assert.match(
    late.output(),
    /the credential was never set in ZAP \(\d+ s into the scan: ZAP's API did not answer within 0\.02 s\), so the scan ran without it and is not trusted/,
  );
});

test('an API key in a header goes on the rule under its own name, and its value is never logged', async (t) => {
  const net = network();
  const scan = liveScan();
  const { done, output } = liveLane(
    t,
    { ...DEMO, actor: 'keyed' },
    { env: { K: 'Kv7' }, net, scan },
  );
  await until(() => net.rules().length === 1, 'the rule');
  await new Promise((resolve) => setTimeout(resolve, 20));
  scan.finish();
  assert.equal(await done, 0);
  assert.equal(net.rules().length, 1, 'a key is never renewed');
  assert.equal(net.rules()[0].params.matchString, 'X-Key');
  assert.equal(net.rules()[0].params.replacement, 'Kv7');
  assert.match(output(), /actor "keyed" sends its credential \(api_key\) in the X-Key header/);
  assert.doesNotMatch(output(), /Kv7/);
});

test('an API key in the query, a missing variable and a refused login stop the lane with 2 before the scan', async (t) => {
  const cases = [
    [
      { ...DEMO, actor: 'queried' },
      { env: { K: 'k1' } },
      /actor "queried": Auth "api_key" sends the key in the query parameter "key"; a lane can only add a header to the requests its tool sends; the scan did not run/,
    ],
    [
      USER,
      { env: {} },
      /actor "user": Auth "login" needs the environment variable U, which is not set; the scan did not run/,
    ],
    [
      USER,
      { env: USER_ENV, post: loginEndpoint(() => 'x', { refuseFrom: 1 }).post },
      /actor "user": Login at \/users\/v1\/login as the user in U answered 401/,
    ],
  ];
  for (const [options, extra, message] of cases) {
    const scan = liveScan();
    const { done, output } = liveLane(t, options, { scan, ...extra });
    assert.equal(await done, 2);
    assert.equal(scan.args, null, 'no scan');
    assert.match(output(), message);
    assert.doesNotMatch(output(), /k1|Pz9/);
  }
});

test('an API that stops answering during the scan: docker stop, and exit 1 for availability', async (t) => {
  const refused = () => {
    throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
  };
  const scan = liveScan();
  const { done, output } = liveLane(t, DEMO, { net: network({ api: refused }), scan });
  assert.equal(await done, 1, 'docker stop ended the scan');
  const container = scan.args[4];
  assert.deepEqual(scan.stops, [['stop', container]]);
  assert.match(
    output(),
    new RegExp(
      `the API at http://localhost:9000/api stopped answering during the scan: 3 checks 0\\.003 s apart got no answer \\(ECONNREFUSED\\); stopping ZAP \\(docker stop ${container}\\)`,
    ),
  );
  assert.match(
    output(),
    /failed \(availability: the API stopped answering during the scan.*This is not an alert of a FAIL rule; no report\)/,
  );
  assert.doesNotMatch(output(), /did not complete|alerts by risk/);
});

test('checks without an answer, fewer than the limit and followed by answers, do not trip the guard', async (t) => {
  const net = network({
    api: () => {
      if (net.apiCalls.length <= 2) {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
      }
      return new Response('nope', { status: 503 });
    },
  });
  const scan = liveScan();
  const { done, output } = liveLane(t, DEMO, { net, scan });
  await until(() => net.apiCalls.length >= 8, 'several checks');
  scan.finish();
  assert.equal(await done, 0);
  assert.deepEqual(scan.stops, []);
  assert.doesNotMatch(output(), /stopped answering/);
});

// ---------------------------------------------------------------------------------------------
// Known false positives

const FP_LINE = '40018\t^https?://[^/]+/api/register$\tVN-16: the ORM binds the username';

function packWithFalsePositives(t, text, { rules = true } = {}) {
  const root = scratchRoot(t);
  writeFileSync(join(root, 'services', 'demo', 'dast-false-positives.tsv'), text);
  if (!rules) rmSync(join(root, 'services', 'demo', 'dast-rules.tsv'));
  return root;
}

test('known false positives are read with their reason; every bad line is named', () => {
  const root = mkdtempSync(join(tmpdir(), 'dast-fp-'));
  mkdirSync(join(root, 'services', 'shop'), { recursive: true });
  assert.deepEqual(falsePositives('shop', root), [], 'no file: none');
  const file = join(root, 'services', 'shop', 'dast-false-positives.tsv');
  writeFileSync(
    file,
    `# stateful register\n\n${FP_LINE}\r\n10036\t.*/books.*\tVN-17: a look-alike\n`,
  );
  assert.deepEqual(falsePositives('shop', root), [
    {
      ruleId: '40018',
      url: '^https?://[^/]+/api/register$',
      reason: 'VN-16: the ORM binds the username',
    },
    { ruleId: '10036', url: '.*/books.*', reason: 'VN-17: a look-alike' },
  ]);
  writeFileSync(file, 'SQLi\t.*\twhy\n40018\t.* /x\twhy\n40018\t.*/x\n40018\t(unclosed\twhy\n');
  assert.throws(
    () => falsePositives('shop', root),
    (error) =>
      /line 1: the rule id must be a ZAP plugin id/.test(error.message) &&
      /line 2: a URL regex without spaces is required/.test(error.message) &&
      /line 3: the reason \(the evidence it is false\) is required/.test(error.message) &&
      /line 4: "\(unclosed" is not a regular expression/.test(error.message),
  );
});

test('a false positive becomes an alert filter for the report and an out-of-scope rule for the exit', () => {
  const positives = [{ ruleId: '40018', url: '.*/register$', reason: 'why' }];
  assert.equal(
    zapConfig([], positives),
    '-config scanner.injectable=19' +
      ' -config globalalertfilter.filters.filter(0).ruleid=40018' +
      ' -config globalalertfilter.filters.filter(0).newrisk=-1' +
      ' -config globalalertfilter.filters.filter(0).url=.*/register$' +
      ' -config globalalertfilter.filters.filter(0).urlregex=true' +
      ' -config globalalertfilter.filters.filter(0).enabled=true',
  );
  assert.equal(
    rulesWithFalsePositives('40018\tFAIL\t(SQL Injection)\n\n', positives),
    '40018\tFAIL\t(SQL Injection)\n# known false positives (dast-false-positives.tsv)\n40018\tOUTOFSCOPE\t.*/register$\n',
  );
});

test('the lane hands ZAP the rules with the false positives out of scope, and lists them', async (t) => {
  const root = packWithFalsePositives(t, `${FP_LINE}\n`);
  const runner = fakeRunner({ report: readFixture('zap-site-object.json') });
  const lines = [];
  const code = await dastLane(DEMO, {
    root,
    env: {},
    run: runner.run,
    fetchImpl: fakeFetch().impl,
    log: (line) => lines.push(line),
  });
  assert.equal(code, 0);
  const args = runner.scan().args;
  assert.deepEqual(args.slice(-2), ['-c', '/zap/wrk/demo-rules.tsv']);
  assert.match(
    args[args.indexOf('-z') + 1],
    /globalalertfilter\.filters\.filter\(0\)\.ruleid=40018/,
  );
  const copy = readFileSync(join(root, 'reports', 'dast', 'demo-rules.tsv'), 'utf8');
  assert.ok(copy.startsWith(RULES.replace(/\s*$/, '')), 'the pack rules come first, unchanged');
  assert.match(copy, /\n40018\tOUTOFSCOPE\t\^https\?:\/\/\[\^\/\]\+\/api\/register\$\n$/);
  assert.match(
    lines.join('\n'),
    /known false positive \(dast-false-positives\.tsv\): rule 40018 on .*: VN-16: the ORM binds the username/,
  );
});

test('without a rules file the false positives are only alert filters; a bad file stops the lane', async (t) => {
  const root = packWithFalsePositives(t, `${FP_LINE}\n`, { rules: false });
  const runner = fakeRunner({ report: readFixture('zap-site-object.json') });
  const code = await dastLane(DEMO, {
    root,
    env: {},
    run: runner.run,
    fetchImpl: fakeFetch().impl,
    log: () => {},
  });
  assert.equal(code, 0);
  assert.equal(runner.scan().args.includes('-c'), false);
  assert.equal(existsSync(join(root, 'reports', 'dast', 'demo-rules.tsv')), false);

  const bad = packWithFalsePositives(t, '40018\t.*/register$\n');
  const refused = fakeRunner({});
  const lines = [];
  const badCode = await dastLane(DEMO, {
    root: bad,
    env: {},
    run: refused.run,
    fetchImpl: fakeFetch().impl,
    log: (line) => lines.push(line),
  });
  assert.equal(badCode, 2);
  assert.equal(refused.scan(), undefined);
  assert.match(lines.join('\n'), /line 1: the reason .* is required; the scan did not run/);
});
