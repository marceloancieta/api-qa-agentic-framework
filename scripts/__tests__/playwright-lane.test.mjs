import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenReport, runLane } from '../lib/playwright-lane.mjs';
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

test('runLane runs a real lane and reads its report', () => {
  const lane = runLane(REPO_ROOT, ['--project=unit', 'helpers/__tests__/service.spec.ts']);
  assert.equal(lane.exitCode, 0, lane.stderr);
  assert.equal(lane.records.length, 2);
  assert.ok(lane.records.every((r) => r.project === 'unit' && r.outcome === 'expected'));
});
