// Where every designed case stands, checked against the specs and the latest run (GATE-04).
//
// A registry row is a claim ("TC-PET-03 is automated in specs/pet.spec.ts"); the spec corpus and the
// results are the evidence. Claims maintained by hand drift from the evidence without anybody
// noticing, so this script compares them row by row and computes the coverage numbers itself (L-08)
// instead of letting a document carry them.
//
// Lifecycle rules, per registry row (a registry is services/<pack>/registry/*.md, see
// scripts/lib/registry.mjs for its format):
//   any status    the registry's structure problems come first; a row that could not be read is
//                 skipped there and checked nowhere else
//   draft         no spec test may carry the case id yet; one that does means the row is stale
//   approved      same as draft (technique and priority are already enforced by the parser)
//   automated     the Spec column names a file inside the pack (relative to the pack directory, or
//                 to the repository when it starts with services/), the file declares exactly one
//                 test whose title starts with the case id, and that test is not disabled
//                 (test.skip / test.fixme on the declaration or an enclosing describe, or an
//                 unconditional test.skip() / test.fixme() in its body)
//   published     everything automated needs, and the case has a result in the latest run
//   blocked       the Defect column holds a tracker key (matching qa-config tracker.key_pattern when
//                 one is configured); a spec test for the case, if there is one, is either armed
//                 with knownGap('<key>') or skipped with the key in the skip call; and the latest
//                 run must not show it passing. "Blocked only when the case cannot run" is checked
//                 through that last point: a blocked case that passes has lost its reason. Whether a
//                 failing case should rather be `automated` with a knownGap arm is a review question
//                 the script cannot answer.
// And from the specs' side:
//   orphan-test          a test whose title carries a case id that no registry of its pack lists
//   untracked-known-gap  a knownGap('<key>') whose key is not the Defect of the test's own row, or
//                        (for a test without a row) of any blocked, automated or published row
// Coverage per registry: cases by status, the automated ratio, and the floor (derive-floor) summed
// over the registry's endpoints; fewer cases than the floor is a finding that quotes both numbers.
//
// The latest run is the last group of `*-result.json` files in the results directory (grouped as in
// declared-codes), and a case is found there by its identity `<service>-<version>-<TC id>` (the
// testCaseId set by helpers/case-meta.ts, L-22). Without results the run-based checks are skipped
// and the report says so (L-05).
//
// Usage:
//   node scripts/coverage-status.mjs [--service <pack>] [--results <dir>] [--root <dir>]
//     [--json]          machine-readable report
//     [--report-only]   print the findings but exit 0

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCli, readService, REPO_ROOT, servicePacks } from './lib/cli.mjs';
import { classifyCall, literalText, loadCorpus, parseSpecFile, ts } from './lib/corpus.mjs';
import { loadRegistries, STATUSES } from './lib/registry.mjs';
import { loadModel } from './lib/openapi.mjs';
import { operationFloor } from './derive-floor.mjs';
import { groupRuns } from './declared-codes.mjs';

/** Every rule a finding can carry, in report order. */
export const RULES = [
  'registry-structure',
  'unknown-endpoint',
  'below-floor',
  'stale-status',
  'spec-missing',
  'spec-not-found',
  'test-missing',
  'test-duplicate',
  'test-disabled',
  'not-in-results',
  'blocked-key',
  'blocked-not-armed',
  'blocked-but-passing',
  'orphan-test',
  'untracked-known-gap',
];

const RUNNING = ['automated', 'published'];
const toPosix = (path) => path.split('\\').join('/');

/** tracker.key_pattern of qa-config.json (else the example) as `{ source, regex }`, or null. */
export function trackerPattern(root) {
  for (const name of ['qa-config.json', 'qa-config.example.json']) {
    const file = join(root, name);
    if (!existsSync(file)) continue;
    const pattern = JSON.parse(readFileSync(file, 'utf8')).tracker?.key_pattern;
    return pattern ? { source: pattern, regex: new RegExp(`^(?:${pattern})$`) } : null;
  }
  return null;
}

/**
 * The latest run in a results directory: `{ dir, found, files, run, byIdentity }`, where
 * `byIdentity` maps a testCaseId to its last result `{ status, name, stop }` (retries collapse to
 * the attempt that finished last). `found` is false when the directory holds no result files.
 */
export function readLatestRun(dir) {
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith('-result.json'))
        .sort()
    : [];
  const results = files.map((name) => JSON.parse(readFileSync(join(dir, name), 'utf8')));
  const runs = groupRuns(results);
  const run = runs.at(-1) ?? [];
  const byIdentity = new Map();
  for (const result of run) {
    if (!result.testCaseId) continue;
    const previous = byIdentity.get(result.testCaseId);
    if (!previous || (result.stop ?? 0) >= previous.stop) {
      byIdentity.set(result.testCaseId, {
        status: result.status ?? 'unknown',
        name: result.name ?? '',
        stop: result.stop ?? 0,
      });
    }
  }
  return { dir, found: files.length > 0, files: files.length, run: run.length, byIdentity };
}

const argumentText = (call, sourceFile) =>
  call.arguments
    .filter((argument) => !ts.isFunctionLike(argument))
    .map((argument) => argument.getText(sourceFile))
    .join(' ');

/**
 * What a declared test does to its own execution: `{ keys, skips }`. `keys` are the literal keys
 * of knownGap() calls in its body; each skip is `{ how, text, unconditional }`, where `text` is the
 * source of the skip call's arguments (so a key in a reason, a template or an annotation is seen).
 */
export function inspectTest(test, sourceFile) {
  const keys = new Set();
  const skips = [];
  const call = test.node;
  if (test.modifier === 'skip' || test.modifier === 'fixme') {
    skips.push({
      how: `test.${test.modifier}`,
      text: argumentText(call, sourceFile),
      unconditional: true,
    });
  }
  for (let parent = call.parent; parent; parent = parent.parent) {
    if (!ts.isCallExpression(parent)) continue;
    const { kind, modifier } = classifyCall(parent);
    if (kind === 'describe' && (modifier === 'skip' || modifier === 'fixme')) {
      skips.push({
        how: `test.describe.${modifier}`,
        text: argumentText(parent, sourceFile),
        unconditional: true,
      });
    }
  }
  const body = call.arguments.find((argument) => ts.isFunctionLike(argument));
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'knownGap') {
        const key = literalText(node.arguments[0]);
        if (key) keys.add(key);
      }
      const { kind, modifier } = classifyCall(node);
      if (kind === 'other' && (modifier === 'skip' || modifier === 'fixme')) {
        const first = node.arguments[0];
        skips.push({
          how: `test.${modifier}() in the body`,
          text: argumentText(node, sourceFile),
          unconditional: !first || first.kind === ts.SyntaxKind.TrueKeyword,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  if (body) visit(body);
  return { keys: [...keys], skips };
}

/** Spec tests of one pack indexed by case id: `Map<caseId, [{ file, line, test, inspected }]>`. */
function indexCorpus(corpus) {
  const index = new Map();
  for (const spec of corpus) {
    for (const test of spec.tests) {
      if (!test.caseId) continue;
      const entry = {
        file: spec.file,
        line: test.line,
        test,
        ...inspectTest(test, spec.sourceFile),
      };
      if (!index.has(test.caseId)) index.set(test.caseId, []);
      index.get(test.caseId).push(entry);
    }
  }
  return index;
}

/** Root-relative path of a Spec cell, or null when it points outside the pack. */
function specPath(cell, pack) {
  const packDir = `services/${pack}`;
  const path = toPosix(cell).startsWith('services/')
    ? toPosix(cell)
    : toPosix(join(packDir, cell)).replace(/^\.\//, '');
  return path.startsWith(`${packDir}/`) && !path.split('/').includes('..') ? path : null;
}

const percent = (part, whole) => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);

/** Floors of a registry's endpoints: `{ total, endpoints: [{ key, floor }], unknown: [key] }`. */
function registryFloor(model, endpoints) {
  const operations = new Map(model.operations.map((operation) => [operation.key, operation]));
  const result = { total: 0, endpoints: [], unknown: [] };
  for (const raw of endpoints ?? []) {
    const [method = '', ...rest] = String(raw).trim().split(/\s+/);
    const key = `${method.toUpperCase()} ${rest.join(' ')}`;
    const operation = operations.get(key);
    if (!operation) {
      result.unknown.push(key);
      continue;
    }
    const { floor } = operationFloor(model, operation);
    result.endpoints.push({ key, floor });
    result.total += floor;
  }
  return result;
}

/**
 * Check every registry of every pack (or of `pack`) against the specs and the latest run.
 * Returns `{ packs, findings, notes, results, tracker }`.
 */
export async function coverageStatus(root, { pack = null, resultsDir = null } = {}) {
  const packs = pack ? [pack] : servicePacks(root);
  const tracker = trackerPattern(root);
  const results = readLatestRun(resultsDir ?? join(root, 'allure-results'));
  const resultsLabel = toPosix(relative(root, results.dir)) || '.';
  const findings = [];
  const notes = [];
  const report = [];
  const add = (rule, packName, file, line, caseId, message) =>
    findings.push({ rule, pack: packName, file, line, case: caseId, message });

  for (const name of packs) {
    const service = readService(name, root);
    const registries = loadRegistries(root, name);
    const corpus = loadCorpus(root, name);
    const index = indexCorpus(corpus);
    const identity = (caseId) => `${service.name}-${service.version}-${caseId}`;
    const rows = new Map(
      registries.flatMap((registry) => registry.cases.map((row) => [row.id, row])),
    );
    const packReport = { pack: name, registries: [] };
    report.push(packReport);

    let model = null;
    if (registries.length > 0) {
      model = await loadModel(join(service.dir, service.spec ?? 'openapi.json'));
    }

    for (const registry of registries) {
      for (const problem of registry.problems) {
        add('registry-structure', name, problem.file, problem.line, null, problem.message);
      }
      const floor = registryFloor(model, registry.meta.endpoints);
      for (const key of floor.unknown) {
        add(
          'unknown-endpoint',
          name,
          registry.file,
          1,
          null,
          `endpoint "${key}" is not an operation of ${service.spec ?? 'openapi.json'}; it adds nothing to the floor`,
        );
      }
      const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
      for (const row of registry.cases) {
        if (row.status in byStatus) byStatus[row.status] += 1;
      }
      const automated = byStatus.automated + byStatus.published;
      const cases = registry.cases.length;
      packReport.registries.push({
        file: registry.file,
        feature: registry.meta.feature ?? null,
        title: registry.meta.title ?? null,
        cases,
        byStatus,
        automated,
        automatedPercent: percent(automated, cases),
        floor: floor.total,
        floorByEndpoint: floor.endpoints,
        gap: Math.max(0, floor.total - cases),
      });
      if (cases < floor.total) {
        add(
          'below-floor',
          name,
          registry.file,
          1,
          null,
          `${cases} case(s) designed, the floor of its ${floor.endpoints.length} endpoint(s) is ${floor.total} (gap ${floor.total - cases})`,
        );
      }

      for (const row of registry.cases) {
        const at = (rule, message) => add(rule, name, registry.file, row.line, row.id, message);
        const tests = index.get(row.id) ?? [];
        const where = (list) => list.map((entry) => `${entry.file}:${entry.line}`).join(', ');
        const latest = results.byIdentity.get(identity(row.id));

        if (row.status === 'draft' || row.status === 'approved') {
          if (tests.length > 0) {
            at(
              'stale-status',
              `${row.id} is ${row.status} but ${where(tests)} already declares it; the row should read automated`,
            );
          }
        } else if (RUNNING.includes(row.status)) {
          if (!row.spec) {
            at('spec-missing', `${row.id} is ${row.status} but its Spec column is empty`);
          } else {
            const path = specPath(row.spec, name);
            if (!path || !existsSync(join(root, path))) {
              at(
                'spec-not-found',
                `${row.id}: Spec "${row.spec}" is not a file of pack ${name} (paths are relative to services/${name}/)`,
              );
            } else {
              const parsed = corpus.find((spec) => spec.file === path) ?? parseSpecFile(root, path);
              const own = parsed.tests
                .filter((test) => test.caseId === row.id)
                .map((test) => ({
                  file: path,
                  line: test.line,
                  ...inspectTest(test, parsed.sourceFile),
                }));
              if (own.length === 0) {
                const elsewhere = tests.length > 0 ? ` (it is declared in ${where(tests)})` : '';
                at(
                  'test-missing',
                  `${row.id}: ${path} declares no test titled "${row.id} ..."${elsewhere}`,
                );
              } else if (own.length > 1) {
                at(
                  'test-duplicate',
                  `${row.id}: ${path} declares it ${own.length} times (${where(own)})`,
                );
              }
              for (const entry of own) {
                const disabled = entry.skips.filter((skip) => skip.unconditional);
                if (disabled.length > 0) {
                  at(
                    'test-disabled',
                    `${row.id} is ${row.status} but ${entry.file}:${entry.line} is disabled by ${disabled.map((skip) => skip.how).join(', ')}`,
                  );
                }
              }
            }
          }
          if (row.status === 'published' && results.found && !latest) {
            at(
              'not-in-results',
              `${row.id} is published but the latest run in ${resultsLabel} has no result for ${identity(row.id)}`,
            );
          }
        } else if (row.status === 'blocked') {
          const keyOk = row.defect && (!tracker || tracker.regex.test(row.defect));
          if (!keyOk) {
            at(
              'blocked-key',
              row.defect
                ? `${row.id} is blocked but Defect "${row.defect}" does not match tracker.key_pattern`
                : `${row.id} is blocked without a Defect key`,
            );
          }
          if (row.defect) {
            for (const entry of tests) {
              const armed =
                entry.keys.includes(row.defect) ||
                entry.skips.some((skip) => skip.text.includes(row.defect));
              if (!armed) {
                at(
                  'blocked-not-armed',
                  `${row.id} is blocked by ${row.defect} but ${entry.file}:${entry.line} neither calls knownGap('${row.defect}') nor skips with the key in the reason`,
                );
              }
            }
          }
          if (latest?.status === 'passed') {
            at(
              'blocked-but-passing',
              `${row.id} is blocked but passed in the latest run; check whether ${row.defect || 'the defect'} is fixed before changing the status (L-14)`,
            );
          }
        }
      }
    }

    for (const spec of corpus) {
      for (const test of spec.tests) {
        const { keys } = inspectTest(test, spec.sourceFile);
        const row = test.caseId ? rows.get(test.caseId) : null;
        if (test.caseId && !row) {
          add(
            'orphan-test',
            name,
            spec.file,
            test.line,
            test.caseId,
            `${test.caseId} is declared here but no registry of pack ${name} lists it`,
          );
        }
        for (const key of keys) {
          const tracked = row
            ? row.defect === key
            : registries.some((registry) =>
                registry.cases.some(
                  (other) => other.defect === key && ['blocked', ...RUNNING].includes(other.status),
                ),
              );
          if (!tracked) {
            add(
              'untracked-known-gap',
              name,
              spec.file,
              test.line,
              test.caseId,
              row
                ? `knownGap('${key}') but the Defect of ${row.id} in its registry is "${row.defect}"`
                : `knownGap('${key}') matches no Defect of a blocked, automated or published row`,
            );
          }
        }
      }
    }
  }

  const registryCount = report.reduce((sum, entry) => sum + entry.registries.length, 0);
  if (registryCount === 0) {
    notes.push(
      `No registries under services/${pack ?? '*'}/registry/ yet: nothing to check against the specs.`,
    );
  } else if (!results.found) {
    notes.push(
      `No result files in ${resultsLabel}: "published in the latest run" and "blocked but passing" were not checked. Run the suite, or point --results at a results directory.`,
    );
  }
  const order = (finding) => RULES.indexOf(finding.rule);
  findings.sort(
    (a, b) =>
      (a.rule === 'registry-structure' ? 0 : 1) - (b.rule === 'registry-structure' ? 0 : 1) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      order(a) - order(b),
  );
  return {
    packs: report,
    findings,
    notes,
    results: { dir: resultsLabel, found: results.found, files: results.files, run: results.run },
    tracker: tracker ? tracker.source : null,
  };
}

export function renderReport(status) {
  const lines = [];
  for (const pack of status.packs) {
    lines.push(
      `Pack ${pack.pack}: ${pack.registries.length} registr${pack.registries.length === 1 ? 'y' : 'ies'}`,
    );
    for (const registry of pack.registries) {
      const counts = Object.entries(registry.byStatus)
        .map(([status, count]) => `${status} ${count}`)
        .join(', ');
      lines.push(
        `  ${registry.file} (${registry.feature ?? '?'}): ${registry.cases} cases [${counts}]`,
        `    automated ${registry.automated}/${registry.cases} (${registry.automatedPercent}%), floor ${registry.floor}, gap ${registry.gap}`,
      );
    }
  }
  const run = status.results.found
    ? `${status.results.dir}: ${status.results.files} result files, latest run ${status.results.run}`
    : `${status.results.dir}: no result files`;
  lines.push('', `Results: ${run}`, `Tracker key pattern: ${status.tracker ?? '(none; any key)'}`);
  for (const note of status.notes) lines.push(`Note: ${note}`);
  lines.push('');
  if (status.findings.length === 0) lines.push('No findings.');
  else {
    lines.push(`${status.findings.length} finding(s):`);
    for (const finding of status.findings) {
      lines.push(`  ${finding.file}:${finding.line}  [${finding.rule}]  ${finding.message}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  const values = parseCli({
    root: { type: 'string' },
    results: { type: 'string' },
    json: { type: 'boolean', default: false },
    'report-only': { type: 'boolean', default: false },
  });
  if (values['spec'] || values['live']) {
    throw new Error(
      'coverage-status reads the packs themselves; use --service, not --spec/--live.',
    );
  }
  const root = values['root'] ? resolve(values['root']) : REPO_ROOT;
  const resultsDir = values['results'] ? resolve(values['results']) : null;
  const status = await coverageStatus(root, { pack: values['service'] ?? null, resultsDir });
  console.log(values['json'] ? JSON.stringify(status, null, 2) : renderReport(status));
  if (status.findings.length > 0 && !values['report-only']) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 2;
  });
}
