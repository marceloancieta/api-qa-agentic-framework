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
  '@destructive',
];

export const TAGS = [...LAYER_TAGS, ...CATEGORY_TAGS];

export const KNOWN_GAP_TAG = '@known-gap';
export const QUARANTINE_TAG = '@quarantine';
export const DESTRUCTIVE_TAG = '@destructive';

// ---------------------------------------------------------------------------------------------
// The tags every run leaves out

/**
 * Set to `1` by the destructive lane only (scripts/destructive-lane.mjs): the run selects the
 * `@destructive` cases instead of leaving them out.
 */
export const DESTRUCTIVE_LANE_ENV = 'QA_DESTRUCTIVE';

/**
 * Set to `1` by the flake lane only (scripts/flake-lane.mjs): the run keeps the `@quarantine` cases,
 * which every other run leaves out, so the lane can tell whether their fix holds.
 */
export const FLAKE_LANE_ENV = 'QA_INCLUDE_QUARANTINE';

// A tag in Playwright's grep title (the title path, then the tags), not the start of a longer word.
const anyTag = (tags) => new RegExp(`(?:${tags.join('|')})(?![\\w-])`);

/**
 * The `grep` and `grepInvert` of every `api-<pack>` project in playwright.config.ts, from the
 * environment of the run. Every run leaves out `@destructive` cases (they break the service for
 * every other caller, L-59) and `@quarantine` cases (confirmed flaky, so their verdict means
 * nothing until the linked fix lands). The destructive lane selects the destructive cases instead,
 * and the flake lane keeps the quarantined ones; a quarantined destructive case runs in neither.
 * A command-line `--grep` or `--grep-invert` narrows this selection further, never widens it.
 */
export function projectTagFilter(env = process.env) {
  const destructiveLane = env[DESTRUCTIVE_LANE_ENV] === '1';
  const flakeLane = env[FLAKE_LANE_ENV] === '1';
  const leftOut = [
    ...(destructiveLane ? [] : [DESTRUCTIVE_TAG]),
    ...(flakeLane ? [] : [QUARANTINE_TAG]),
  ];
  return {
    ...(destructiveLane ? { grep: anyTag([DESTRUCTIVE_TAG]) } : {}),
    ...(leftOut.length > 0 ? { grepInvert: anyTag(leftOut) } : {}),
  };
}
