// Protecting shared data a case touches (seed data, a common account). Creating dedicated data is
// better; when a case must use something shared, it runs inside a guard:
//   1. capture the state before the case;
//   2. run the case;
//   3. always, even when the case failed: read the state again, compare, and repair only the fields
//      that really differ, then read once more to confirm;
//   4. report what happened as an attachment, an annotation and, when something is wrong, a soft
//      failure. The guard never throws over the case's own error.
// A case that expects the API to refuse a change says so (`expectChange: false`): if the resource
// changed anyway, that is a finding about the API, reported apart from the repair.
//
// An armed expected failure (`test.fail`) would also absorb the guard's soft failure, so for armed
// cases a problem is additionally written to stderr and annotated, where the arm cannot hide it.

import { test, expect } from '@playwright/test';

export interface GuardedResource<S> {
  /** A safe name for reports: a role ("seed pet"), never a real identifier. */
  label: string;
  /** The current state, or null when the resource no longer exists. */
  capture(): Promise<S | null>;
  /** Names of the fields where two snapshots disagree (see `changedFields` in state-compare). */
  diff(baseline: S, current: S): string[];
  /** Put `baseline` back; may return the status code of the request that did it. */
  restore(baseline: S): Promise<number | void>;
}

export interface GuardReport {
  label: string;
  /** Fields that differed from the baseline after the case. */
  changed: string[];
  /** True when the case was expected to leave the resource alone and it changed anyway. */
  unintended: boolean;
  /** True when the resource matches the baseline at the end (trivially, when nothing changed). */
  restored: boolean;
  /** Fields still different after the repair. */
  remaining: string[];
  repairStatus?: number;
  /** What a person must do by hand, when the guard could not put things back. */
  problem?: string;
}

/** Compare and repair. Never throws: every failure becomes a `problem` in the report. */
export async function restoreIfChanged<S>(
  resource: GuardedResource<S>,
  baseline: S,
  expectChange: boolean,
): Promise<GuardReport> {
  const base = { label: resource.label, unintended: false };
  try {
    const now = await resource.capture();
    if (now === null) {
      return {
        ...base,
        changed: ['(resource missing)'],
        unintended: !expectChange,
        restored: false,
        remaining: ['(resource missing)'],
        problem: `the ${resource.label} no longer exists; recreate it by hand`,
      };
    }
    const changed = resource.diff(baseline, now);
    if (changed.length === 0) return { ...base, changed, restored: true, remaining: [] };

    const repairStatus = (await resource.restore(baseline)) ?? undefined;
    const after = await resource.capture();
    const remaining = after === null ? ['(resource missing)'] : resource.diff(baseline, after);
    return {
      ...base,
      changed,
      unintended: !expectChange,
      restored: remaining.length === 0,
      remaining,
      ...(repairStatus === undefined ? {} : { repairStatus }),
      ...(remaining.length === 0
        ? {}
        : { problem: `the repair left ${remaining.join(', ')} different from the baseline` }),
    };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return {
      ...base,
      changed: [],
      restored: false,
      remaining: [],
      problem: `the guard could not run (${reason}); check the ${resource.label} by hand`,
    };
  }
}

/**
 * Run `body` with `resource` guarded. `expectChange` says whether the case is meant to modify it
 * (true: changes are repaired silently) or not (false: any change is also reported as a finding).
 */
export async function withResourceGuard<S, T>(
  resource: GuardedResource<S>,
  options: { expectChange: boolean },
  body: () => Promise<T>,
): Promise<T> {
  const baseline = await resource.capture();
  if (baseline === null) {
    throw new Error(`Cannot guard the ${resource.label}: it does not exist before the case.`);
  }
  try {
    return await body();
  } finally {
    const report = await restoreIfChanged(resource, baseline, options.expectChange);
    await publish(report);
  }
}

/** What a report means for the case: an unintended change, a failed repair, or nothing. */
export function guardFindings(report: GuardReport): string[] {
  return [
    ...(report.unintended
      ? [
          `the ${report.label} changed (${report.changed.join(', ')}) though the case expected no change`,
        ]
      : []),
    ...(report.problem ? [`the ${report.label} was not restored: ${report.problem}`] : []),
  ];
}

async function publish(report: GuardReport): Promise<void> {
  const info = test.info();
  await info.attach(`guard ${report.label}`, {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  const findings = guardFindings(report);
  if (findings.length === 0) return;

  for (const finding of findings) info.annotations.push({ type: 'guard', description: finding });
  if (info.expectedStatus === 'failed') {
    // The arm would swallow a soft failure; make the finding impossible to miss anyway.
    console.error(`[guard] ${info.title}: ${findings.join('; ')}`);
  }
  expect.soft(findings, 'resource guard findings').toEqual([]);
}
