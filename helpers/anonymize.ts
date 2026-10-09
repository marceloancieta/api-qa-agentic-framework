// Anonymization for data captured from a real environment before it becomes a fixture or evidence.
// Each technique trades utility for privacy differently:
//   mask        - hide most of the value, keep its shape (last digits of a phone)
//   hash        - stable pseudonym; equal inputs stay equal, nothing is readable
//   substitute  - replace with a realistic fake (usually from the seeded faker)
//   generalize  - keep a coarser version (the year of a date, the domain of an email)
// Rules are keyed by field name and applied at any depth.

import { pseudonym } from './redact';

export type Anonymizer = (value: unknown) => unknown;

export function mask(keepLast = 0, char = '*'): Anonymizer {
  return (value) => {
    if (value === null || value === undefined) return value;
    const text = String(value);
    const kept = keepLast > 0 ? text.slice(-keepLast) : '';
    return char.repeat(Math.max(text.length - kept.length, 0)) + kept;
  };
}

export function hash(): Anonymizer {
  return (value) => (value === null || value === undefined ? value : pseudonym(value));
}

export function substitute(make: (original: unknown) => unknown): Anonymizer {
  return (value) => (value === null || value === undefined ? value : make(value));
}

export const generalize = {
  /** An ISO date-time cut to the given precision: `2026-10-09T13:00:00Z` -> `2026-10` for month. */
  date(precision: 'year' | 'month' | 'day'): Anonymizer {
    const length = { year: 4, month: 7, day: 10 }[precision];
    return (value) => (typeof value === 'string' ? value.slice(0, length) : value);
  },
  /** A number replaced by the bucket it falls in: 37 with size 10 -> "30-39". */
  number(size: number): Anonymizer {
    return (value) => {
      if (typeof value !== 'number') return value;
      const low = Math.floor(value / size) * size;
      return `${low}-${low + size - 1}`;
    };
  },
  /** Only the domain of an email address. */
  emailDomain(): Anonymizer {
    return (value) =>
      typeof value === 'string' && value.includes('@') ? `*@${value.split('@').pop()}` : value;
  },
};

/** A deep copy of `value` with each rule applied to every key of that name (case-insensitive). */
export function anonymize(value: unknown, rules: Record<string, Anonymizer>): unknown {
  const byName = new Map(Object.entries(rules).map(([key, rule]) => [key.toLowerCase(), rule]));
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;
    return Object.fromEntries(
      Object.entries(node).map(([key, child]) => {
        const rule = byName.get(key.toLowerCase());
        return [key, rule ? rule(child) : walk(child)];
      }),
    );
  };
  return walk(value);
}
