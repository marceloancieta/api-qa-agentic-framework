#!/usr/bin/env node
/**
 * DAST lane (FUT-01): run OWASP ZAP's API scan against one pack's API, driven by its OpenAPI
 * document, and report the alerts it raised.
 *
 * Why. The specs check what a case asserts; a dynamic scan looks for what nobody wrote a case for:
 * missing security headers, information leaks, injection points the contract exposes. ZAP runs
 * from the pinned `zap` service of docker-compose.yml (profile `dast`, so `docker compose up` never
 * starts it), which keeps the scanner's version in one place.
 *
 * Definition and base. The lane fetches the pack's spec_url on the host (`QA_ENV` selects the
 * environment, `QA_<PACK>_SPEC_URL` or `--target` override it), saves it as
 * reports/dast/<out>-openapi.<json|yaml> and hands ZAP that file with `-O <base>`, the pack's
 * base_url (`QA_<PACK>_BASE_URL` or `--base` override it). ZAP then sends every operation to the
 * base, whatever the document's `servers` say: a definition read from a URL resolves a relative
 * server such as "" against the document's own URL, and every request went to
 * `/openapi.json/<path>` and answered 404.
 *
 * Address. ZAP runs in a container, where `localhost` is the container itself, so a loopback base
 * is rewritten to the address the container reaches (scripts/lib/container.mjs). The lane prints
 * the rewrite.
 *
 * Policy. When the pack has `services/<pack>/dast-rules.tsv` (ZAP's own tab-separated format,
 * `<pluginId>\t<IGNORE|WARN|FAIL>\t(<name>)`), ZAP reads it from the read-only mount and fails on
 * an alert of a FAIL rule. `-I` keeps warnings from failing the scan. Counting alerts per risk
 * against thresholds belongs to the quality gate (`quality_gate.dast`, which reads
 * reports/dast/<pack>.json); the lane does not judge counts a second time. A rules file also moves
 * ZAP from its API-Minimal policy to every active rule not set to IGNORE, which makes a scan take
 * minutes rather than seconds. IGNORE stops an active rule; on a passive rule it only hides the alert
 * from ZAP's summary, and the alert stays in the JSON report the quality gate counts.
 *
 * Scan options. Injection points include the URL path (`scanner.injectable=19`: query, body and
 * path), because an API carries its ids in the path and ZAP's default leaves them out. A pack may
 * keep URLs out of the scan with `services/<pack>/dast-exclude.txt`, one regular expression per
 * line (`#` starts a comment), for an operation a scan must not call, such as one that resets the
 * service's data. The patterns become ZAP's global URL exclusions, which the spider and the active
 * scan honour, and the lane also removes every matching path from the definition it saves: ZAP's
 * import sends each operation of the definition once and ignores those exclusions.
 *
 *   node scripts/dast-lane.mjs --service pack [--target openapi-url] [--base api-url] [--out name]
 *
 * Reports land in reports/dast/<out>.json and .html (default out: the pack name). Stale files of
 * the same name are removed first, so a scan that writes no report can never pass with an old one.
 *
 * Exit codes: 0 no alert of a FAIL rule (ZAP exit 0, or 2 for warnings only); 1 an alert of a FAIL
 * rule (ZAP exit 1); 2 the lane could not run or the scan did not complete (bad arguments, a spec
 * URL that does not answer or is not an OpenAPI document, Docker missing, any other ZAP exit, no
 * JSON report or one that is not a ZAP report).
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  packEnvironment,
  readService,
  readTextIfExists,
  REPO_ROOT,
  servicePacks,
} from './lib/cli.mjs';
import { dockerRunner, httpUrl, reachableBase } from './lib/container.mjs';
import { describeExit, exitCodeOf, spawnFailure } from './lib/spawn.mjs';
import { InputError, dastCounts } from './quality-gate.mjs';

export const RISKS = ['informational', 'low', 'medium', 'high']; // index = ZAP riskcode
export const ZAP_SERVICE = 'zap';
export const REPORTS_DIR = join('reports', 'dast');
export const RULES_FILE = 'dast-rules.tsv';
export const EXCLUDE_FILE = 'dast-exclude.txt';
/** Query (1), body (2) and URL path (16), as ZAP's scanner.injectable bit set. */
export const INJECTABLE = 19;
const ZAP = { name: 'ZAP', service: ZAP_SERVICE };
const CONTAINER_SERVICES = '/zap/services'; // ./services, mounted read-only
const OUT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FETCH_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------------------------
// Arguments and URLs

/** `{ service, target, base, out }` from the command line; `out` defaults to the pack name. */
export function parseLaneArgs(argv, root = REPO_ROOT) {
  const { values } = parseArgs({
    args: argv,
    options: {
      service: { type: 'string' },
      target: { type: 'string' },
      base: { type: 'string' },
      out: { type: 'string' },
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
  return { service: values.service, target: values.target ?? null, base: values.base ?? null, out };
}

/**
 * The URLs of one scan: `{ specUrl, specFrom, baseUrl, baseFrom }`, each with where it came from.
 * The pack must exist even with both overrides, since its name selects the rules and the report;
 * the qa-config entry is read only for a URL no flag gives.
 */
export function resolveUrls({ service, target, base }, root = REPO_ROOT, env = process.env) {
  readService(service, root);
  const environment = target && base ? null : packEnvironment(service, root, env);
  const configured = (setting) => `${setting} of "${service}" in environment "${environment.name}"`;
  if (!target && !environment.specUrl) {
    throw new Error(
      `${environment.source}: pack "${service}" in environment "${environment.name}" has no ` +
        'spec_url; set it or pass --target',
    );
  }
  const specUrl = httpUrl(target ?? environment.specUrl, 'the spec URL').href;
  const baseUrl = (base ?? environment.baseUrl).replace(/\/+$/, '');
  httpUrl(baseUrl, 'the base URL');
  return {
    specUrl,
    specFrom: target ? '--target' : configured('spec_url'),
    baseUrl,
    baseFrom: base ? '--base' : configured('base_url'),
  };
}

/** The pack's rule policy on the host, or null when it has none. */
export function rulesPath(pack, root = REPO_ROOT) {
  const file = join(root, 'services', pack, RULES_FILE);
  return existsSync(file) ? file : null;
}

/** The pack's URL exclusions: one regular expression per line, `#` comments and blanks skipped. */
export function excludePatterns(pack, root = REPO_ROOT) {
  const text = readTextIfExists(join(root, 'services', pack, EXCLUDE_FILE));
  if (text === null) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/** ZAP `-z` options: path injection plus one global URL exclusion per pattern. */
export function zapConfig(excludes = []) {
  return [
    `-config scanner.injectable=${INJECTABLE}`,
    ...excludes.flatMap((regex, i) => [
      `-config globalexcludeurl.url_list.url(${i}).regex=${regex}`,
      `-config globalexcludeurl.url_list.url(${i}).enabled=true`,
    ]),
  ].join(' ');
}

// ---------------------------------------------------------------------------------------------
// The definition, fetched on the host

/**
 * Fetch the OpenAPI document at `url`: `{ text, ext }` with `ext` `json` or `yaml`, as received.
 * Throws with a message for a URL that does not answer, a non-2xx answer and a body that is not a
 * JSON or YAML OpenAPI (or Swagger) document.
 */
export async function fetchSpec(url, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    throw new Error(
      `the spec URL ${url} did not answer (${error.cause?.code ?? error.message}); check that the ` +
        'service is up and QA_ENV names the right environment',
      { cause: error },
    );
  }
  if (!response.ok) throw new Error(`the spec URL ${url} answered ${response.status}`);
  const text = await response.text();
  let document;
  let ext = 'json';
  try {
    document = JSON.parse(text);
  } catch {
    ext = 'yaml';
    try {
      document = parseYaml(text);
    } catch {
      document = null;
    }
  }
  const isObject = document !== null && typeof document === 'object' && !Array.isArray(document);
  if (!isObject || !('openapi' in document || 'swagger' in document)) {
    throw new Error(`the spec URL ${url} did not return an OpenAPI document in JSON or YAML`);
  }
  return { text, ext };
}

/**
 * The definition without the paths a pack keeps out of the scan: `{ text, removed }`. A path goes
 * when its URL (`base` + the path template, e.g. `http://api:5000/users/v1/{username}`) matches an
 * exclusion. ZAP's global URL exclusions cover the spider and the active scan but not the import,
 * which sends every operation of the definition once: an operation that resets the data was called
 * at the start of every scan until the lane took it out of the definition. Unchanged text when
 * nothing matches; otherwise the document is written back in its own format.
 */
export function withoutExcluded(spec, base, excludes = []) {
  if (excludes.length === 0) return { text: spec.text, removed: [] };
  const document = spec.ext === 'json' ? JSON.parse(spec.text) : parseYaml(spec.text);
  const patterns = excludes.map((regex) => new RegExp(regex));
  const prefix = base.replace(/\/+$/, '');
  const removed = Object.keys(document.paths ?? {}).filter((path) =>
    patterns.some((pattern) => pattern.test(`${prefix}${path}`)),
  );
  if (removed.length === 0) return { text: spec.text, removed };
  for (const path of removed) delete document.paths[path];
  const text =
    spec.ext === 'json' ? `${JSON.stringify(document, null, 2)}\n` : stringifyYaml(document);
  return { text, removed };
}

// ---------------------------------------------------------------------------------------------
// The scan

/**
 * `docker` arguments of one scan. File names are relative to /zap/wrk (reports/dast); the rules
 * file is read through the read-only services mount.
 */
export function zapArgs({ definition, base, out, pack, rules, excludes = [] }) {
  return [
    'compose',
    'run',
    '--rm',
    ZAP_SERVICE,
    'zap-api-scan.py',
    '-t',
    definition,
    '-f',
    'openapi',
    '-O',
    base,
    '-J',
    `${out}.json`,
    '-r',
    `${out}.html`,
    '-I',
    '-z',
    zapConfig(excludes),
    ...(rules ? ['-c', `${CONTAINER_SERVICES}/${pack}/${RULES_FILE}`] : []),
  ];
}

/**
 * The lane's exit code for ZAP's: `{ code, note }`, or `{ code: 2, note }` when the scan did not
 * complete. ZAP exits 0 clean, 1 on a FAIL rule, 2 on warnings only (not with `-I`), 3 on errors.
 */
export function mapZapExit(zapExit) {
  if (zapExit === 0) return { code: 0, note: 'no alert of a FAIL rule' };
  if (zapExit === 1) return { code: 1, note: 'an alert of a FAIL rule' };
  if (zapExit === 2) return { code: 0, note: 'warnings only' };
  return {
    code: 2,
    note: `ZAP exited ${zapExit}: the scan did not complete (see its output above)`,
  };
}

// ---------------------------------------------------------------------------------------------
// Report

/** Plugin ids that a ZAP rules file sets to FAIL. */
export function failRuleIds(text) {
  const ids = new Set();
  for (const line of (text ?? '').split(/\r?\n/)) {
    if (line.startsWith('#') || line.trim() === '') continue;
    const [id, level] = line.split('\t');
    if (level?.trim() === 'FAIL') ids.add(id.trim());
  }
  return ids;
}

const sitesOf = (report) => (Array.isArray(report.site) ? report.site : [report.site]);

/**
 * Alerts per risk of a ZAP JSON report: `{ counts, names, failing }`. Counts come from the quality
 * gate's `dastCounts`, which also rejects a report of the wrong shape; `names` lists each risk's
 * alert names once; `failing` lists the alerts whose plugin id is in `failIds`.
 */
export function summarize(report, failIds = new Set()) {
  const counts = dastCounts(report).value;
  const names = Object.fromEntries(RISKS.map((risk) => [risk, new Set()]));
  const failing = [];
  for (const site of sitesOf(report)) {
    for (const alert of site.alerts ?? []) {
      const name = alert.name ?? alert.alert ?? `plugin ${alert.pluginid}`;
      names[RISKS[Number(alert.riskcode)]].add(name);
      if (failIds.has(String(alert.pluginid))) failing.push(`${alert.pluginid} ${name}`);
    }
  }
  return {
    counts,
    names: Object.fromEntries(RISKS.map((risk) => [risk, [...names[risk]]])),
    failing: [...new Set(failing)],
  };
}

/** Summary lines, highest risk first. */
export function summaryLines(summary) {
  const order = [...RISKS].reverse();
  return [
    `alerts by risk: ${order.map((risk) => `${risk} ${summary.counts[risk]}`).join(', ')}`,
    ...order
      .filter((risk) => summary.names[risk].length > 0)
      .map((risk) => `  ${risk}: ${summary.names[risk].join(', ')}`),
  ];
}

// ---------------------------------------------------------------------------------------------
// The lane

/**
 * Run one scan and return the lane's exit code; `log` prints. `run` replaces `dockerRunner` and
 * `fetchImpl` replaces `fetch` in tests, so they never start Docker or call a network.
 */
export async function dastLane(
  options,
  {
    root = REPO_ROOT,
    env = process.env,
    run = dockerRunner,
    fetchImpl = fetch,
    log = console.log,
  } = {},
) {
  const urls = resolveUrls(options, root, env);
  const rules = rulesPath(options.service, root);
  const dir = join(root, REPORTS_DIR);
  const jsonFile = join(dir, `${options.out}.json`);
  const htmlFile = join(dir, `${options.out}.html`);
  const specFiles = ['json', 'yaml'].map((ext) => join(dir, `${options.out}-openapi.${ext}`));
  const shown = (file) => relative(root, file).replace(/\\/g, '/');

  mkdirSync(dir, { recursive: true });
  // ZAP runs as uid 1000 in its container; on a Linux host whose checkout belongs to another user
  // (CI runners) it could not write here otherwise. A no-op on Windows; a failure surfaces as a
  // missing report below.
  try {
    chmodSync(dir, 0o777);
  } catch {
    // not ours to change; ZAP reports the problem if it cannot write
  }
  for (const file of [jsonFile, htmlFile, ...specFiles]) rmSync(file, { force: true });

  let spec;
  try {
    spec = await fetchSpec(urls.specUrl, fetchImpl);
  } catch (error) {
    log(`dast-lane: ${error.message}; the scan did not run`);
    return 2;
  }
  const base = reachableBase(urls.baseUrl, { root, run, tool: ZAP });
  if (base.error) {
    log(`dast-lane: ${base.error}; the scan did not run`);
    return 2;
  }

  const excludes = excludePatterns(options.service, root);
  let definition;
  try {
    definition = withoutExcluded(spec, base.url, excludes);
  } catch (error) {
    log(
      `dast-lane: ${EXCLUDE_FILE} holds a pattern that is not a regular expression (${error.message}); the scan did not run`,
    );
    return 2;
  }
  const specFile = join(dir, `${options.out}-openapi.${spec.ext}`);
  writeFileSync(specFile, definition.text);
  log(`dast-lane: definition ${urls.specUrl} (${urls.specFrom}), saved as ${shown(specFile)}`);
  log(`dast-lane: API base ${urls.baseUrl} (${urls.baseFrom})`);
  if (base.note) log(`dast-lane: rewritten to ${base.url}: ${base.note}`);
  log(
    rules
      ? `dast-lane: rule policy ${shown(rules)}`
      : `dast-lane: no ${RULES_FILE} in services/${options.service}; every alert is a warning`,
  );
  if (excludes.length > 0) {
    log(`dast-lane: kept out of the scan (${EXCLUDE_FILE}): ${excludes.join(', ')}`);
    log(
      definition.removed.length > 0
        ? `dast-lane: removed from the definition, so ZAP's import never calls them: ${definition.removed.join(', ')}`
        : 'dast-lane: no path of the definition matches them; the scan and the spider still skip matching URLs',
    );
  }
  const args = zapArgs({
    definition: `${options.out}-openapi.${spec.ext}`,
    base: base.url,
    out: options.out,
    pack: options.service,
    rules,
    excludes,
  });
  const result = run(args, { cwd: root });
  const failure = spawnFailure(result);
  if (failure) {
    log(`dast-lane: docker ${failure}; the scan did not complete`);
    return 2;
  }
  const mapped = mapZapExit(exitCodeOf(result));
  if (mapped.code === 2) {
    log(`dast-lane: ${mapped.note}`);
    return 2;
  }

  const text = readTextIfExists(jsonFile);
  if (text === null) {
    log(
      `dast-lane: ZAP ${describeExit(result)} but wrote no ${shown(jsonFile)}; the scan did not complete`,
    );
    return 2;
  }
  let summary;
  try {
    summary = summarize(JSON.parse(text), failRuleIds(rules ? readFileSync(rules, 'utf8') : ''));
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof InputError)) throw error;
    log(
      `dast-lane: ${shown(jsonFile)} is not a ZAP JSON report (${error.message}); the scan did not complete`,
    );
    return 2;
  }

  for (const line of summaryLines(summary)) log(`dast-lane: ${line}`);
  const reports = [jsonFile, htmlFile].filter((file) => existsSync(file)).map(shown);
  log(`dast-lane: reports in ${reports.join(' and ')}`);
  if (mapped.code === 1) {
    log(
      summary.failing.length > 0
        ? `dast-lane: FAIL rule alert(s): ${summary.failing.join('; ')}`
        : 'dast-lane: ZAP reported an alert of a FAIL rule (see its output above)',
    );
  }
  log(`dast-lane: ${mapped.code === 0 ? 'passed' : 'failed'} (${mapped.note})`);
  return mapped.code;
}

const entryScript = process.argv[1];
if (entryScript && pathToFileURL(entryScript).href === import.meta.url) {
  Promise.resolve()
    .then(() => dastLane(parseLaneArgs(process.argv.slice(2))))
    .then(
      (code) => process.exit(code),
      (error) => {
        console.error(`dast-lane: ${error.message}`);
        process.exit(2);
      },
    );
}
