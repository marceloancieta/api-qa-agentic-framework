import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, runId } from '../lib/log.mjs';

const fixedClock = () => new Date('2026-10-09T15:04:05.123Z');
const capture = () => {
  const lines = [];
  return { lines, out: { log: (line) => lines.push(line) } };
};

test('lines carry the timestamp, the run id, the tool and the fields', () => {
  const { lines, out } = capture();
  const log = createLogger('tm-publish', { env: { QA_RUN_ID: '7f3a9c1e' }, out, now: fixedClock });
  log.info('uploaded results', { count: 12, launch: 'nightly run', skipped: undefined });
  log.warn('dropped');
  assert.deepEqual(lines, [
    '2026-10-09T15:04:05.123Z run=7f3a9c1e tm-publish info  uploaded results count=12 launch="nightly run"',
    '2026-10-09T15:04:05.123Z run=7f3a9c1e tm-publish warn  dropped',
  ]);
});

test('a missing run id is created once and exported for child processes', () => {
  const env = {};
  const first = runId(env);
  assert.match(first, /^[0-9a-f]{8}$/);
  assert.equal(env.QA_RUN_ID, first);
  assert.equal(createLogger('x', { env, out: capture().out }).runId, first);
});

test('QA_LOG_FORMAT=json prints one object per line', () => {
  const { lines, out } = capture();
  const env = { QA_RUN_ID: 'abc', QA_LOG_FORMAT: 'json' };
  createLogger('tracker', { env, out, now: fixedClock }).error('failed', { status: 503 });
  assert.deepEqual(JSON.parse(lines[0]), {
    time: '2026-10-09T15:04:05.123Z',
    run: 'abc',
    tool: 'tracker',
    level: 'error',
    message: 'failed',
    status: 503,
  });
});
