import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { exitDetail, flattenReport, runLane, unexplainedExit } from '../lib/playwright-lane.mjs';
import { REPO_ROOT } from '../lib/cli.mjs';

const REPORT = {
  suites: [
    {
      title: 'services/x/specs/a.spec.ts',
      specs: [
        {
          title: 'top level',
          file: 'services/x/specs/a.spec.ts',
          line: 3,
          tags: [],
          tests: [
            {
              projectName: 'api',
              expectedStatus: 'passed',
              status: 'flaky',
              annotations: [],
              results: [
                { status: 'failed', retry: 0, duration: 5, errors: [{ message: 'boom' }] },
                { status: 'passed', retry: 1, duration: 4, errors: [] },
              ],
            },
          ],
        },
      ],
      suites: [
        {
          title: 'group',
          specs: [
            {
              title: 'inner',
              file: 'services/x/specs/a.spec.ts',
              line: 9,
              tags: ['@smoke'],
              tests: [
                {
                  projectName: 'api',
                  expectedStatus: 'failed',
                  status: 'expected',
                  annotations: [{ type: 'issue', description: 'KEY-1' }],
                  results: [{ status: 'failed', retry: 0, duration: 7, errors: [] }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

test('the JSON report becomes one record per test with its attempts', () => {
  const records = flattenReport(REPORT);
  assert.deepEqual(
    records.map((r) => [r.titlePath, r.outcome, r.expectedStatus, r.attempts.map((a) => a.status)]),
    [
      [['top level'], 'flaky', 'passed', ['failed', 'passed']],
      [['group', 'inner'], 'expected', 'failed', ['failed']],
    ],
  );
  assert.deepEqual(records[0].attempts[0].errors, ['boom']);
  assert.deepEqual(records[1].annotations, [{ type: 'issue', description: 'KEY-1' }]);
});

// A stand-in for spawnSync: optionally writes `report` where the lane asked for it, then returns
// `result` as the child's outcome.
const fakeSpawn =
  (result, report = null) =>
  (command, args, options) => {
    if (report) writeFileSync(options.env.QA_JSON_REPORT, JSON.stringify(report));
    return { stdout: '', stderr: '', ...result };
  };

test('runLane passes Playwright exit code on, and reports a run that did not finish', () => {
  const exited = runLane(REPO_ROOT, [], {}, { spawn: fakeSpawn({ status: 1, signal: null }) });
  assert.equal(exited.exitCode, 1);
  assert.equal(exited.runnerError, null);

  const killed = runLane(
    REPO_ROOT,
    [],
    {},
    { spawn: fakeSpawn({ status: null, signal: 'SIGKILL' }, REPORT) },
  );
  assert.equal(killed.exitCode, 1, 'a killed run never reads as exit 0');
  assert.equal(killed.runnerError, 'killed by SIGKILL');
  assert.equal(killed.records.length, 2, 'the partial records are still handed over');
  assert.match(killed.stderr, /Playwright killed by SIGKILL/);

  const error = Object.assign(new Error('spawnSync node ENOENT'), { code: 'ENOENT' });
  const missing = runLane(
    REPO_ROOT,
    [],
    {},
    {
      spawn: fakeSpawn({ status: null, signal: null, error, stdout: null, stderr: null }),
    },
  );
  assert.equal(missing.exitCode, 1);
  assert.match(missing.runnerError, /could not run: spawnSync node ENOENT/);
  assert.equal(missing.stdout, '');
  assert.deepEqual(missing.records, []);
});

test('the exit code has the last word over verdicts that look fine', () => {
  const ok = { exitCode: 0, runnerError: null, stdout: '', stderr: '' };
  assert.equal(unexplainedExit(ok, false), null);
  assert.equal(unexplainedExit({ ...ok, exitCode: 1 }, true), null, 'a failed verdict explains it');
  assert.equal(
    unexplainedExit({ ...ok, exitCode: 1, stderr: 'line 1\nError in global teardown' }, false),
    'Playwright exited 1 although no case failed: line 1 | Error in global teardown',
  );
  assert.equal(
    unexplainedExit({ ...ok, exitCode: 1, runnerError: 'killed by SIGTERM' }, true),
    'Playwright did not finish: killed by SIGTERM',
    'a run that did not finish is never trusted, even when a verdict failed',
  );
  assert.equal(
    exitDetail({ exitCode: 2, stderr: '', stdout: 'a\nb' }),
    'Playwright exited 2: a | b',
  );
});

test('runLane runs a real lane and reads its report', () => {
  const lane = runLane(REPO_ROOT, ['--project=unit', 'helpers/__tests__/service.spec.ts']);
  assert.equal(lane.exitCode, 0, lane.stderr);
  // One record per test declared in helpers/__tests__/service.spec.ts.
  assert.equal(lane.records.length, 3);
  assert.ok(lane.records.every((r) => r.project === 'unit' && r.outcome === 'expected'));
});
