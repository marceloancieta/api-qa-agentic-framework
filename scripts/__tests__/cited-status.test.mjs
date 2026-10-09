import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { citedStatus } from '../cited-status.mjs';
import { compareWithMarkers } from '../lib/lint.mjs';
import { loadTracker, trackerConfig } from '../tracker/index.mjs';

const ROOT = join(import.meta.dirname, '..', '__fixtures__', 'cited-status');
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

test('exactly the marked claims are reported against the tracker state', async () => {
  const config = trackerConfig(ROOT);
  const tracker = await loadTracker(config, { root: ROOT });
  const { enabled, claims, findings } = await citedStatus({
    root: ROOT,
    config,
    tracker,
    log: quiet,
  });
  assert.equal(enabled, true);
  assert.deepEqual(compareWithMarkers(ROOT, findings), { missed: [], unexpected: [] });
  assert.deepEqual([...new Set(claims.map((c) => c.kind))].sort(), [
    'known-gap',
    'waiting',
    'workaround',
  ]);
});

test('without a tracker it is a no-op that says so', async () => {
  const lines = [];
  const log = { ...quiet, info: (message) => lines.push(message) };
  const outcome = await citedStatus({
    root: ROOT,
    config: { provider: 'none' },
    tracker: null,
    log,
  });
  assert.deepEqual(outcome, { enabled: false, findings: [] });
  assert.match(lines[0], /opt-in/);
});
