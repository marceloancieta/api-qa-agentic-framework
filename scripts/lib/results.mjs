// Reading test results from an Allure results directory. The directory accumulates across runs
// until a run clears it, so results are grouped into runs separated by idle time, and tools read the
// latest run unless asked otherwise. Retries of one case collapse to the last attempt.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Results more than this far apart belong to different runs. */
export const RUN_GAP_MINUTES = 10;

/** Every `*-result.json` in `dir`, parsed, with its file name; [] when the directory is missing. */
export function readResultFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('-result.json'))
    .sort()
    .map((file) => ({ file, ...JSON.parse(readFileSync(join(dir, file), 'utf8')) }));
}

/** Group test results into runs separated by idle gaps; returns the runs oldest first. */
export function groupRuns(results, gapMs = RUN_GAP_MINUTES * 60_000) {
  const sorted = [...results].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  const runs = [];
  let lastStop = -Infinity;
  for (const result of sorted) {
    const start = result.start ?? 0;
    if (runs.length === 0 || start - lastStop > gapMs) runs.push([]);
    runs[runs.length - 1].push(result);
    lastStop = Math.max(lastStop, result.stop ?? start);
  }
  return runs;
}

/** The results of the latest run in `dir` (an empty list when there are none). */
export function latestRun(dir) {
  return groupRuns(readResultFiles(dir)).at(-1) ?? [];
}

/**
 * One entry per key: the last attempt (by stop time) wins and `attempts` counts them all.
 * `keyOf` returns null for results that cannot be keyed; those are returned in `unkeyed`.
 */
export function lastAttempts(results, keyOf) {
  const byKey = new Map();
  const unkeyed = [];
  for (const result of results) {
    const key = keyOf(result);
    if (key === null || key === undefined) {
      unkeyed.push(result);
      continue;
    }
    const previous = byKey.get(key);
    const attempts = (previous?.attempts ?? 0) + 1;
    const latest =
      !previous || (result.stop ?? 0) >= (previous.result.stop ?? 0) ? result : previous.result;
    byKey.set(key, { result: latest, attempts });
  }
  return { byKey, unkeyed };
}
