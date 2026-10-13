import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';
import {
  PS_ARGS,
  containerBase,
  httpUrl,
  parseComposePs,
  reachableBase,
} from '../lib/container.mjs';

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
