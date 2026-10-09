// The `local` adapter: a definitions-first test-management store kept in JSON files. It needs no
// service, so it is the reference implementation the adapter contract tests run against in any CI,
// and the template for a new adapter: copy this file and replace the store with the tool's API.
//
// Layout under `dir` (qa-config test_management.options.dir, default reports/tm/local):
//   cases.json        { "<identity>": { tmId, title, feature, technique, priority, tags, spec } }
//   runs/<id>.json    { id, name, runId, startedAt, closedAt, results: { "<identity>": {...} } }

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertReadBack } from '../../adapter.mjs';

export const DEFINITION_FIELDS = ['title', 'feature', 'technique', 'priority', 'tags', 'spec'];
const RESULT_FIELDS = ['status', 'attempts', 'durationMs', 'issues'];

const readJson = (file, fallback) =>
  existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const pick = (source, fields) =>
  Object.fromEntries(fields.map((field) => [field, source[field] ?? null]));

export function createAdapter(options = {}, { root = process.cwd(), now = () => new Date() } = {}) {
  const dir = join(root, options.dir ?? join('reports', 'tm', 'local'));
  const casesFile = join(dir, 'cases.json');
  const runsDir = join(dir, 'runs');
  mkdirSync(runsDir, { recursive: true });
  const runFile = (id) => join(runsDir, `${id}.json`);

  const readDefinitions = async (identities) => {
    const store = readJson(casesFile, {});
    return Object.fromEntries(identities.filter((id) => id in store).map((id) => [id, store[id]]));
  };

  const readRun = async (run) => readJson(runFile(run.id), null);

  return {
    name: 'local',
    capabilities: { definitions: true, runs: true },
    readDefinitions,
    readRun,

    async publishDefinitions(cases) {
      const store = readJson(casesFile, {});
      const published = [];
      const unchanged = [];
      let next = Object.keys(store).length + 1;
      for (const testCase of cases) {
        const definition = pick(testCase, DEFINITION_FIELDS);
        const existing = store[testCase.identity];
        if (
          existing &&
          JSON.stringify(pick(existing, DEFINITION_FIELDS)) === JSON.stringify(definition)
        ) {
          unchanged.push(testCase.identity);
          continue;
        }
        const tmId = existing?.tmId ?? `LOC-${next++}`;
        store[testCase.identity] = { tmId, ...definition };
        published.push({
          identity: testCase.identity,
          tmId,
          url: `file://${casesFile.replace(/\\/g, '/')}#${tmId}`,
        });
      }
      writeJson(casesFile, store);
      const readBack = await readDefinitions(published.map((p) => p.identity));
      for (const { identity } of published) {
        assertReadBack(`case ${identity}`, store[identity], readBack[identity], [
          'tmId',
          ...DEFINITION_FIELDS,
        ]);
      }
      return { published, unchanged };
    },

    async startRun({ name, runId }) {
      const id = `run-${readdirSync(runsDir).length + 1}`;
      const record = {
        id,
        name,
        runId: runId ?? null,
        startedAt: now().toISOString(),
        closedAt: null,
        results: {},
      };
      writeJson(runFile(id), record);
      assertReadBack(`run ${id}`, record, await readRun({ id }), [
        'id',
        'name',
        'runId',
        'startedAt',
      ]);
      return { id, url: `file://${runFile(id).replace(/\\/g, '/')}` };
    },

    async reportResults(run, results) {
      const record = await readRun(run);
      if (!record) throw new Error(`Run ${run.id} does not exist.`);
      if (record.closedAt) throw new Error(`Run ${run.id} is closed; start a new run to report.`);
      const known = readJson(casesFile, {});
      const reported = [];
      const skipped = [];
      for (const result of results) {
        if (!(result.identity in known)) {
          skipped.push({ identity: result.identity, reason: 'case is not published to this tool' });
          continue;
        }
        record.results[result.identity] = pick(result, RESULT_FIELDS);
        reported.push(result.identity);
      }
      writeJson(runFile(run.id), record);
      const readBack = await readRun(run);
      for (const identity of reported) {
        assertReadBack(
          `result ${identity}`,
          record.results[identity],
          readBack.results[identity],
          RESULT_FIELDS,
        );
      }
      return { reported, skipped };
    },

    async closeRun(run) {
      const record = await readRun(run);
      if (!record) throw new Error(`Run ${run.id} does not exist.`);
      if (record.closedAt) return { closed: true, alreadyClosed: true };
      record.closedAt = now().toISOString();
      writeJson(runFile(run.id), record);
      assertReadBack(`run ${run.id}`, record, await readRun(run), ['closedAt']);
      return { closed: true, alreadyClosed: false };
    },
  };
}
