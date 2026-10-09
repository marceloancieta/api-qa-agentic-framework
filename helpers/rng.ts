// Seeded randomness. A run has one root seed (QA_SEED, printed by global setup); each test derives
// its own seed from the root and its title, so a failing case replays with the same data whatever
// order, worker or subset it runs in.

export const SEED_VARIABLE = 'QA_SEED';

/** 32-bit FNV-1a hash: turns a seed string into a PRNG state. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Rng {
  /** The seed this generator started from. */
  readonly seed: number;
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

/** A small, fast PRNG (mulberry32). Not for cryptography; only for reproducible test data. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    seed,
    next,
    int: (min, max) => {
      if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
        throw new Error(`rng.int needs integers with min <= max, got ${min} and ${max}.`);
      }
      return min + Math.floor(next() * (max - min + 1));
    },
    pick: (items) => {
      if (items.length === 0) throw new Error('rng.pick needs at least one item.');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
  };
}

/** The run's root seed: QA_SEED when set (to replay a run), otherwise a fresh one. */
export function rootSeed(env: NodeJS.ProcessEnv = process.env): string {
  const given = env[SEED_VARIABLE]?.trim();
  if (given) return given;
  return String(Math.floor(Math.random() * 1_000_000_000));
}

/** The seed of one test: stable for the same root seed and test title path. */
export function testSeed(root: string, titlePath: readonly string[]): number {
  return hashSeed(`${root}\u0000${titlePath.join('\u0000')}`);
}
