// Requirements traceability matrix, generated (GATE-05). For every pack it joins three sources that
// are otherwise read separately:
//   registries   requirement -> case -> technique, status and defect (services/<pack>/registry/*.md)
//   specs        where each case is implemented (file:line, read through the TypeScript AST)
//   results      what the latest run said about it (passed, failed, skipped, or not run)
// and lists apart the two gaps a matrix exists to show: requirements no case covers, and cases that
// trace to no requirement. The matrix is computed, never edited (L-08): `--write` regenerates
// docs/traceability/<pack>.md with a header saying so, and coverage-status checks the claims the
// matrix only repeats.
//
// "Last result" comes from the latest run in the results directory, found by the case identity
// `<service>-<version>-<TC id>` (see coverage-status for how the run is chosen). A broken result
// reads as failed; a case with no result in that run reads "not run".
//
// Usage:
//   node scripts/traceability.mjs [--service <pack>] [--results <dir>] [--root <dir>]
//     [--write]   write docs/traceability/<pack>.md instead of printing Markdown
//     [--json]    print the matrix as JSON

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCli, readService, REPO_ROOT, servicePacks } from './lib/cli.mjs';
import { loadCorpus } from './lib/corpus.mjs';
import { loadRegistries } from './lib/registry.mjs';
import { readLatestRun } from './coverage-status.mjs';

const toPosix = (path) => path.split('\\').join('/');

const RESULT_WORDS = { passed: 'passed', failed: 'failed', broken: 'failed', skipped: 'skipped' };

/** Allure status -> matrix wording. */
export function resultWord(status) {
  return status ? (RESULT_WORDS[status] ?? 'not run') : 'not run';
}

/**
 * The matrix of every pack (or of `pack`): `{ results, packs: [{ pack, title, registries }] }`.
 * Each registry holds `requirements` (with the ids of the cases tracing to each), `rows` (one per
 * case that names a requirement, in requirement order), `uncovered` and `unlinked`.
 */
export function buildMatrix(root, { pack = null, resultsDir = null } = {}) {
  const results = readLatestRun(resultsDir ?? join(root, 'allure-results'));
  const packs = [];
  for (const name of pack ? [pack] : servicePacks(root)) {
    const service = readService(name, root);
    const locations = new Map();
    for (const spec of loadCorpus(root, name)) {
      for (const test of spec.tests) {
        if (!test.caseId) continue;
        if (!locations.has(test.caseId)) locations.set(test.caseId, []);
        locations.get(test.caseId).push(`${spec.file}:${test.line}`);
      }
    }
    const registries = loadRegistries(root, name).map((registry) => {
      const entry = (row) => ({
        requirement: row.requirement || null,
        case: row.id,
        title: row.title,
        technique: row.technique,
        priority: row.priority,
        specs: locations.get(row.id) ?? [],
        status: row.status,
        lastResult: resultWord(
          results.byIdentity.get(`${service.name}-${service.version}-${row.id}`)?.status,
        ),
        defect: row.defect || null,
      });
      const requirements = registry.requirements
        .filter((requirement) => requirement?.id)
        .map((requirement) => ({
          id: requirement.id,
          text: requirement.text ?? '',
          cases: registry.cases
            .filter((row) => row.requirement === requirement.id)
            .map((row) => row.id),
        }));
      const rows = requirements.flatMap((requirement) =>
        registry.cases.filter((row) => row.requirement === requirement.id).map(entry),
      );
      return {
        file: registry.file,
        feature: registry.meta.feature ?? null,
        title: registry.meta.title ?? registry.file,
        requirements,
        rows,
        uncovered: requirements.filter((requirement) => requirement.cases.length === 0),
        unlinked: registry.cases.filter((row) => !row.requirement).map(entry),
        problems: registry.problems.length,
      };
    });
    packs.push({ pack: name, title: service.title ?? name, registries });
  }
  return {
    results: {
      dir: toPosix(relative(root, results.dir)) || '.',
      found: results.found,
      files: results.files,
      run: results.run,
    },
    packs,
  };
}

// Backslashes first, so an escaped pipe inside a value cannot turn into a column break.
const cell = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|');
const specCell = (specs) =>
  specs.length > 0 ? specs.map((spec) => `\`${spec}\``).join('<br>') : '-';
const table = (header, rows) => [
  `| ${header.join(' | ')} |`,
  `|${header.map(() => '---').join('|')}|`,
  ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
];

/** One pack's matrix as a Markdown document. */
export function renderPack(matrix, packEntry) {
  const { results } = matrix;
  const lines = [
    '<!-- Generated by scripts/traceability.mjs from the registries, the specs and the latest results. -->',
    '<!-- Do not edit by hand: run `node scripts/traceability.mjs --write` to regenerate it. -->',
    '',
    `# Traceability matrix: ${packEntry.title}`,
    '',
    results.found
      ? `Last results: the latest run in \`${results.dir}\` (${results.run} of ${results.files} result files).`
      : `Last results: no result files in \`${results.dir}\`, so every case reads "not run".`,
  ];
  if (packEntry.registries.length === 0) {
    lines.push('', `No registries under \`services/${packEntry.pack}/registry/\` yet.`);
  }
  for (const registry of packEntry.registries) {
    lines.push(
      '',
      `## ${registry.title} (\`${registry.feature ?? '?'}\`)`,
      '',
      `Registry: \`${registry.file}\``,
    );
    if (registry.problems > 0) {
      lines.push(
        '',
        `The registry has ${registry.problems} structure problem(s); rows that could not be read are missing here. Run coverage-status.`,
      );
    }
    lines.push('', '### Requirements', '');
    if (registry.requirements.length === 0) lines.push('None declared.');
    for (const requirement of registry.requirements) {
      const cases = requirement.cases.length > 0 ? requirement.cases.join(', ') : 'no case';
      lines.push(`- **${requirement.id}** ${requirement.text} (${cases})`);
    }
    lines.push('', '### Matrix', '');
    if (registry.rows.length === 0) lines.push('No case traces to a requirement.');
    else {
      lines.push(
        ...table(
          ['Requirement', 'Case', 'Technique', 'Spec', 'Status', 'Last result', 'Defect'],
          registry.rows.map((row) => [
            row.requirement,
            `${row.case} ${row.title}`,
            row.technique,
            specCell(row.specs),
            row.status,
            row.lastResult,
            row.defect ?? '-',
          ]),
        ),
      );
    }
    lines.push('', '### Requirements without cases', '');
    if (registry.uncovered.length === 0) lines.push('None.');
    for (const requirement of registry.uncovered)
      lines.push(`- **${requirement.id}** ${requirement.text}`);
    lines.push('', '### Cases without a requirement', '');
    if (registry.unlinked.length === 0) lines.push('None.');
    else {
      lines.push(
        ...table(
          ['Case', 'Technique', 'Spec', 'Status', 'Last result', 'Defect'],
          registry.unlinked.map((row) => [
            `${row.case} ${row.title}`,
            row.technique,
            specCell(row.specs),
            row.status,
            row.lastResult,
            row.defect ?? '-',
          ]),
        ),
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const values = parseCli({
    root: { type: 'string' },
    results: { type: 'string' },
    write: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  });
  if (values['spec'] || values['live']) {
    throw new Error('traceability reads the packs themselves; use --service, not --spec/--live.');
  }
  const root = values['root'] ? resolve(values['root']) : REPO_ROOT;
  const matrix = buildMatrix(root, {
    pack: values['service'] ?? null,
    resultsDir: values['results'] ? resolve(values['results']) : null,
  });
  if (values['json']) {
    console.log(JSON.stringify(matrix, null, 2));
    return;
  }
  const withRegistries = matrix.packs.filter((entry) => entry.registries.length > 0);
  if (withRegistries.length === 0) {
    console.log('No registries under services/*/registry/ yet: there is no matrix to generate.');
    return;
  }
  if (!values['write']) {
    process.stdout.write(withRegistries.map((entry) => renderPack(matrix, entry)).join('\n'));
    return;
  }
  const dir = join(root, 'docs', 'traceability');
  mkdirSync(dir, { recursive: true });
  for (const entry of matrix.packs) {
    if (entry.registries.length === 0) {
      console.log(`${entry.pack}: no registries, nothing written`);
      continue;
    }
    const file = join(dir, `${entry.pack}.md`);
    writeFileSync(file, renderPack(matrix, entry));
    console.log(`${entry.pack}: wrote ${toPosix(relative(root, file))}`);
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
