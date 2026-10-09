// Declared response codes against the codes a test run actually received (CON-07). A contract is
// checked in both directions (L-33):
//   unreached   declared for an operation but never received: a coverage gap, informative only
//   undeclared  received but not declared: the API answers something its contract does not
//               promise (a 404 the description omits, a 500 on a wrongly typed parameter), which
//               is a contract finding
//
// Observed codes come from the evidence every API call attaches to its test (helpers/evidence.ts):
// JSON attachments shaped `{ request: { method, url }, response: { status } }`. In an Allure
// results directory the attachments are reached through the `*-result.json` files, and only the
// latest run is read: results are grouped into runs wherever no test was running for more than
// RUN_GAP_MINUTES, and the last group wins (`--all` reads every result). A directory without
// result files is read as loose attachments.
//
// Matching a recorded URL to an operation: the path part of every declared server is stripped
// (longest first), then each path template is compared segment by segment, a `{name}` matching any
// value. When several templates match, the most specific wins: at the first segment where they
// differ, a literal beats a mixed segment (`{id}.json`), which beats a bare parameter; so
// `/pet/findByStatus` is chosen over `/pet/{petId}`.
//
// Declared codes: an explicit code (`404`) covers itself; a range (`4XX`) covers the codes of its
// class that are not declared explicitly. `default` promises no particular code: a code that only
// `default` covers is reported as undeclared and marked `default`, unless `--default-declares`
// is given. `default` itself is never listed as unreached.
//
// Usage:
//   node scripts/declared-codes.mjs [--service <pack> | --spec <file|url> | --live]
//     [--results <dir>]      evidence directory (default allure-results)
//     [--all]                every run in the directory, not only the latest
//     [--default-declares]   a code covered by `default` counts as declared
//     [--json]               machine-readable report
//     [--strict]             exit 1 when an undeclared answer was received

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel } from './lib/openapi.mjs';
import { parseCli, REPO_ROOT, resolveSpecSource } from './lib/cli.mjs';
import { groupRuns, RUN_GAP_MINUTES } from './lib/results.mjs';

export { groupRuns, RUN_GAP_MINUTES };

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// ---------------------------------------------------------------------------------------------
// Templates and URLs

/** The path part of each server URL, longest first, without a trailing slash. */
export function basePaths(servers) {
  const paths = servers.map((server) => {
    let path = server;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(server)) {
      try {
        path = new URL(server).pathname;
      } catch {
        path = '';
      }
    }
    return path.replace(/\/+$/, '');
  });
  return [...new Set(paths.filter(Boolean))].sort((a, b) => b.length - a.length);
}

/** The request path with the first matching base path removed. */
export function stripBase(pathname, bases) {
  for (const base of bases) {
    if (pathname === base) return '/';
    if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length);
  }
  return pathname;
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compileSegment(segment) {
  if (!segment.includes('{')) return { rank: 2, literal: segment };
  if (/^\{[^}]+\}$/.test(segment)) return { rank: 0, regex: /^.+$/s };
  const source = segment
    .split(/(\{[^}]+\})/)
    .map((part) => (part.startsWith('{') ? '.+?' : escapeRegExp(part)))
    .join('');
  return { rank: 1, regex: new RegExp(`^${source}$`, 's') };
}

const splitPath = (path) => path.split('/').filter((segment) => segment !== '');

export function compileTemplates(operations) {
  return operations.map((operation) => ({
    operation,
    method: operation.method.toUpperCase(),
    segments: splitPath(operation.path).map(compileSegment),
  }));
}

function decode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function segmentsMatch(template, segments) {
  return (
    template.segments.length === segments.length &&
    template.segments.every((part, i) =>
      part.rank === 2 ? part.literal === segments[i] : part.regex.test(segments[i]),
    )
  );
}

function moreSpecific(a, b) {
  for (let i = 0; i < a.segments.length; i += 1) {
    const difference = a.segments[i].rank - b.segments[i].rank;
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * The operation a request belongs to, or `{ operation: null, reason }` with reason `path` (no
 * template matches) or `method` (the path exists, the method does not).
 */
export function matchOperation(templates, method, pathname, bases = []) {
  const segments = splitPath(stripBase(pathname, bases)).map(decode);
  const byPath = templates.filter((template) => segmentsMatch(template, segments));
  const candidates = byPath.filter((template) => template.method === method.toUpperCase());
  if (candidates.length === 0) {
    return { operation: null, reason: byPath.length ? 'method' : 'path' };
  }
  candidates.sort((a, b) => moreSpecific(b, a));
  return { operation: candidates[0].operation, reason: null };
}

// ---------------------------------------------------------------------------------------------
// Declared codes

/**
 * How the declared responses treat one received code: `explicit`, `range`, `default`, or null
 * when nothing covers it.
 */
export function coverage(declared, code) {
  const status = String(code);
  if (declared.includes(status)) return 'explicit';
  const range = `${status[0]}XX`;
  if (declared.some((d) => d.toUpperCase() === range)) return 'range';
  if (declared.includes('default')) return 'default';
  return null;
}

/** Declared codes that no received code reached (`default` is never listed). */
export function unreachedCodes(declared, observedCodes) {
  const observed = observedCodes.map(String);
  return declared.filter((status) => {
    if (status === 'default') return false;
    if (/^\dXX$/i.test(status)) {
      return !observed.some((code) => code[0] === status[0] && !declared.includes(code));
    }
    return !observed.includes(status);
  });
}

// ---------------------------------------------------------------------------------------------
// Evidence

/** True for an evidence record of one API call. */
export function isExchange(record) {
  return (
    isObject(record) &&
    isObject(record.request) &&
    typeof record.request.method === 'string' &&
    typeof record.request.url === 'string' &&
    isObject(record.response) &&
    Number.isInteger(record.response.status)
  );
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function attachmentSources(node, found = []) {
  for (const attachment of node.attachments ?? []) {
    if (typeof attachment.source === 'string' && /json/i.test(attachment.type ?? 'json')) {
      found.push(attachment.source);
    }
  }
  for (const step of node.steps ?? []) attachmentSources(step, found);
  return found;
}

/**
 * The API calls recorded in a results directory: `{ exchanges, tests, runs }`, each exchange with
 * the name of the test that made it (null for loose attachments).
 */
export function readExchanges(dir, { all = false } = {}) {
  if (!existsSync(dir)) throw new Error(`No results directory ${dir}.`);
  const files = readdirSync(dir).sort();
  const resultFiles = files.filter((name) => name.endsWith('-result.json'));

  if (resultFiles.length === 0) {
    const exchanges = files
      .filter((name) => name.endsWith('.json'))
      .map((name) => readJson(join(dir, name)))
      .filter(isExchange)
      .map((record) => ({ record, test: null }));
    return { exchanges, tests: 0, runs: 0 };
  }

  const results = resultFiles.map((name) => readJson(join(dir, name))).filter(isObject);
  const runs = groupRuns(results);
  const chosen = all ? results : (runs.at(-1) ?? []);
  const exchanges = [];
  for (const result of chosen) {
    for (const source of attachmentSources(result)) {
      const record = readJson(join(dir, source));
      if (isExchange(record)) {
        exchanges.push({ record, test: result.fullName ?? result.name ?? null });
      }
    }
  }
  return { exchanges, tests: chosen.length, runs: runs.length };
}

// ---------------------------------------------------------------------------------------------
// The comparison

const SAMPLE_LIMIT = 3;

/**
 * Compare declared and received codes. Returns one entry per operation (model order) with
 * `declared`, `observed` (code -> count), `unreached` and `undeclared`, plus requests that match
 * no operation and a summary.
 */
export function compareCodes(model, exchanges, { defaultDeclares = false } = {}) {
  const templates = compileTemplates(model.operations);
  const bases = basePaths(model.servers);
  const byKey = new Map(
    model.operations.map((operation) => [
      operation.key,
      { operation, observed: new Map(), samples: new Map() },
    ]),
  );
  const unmatched = new Map();

  for (const { record, test } of exchanges) {
    const method = record.request.method.toUpperCase();
    let pathname;
    try {
      pathname = new URL(record.request.url, 'http://recorded.invalid').pathname;
    } catch {
      pathname = record.request.url;
    }
    const status = record.response.status;
    const match = matchOperation(templates, method, pathname, bases);
    if (!match.operation) {
      const id = `${method} ${pathname} ${status}`;
      const entry = unmatched.get(id) ?? { method, path: pathname, status, reason: match.reason };
      entry.count = (entry.count ?? 0) + 1;
      unmatched.set(id, entry);
      continue;
    }
    const slot = byKey.get(match.operation.key);
    slot.observed.set(status, (slot.observed.get(status) ?? 0) + 1);
    const samples = slot.samples.get(status) ?? [];
    if (samples.length < SAMPLE_LIMIT) samples.push({ url: record.request.url, test });
    slot.samples.set(status, samples);
  }

  const operations = [...byKey.values()].map(({ operation, observed, samples }) => {
    const declared = operation.responses.map((response) => response.status);
    const codes = [...observed.keys()].sort((a, b) => a - b);
    const undeclared = codes
      .map((code) => ({ code, covered: coverage(declared, code) }))
      .filter(({ covered }) => !covered || (covered === 'default' && !defaultDeclares))
      .map(({ code, covered }) => ({
        status: code,
        count: observed.get(code),
        default: covered === 'default',
        samples: samples.get(code),
      }));
    return {
      key: operation.key,
      declared,
      observed: Object.fromEntries(codes.map((code) => [String(code), observed.get(code)])),
      unreached: unreachedCodes(declared, codes),
      undeclared,
    };
  });

  const reached = operations.filter((op) => Object.keys(op.observed).length > 0);
  return {
    operations,
    unmatched: [...unmatched.values()].sort((a, b) =>
      `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`),
    ),
    summary: {
      exchanges: exchanges.length,
      operations: operations.length,
      exercised: reached.length,
      unreached: operations.reduce((sum, op) => sum + op.unreached.length, 0),
      undeclared: operations.reduce((sum, op) => sum + op.undeclared.length, 0),
      unmatched: unmatched.size,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Output

export function renderReport(report) {
  const rows = report.operations.map((op) => [
    op.key,
    op.declared.join(' '),
    Object.entries(op.observed)
      .map(([code, count]) => (count > 1 ? `${code}x${count}` : code))
      .join(' ') || '-',
    op.unreached.join(' ') || '-',
    op.undeclared.map((u) => (u.default ? `${u.status}(default)` : String(u.status))).join(' ') ||
      '-',
  ]);
  const header = ['operation', 'declared', 'observed', 'unreached', 'undeclared'];
  const widths = header.map((title, i) => Math.max(title.length, ...rows.map((r) => r[i].length)));
  const line = (cells) =>
    cells
      .map((cell, i) => cell.padEnd(widths[i]))
      .join('  ')
      .trimEnd();
  const out = [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)];

  const findings = report.operations.flatMap((op) =>
    op.undeclared.map((u) => {
      const where = u.samples.map((s) => (s.test ? `${s.url} (${s.test})` : s.url));
      const note = u.default ? ' - only `default` covers it' : '';
      return `  ${op.key} -> ${u.status} x${u.count}${note}\n${where.map((w) => `      ${w}`).join('\n')}`;
    }),
  );
  if (findings.length) out.push('', 'Undeclared answers (contract findings):', ...findings);
  if (report.unmatched.length) {
    out.push('', 'Requests matching no operation:');
    for (const u of report.unmatched) {
      const why = u.reason === 'method' ? 'method not declared' : 'path not declared';
      out.push(`  ${u.method} ${u.path} -> ${u.status} x${u.count} (${why})`);
    }
  }
  const s = report.summary;
  out.push(
    '',
    `${s.exchanges} recorded calls; ${s.exercised}/${s.operations} operations exercised; ` +
      `${s.unreached} declared codes unreached; ${s.undeclared} undeclared answers; ` +
      `${s.unmatched} unmatched requests.`,
  );
  return out.join('\n');
}

async function main() {
  const values = parseCli({
    results: { type: 'string', default: join(REPO_ROOT, 'allure-results') },
    all: { type: 'boolean', default: false },
    'default-declares': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    strict: { type: 'boolean', default: false },
  });
  const { source } = resolveSpecSource(values);
  const model = await loadModel(source);
  const dir = resolve(values.results);
  const evidence = readExchanges(dir, { all: values.all });
  const report = compareCodes(model, evidence.exchanges, {
    defaultDeclares: values['default-declares'],
  });
  const label = (path) =>
    /^https?:\/\//i.test(path) ? path : relative(REPO_ROOT, resolve(path)).split('\\').join('/');
  const scope = values.all ? 'all runs' : 'latest run';

  if (values.json) {
    const meta = { source: label(source), results: label(dir), scope, tests: evidence.tests };
    console.log(JSON.stringify({ ...meta, ...report }, null, 2));
  } else {
    console.log(`${label(source)} vs ${label(dir)} (${scope}, ${evidence.tests} tests)\n`);
    console.log(renderReport(report));
  }
  if (values.strict && report.summary.undeclared > 0) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
