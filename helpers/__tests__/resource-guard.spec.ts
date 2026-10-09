import { test, expect } from '@playwright/test';
import {
  guardFindings,
  restoreIfChanged,
  withResourceGuard,
  type GuardedResource,
} from '../resource-guard';

interface State {
  status: string;
  name: string;
}

// An in-memory resource; `stubborn` fields ignore restores, `vanish` deletes it.
function fakeResource(initial: State, options: { stubborn?: (keyof State)[] } = {}) {
  let current: State | null = { ...initial };
  let restores = 0;
  const resource: GuardedResource<State> = {
    label: 'seed record',
    capture: async () => (current ? { ...current } : null),
    diff: (a, b) => (Object.keys(a) as (keyof State)[]).filter((key) => a[key] !== b[key]),
    restore: async (baseline) => {
      restores += 1;
      if (!current) return 404;
      for (const key of Object.keys(baseline) as (keyof State)[]) {
        if (!options.stubborn?.includes(key)) current[key] = baseline[key];
      }
      return 200;
    },
  };
  return {
    resource,
    set: (patch: Partial<State>) => current && Object.assign(current, patch),
    vanish: () => {
      current = null;
    },
    restores: () => restores,
  };
}

const baseline: State = { status: 'available', name: 'rex' };

test.describe('restoreIfChanged', () => {
  test('does nothing when nothing changed', async () => {
    const fake = fakeResource(baseline);
    expect(await restoreIfChanged(fake.resource, baseline, true)).toEqual({
      label: 'seed record',
      unintended: false,
      changed: [],
      restored: true,
      remaining: [],
    });
    expect(fake.restores()).toBe(0);
  });

  test('repairs an intended change and confirms it', async () => {
    const fake = fakeResource(baseline);
    fake.set({ status: 'sold' });
    expect(await restoreIfChanged(fake.resource, baseline, true)).toMatchObject({
      changed: ['status'],
      unintended: false,
      restored: true,
      repairStatus: 200,
    });
  });

  test('flags a change the case did not expect', async () => {
    const fake = fakeResource(baseline);
    fake.set({ name: 'changed' });
    expect(await restoreIfChanged(fake.resource, baseline, false)).toMatchObject({
      changed: ['name'],
      unintended: true,
      restored: true,
    });
  });

  test('reports what a repair could not put back', async () => {
    const fake = fakeResource(baseline, { stubborn: ['name'] });
    fake.set({ name: 'changed', status: 'sold' });
    const report = await restoreIfChanged(fake.resource, baseline, true);
    expect(report).toMatchObject({ restored: false, remaining: ['name'] });
    expect(report.problem).toMatch(/left name different/);
  });

  test('a missing resource and a failing capture become problems, never exceptions', async () => {
    const gone = fakeResource(baseline);
    gone.vanish();
    expect((await restoreIfChanged(gone.resource, baseline, true)).problem).toMatch(
      /no longer exists/,
    );

    const broken: GuardedResource<State> = {
      ...fakeResource(baseline).resource,
      capture: async () => {
        throw new Error('socket hang up');
      },
    };
    expect((await restoreIfChanged(broken, baseline, true)).problem).toMatch(/socket hang up/);
  });
});

test.describe('withResourceGuard', () => {
  test('restores after the body and returns its value', async () => {
    const fake = fakeResource(baseline);
    const value = await withResourceGuard(fake.resource, { expectChange: true }, async () => {
      fake.set({ status: 'sold' });
      return 42;
    });
    expect(value).toBe(42);
    expect(await fake.resource.capture()).toEqual(baseline);
  });

  test("restores after a failing body and rethrows the body's own error", async () => {
    const fake = fakeResource(baseline);
    await expect(
      withResourceGuard(fake.resource, { expectChange: true }, async () => {
        fake.set({ status: 'sold' });
        throw new Error('assertion in the case');
      }),
    ).rejects.toThrow('assertion in the case');
    expect(await fake.resource.capture()).toEqual(baseline);
  });

  test('refuses to guard a resource that does not exist yet', async () => {
    const fake = fakeResource(baseline);
    fake.vanish();
    await expect(
      withResourceGuard(fake.resource, { expectChange: true }, async () => 1),
    ).rejects.toThrow(/does not exist before the case/);
  });
});

test('findings name an unintended change and a failed repair', () => {
  const report = {
    label: 'seed record',
    changed: ['name'],
    unintended: true,
    restored: false,
    remaining: ['name'],
    problem: 'the repair left name different from the baseline',
  };
  expect(guardFindings(report)).toEqual([
    'the seed record changed (name) though the case expected no change',
    'the seed record was not restored: the repair left name different from the baseline',
  ]);
  expect(guardFindings({ ...report, unintended: false, problem: undefined })).toEqual([]);
});
