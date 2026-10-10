// The execution-tag taxonomy, defined here and nowhere else (L-07). `.claude/rules/tagging.md`
// explains when each tag applies; `lint-harness` (tag-taxonomy) reports any other tag, and a test
// keeps that rule's table and these lists equal.

/** Exactly one per designed case: which lane runs it. */
export const LAYER_TAGS = ['@smoke', '@sanity', '@regression'];

/** Zero or more per case: what kind of risk it covers, or how a lane treats it. */
export const CATEGORY_TAGS = [
  '@security',
  '@performance',
  '@data-integrity',
  '@contract-drift',
  '@known-gap',
  '@quarantine',
];

export const TAGS = [...LAYER_TAGS, ...CATEGORY_TAGS];

export const KNOWN_GAP_TAG = '@known-gap';
export const QUARANTINE_TAG = '@quarantine';
