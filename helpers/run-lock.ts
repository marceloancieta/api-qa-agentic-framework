// One local run at a time per checkout. Every run clears `allure-results/` when it starts, so a
// second run started while the first is still going would delete the first one's evidence and mix
// the two. The lock file records the owner's pid; a lock whose process is gone, or older than any
// real run, is stale and taken over.

import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './config';

export const LOCK_FILE = join(REPO_ROOT, 'allure-results.lock');
export const CONCURRENT_RUNS_VARIABLE = 'QA_ALLOW_CONCURRENT_RUNS';
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

interface LockRecord {
  pid: number;
  startedAt: string;
}

function read(file: string): LockRecord | null {
  try {
    const record = JSON.parse(readFileSync(file, 'utf8')) as Partial<LockRecord>;
    return typeof record.pid === 'number' && typeof record.startedAt === 'string'
      ? { pid: record.pid, startedAt: record.startedAt }
      : null;
  } catch {
    return null;
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function isStale(record: LockRecord | null, now = Date.now()): boolean {
  if (!record || !alive(record.pid)) return true;
  const age = now - Date.parse(record.startedAt);
  return !Number.isFinite(age) || age > MAX_AGE_MS;
}

function create(file: string): boolean {
  try {
    writeFileSync(file, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), {
      flag: 'wx',
    });
    return true;
  } catch (error) {
    const exists = (error as NodeJS.ErrnoException).code === 'EEXIST';
    if (exists) return false;
    throw error;
  }
}

/** Take the lock or explain who holds it. */
export function acquireRunLock(file = LOCK_FILE, env: NodeJS.ProcessEnv = process.env): void {
  if (env[CONCURRENT_RUNS_VARIABLE] === '1') return;
  if (create(file)) return;
  const holder = read(file);
  if (!isStale(holder)) {
    throw new Error(
      `Another run (pid ${holder?.pid}, started ${holder?.startedAt}) is using allure-results/. ` +
        `Wait for it, or set ${CONCURRENT_RUNS_VARIABLE}=1 to run anyway and accept mixed results.`,
    );
  }
  rmSync(file, { force: true });
  if (!create(file)) throw new Error(`Another run took ${file} at the same moment; try again.`);
}

/** Release the lock if this process holds it. */
export function releaseRunLock(file = LOCK_FILE): void {
  if (read(file)?.pid === process.pid) rmSync(file, { force: true });
}
