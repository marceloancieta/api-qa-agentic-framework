// Comparing two states of a resource field by field, by bucket (helpers/state-compare.ts explains
// the buckets). Plain JavaScript so the lanes, which run in Node without a TypeScript step, share
// the one implementation with the specs: helpers/state-compare.ts re-exports it with its types.

/** Normalizers, applied to both sides before comparing; a field rule names one or passes its own. */
export const normalize = {
  /** A date-time as epoch milliseconds, so `...Z` and `...+00:00` compare equal. */
  instant: (value) => {
    if (typeof value !== 'string') return value;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? value : ms;
  },
  /** Arrays compared as sets: order does not matter. */
  unordered: (value) =>
    Array.isArray(value) ? [...value].map((item) => JSON.stringify(item)).sort() : value,
};

export const BUCKETS = Object.freeze(['identity', 'business', 'provenance', 'volatile']);

/** A model entry as a full rule; a named normalizer becomes its function. */
function rule(entry) {
  const full = typeof entry === 'string' ? { bucket: entry } : { ...entry };
  if (typeof full.normalize === 'string') {
    const named = normalize[full.normalize];
    if (!named) {
      throw new Error(
        `unknown normalizer "${full.normalize}" (known: ${Object.keys(normalize).join(', ')})`,
      );
    }
    full.normalize = named;
  }
  return full;
}

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Leaf values by dotted path. Objects are walked; arrays and primitives are leaves. */
export function flatten(value, prefix = '') {
  const leaves = new Map();
  if (!isPlainObject(value)) {
    if (prefix) leaves.set(prefix, value);
    return leaves;
  }
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(child) && Object.keys(child).length > 0) {
      for (const [leaf, leafValue] of flatten(child, path)) leaves.set(leaf, leafValue);
    } else {
      leaves.set(path, child);
    }
  }
  return leaves;
}

// The model entry for a path: exact, else the closest classified parent (`category` covers `category.id`).
function ruleFor(model, path) {
  for (let current = path; current; current = current.slice(0, current.lastIndexOf('.'))) {
    const entry = model[current];
    if (entry) return rule(entry);
    if (!current.includes('.')) break;
  }
  return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Field paths that differ between `expected` and `actual`, grouped by bucket. A path the model
 * does not classify is listed under `unclassified`, unless `fallback` names the bucket it takes.
 */
export function compareStates(expected, actual, model, { fallback } = {}) {
  const result = { identity: [], business: [], provenance: [], unclassified: [] };
  const left = flatten(expected);
  const right = flatten(actual);
  for (const path of new Set([...left.keys(), ...right.keys()])) {
    const fieldRule = ruleFor(model, path) ?? (fallback ? rule(fallback) : null);
    if (!fieldRule) {
      result.unclassified.push(path);
      continue;
    }
    const { bucket } = fieldRule;
    if (bucket === 'volatile') continue;
    if (bucket === 'provenance') {
      const shape = fieldRule.shape ?? ((value) => value !== undefined && value !== null);
      if (right.has(path) && !shape(right.get(path))) result.provenance.push(path);
      continue;
    }
    const prepare = fieldRule.normalize ?? ((value) => value);
    if (!same(prepare(left.get(path)), prepare(right.get(path)))) result[bucket].push(path);
  }
  return result;
}
