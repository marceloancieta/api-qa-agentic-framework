// All-pairs (pairwise) combination design, ISTQB black-box technique (ADR 0007). When an operation
// has several independent factors with a few values each (enum or boolean parameters, optional ones
// that may also be left out), the full product grows multiplicatively while most interaction faults
// involve only two factors. A set of rows in which every value pair of every two factors appears at
// least once keeps that detection power at a fraction of the cost.
//
// The generator is greedy and has no randomness, so the same factors always give the same rows:
//   1. factors are visited from the most to the fewest values (ties keep the given order), which
//      tends to give fewer rows;
//   2. each new row starts from the first pair not yet covered, then fills every other factor with
//      the value that covers the most still-uncovered pairs against the factors already set (ties
//      go to the earlier value);
//   3. it stops when every pair is covered.
// Every row covers at least its seed pair, so the row count never exceeds the number of pairs; in
// practice it stays close to the product of the two largest value counts.
//
// Bound: at most PAIRWISE_LIMITS.factors factors with at most PAIRWISE_LIMITS.levels values each.
// Larger input throws; callers trim their factors first and record what they left out.

export const PAIRWISE_LIMITS = Object.freeze({ factors: 12, levels: 8 });

function validate(factors) {
  if (!Array.isArray(factors)) throw new TypeError('factors must be an array');
  if (factors.length > PAIRWISE_LIMITS.factors) {
    throw new RangeError(
      `pairwise accepts at most ${PAIRWISE_LIMITS.factors} factors (got ${factors.length})`,
    );
  }
  const names = new Set();
  for (const factor of factors) {
    if (typeof factor?.name !== 'string' || !Array.isArray(factor.values)) {
      throw new TypeError('each factor needs a name and a values array');
    }
    if (names.has(factor.name)) throw new Error(`duplicate factor "${factor.name}"`);
    names.add(factor.name);
    if (factor.values.length === 0) throw new Error(`factor "${factor.name}" has no values`);
    if (factor.values.length > PAIRWISE_LIMITS.levels) {
      throw new RangeError(
        `factor "${factor.name}" has ${factor.values.length} values; the limit is ${PAIRWISE_LIMITS.levels}`,
      );
    }
  }
}

// Pairs are kept as index tuples over the visiting order: `${a}.${x}|${b}.${y}` with a < b.
const pairKey = (a, x, b, y) => (a < b ? `${a}.${x}|${b}.${y}` : `${b}.${y}|${a}.${x}`);

/**
 * Rows covering every value pair of every two factors.
 * @param {{ name: string, values: unknown[] }[]} factors
 * @returns {Record<string, unknown>[]} one object per row, keyed by factor name, in factor order
 */
export function allPairs(factors) {
  validate(factors);
  if (factors.length === 0) return [];
  if (factors.length === 1) return factors[0].values.map((value) => ({ [factors[0].name]: value }));

  const order = factors
    .map((factor, index) => ({ index, size: factor.values.length }))
    .sort((p, q) => q.size - p.size || p.index - q.index)
    .map((entry) => entry.index);
  const sizes = order.map((index) => factors[index].values.length);

  const uncovered = new Set();
  const pending = []; // the same pairs in a fixed order, for picking seeds
  for (let a = 0; a < sizes.length; a++) {
    for (let b = a + 1; b < sizes.length; b++) {
      for (let x = 0; x < sizes[a]; x++) {
        for (let y = 0; y < sizes[b]; y++) {
          const key = pairKey(a, x, b, y);
          uncovered.add(key);
          pending.push([a, x, b, y, key]);
        }
      }
    }
  }

  const rows = [];
  let cursor = 0;
  while (uncovered.size > 0) {
    while (!uncovered.has(pending[cursor][4])) cursor++;
    const [a, x, b, y] = pending[cursor];
    const row = new Array(sizes.length).fill(-1);
    row[a] = x;
    row[b] = y;
    for (let f = 0; f < sizes.length; f++) {
      if (row[f] !== -1) continue;
      let best = 0;
      let bestGain = -1;
      for (let v = 0; v < sizes[f]; v++) {
        let gain = 0;
        for (let g = 0; g < sizes.length; g++) {
          if (row[g] !== -1 && uncovered.has(pairKey(f, v, g, row[g]))) gain++;
        }
        if (gain > bestGain) {
          best = v;
          bestGain = gain;
        }
      }
      row[f] = best;
    }
    for (let f = 0; f < sizes.length; f++) {
      for (let g = f + 1; g < sizes.length; g++) uncovered.delete(pairKey(f, row[f], g, row[g]));
    }
    rows.push(row);
  }

  return rows.map((row) => {
    const out = {};
    for (const index of [...order.keys()].sort((p, q) => order[p] - order[q])) {
      const factor = factors[order[index]];
      out[factor.name] = factor.values[row[index]];
    }
    return out;
  });
}

/** The size of the full product, for comparing against the pairwise row count. */
export function fullProductSize(factors) {
  return factors.reduce((total, factor) => total * factor.values.length, factors.length ? 1 : 0);
}

/**
 * Value pairs that no row contains, as `[nameA, valueA, nameB, valueB]`; empty when the rows are a
 * complete all-pairs set. Values are compared by their JSON text.
 */
export function missingPairs(factors, rows) {
  const seen = new Set(
    rows.flatMap((row) =>
      factors.flatMap((p, i) =>
        factors.slice(i + 1).map((q) => JSON.stringify([p.name, row[p.name], q.name, row[q.name]])),
      ),
    ),
  );
  const missing = [];
  factors.forEach((p, i) => {
    for (const q of factors.slice(i + 1)) {
      for (const x of p.values) {
        for (const y of q.values) {
          if (!seen.has(JSON.stringify([p.name, x, q.name, y])))
            missing.push([p.name, x, q.name, y]);
        }
      }
    }
  });
  return missing;
}
