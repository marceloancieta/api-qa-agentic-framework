// All-pairs generator (CON-05): complete, smaller than the product, deterministic, bounded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allPairs, fullProductSize, missingPairs, PAIRWISE_LIMITS } from '../lib/pairwise.mjs';

const factors = [
  { name: 'sort', values: ['asc', 'desc'] },
  { name: 'kind', values: ['book', 'film', 'game', 'music'] },
  { name: 'archived', values: [true, false, null] },
  { name: 'limit', values: [1, 50, 100] },
  { name: 'expand', values: ['none', 'all'] },
];

test('every value pair of every two factors appears in some row', () => {
  const rows = allPairs(factors);
  assert.deepEqual(missingPairs(factors, rows), []);
  for (const row of rows)
    assert.deepEqual(
      Object.keys(row),
      factors.map((f) => f.name),
    );
});

test('it needs fewer rows than the full product', () => {
  const rows = allPairs(factors);
  assert.equal(fullProductSize(factors), 144);
  assert.ok(rows.length < 144, `${rows.length} rows`);
  assert.ok(rows.length >= 12, 'never below the product of the two largest factors');
  assert.ok(rows.length <= 20, `${rows.length} rows is more than a greedy all-pairs set needs`);
});

test('the same factors always give the same rows', () => {
  assert.deepEqual(allPairs(factors), allPairs(structuredClone(factors)));
});

test('small inputs degrade gracefully', () => {
  assert.deepEqual(allPairs([]), []);
  assert.deepEqual(allPairs([{ name: 'a', values: [1, 2] }]), [{ a: 1 }, { a: 2 }]);
  const two = [
    { name: 'a', values: [1, 2] },
    { name: 'b', values: ['x', 'y', 'z'] },
  ];
  assert.equal(allPairs(two).length, 6, 'two factors: all pairs is the product');
  assert.deepEqual(missingPairs(two, allPairs(two)), []);
});

test('missingPairs reports an incomplete set', () => {
  const two = [
    { name: 'a', values: [1, 2] },
    { name: 'b', values: ['x'] },
  ];
  assert.deepEqual(missingPairs(two, [{ a: 1, b: 'x' }]), [['a', 2, 'b', 'x']]);
});

test('input beyond the documented bound is refused', () => {
  const many = Array.from({ length: PAIRWISE_LIMITS.factors + 1 }, (_, i) => ({
    name: `f${i}`,
    values: [0, 1],
  }));
  assert.throws(() => allPairs(many), RangeError);
  const wide = [
    { name: 'f', values: Array.from({ length: PAIRWISE_LIMITS.levels + 1 }, (_, i) => i) },
  ];
  assert.throws(() => allPairs(wide), RangeError);
  assert.throws(() => allPairs([{ name: 'f', values: [] }]), /no values/);
  assert.throws(
    () =>
      allPairs([
        { name: 'f', values: [1] },
        { name: 'f', values: [2] },
      ]),
    /duplicate/,
  );
});
