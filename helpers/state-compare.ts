// Comparing two states of a resource (sent vs read back, before vs after) field by field. Every field
// belongs to a bucket, and the bucket decides what "same" means:
//   identity   - names the resource; must be equal.
//   business   - what the case is about; must be equal.
//   provenance - who/what wrote it (an audit field); only its shape is checked, never its value.
//   volatile   - timestamps, generated ids, counters; never compared for equality.
// A field missing from the model is reported as unclassified, so the model cannot silently fall
// behind the API. Generated ids are never asserted as literals: take them from the response that
// created the resource.

export type Bucket = 'identity' | 'business' | 'provenance' | 'volatile';

export interface FieldRule {
  bucket: Bucket;
  /** Applied to both sides before comparing (e.g. `normalize.instant` for date-times). */
  normalize?: (value: unknown) => unknown;
  /** Provenance only: whether a value has the expected shape. Default: present and not null. */
  shape?: (value: unknown) => boolean;
}

/** Dotted field paths (`category.name`) to a bucket or a full rule. Arrays are compared whole. */
export type FieldModel = Record<string, Bucket | FieldRule>;

export interface StateDifferences {
  identity: string[];
  business: string[];
  provenance: string[];
  unclassified: string[];
}

export const normalize = {
  /** A date-time as epoch milliseconds, so `...Z` and `...+00:00` compare equal. */
  instant: (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? value : ms;
  },
  /** Arrays compared as sets: order does not matter. */
  unordered: (value: unknown): unknown =>
    Array.isArray(value) ? [...value].map((item) => JSON.stringify(item)).sort() : value,
};

function rule(entry: Bucket | FieldRule): FieldRule {
  return typeof entry === 'string' ? { bucket: entry } : entry;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Leaf values by dotted path. Objects are walked; arrays and primitives are leaves. */
export function flatten(value: unknown, prefix = ''): Map<string, unknown> {
  const leaves = new Map<string, unknown>();
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
function ruleFor(model: FieldModel, path: string): FieldRule | null {
  for (let current = path; current; current = current.slice(0, current.lastIndexOf('.'))) {
    const entry = model[current];
    if (entry) return rule(entry);
    if (!current.includes('.')) break;
  }
  return null;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Field paths that differ between `expected` and `actual`, grouped by bucket. */
export function compareStates(
  expected: unknown,
  actual: unknown,
  model: FieldModel,
): StateDifferences {
  const result: StateDifferences = { identity: [], business: [], provenance: [], unclassified: [] };
  const left = flatten(expected);
  const right = flatten(actual);
  for (const path of new Set([...left.keys(), ...right.keys()])) {
    const fieldRule = ruleFor(model, path);
    if (!fieldRule) {
      result.unclassified.push(path);
      continue;
    }
    const { bucket } = fieldRule;
    if (bucket === 'volatile') continue;
    if (bucket === 'provenance') {
      const shape = fieldRule.shape ?? ((value: unknown) => value !== undefined && value !== null);
      if (right.has(path) && !shape(right.get(path))) result.provenance.push(path);
      continue;
    }
    const prepare = fieldRule.normalize ?? ((value: unknown) => value);
    if (!same(prepare(left.get(path)), prepare(right.get(path)))) result[bucket].push(path);
  }
  return result;
}

/** Identity and business fields that changed from `before` to `after` (volatile ones never count). */
export function changedFields(before: unknown, after: unknown, model: FieldModel): string[] {
  const { identity, business } = compareStates(before, after, model);
  return [...identity, ...business];
}

/** Throws, listing every difference by bucket, unless the two states are the same resource state. */
export function expectSameState(expected: unknown, actual: unknown, model: FieldModel): void {
  const differences = compareStates(expected, actual, model);
  const lines = (Object.entries(differences) as [keyof StateDifferences, string[]][])
    .filter(([, paths]) => paths.length > 0)
    .map(([bucket, paths]) => `  ${bucket}: ${paths.join(', ')}`);
  if (lines.length > 0) throw new Error(`States differ:\n${lines.join('\n')}`);
}

/** Throws unless the only identity/business fields that changed are exactly `intended`. */
export function expectOnlyChanged(
  before: unknown,
  after: unknown,
  model: FieldModel,
  intended: readonly string[],
): void {
  const changed = changedFields(before, after, model);
  const unexpected = changed.filter(
    (path) => !intended.some((i) => path === i || path.startsWith(`${i}.`)),
  );
  const missing = intended.filter(
    (i) => !changed.some((path) => path === i || path.startsWith(`${i}.`)),
  );
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `Unexpected change set. Changed but not intended: ${unexpected.join(', ') || '(none)'}. ` +
        `Intended but unchanged: ${missing.join(', ') || '(none)'}.`,
    );
  }
}

export interface Inventory {
  before: number;
  after: number;
  added: string[];
  removed: string[];
}

/** Related resources (a pet's orders, a user's keys) compared by count and by identity. */
export function compareInventory<T>(
  before: readonly T[],
  after: readonly T[],
  key: (item: T) => string,
): Inventory {
  const was = new Set(before.map(key));
  const now = new Set(after.map(key));
  return {
    before: before.length,
    after: after.length,
    added: [...now].filter((id) => !was.has(id)),
    removed: [...was].filter((id) => !now.has(id)),
  };
}
