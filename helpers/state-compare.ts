// Comparing two states of a resource (sent vs read back, before vs after) field by field. Every field
// belongs to a bucket, and the bucket decides what "same" means:
//   identity   - names the resource; must be equal.
//   business   - what the case is about; must be equal.
//   provenance - who/what wrote it (an audit field); only its shape is checked, never its value.
//   volatile   - timestamps, generated ids, counters; never compared for equality.
// A field missing from the model is reported as unclassified, so the model cannot silently fall
// behind the API. Generated ids are never asserted as literals: take them from the response that
// created the resource.

import { compareStates, type FieldModel } from '../scripts/lib/state-compare.mjs';

// The comparison itself lives in scripts/lib/state-compare.mjs, so the differential lane, which
// runs in Node, compares with the same code as the specs.
export {
  compareStates,
  flatten,
  normalize,
  type Bucket,
  type FieldModel,
  type FieldRule,
  type StateDifferences,
} from '../scripts/lib/state-compare.mjs';

/** Identity and business fields that changed from `before` to `after` (volatile ones never count). */
export function changedFields(before: unknown, after: unknown, model: FieldModel): string[] {
  const { identity, business } = compareStates(before, after, model);
  return [...identity, ...business];
}

/** Throws, listing every difference by bucket, unless the two states are the same resource state. */
export function expectSameState(expected: unknown, actual: unknown, model: FieldModel): void {
  const differences = compareStates(expected, actual, model);
  const lines = Object.entries(differences)
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
