// Types for scripts/lib/state-compare.mjs.

export type Bucket = 'identity' | 'business' | 'provenance' | 'volatile';

export type NormalizerName = 'instant' | 'unordered';

export interface FieldRule {
  bucket: Bucket;
  /** Applied to both sides before comparing: a function, or the name of one in `normalize`. */
  normalize?: ((value: unknown) => unknown) | NormalizerName;
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

export const normalize: Record<NormalizerName, (value: unknown) => unknown>;
export const BUCKETS: readonly Bucket[];
export function flatten(value: unknown, prefix?: string): Map<string, unknown>;
export function compareStates(
  expected: unknown,
  actual: unknown,
  model: FieldModel,
  options?: { fallback?: Bucket | FieldRule },
): StateDifferences;
