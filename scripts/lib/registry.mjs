// Test-case registries: one Markdown file per feature under services/<pack>/registry/. People review
// them as documents; tools read them as data, so the structure is strict:
//
//   ---                                  YAML front matter
//   feature: PET                         case ids are TC-<feature>-NN
//   title: Pets
//   endpoints:                           block list: braces in paths break YAML flow lists
//     - POST /pet
//     - GET /pet/{petId}
//   requirements:                        optional; what the cases trace back to
//     - { id: REQ-PET-01, text: A pet can be created with only the required fields }
//   ---
//   ...free text...
//   ## Cases
//   | ID | Title | Requirement | Technique | Priority | Status | Spec | Defect |
//   |---|---|---|---|---|---|---|---|
//   | TC-PET-01 | ... | REQ-PET-01 | equivalence-partition | high | automated | specs/pet.spec.ts | |
//
// Structure is validated before content (L-12): a row with the wrong number of cells is reported and
// skipped rather than read with shifted columns, and statuses, techniques and priorities are checked
// against their enums, never against a list of likely words.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const COLUMNS = [
  'ID',
  'Title',
  'Requirement',
  'Technique',
  'Priority',
  'Status',
  'Spec',
  'Defect',
];

/** draft -> approved -> automated -> published; blocked at any point, with a defect key. */
export const STATUSES = ['draft', 'approved', 'automated', 'published', 'blocked'];
export const TECHNIQUES = [
  'equivalence-partition',
  'boundary-value',
  'decision-table',
  'state-transition',
  'pairwise',
  'error-guessing',
  'use-case',
];
export const PRIORITIES = ['high', 'medium', 'low'];

const FEATURE = /^[A-Z][A-Z0-9]{1,9}$/;
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

function splitRow(line) {
  // `| a | b |` -> ['a', 'b']; an escaped pipe stays inside its cell.
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

/** Parse one registry. Never throws on content: every defect is a problem with a line number. */
export function parseRegistry(text, file = 'registry.md') {
  const problems = [];
  const problem = (line, message) => problems.push({ file, line, message });

  const front = FRONT_MATTER.exec(text);
  let meta = {};
  if (!front) problem(1, 'missing YAML front matter (--- ... ---)');
  else {
    try {
      meta = parseYaml(front[1]) ?? {};
    } catch (error) {
      problem(1, `front matter is not valid YAML: ${error.message}`);
    }
  }
  if (!FEATURE.test(String(meta.feature ?? ''))) {
    problem(1, 'front matter `feature` must be 2-10 capitals/digits, e.g. PET');
  }
  if (!meta.title) problem(1, 'front matter `title` is required');
  if (!Array.isArray(meta.endpoints) || meta.endpoints.length === 0) {
    problem(1, 'front matter `endpoints` must list at least one "METHOD /path"');
  }
  const requirements = Array.isArray(meta.requirements) ? meta.requirements : [];
  const requirementIds = new Set(requirements.map((r) => r?.id));

  const lines = text.split(/\r?\n/);
  const heading = lines.findIndex((line) => /^##\s+Cases\s*$/.test(line));
  const cases = [];
  if (heading === -1) {
    problem(1, 'missing "## Cases" section');
    return { file, meta, requirements, cases, problems };
  }

  let index = heading + 1;
  while (index < lines.length && lines[index].trim() === '') index += 1;
  const header = lines[index] ?? '';
  const headerCells = splitRow(header);
  if (headerCells.join('|') !== COLUMNS.join('|')) {
    problem(index + 1, `the cases table header must be: | ${COLUMNS.join(' | ')} |`);
    return { file, meta, requirements, cases, problems };
  }
  index += 2; // header and separator

  const seen = new Set();
  const casePattern = new RegExp(`^TC-${meta.feature ?? '[A-Z0-9]+'}-\\d{2,3}$`);
  for (; index < lines.length && lines[index].trim().startsWith('|'); index += 1) {
    const lineNumber = index + 1;
    const cells = splitRow(lines[index]);
    if (cells.length !== COLUMNS.length) {
      problem(lineNumber, `row has ${cells.length} cells, expected ${COLUMNS.length}; row skipped`);
      continue;
    }
    const row = Object.fromEntries(COLUMNS.map((column, i) => [column.toLowerCase(), cells[i]]));
    const entry = { ...row, line: lineNumber };
    if (!casePattern.test(row.id))
      problem(lineNumber, `case id "${row.id}" must be TC-${meta.feature}-NN`);
    if (seen.has(row.id)) problem(lineNumber, `duplicate case id ${row.id}`);
    seen.add(row.id);
    if (!row.title) problem(lineNumber, `${row.id}: title is empty`);
    if (!STATUSES.includes(row.status)) {
      problem(lineNumber, `${row.id}: status "${row.status}" is not one of ${STATUSES.join(', ')}`);
    }
    if (!TECHNIQUES.includes(row.technique)) {
      problem(
        lineNumber,
        `${row.id}: technique "${row.technique}" is not one of ${TECHNIQUES.join(', ')}`,
      );
    }
    if (!PRIORITIES.includes(row.priority)) {
      problem(
        lineNumber,
        `${row.id}: priority "${row.priority}" is not one of ${PRIORITIES.join(', ')}`,
      );
    }
    if (row.requirement && !requirementIds.has(row.requirement)) {
      problem(
        lineNumber,
        `${row.id}: requirement ${row.requirement} is not declared in the front matter`,
      );
    }
    cases.push(entry);
  }
  return { file, meta, requirements, cases, problems };
}

/** Every registry of every pack (or of one pack), parsed. */
export function loadRegistries(root, pack = null) {
  const services = join(root, 'services');
  if (!existsSync(services)) return [];
  const packs = pack
    ? [pack]
    : readdirSync(services, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
  const registries = [];
  for (const name of packs.sort()) {
    const dir = join(services, name, 'registry');
    if (!existsSync(dir)) continue;
    for (const fileName of readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()) {
      const file = join(dir, fileName);
      registries.push({
        pack: name,
        ...parseRegistry(readFileSync(file, 'utf8'), relative(root, file).replace(/\\/g, '/')),
      });
    }
  }
  return registries;
}
