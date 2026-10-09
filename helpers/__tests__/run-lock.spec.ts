import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { acquireRunLock, isStale, releaseRunLock } from '../run-lock';

const lockPath = () => join(mkdtempSync(join(tmpdir(), 'lock-')), 'run.lock');
// A pid that cannot belong to a running process on any supported platform.
const DEAD_PID = 2 ** 30;

test.describe('run lock', () => {
  test('a free lock is taken and released by its owner', () => {
    const file = lockPath();
    acquireRunLock(file, {});
    expect(JSON.parse(readFileSync(file, 'utf8')).pid).toBe(process.pid);
    releaseRunLock(file);
    expect(existsSync(file)).toBe(false);
  });

  test('a live holder blocks a second run, with the override named', () => {
    const file = lockPath();
    acquireRunLock(file, {});
    expect(() => acquireRunLock(file, {})).toThrow(/QA_ALLOW_CONCURRENT_RUNS=1/);
    releaseRunLock(file);
  });

  test('the override skips the lock entirely', () => {
    const file = lockPath();
    acquireRunLock(file, {});
    expect(() => acquireRunLock(file, { QA_ALLOW_CONCURRENT_RUNS: '1' })).not.toThrow();
    releaseRunLock(file);
  });

  test('a lock left by a dead process is taken over', () => {
    const file = lockPath();
    writeFileSync(file, JSON.stringify({ pid: DEAD_PID, startedAt: new Date().toISOString() }));
    acquireRunLock(file, {});
    expect(JSON.parse(readFileSync(file, 'utf8')).pid).toBe(process.pid);
    releaseRunLock(file);
  });

  test('release leaves a lock held by another process alone', () => {
    const file = lockPath();
    writeFileSync(file, JSON.stringify({ pid: DEAD_PID, startedAt: new Date().toISOString() }));
    releaseRunLock(file);
    expect(existsSync(file)).toBe(true);
  });

  test('staleness: unreadable, dead, or too old', () => {
    const now = Date.now();
    expect(isStale(null)).toBe(true);
    expect(isStale({ pid: DEAD_PID, startedAt: new Date(now).toISOString() })).toBe(true);
    expect(isStale({ pid: process.pid, startedAt: new Date(now).toISOString() }, now)).toBe(false);
    expect(isStale({ pid: process.pid, startedAt: '2000-01-01T00:00:00Z' }, now)).toBe(true);
  });
});
