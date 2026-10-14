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
 * Known false positives. `services/<pack>/dast-false-positives.tsv` lists alerts the pack has shown
 * to be false: `<rule id>	<URL regex>	<reason>`, the reason naming the evidence. Each becomes a
 * global alert filter (`newrisk=-1`), so ZAP marks those alerts False Positive and the JSON report
 * leaves them out, and an OUTOFSCOPE line in a copy of the rules file (reports/dast/<out>-rules.tsv),
 * because ZAP's scan script counts alerts for its exit before any filter applies. The lane lists them.
 *
 * Scan options. Injection points include the URL path (`scanner.injectable=19`: query, body and
 * path), because an API carries its ids in the path and ZAP's default leaves them out. A pack may
 * keep URLs out of the scan with `services/<pack>/dast-exclude.txt`, one regular expression per
 * line (`#` starts a comment), for an operation a scan must not call, such as one that resets the
 * service's data. The patterns become ZAP's global URL exclusions, which the spider and the active
 * scan honour, and the lane also removes every matching path from the definition it saves: ZAP's
 * import sends each operation of the definition once and ignores those exclusions.
 *
 * Writes. An active scan sends POST, PUT and DELETE requests with attack payloads, so the lane
 * scans only where the pack's entry has `allow_writes: true`; with both `--target` and `--base`,
 * which skip qa-config, only a loopback base. A pack whose service cannot take concurrent callers
 * sets `workers` in its service.json, and ZAP then scans with that many threads per host. When the
 * entry names a `recovery` (the destructive lane's, such as a container restart), the lane runs it
 * after the scan, whatever the scan found, and waits until the API answers, so the next caller
 * does not meet what the scan wrote.
 *
 * Authentication (FUT-10). `--actor` picks whose credential the scan sends, as the specs pick it:
 * `default` is the pack entry's `auth`, `anonymous` sends none, any other name comes from the
 * entry's `actors` (scripts/lib/auth-tokens.mjs). With both `--target` and `--base`, qa-config is
 * not read, so the scan sends no credential and only `default` or `anonymous` is accepted. A
 * credential is obtained once before the scan, so missing variables, refused credentials and an
 * API key the API expects in the query stop the lane before ZAP starts. The lane then publishes
 * ZAP's API on a free loopback port, obtains the credential again the moment that API answers and
 * puts it on every request ZAP sends with a replacer rule, which it swaps whenever the token is
 * due for renewal (scripts/lib/zap-auth.mjs). A scan whose rule never went in, or whose renewal
 * failed, is not trusted: an operation the scan attacked may have changed or removed the scan
 * user's credentials, and dast-exclude.txt keeps it out of the next scan. The lane prints the
 * actor, the scheme, the header name and the number of renewals, never a value.
 *
 * Liveness. While ZAP runs, the lane requests the base URL from the host every 15 s; any HTTP
 * answer counts. After 4 checks in a row without one, the API stopped answering during the scan (a
 * payload hung or crashed it, and ZAP would wait for it forever): the lane stops the container and
 * fails with an availability finding, with or without a report.
 *
 *   node scripts/dast-lane.mjs --service pack [--actor name] [--target openapi-url]
 *                              [--base api-url] [--out name]
 *
 * Reports land in reports/dast/<out>.json and .html (default out: the pack name). Stale files of
 * the same name are removed first, so a scan that writes no report can never pass with an old one.
 *
 * Exit codes: 0 no alert of a FAIL rule (ZAP exit 0, or 2 for warnings only); 1 an alert of a FAIL
 * rule (ZAP exit 1), or the API stopped answering during the scan; 2 the lane could not run or the
 * scan did not complete or cannot be trusted (bad arguments, an unknown actor, a credential that
 * cannot be obtained, an environment without `allow_writes`, a spec URL that does not answer,
 * answers more than 16 MiB (MAX_SPEC_BYTES) or is not an OpenAPI document, Docker missing, any
 * other ZAP exit, no JSON report or one that is not a ZAP report, a credential that was never set
 * in ZAP or whose renewal failed, a recovery that failed).
 */

import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { ANONYMOUS_ACTOR, DEFAULT_ACTOR, actorAuthOf, laneCredential } from './lib/auth-tokens.mjs';
import {
  packEnvironment,
  readService,
  readTextIfExists,
  REPO_ROOT,
  servicePacks,
} from './lib/cli.mjs';
import {
  dockerRunner,
  dockerRunnerAsync,
  freeLoopbackPort,
  httpUrl,
  isLoopback,
  reachableBase,
  watchLiveness,
} from './lib/container.mjs';
import { loadLocalEnv } from './lib/env.mjs';
import { describeExit, exitCodeOf, spawnFailure } from './lib/spawn.mjs';
import { recoveryOf, recoveryStep } from './destructive-lane.mjs';
import { startZapAuth } from './lib/zap-auth.mjs';
import { InputError, dastCounts } from './quality-gate.mjs';

export const RISKS = ['informational', 'low', 'medium', 'high']; // index = ZAP riskcode
export const ZAP_SERVICE = 'zap';
export const REPORTS_DIR = join('reports', 'dast');
export const RULES_FILE = 'dast-rules.tsv';
export const EXCLUDE_FILE = 'dast-exclude.txt';
export const FALSE_POSITIVES_FILE = 'dast-false-positives.tsv';
/** Query (1), body (2) and URL path (16), as ZAP's scanner.injectable bit set. */
export const INJECTABLE = 19;
const ZAP = { name: 'ZAP', service: ZAP_SERVICE };
const CONTAINER_SERVICES = '/zap/services'; // ./services, mounted read-only
const CONTAINER_WRK = '/zap/wrk'; // reports/dast, mounted read-write
const OUT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FETCH_TIMEOUT_MS = 30_000;
/** The largest definition the lane saves for ZAP: far above a real contract, far below a full disk. */
export const MAX_SPEC_BYTES = 16 * 1024 * 1024;
/**
 * How often and how long the lane waits during a scan, in ms: ZAP's API (`pollMs` between checks,
 * `readyTimeoutMs` in all, `requestTimeoutMs` per call, renewals at least `minRenewMs` apart) and
 * the API under test (a check every `livenessMs`, each given `livenessTimeoutMs`,
 * `livenessMisses` in a row mean it stopped answering).
 */
export const TIMING = Object.freeze({
  pollMs: 2_000,
  readyTimeoutMs: 300_000,
  requestTimeoutMs: 10_000,
  minRenewMs: 1_000,
  livenessMs: 15_000,
  livenessTimeoutMs: 10_000,
  livenessMisses: 4,
});

// ---------------------------------------------------------------------------------------------
// Arguments and URLs

/**
 * `{ service, target, base, out, actor }` from the command line; `out` defaults to the pack name
 * and `actor` to `default`.
 */
export function parseLaneArgs(argv, root = REPO_ROOT) {
  const { values } = parseArgs({
    args: argv,
    options: {
      service: { type: 'string' },
      actor: { type: 'string' },
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
  return {
    service: values.service,
    target: values.target ?? null,
    base: values.base ?? null,
    out,
    actor: values.actor ?? DEFAULT_ACTOR,
  };
}

/**
 * The `auth` entry of the scan's actor: `{ actor, auth, note }`, `note` saying why no credential is
 * sent when qa-config is not read. With both `--target` and `--base` qa-config is not read (as for
 * the URLs), so only `default` and `anonymous` are accepted and both send nothing; otherwise the
 * actor comes from the pack's entry in the active environment, and an unknown name is an error
 * that lists the known ones. A pack without `auth` sends nothing as `default`.
 */
export function scanAuth(
  { service, target, base, actor = DEFAULT_ACTOR },
  root = REPO_ROOT,
  env = process.env,
) {
  if (target && base) {
    if (actor !== DEFAULT_ACTOR && actor !== ANONYMOUS_ACTOR) {
      throw new Error(
        `--actor "${actor}" comes from the pack's qa-config entry, which the lane does not read ` +
          'when both --target and --base are given; drop one of them, or use --actor anonymous',
      );
    }
    return {
      actor,
      auth: { type: 'none' },
      note: actor === DEFAULT_ACTOR ? 'qa-config is not read with both --target and --base' : null,
    };
  }
  const auth = actorAuthOf(packEnvironment(service, root, env), actor);
  return { actor, auth: auth ?? { type: 'none' }, note: null };
}

/**
 * Where the scan may write, and how the service is restored after it: `{ refusal, recovery }`.
 * An active scan sends POST, PUT and DELETE requests with attack payloads, so it runs only where
 * the pack's entry has `allow_writes: true`; `refusal` says why it must not run, else null. With
 * both `--target` and `--base` qa-config is not read, so the base must be a loopback address, a
 * service on this machine. `recovery` is the entry's `recovery` (scripts/destructive-lane.mjs),
 * which the lane runs after the scan so the next caller does not meet what the scan wrote; null
 * when the entry names none or qa-config is not read.
 */
export function scanWrites({ service, target, base }, urls, root = REPO_ROOT, env = process.env) {
  if (target && base) {
    return {
      refusal: isLoopback(urls.baseUrl)
        ? null
        : `with both --target and --base the lane does not read allow_writes from qa-config, so ` +
          `the base must be a loopback address; ${urls.baseUrl} is not`,
      recovery: null,
    };
  }
  const environment = packEnvironment(service, root, env);
  const at = `api.environments.${environment.name}.packs.${service}`;
  return {
    refusal: environment.config.allow_writes
      ? null
      : `pack "${service}" has allow_writes false in environment "${environment.name}" ` +
        `(${at} in ${environment.source}), and an active scan sends writes`,
    recovery: recoveryOf(environment),
  };
}

/**
 * ZAP's scan threads per host: the pack's `workers` (service.json), for a service that cannot take
 * concurrent callers, or null to keep ZAP's default.
 */
export function scanThreads(service, root = REPO_ROOT) {
  const { workers } = readService(service, root);
  return Number.isInteger(workers) && workers > 0 ? workers : null;
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

/**
 * The pack's known false positives: `[{ ruleId, url, reason }]` from
 * `services/<pack>/dast-false-positives.tsv`, one per line as `<rule id>\t<URL regex>\t<reason>`,
 * `#` comments and blanks skipped. The reason is required: it names the evidence (a contract note)
 * that the alert is false. Throws with every bad line.
 */
export function falsePositives(pack, root = REPO_ROOT) {
  const text = readTextIfExists(join(root, 'services', pack, FALSE_POSITIVES_FILE));
  if (text === null) return [];
  const entries = [];
  const problems = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const [ruleId, url, ...rest] = line.split('\t').map((part) => part.trim());
    const reason = rest.join(' ').trim();
    const where = `${FALSE_POSITIVES_FILE} line ${index + 1}`;
    if (!/^\d+$/.test(ruleId ?? '')) problems.push(`${where}: the rule id must be a ZAP plugin id`);
    else if (!url || /\s/.test(url))
      problems.push(`${where}: a URL regex without spaces is required`);
    else if (!reason) problems.push(`${where}: the reason (the evidence it is false) is required`);
    else {
      try {
        new RegExp(url);
        entries.push({ ruleId, url, reason });
      } catch (error) {
        problems.push(`${where}: "${url}" is not a regular expression (${error.message})`);
      }
    }
  });
  if (problems.length > 0) throw new Error(problems.join('; '));
  return entries;
}

/**
 * ZAP `-z` options: path injection, `threads` scan threads per host when the pack sets them, one
 * global URL exclusion per pattern, and one global alert filter per known false positive, which
 * marks its alerts False Positive (`newrisk=-1`) so the JSON report the quality gate counts leaves
 * them out.
 */
export function zapConfig(excludes = [], positives = [], threads = null) {
  return [
    `-config scanner.injectable=${INJECTABLE}`,
    ...(threads ? [`-config scanner.threadPerHost=${threads}`] : []),
    ...excludes.flatMap((regex, i) => [
      `-config globalexcludeurl.url_list.url(${i}).regex=${regex}`,
      `-config globalexcludeurl.url_list.url(${i}).enabled=true`,
    ]),
    ...positives.flatMap(({ ruleId, url }, i) => [
      `-config globalalertfilter.filters.filter(${i}).ruleid=${ruleId}`,
      `-config globalalertfilter.filters.filter(${i}).newrisk=-1`,
      `-config globalalertfilter.filters.filter(${i}).url=${url}`,
      `-config globalalertfilter.filters.filter(${i}).urlregex=true`,
      `-config globalalertfilter.filters.filter(${i}).enabled=true`,
    ]),
  ].join(' ');
}

/**
 * The rules file ZAP reads when the pack has known false positives: the pack's own rules plus one
 * `<rule>\tOUTOFSCOPE\t<URL regex>` line each. ZAP's scan script counts alerts before any alert
 * filter applies, so without these lines a false positive of a FAIL rule would still fail the scan.
 */
export function rulesWithFalsePositives(rulesText, positives) {
  const lines = positives.map(({ ruleId, url }) => `${ruleId}\tOUTOFSCOPE\t${url}`);
  return `${rulesText.replace(/\s*$/, '')}\n# known false positives (${FALSE_POSITIVES_FILE})\n${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------------------------
// The definition, fetched on the host

/**
 * The body of `response` as UTF-8 text, or null when it is larger than `limit` bytes: a declared
 * `Content-Length` over the limit is refused before reading, and a body without one stops being
 * read once it passes the limit.
 */
async function cappedText(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) return null;
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Fetch the OpenAPI document at `url`: `{ text, ext }` with `ext` `json` or `yaml`, as received.
 * Throws with a message for a URL that does not answer, a non-2xx answer, a body larger than
 * `maxBytes` and a body that is not a JSON or YAML OpenAPI (or Swagger) document.
 *
 * The lane saves this text for ZAP, which is why it fetches it (CodeQL js/http-to-file-access,
 * GATE-20): the file name is fixed by the lane (`--out` is a plain name, the extension comes from
 * the parse), the text must parse as an OpenAPI object, its size is capped, and only ZAP reads it,
 * as data.
 */
export async function fetchSpec(url, fetchImpl = fetch, { maxBytes = MAX_SPEC_BYTES } = {}) {
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
  const text = await cappedText(response, maxBytes);
  if (text === null) {
    throw new Error(
      `the spec URL ${url} answered more than ${maxBytes} bytes, the most the lane saves as a definition`,
    );
  }
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
 * The name of one scan's container, `qa-dast-<out>-<6 hex>`, which the lane stops when the API
 * stops answering. `random` replaces the random suffix in tests.
 */
export function containerName(out, random = () => randomBytes(3).toString('hex')) {
  return `qa-dast-${out}-${random()}`;
}

/**
 * `docker` arguments of one scan. File names are relative to /zap/wrk (reports/dast); the rules
 * file is read through the read-only services mount. `container` names the container; `apiPort`,
 * given when the scan carries a credential, publishes ZAP's API on that loopback port (`-P` makes
 * ZAP listen on it inside the container).
 */
export function zapArgs({
  definition,
  base,
  out,
  pack,
  rules,
  excludes = [],
  positives = [],
  rulesFile,
  container,
  apiPort,
  threads = null,
}) {
  return [
    'compose',
    'run',
    '--rm',
    ...(container ? ['--name', container] : []),
    ...(apiPort ? ['-p', `127.0.0.1:${apiPort}:${apiPort}`] : []),
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
    ...(apiPort ? ['-P', String(apiPort)] : []),
    '-z',
    zapConfig(excludes, positives, threads),
    ...(rules ? ['-c', rulesFile ?? `${CONTAINER_SERVICES}/${pack}/${RULES_FILE}`] : []),
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
// Authentication and liveness messages

/** Who the scan sends as: actor, scheme and header name; never a value. */
export function credentialLine({ actor, auth, note }, credential) {
  if (!credential) {
    return `actor "${actor}" sends no credential (${note ?? `auth ${auth.type}`})`;
  }
  const renewed = credential.renewAt === undefined ? '' : ', renewed before it expires';
  return (
    `actor "${actor}" sends its credential (${credential.type}) in the ${credential.header} header, ` +
    `set on every request ZAP sends through its replacer${renewed}`
  );
}

/**
 * Why a scan with a credential is not trusted, or null when the credential stayed on it: the rule
 * never went in, or a renewal failed (`state` of scripts/lib/zap-auth.mjs).
 */
export function untrustedReason(state, { actor, pack }) {
  const { failure } = state;
  if (failure?.stage === 'renewal') {
    return (
      `renewal ${state.renewals + 1} of the credential failed ${failure.at} s into the scan ` +
      `(${failure.reason}), so from then on ZAP sent a stale credential and the scan is not ` +
      `trusted. An operation the scan attacked may have changed or removed the credentials of ` +
      `actor "${actor}"; keep it out of the scan with services/${pack}/${EXCLUDE_FILE}`
    );
  }
  if (failure) {
    return (
      `the credential was never set in ZAP (${failure.at} s into the scan: ${failure.reason}), ` +
      'so the scan ran without it and is not trusted'
    );
  }
  if (state.setAt === null) {
    return "the scan ended before ZAP's API answered, so the credential was never set and the scan is not trusted";
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The lane

/**
 * Run one scan and return the lane's exit code; `log` prints. In tests, `run` replaces
 * `dockerRunner` (compose ps, docker stop), `runAsync` the scan's `dockerRunnerAsync` (an injected
 * `run` serves the scan too unless `runAsync` is given), `fetchImpl` replaces `fetch` (the
 * definition, ZAP's API, the liveness checks), `post` the credential requests, `freePort` the
 * loopback port, `recover` the recovery step and `timing` shortens `TIMING`, so tests never start
 * Docker or call a network.
 */
export async function dastLane(
  options,
  {
    root = REPO_ROOT,
    env = process.env,
    run = dockerRunner,
    runAsync = run === dockerRunner
      ? dockerRunnerAsync
      : (args, runOptions) => Promise.resolve(run(args, runOptions)),
    fetchImpl = fetch,
    post,
    now = Date.now,
    freePort = freeLoopbackPort,
    recover,
    timing = {},
    log = console.log,
  } = {},
) {
  const urls = resolveUrls(options, root, env);
  const who = scanAuth(options, root, env);
  const writes = scanWrites(options, urls, root, env);
  if (writes.refusal) {
    log(`dast-lane: ${writes.refusal}; the scan did not run`);
    return 2;
  }
  const threads = scanThreads(options.service, root);
  const times = { ...TIMING, ...timing };
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
  const rulesCopy = join(dir, `${options.out}-rules.tsv`);
  for (const file of [jsonFile, htmlFile, rulesCopy, ...specFiles]) rmSync(file, { force: true });

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
  // The login goes from the host, so the credential uses the host's view of the base URL.
  const obtain = () =>
    laneCredential(who.auth, { baseUrl: urls.baseUrl, env, now, ...(post ? { post } : {}) });
  let credential;
  try {
    credential = await obtain();
  } catch (error) {
    const why = error.message.replace(/\.$/, '');
    log(`dast-lane: actor "${who.actor}": ${why}; the scan did not run`);
    return 2;
  }

  const excludes = excludePatterns(options.service, root);
  let positives;
  try {
    positives = falsePositives(options.service, root);
  } catch (error) {
    log(`dast-lane: ${error.message}; the scan did not run`);
    return 2;
  }
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
  // Saving the fetched definition for ZAP is this lane's job; fetchSpec says what guards it.
  // codeql[js/http-to-file-access]
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
  let rulesFile;
  if (positives.length > 0) {
    for (const { ruleId, url, reason } of positives) {
      log(
        `dast-lane: known false positive (${FALSE_POSITIVES_FILE}): rule ${ruleId} on ${url}: ${reason}`,
      );
    }
    if (rules) {
      writeFileSync(rulesCopy, rulesWithFalsePositives(readFileSync(rules, 'utf8'), positives));
      rulesFile = `${CONTAINER_WRK}/${options.out}-rules.tsv`;
      log(`dast-lane: ZAP reads the rules with them out of scope from ${shown(rulesCopy)}`);
    }
  }
  log(`dast-lane: ${credentialLine(who, credential)}`);
  if (threads) {
    log(
      `dast-lane: ${threads} scan thread(s) per host (workers in services/${options.service}/service.json)`,
    );
  }
  const apiPort = credential ? await freePort() : null;
  const container = containerName(options.out);
  const args = zapArgs({
    definition: `${options.out}-openapi.${spec.ext}`,
    base: base.url,
    out: options.out,
    pack: options.service,
    rules,
    excludes,
    positives,
    rulesFile,
    container,
    apiPort,
    threads,
  });

  const scan = runAsync(args, { cwd: root });
  const seconds = (ms) => ms / 1000;
  const liveness = watchLiveness(urls.baseUrl, {
    fetchImpl,
    intervalMs: times.livenessMs,
    timeoutMs: times.livenessTimeoutMs,
    misses: times.livenessMisses,
    onDown: (state) => {
      log(
        `dast-lane: the API at ${urls.baseUrl} stopped answering during the scan: ${state.misses} ` +
          `checks ${seconds(times.livenessMs)} s apart got no answer (${state.reason}); ` +
          `stopping ZAP (docker stop ${container})`,
      );
      const stopped = run(['stop', container], { cwd: root, capture: true });
      if (spawnFailure(stopped) || exitCodeOf(stopped) !== 0) {
        log(
          `dast-lane: docker stop ${describeExit(stopped)}; stop the container by hand: docker stop ${container}`,
        );
      }
    },
  });
  const auth = credential
    ? startZapAuth({
        port: apiPort,
        obtain,
        log: (line) => log(`dast-lane: ${line}`),
        fetchImpl,
        now,
        readyTimeoutMs: times.readyTimeoutMs,
        pollMs: times.pollMs,
        requestTimeoutMs: times.requestTimeoutMs,
        minRenewMs: times.minRenewMs,
      })
    : null;
  const result = await scan;
  await Promise.all([liveness.stop(), auth?.stop()]);
  const code = judgeScan({ result, liveness, auth });
  if (!writes.recovery) return code;
  log(`dast-lane: restoring the service after the scan's writes: ${writes.recovery.command}`);
  const restored = await (recover ?? recoveryStep(writes.recovery, urls.baseUrl, root))();
  if (restored.ok) {
    log(`dast-lane: service restored (${restored.detail})`);
    return code;
  }
  log(
    `dast-lane: the recovery failed (${restored.outcome}: ${restored.detail}); the service may ` +
      `still hold what the scan wrote, so the lane ends with 2 whatever the scan found (it would have ended with ${code})`,
  );
  return 2;

  /** The lane's exit code for a scan that ran: availability, the credential, ZAP's exit, the report. */
  function judgeScan({ result, liveness, auth }) {
    if (liveness.state.down) {
      const report = existsSync(jsonFile) ? `${shown(jsonFile)} may be incomplete` : 'no report';
      log(
        `dast-lane: failed (availability: the API stopped answering during the scan, so a request ` +
          `ZAP sent may have hung or crashed it; see the API's logs. This is not an alert of a FAIL ` +
          `rule; ${report})`,
      );
      return 1;
    }
    const failure = spawnFailure(result);
    if (failure) {
      log(`dast-lane: docker ${failure}; the scan did not complete`);
      return 2;
    }
    if (auth) {
      const untrusted = untrustedReason(auth.state, { actor: who.actor, pack: options.service });
      log(`dast-lane: credential of actor "${who.actor}" renewed ${auth.state.renewals} time(s)`);
      if (untrusted) {
        log(`dast-lane: ${untrusted}`);
        return 2;
      }
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
}

const entryScript = process.argv[1];
if (entryScript && pathToFileURL(entryScript).href === import.meta.url) {
  Promise.resolve()
    .then(() => {
      const options = parseLaneArgs(process.argv.slice(2));
      loadLocalEnv(); // the actor's credentials, when the real environment does not set them
      return dastLane(options);
    })
    .then(
      (code) => process.exit(code),
      (error) => {
        console.error(`dast-lane: ${error.message}`);
        process.exit(2);
      },
    );
}
