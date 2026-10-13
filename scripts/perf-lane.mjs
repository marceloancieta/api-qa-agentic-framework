#!/usr/bin/env node
/**
 * Performance lane (FUT-02): a smoke load of a pack's GET operations with k6, built from the
 * pack's OpenAPI model, whose latency the quality gate judges.
 *
 * Why. A spec's duration says little about latency: one timing is noise, and a case that sends
 * three requests counts once. This lane sends many requests at a steady rate and keeps k6's
 * percentiles, overall and per operation, so latency is judged on a distribution.
 *
 * Plan. The operations come from the pack's tracked contract (service.json `spec`), read through
 * the OpenAPI normalizer: every GET operation, each with the URL the lane can fill and the 2xx
 * status the contract declares for success. A required parameter takes, in order, the pack's value
 * (`params` in services/<pack>/perf.json, by parameter name), the schema's first example, its
 * default, its first enum value. An operation is left out, with its reason, when the pack excludes
 * it (`exclude`: an operation that resets data or answers with secrets), when the contract
 * requires credentials (authenticated runs come with FUT-10) unless the pack lists it
 * in `anonymous` (the API answers it without them, with the contract note that says so), when a
 * required parameter has no value, or when it declares no 2xx response. Every operation left out is
 * printed with the reason (L-05). The plan is written to reports/perf/<out>-plan.json.
 *
 * Run. k6 runs from the pinned `k6` compose service (profile `perf`) with scripts/k6/smoke.js, a
 * fixed script that reads the plan: an open model at `--rate` requests a second for `--duration`,
 * with at most `--vus` virtual users, one planned request per iteration in turn. A loopback base is
 * rewritten to the address the container reaches (scripts/lib/container.mjs). Before k6 starts,
 * the lane sends the first planned request from the host: an API that does not answer stops the
 * lane (reachability rule), whatever HTTP status it returns is an answer.
 *
 * Verdict. The lane judges correctness only: every request must answer its expected status. Latency
 * is judged once, by the quality gate's `p95_latency` check with `format: k6-summary`, which reads
 * the summary this lane writes (reports/perf/<out>.json). Response bodies are discarded.
 *
 *   node scripts/perf-lane.mjs --service pack [--base api-url] [--out name]
 *                              [--rate n] [--duration 30s] [--vus n]
 *
 * Exit codes: 0 every request answered its expected status; 1 some did not (the operations are
 * listed); 2 the lane could not run or k6 did not complete (bad arguments or pack file, nothing to
 * measure, an API that does not answer, Docker missing, a k6 error, no summary or one that is not
 * a k6 summary).
 */

import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  packEnvironment,
  readService,
  readTextIfExists,
  REPO_ROOT,
  servicePacks,
} from './lib/cli.mjs';
import { dockerRunner, httpUrl, reachableBase } from './lib/container.mjs';
import { loadModel } from './lib/openapi.mjs';
import { describeExit, exitCodeOf, spawnFailure } from './lib/spawn.mjs';
import { InputError, k6Latency } from './quality-gate.mjs';

export const K6_SERVICE = 'k6';
export const REPORTS_DIR = join('reports', 'perf');
export const PACK_FILE = 'perf.json';
export const RUNNER = '/k6/smoke.js'; // scripts/k6, mounted read-only
const CONTAINER_REPORTS = '/perf'; // reports/perf
const K6 = { name: 'k6', service: K6_SERVICE };
export const DEFAULT_LOAD = Object.freeze({ rate: 20, duration: '30s', vus: 10 });
const OUT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const DURATION = /^[1-9][0-9]*(ms|s|m|h)$/;
const PREFLIGHT_TIMEOUT_MS = 10_000;
const PACK_KEYS = ['$comment', 'params', 'anonymous', 'exclude'];

// ---------------------------------------------------------------------------------------------
// Arguments

const positiveInteger = (raw, flag) => {
  if (!/^[1-9][0-9]*$/.test(raw))
    throw new Error(`${flag} must be a positive integer, got "${raw}"`);
  return Number(raw);
};

/** `{ service, base, out, load }` from the command line; `out` defaults to the pack name. */
export function parseLaneArgs(argv, root = REPO_ROOT) {
  const { values } = parseArgs({
    args: argv,
    options: {
      service: { type: 'string' },
      base: { type: 'string' },
      out: { type: 'string' },
      rate: { type: 'string' },
      duration: { type: 'string' },
      vus: { type: 'string' },
    },
  });
  if (!values.service) {
    throw new Error(
      `name the pack with --service <name> (packs: ${servicePacks(root).join(', ') || 'none'})`,
    );
  }
  const out = values.out ?? values.service;
  if (!OUT_NAME.test(out)) {
    throw new Error(
      `--out must be a plain file name (letters, digits, ".", "_", "-"), got "${out}"`,
    );
  }
  const duration = values.duration ?? DEFAULT_LOAD.duration;
  if (!DURATION.test(duration)) {
    throw new Error(`--duration must be a k6 duration such as 30s or 2m, got "${duration}"`);
  }
  return {
    service: values.service,
    base: values.base ?? null,
    out,
    load: {
      rate: values.rate ? positiveInteger(values.rate, '--rate') : DEFAULT_LOAD.rate,
      duration,
      vus: values.vus ? positiveInteger(values.vus, '--vus') : DEFAULT_LOAD.vus,
    },
  };
}

/** `{ baseUrl, baseFrom }`: --base, else the pack's base_url in the active environment. */
export function resolveBase({ service, base }, root = REPO_ROOT, env = process.env) {
  if (base) {
    const baseUrl = base.replace(/\/+$/, '');
    httpUrl(baseUrl, 'the base URL');
    return { baseUrl, baseFrom: '--base' };
  }
  const environment = packEnvironment(service, root, env);
  httpUrl(environment.baseUrl, 'the base URL');
  return {
    baseUrl: environment.baseUrl,
    baseFrom: `base_url of "${service}" in environment "${environment.name}"`,
  };
}

// ---------------------------------------------------------------------------------------------
// The pack's file

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isValue = (value) => ['string', 'number', 'boolean'].includes(typeof value);

/**
 * services/<pack>/perf.json, checked: `{ params, anonymous, exclude }`, each an object (empty when
 * the pack has no file). Throws with the file and the problem.
 */
export function readPackFile(pack, root = REPO_ROOT) {
  const file = join('services', pack, PACK_FILE);
  const text = readTextIfExists(join(root, file));
  if (text === null) return { params: {}, anonymous: {}, exclude: {} };
  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error.message}`, { cause: error });
  }
  if (!isObject(config)) throw new Error(`${file} must hold an object`);
  const problems = Object.keys(config)
    .filter((key) => !PACK_KEYS.includes(key))
    .map((key) => `unknown key "${key}" (known: ${PACK_KEYS.join(', ')})`);
  for (const key of ['params', 'anonymous', 'exclude']) {
    if (key in config && !isObject(config[key])) problems.push(`"${key}" must be an object`);
  }
  for (const [name, value] of Object.entries(isObject(config.params) ? config.params : {})) {
    const ok = isValue(value) || (Array.isArray(value) && value.length > 0 && value.every(isValue));
    if (!ok) problems.push(`params.${name} must be a string, number, boolean or a list of them`);
  }
  for (const key of ['anonymous', 'exclude']) {
    for (const [operation, reason] of Object.entries(isObject(config[key]) ? config[key] : {})) {
      if (typeof reason !== 'string' || reason.trim() === '') {
        problems.push(`${key}["${operation}"] must give its reason as text`);
      }
    }
  }
  if (problems.length > 0) throw new Error(`${file}: ${problems.join('; ')}`);
  return { params: {}, anonymous: {}, exclude: {}, ...config };
}

// ---------------------------------------------------------------------------------------------
// The plan

/** The value of a required parameter, or undefined: the pack's, an example, the default, an enum. */
function parameterValue(parameter, params) {
  if (parameter.name in params) return params[parameter.name];
  const schema = parameter.schema ?? {};
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  return undefined;
}

/** The success status the contract declares: its lowest 2xx, or null. */
export function successStatus(operation) {
  const codes = operation.responses
    .map((response) => response.status)
    .filter((status) => /^2[0-9][0-9]$/.test(status))
    .map(Number)
    .sort((a, b) => a - b);
  return codes[0] ?? null;
}

/** True when every security requirement of the operation names a scheme (none is anonymous). */
const securedOperation = (operation) =>
  operation.security.length > 0 && operation.security.every((schemes) => schemes.length > 0);

/**
 * The plan of a model's GET operations: `{ requests, skipped }`. A request is `{ name, path,
 * status }` with `note` when the pack lists it in `anonymous`; a skipped operation is
 * `{ name, reason }`. Throws when the pack's file names an operation that is not a GET operation
 * of the contract, so a renamed path never leaves a stale entry behind.
 */
export function derivePlan(model, pack = { params: {}, anonymous: {}, exclude: {} }) {
  const gets = model.operations.filter((operation) => operation.method === 'GET');
  const known = new Set(gets.map((operation) => operation.key));
  const stale = ['anonymous', 'exclude'].flatMap((key) =>
    Object.keys(pack[key])
      .filter((name) => !known.has(name))
      .map((name) => `${key}["${name}"]`),
  );
  if (stale.length > 0) {
    throw new Error(
      `${PACK_FILE} names operations that are not GET operations of the contract: ${stale.join(', ')}`,
    );
  }

  const requests = [];
  const skipped = [];
  for (const operation of gets) {
    const name = operation.key;
    const skip = (reason) => skipped.push({ name, reason });
    if (name in pack.exclude) {
      skip(`excluded by ${PACK_FILE}: ${pack.exclude[name]}`);
      continue;
    }
    if (securedOperation(operation) && !(name in pack.anonymous)) {
      const schemes = operation.security.map((schemes) => schemes.join(' + ')).join(' or ');
      skip(`the contract requires credentials (${schemes}); the lane sends none yet`);
      continue;
    }
    const status = successStatus(operation);
    if (status === null) {
      skip('the contract declares no 2xx response, so there is no success to check');
      continue;
    }

    const required = operation.parameters.filter((p) => p.required);
    const unsupported = required.filter((p) => !['path', 'query'].includes(p.in));
    if (unsupported.length > 0) {
      const names = unsupported.map((p) => `${p.in} parameter "${p.name}"`).join(', ');
      skip(`it requires the ${names}; the lane sends path and query parameters only`);
      continue;
    }
    let path = operation.path;
    const query = new URLSearchParams();
    const missing = [];
    for (const parameter of required) {
      const value = parameterValue(parameter, pack.params);
      if (value === undefined) {
        missing.push(`${parameter.in} parameter "${parameter.name}"`);
      } else if (parameter.in === 'path') {
        path = path.replace(`{${parameter.name}}`, encodeURIComponent(String(value)));
      } else {
        for (const item of [value].flat()) query.append(parameter.name, String(item));
      }
    }
    if (missing.length > 0) {
      skip(`no value for the required ${missing.join(', ')}; give one in ${PACK_FILE} "params"`);
      continue;
    }
    const search = query.toString();
    const request = { name, path: search ? `${path}?${search}` : path, status };
    if (name in pack.anonymous) request.note = `sent without credentials: ${pack.anonymous[name]}`;
    requests.push(request);
  }
  return { requests, skipped };
}

// ---------------------------------------------------------------------------------------------
// The run

/** `docker` arguments of one k6 run. Files are under /perf (reports/perf) in the container. */
export function k6Args(out) {
  return [
    'compose',
    'run',
    '--rm',
    K6_SERVICE,
    'run',
    '-e',
    `PLAN=${CONTAINER_REPORTS}/${out}-plan.json`,
    '-e',
    `SUMMARY=${CONTAINER_REPORTS}/${out}.json`,
    RUNNER,
  ];
}

/**
 * Send one request from the host and report whether the API answered: null when it did (any HTTP
 * status is an answer), else the reason.
 */
export async function preflight(url, fetchImpl = fetch) {
  try {
    await fetchImpl(url, { signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS) });
    return null;
  } catch (error) {
    return `${url} did not answer (${error.cause?.code ?? error.message})`;
  }
}

const ms = (value) => `${Math.round(value * 10) / 10} ms`;

/** Summary lines of a k6 latency (quality-gate `k6Latency`): overall, then each operation. */
export function summaryLines(latency) {
  return [
    `${latency.requests} requests, p95 ${ms(latency.p95)}, max ${ms(latency.max)}` +
      (latency.dropped > 0
        ? `; ${latency.dropped} iteration(s) dropped: --vus could not keep --rate, latency is high`
        : ''),
    ...latency.operations.map(
      (operation) =>
        `  ${operation.name}: ${operation.count} requests, p95 ${ms(operation.p95)}, ` +
        `max ${ms(operation.max)}` +
        (operation.fails ? `, ${operation.fails} with an unexpected status` : ''),
    ),
  ];
}

/**
 * Run the lane and return its exit code; `log` prints. `run` replaces `dockerRunner` and
 * `fetchImpl` replaces `fetch` in tests, so they never start Docker or call a network.
 */
export async function perfLane(
  options,
  {
    root = REPO_ROOT,
    env = process.env,
    run = dockerRunner,
    fetchImpl = fetch,
    log = console.log,
  } = {},
) {
  const service = readService(options.service, root);
  const { baseUrl, baseFrom } = resolveBase(options, root, env);
  const pack = readPackFile(options.service, root);
  const model = await loadModel(join(service.dir, service.spec));
  const plan = derivePlan(model, pack);

  const dir = join(root, REPORTS_DIR);
  const planFile = join(dir, `${options.out}-plan.json`);
  const summaryFile = join(dir, `${options.out}.json`);
  const shown = (file) => relative(root, file).replace(/\\/g, '/');
  mkdirSync(dir, { recursive: true });
  // k6 runs as an unprivileged user in its container; on a Linux host whose checkout belongs to
  // another user (CI runners) it could not write here otherwise. A no-op on Windows.
  try {
    chmodSync(dir, 0o777);
  } catch {
    // not ours to change; a missing summary is reported below
  }
  for (const file of [planFile, summaryFile]) rmSync(file, { force: true });

  log(`perf-lane: contract services/${options.service}/${service.spec}`);
  for (const request of plan.requests.filter((r) => r.note)) {
    log(`perf-lane: ${request.name} ${request.note}`);
  }
  for (const { name, reason } of plan.skipped) log(`perf-lane: left out ${name}: ${reason}`);
  if (plan.requests.length === 0) {
    log('perf-lane: no GET operation left to measure; the lane did not run');
    return 2;
  }

  log(`perf-lane: API base ${baseUrl} (${baseFrom})`);
  const unreachable = await preflight(`${baseUrl}${plan.requests[0].path}`, fetchImpl);
  if (unreachable) {
    log(
      `perf-lane: ${unreachable}; check that the service is up and QA_ENV names the right ` +
        'environment. The lane did not run',
    );
    return 2;
  }
  const base = reachableBase(baseUrl, { root, run, tool: K6 });
  if (base.error) {
    log(`perf-lane: ${base.error}; the lane did not run`);
    return 2;
  }
  if (base.note) log(`perf-lane: rewritten to ${base.url}: ${base.note}`);

  writeFileSync(
    planFile,
    `${JSON.stringify({ pack: options.service, base: base.url, load: options.load, ...plan }, null, 2)}\n`,
  );
  const { rate, duration, vus } = options.load;
  log(
    `perf-lane: ${plan.requests.length} operation(s) at ${rate} requests/s for ${duration} ` +
      `(at most ${vus} VUs); plan in ${shown(planFile)}`,
  );

  const result = run(k6Args(options.out), { cwd: root });
  const failure = spawnFailure(result);
  if (failure) {
    log(`perf-lane: docker ${failure}; the run did not complete`);
    return 2;
  }
  if (exitCodeOf(result) !== 0) {
    log(`perf-lane: k6 ${describeExit(result)}: the run did not complete (see its output above)`);
    return 2;
  }

  const text = readTextIfExists(summaryFile);
  if (text === null) {
    log(`perf-lane: k6 wrote no ${shown(summaryFile)}; the run did not complete`);
    return 2;
  }
  let latency;
  try {
    latency = k6Latency(JSON.parse(text));
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof InputError)) throw error;
    log(`perf-lane: ${shown(summaryFile)} is not a k6 summary (${error.message})`);
    return 2;
  }
  if (latency.requests === 0) {
    log('perf-lane: k6 sent no request; the run did not complete');
    return 2;
  }

  for (const line of summaryLines(latency)) log(`perf-lane: ${line}`);
  log(`perf-lane: summary in ${shown(summaryFile)}; the quality gate's p95_latency judges latency`);
  const failing = latency.operations.filter((operation) => operation.fails > 0);
  if (failing.length > 0 || latency.failedChecks > 0) {
    const names = failing.map((operation) => {
      const expected = plan.requests.find((request) => request.name === operation.name)?.status;
      return `${operation.name} (expected ${expected}, ${operation.fails} of ${operation.count} did not)`;
    });
    log(
      `perf-lane: failed: requests answered an unexpected status: ${names.join('; ') || 'see the summary'}`,
    );
    return 1;
  }
  log('perf-lane: passed (every request answered its expected status)');
  return 0;
}

const entryScript = process.argv[1];
if (entryScript && pathToFileURL(entryScript).href === import.meta.url) {
  Promise.resolve()
    .then(() => perfLane(parseLaneArgs(process.argv.slice(2))))
    .then(
      (code) => process.exit(code),
      (error) => {
        console.error(`perf-lane: ${error.message}`);
        process.exit(2);
      },
    );
}
