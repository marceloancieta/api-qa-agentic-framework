// Types for scripts/lib/tags.mjs.

export const LAYER_TAGS: string[];
export const CATEGORY_TAGS: string[];
export const TAGS: string[];
export const KNOWN_GAP_TAG: string;
export const QUARANTINE_TAG: string;
export const DESTRUCTIVE_TAG: string;
export const DESTRUCTIVE_LANE_ENV: string;
export const FLAKE_LANE_ENV: string;
export function projectTagFilter(env?: Record<string, string | undefined>): {
  grep?: RegExp;
  grepInvert?: RegExp;
};
