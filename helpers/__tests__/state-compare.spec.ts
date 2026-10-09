import { test, expect } from '@playwright/test';
import {
  changedFields,
  compareInventory,
  compareStates,
  expectOnlyChanged,
  expectSameState,
  flatten,
  normalize,
  type FieldModel,
} from '../state-compare';

const MODEL: FieldModel = {
  id: 'identity',
  name: 'business',
  owner: 'business',
  tags: { bucket: 'business', normalize: normalize.unordered },
  shipDate: { bucket: 'business', normalize: normalize.instant },
  updatedBy: { bucket: 'provenance', shape: (v) => typeof v === 'string' && v.startsWith('svc:') },
  updatedAt: 'volatile',
};

const base = {
  id: 7,
  name: 'rex',
  owner: { id: 1, city: 'Lima' },
  tags: ['a', 'b'],
  shipDate: '2026-10-09T10:00:00.000Z',
  updatedBy: 'svc:api',
  updatedAt: '2026-10-09T10:00:01Z',
};

test.describe('compareStates', () => {
  test('equal resources differ in nothing, whatever the volatile fields say', () => {
    const later = { ...base, updatedAt: '2030-01-01T00:00:00Z' };
    expect(compareStates(base, later, MODEL)).toEqual({
      identity: [],
      business: [],
      provenance: [],
      unclassified: [],
    });
  });

  test('normalizers make equivalent representations equal', () => {
    const echoed = { ...base, tags: ['b', 'a'], shipDate: '2026-10-09T10:00:00.000+00:00' };
    expect(changedFields(base, echoed, MODEL)).toEqual([]);
  });

  test('each difference lands in its bucket; nested fields inherit the parent bucket', () => {
    const other = {
      ...base,
      id: 8,
      owner: { id: 1, city: 'Cusco' },
      updatedBy: 'someone',
      extra: 1,
    };
    expect(compareStates(base, other, MODEL)).toEqual({
      identity: ['id'],
      business: ['owner.city'],
      provenance: ['updatedBy'],
      unclassified: ['extra'],
    });
  });

  test('a field missing on one side is a difference', () => {
    const withoutName: Partial<typeof base> = { ...base };
    delete withoutName.name;
    expect(changedFields(base, withoutName, MODEL)).toEqual(['name']);
  });
});

test('flatten walks objects and keeps arrays whole', () => {
  expect([...flatten({ a: { b: 1, c: [1, 2] }, d: {} })]).toEqual([
    ['a.b', 1],
    ['a.c', [1, 2]],
    ['d', {}],
  ]);
});

test.describe('assertions', () => {
  test('expectSameState lists differences by bucket', () => {
    expect(() => expectSameState(base, { ...base, id: 9, name: 'max' }, MODEL)).toThrow(
      'States differ:\n  identity: id\n  business: name',
    );
  });

  test('expectOnlyChanged accepts exactly the intended change set', () => {
    const renamed = { ...base, name: 'max' };
    expect(() => expectOnlyChanged(base, renamed, MODEL, ['name'])).not.toThrow();
    expect(() => expectOnlyChanged(base, renamed, MODEL, ['owner'])).toThrow(
      'Changed but not intended: name. Intended but unchanged: owner.',
    );
    expect(() =>
      expectOnlyChanged(base, { ...base, owner: { id: 2, city: 'Lima' } }, MODEL, ['owner']),
    ).not.toThrow();
  });
});

test('compareInventory reports counts and identities', () => {
  const key = (item: { id: number }) => String(item.id);
  expect(compareInventory([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }, { id: 4 }], key)).toEqual({
    before: 2,
    after: 3,
    added: ['3', '4'],
    removed: ['1'],
  });
});
