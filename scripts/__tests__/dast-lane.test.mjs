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
import {
  PS_ARGS,
  containerBase,
  dastLane,
  excludePatterns,
  failRuleIds,
  fetchSpec,
  mapZapExit,
  parseComposePs,
  parseLaneArgs,
  resolveUrls,
  rulesPath,
  summarize,
  summaryLines,
  zapArgs,
  zapConfig,
} from '../dast-lane.mjs';

const FIXTURES = join(REPO_ROOT, 'scripts', '__fixtures__', 'dast-lane');
const fixtureText = (name) => readFileSync(join(FIXTURES, name), 'utf8');
const readFixture = (name) => JSON.parse(fixtureText(name));
const RULES = fixtureText(join('services', 'demo', 'dast-rules.tsv'));
const PS_LINES = fixtureText('compose-ps-lines.txt');
const PS_ARRAY = fixtureText('compose-ps-array.json');
const SPEC_JSON = JSON.stringify({ openapi: '3.0.1', info: {}, servers: [{ url: '' }], paths: {} });
const SPEC_YAML = 'openapi: 3.0.1\ninfo:\n  title: demo\npaths: {}\n';
const DEMO = { service: 'demo', target: null, base: null, out: 'demo' };
const PLAIN = { service: 'plain', target: null, base: null, out: 'plain' };

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
      ],
      FIXTURES,
    ),
    { service: 'demo', target: 'http://x.test/o.json', base: 'http://x.test', out: 'demo-2' },
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
// The address

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
  const base = containerBase('http://localhost:9000/api', services);
  assert.equal(base.url, 'http://demo-api:8000/api', 'the target port, not the stopped service');
  assert.match(base.note, /compose service "demo-api" publishes port 9000/);
  assert.equal(containerBase('http://127.0.0.1:15432', services).url, 'http://db:5432');
  const array = containerBase('http://127.0.0.1:9001', parseComposePs(PS_ARRAY));
  assert.equal(array.url, 'http://staging-api:5000');
});

test('without a compose service on the port the base goes through host.docker.internal', () => {
  const base = containerBase('http://localhost:9999/v1', parseComposePs(PS_LINES));
  assert.equal(base.url, 'http://host.docker.internal:9999/v1');
  assert.match(
    base.note,
    /no running compose service publishes port 9999.*Linux.*beyond 127.0.0.1/,
  );
  assert.equal(containerBase('http://localhost', []).url, 'http://host.docker.internal');
  assert.deepEqual(containerBase('https://api.example.test/v1', []), {
    url: 'https://api.example.test/v1',
    note: null,
  });
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
  assert.deepEqual(scan.args.slice(5, 11), [
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
