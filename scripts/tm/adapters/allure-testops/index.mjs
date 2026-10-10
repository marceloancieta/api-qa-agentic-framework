// The `allure-testops` adapter: results-first. Allure TestOps creates a test case the first time a
// result with a new identity arrives, so publishing definitions is skipped; a run is a TestOps
// launch. Built and checked against TestOps 26.3 (its OpenAPI is served at /api-docs/).
//
// Options (qa-config test_management.options), each with an environment fallback:
//   endpoint      instance URL                     (ALLURE_ENDPOINT)
//   project_id    numeric project id               (ALLURE_PROJECT_ID)
//   token_env     variable holding the API token   (default ALLURE_TOKEN; never a flag, L-43)
//   resultsDir    Allure results to upload from    (default allure-results)
//   wait_seconds  how long to wait for TestOps to process an upload (default 120)
//
// What is uploaded: for each attributed result, its last attempt's result file and the attachments
// it references, with `fullName` and `testCaseId` set to the identity, so a TestOps test case is
// keyed by the identity rather than by the file that holds the test today. A result without an
// identity is skipped with a reason (L-17). The `host` and `thread` labels name the machine and
// stay local. A result with no file behind it is uploaded as a minimal result built from the
// manifest.
//
// Read-back (L-04): an upload is processed asynchronously, so the launch's results are polled until
// every uploaded identity shows its status; the launch is read back after it is created and closed.

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { credential } from '../../../lib/env.mjs';
import { httpClient } from '../../../lib/http.mjs';
import { assertReadBack } from '../../adapter.mjs';

const LOCAL_LABELS = new Set(['host', 'thread']);
const UPLOAD_BATCH = 50;
const PAGE_SIZE = 100;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Every attachment file a result references, in the result and in its steps at any depth. */
export function attachmentSources(item) {
  return [
    ...(item.attachments ?? []).map((attachment) => attachment.source).filter(Boolean),
    ...(item.steps ?? []).flatMap(attachmentSources),
  ];
}

/** The result as uploaded: keyed by identity, without machine labels. */
export function uploadedResult(source, identity) {
  return {
    ...source,
    fullName: identity,
    testCaseId: identity,
    labels: (source.labels ?? []).filter((label) => !LOCAL_LABELS.has(label.name)),
  };
}

/** A minimal Allure result for a manifest result that has no result file behind it. */
export function synthesizedResult(result, now = Date.now()) {
  const stop = result.stop ?? now;
  return {
    uuid: randomUUID(),
    historyId: result.identity,
    testCaseId: result.identity,
    fullName: result.identity,
    name: result.name || result.identity,
    status: result.status,
    stage: 'finished',
    start: result.start ?? stop - (result.durationMs ?? 0),
    stop,
    labels: result.run ? [{ name: 'run', value: result.run }] : [],
    links: (result.issues ?? []).map((key) => ({ type: 'issue', name: key })),
  };
}

export function createAdapter(
  options = {},
  { root = process.cwd(), env = process.env, fetchImpl = fetch, log = null, wait = sleep } = {},
) {
  const endpoint = String(options.endpoint ?? env.ALLURE_ENDPOINT ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!endpoint) {
    throw new Error(
      'The allure-testops adapter needs test_management.options.endpoint or ALLURE_ENDPOINT.',
    );
  }
  const projectId = Number(options.project_id ?? env.ALLURE_PROJECT_ID);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error(
      'The allure-testops adapter needs a numeric test_management.options.project_id or ALLURE_PROJECT_ID.',
    );
  }
  const token = credential(env, options.token_env ?? 'ALLURE_TOKEN', 'The allure-testops adapter');
  const resultsDir = resolve(root, options.resultsDir ?? 'allure-results');
  const waitMs = (options.wait_seconds ?? 120) * 1000;
  const pollMs = options.poll_ms ?? 2000;
  const request = httpClient({
    baseUrl: endpoint,
    headers: { authorization: `Api-Token ${token}` },
    fetchImpl,
    log,
    wait,
  });
  const expectOk = (response, what) => {
    if (response.ok) return response.json;
    const detail = response.json?.message ?? response.text.slice(0, 200);
    throw new Error(`Allure TestOps: ${what} failed with ${response.status}: ${detail}`);
  };

  const readLaunch = async (id) => {
    const response = await request('GET', `api/launch/${id}`);
    return response.status === 404 ? null : expectOk(response, `read launch ${id}`);
  };

  const launchResults = async (id) => {
    const rows = [];
    for (let page = 0; ; page += 1) {
      const body = expectOk(
        await request('GET', `api/testresult?launchId=${id}&page=${page}&size=${PAGE_SIZE}`),
        `read the results of launch ${id}`,
      );
      rows.push(...(body.content ?? []));
      if (body.last !== false) return rows;
    }
  };

  const readRun = async (run) => {
    const launch = await readLaunch(run.id);
    if (!launch) return null;
    const results = {};
    // Uploaded results carry the identity as their fullName; hidden rows are superseded retries.
    for (const row of await launchResults(run.id)) {
      if (!row.hidden)
        results[row.fullName ?? row.name] = { status: row.status, testCaseId: row.testCaseId };
    }
    return { id: launch.id, name: launch.name, closed: launch.closed === true, results };
  };

  // The files for one attributed result: the result itself, then the attachments it references.
  const filesFor = (result) => {
    const file = result.file && join(resultsDir, basename(result.file));
    if (!file || !existsSync(file)) {
      const synthesized = synthesizedResult(result);
      return [{ name: `${synthesized.uuid}-result.json`, content: JSON.stringify(synthesized) }];
    }
    const source = JSON.parse(readFileSync(file, 'utf8'));
    const files = [
      {
        name: basename(file),
        content: JSON.stringify(uploadedResult(source, result.identity)),
      },
    ];
    for (const attachment of attachmentSources(source)) {
      const path = join(resultsDir, basename(attachment));
      if (existsSync(path)) files.push({ name: basename(attachment), content: readFileSync(path) });
      else log?.warn('attachment missing, not uploaded', { identity: result.identity, attachment });
    }
    return files;
  };

  const upload = async (launchId, files) => {
    const form = new FormData();
    form.append('info', new Blob(['{}'], { type: 'application/json' }));
    for (const { name, content } of files) form.append('file', new Blob([content]), name);
    expectOk(
      await request('POST', `api/launch/${launchId}/upload/file`, form),
      `upload to launch ${launchId}`,
    );
  };

  return {
    name: 'allure-testops',
    capabilities: { definitions: false, runs: true },
    readRun,

    async publishDefinitions() {
      return { published: [], unchanged: [] };
    },

    async startRun({ name, runId }) {
      const body = {
        name,
        projectId,
        autoclose: false,
        tags: runId ? [{ name: `run-${runId}` }] : [],
      };
      const launch = expectOk(await request('POST', 'api/launch', body), 'create a launch');
      assertReadBack(
        `launch ${launch.id}`,
        { name, projectId, closed: false },
        await readLaunch(launch.id),
        ['name', 'projectId', 'closed'],
      );
      return { id: launch.id, url: `${endpoint}/launch/${launch.id}` };
    },

    async reportResults(run, results) {
      const launch = await readLaunch(run.id);
      if (!launch) throw new Error(`Launch ${run.id} does not exist.`);
      if (launch.closed) throw new Error(`Launch ${run.id} is closed; start a new run to report.`);
      const skipped = [];
      const accepted = [];
      for (const result of results) {
        if (!result.identity) {
          skipped.push({ identity: result.name ?? '(unnamed)', reason: 'no case identity (L-17)' });
        } else accepted.push(result);
      }
      for (let start = 0; start < accepted.length; start += UPLOAD_BATCH) {
        await upload(run.id, accepted.slice(start, start + UPLOAD_BATCH).flatMap(filesFor));
      }
      // TestOps processes uploads in the background: wait until every result shows its status.
      const expected = Object.fromEntries(accepted.map((r) => [r.identity, r.status]));
      const deadline = Date.now() + waitMs;
      let pending = Object.keys(expected);
      while (pending.length > 0) {
        const stored = (await readRun(run)).results;
        pending = pending.filter((identity) => stored[identity]?.status !== expected[identity]);
        if (pending.length === 0) break;
        if (Date.now() >= deadline) {
          const differences = pending.map(
            (identity) =>
              `${identity}: wrote ${expected[identity]}, read back ${stored[identity]?.status ?? 'nothing'}`,
          );
          throw new Error(
            `Read-back of launch ${run.id} after ${waitMs / 1000}s does not match what was uploaded:\n  ${differences.join('\n  ')}`,
          );
        }
        await wait(pollMs);
      }
      return { reported: accepted.map((r) => r.identity), skipped };
    },

    async closeRun(run) {
      const launch = await readLaunch(run.id);
      if (!launch) throw new Error(`Launch ${run.id} does not exist.`);
      if (launch.closed) return { closed: true, alreadyClosed: true };
      expectOk(await request('POST', `api/launch/${run.id}/close`), `close launch ${run.id}`);
      const deadline = Date.now() + waitMs;
      let current = await readLaunch(run.id);
      while (!current?.closed && Date.now() < deadline) {
        await wait(pollMs);
        current = await readLaunch(run.id);
      }
      assertReadBack(`launch ${run.id}`, { closed: true }, current, ['closed']);
      return { closed: true, alreadyClosed: false };
    },
  };
}
