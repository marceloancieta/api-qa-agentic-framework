// Time as a dependency. Code that needs "now" (dates in payloads, deadlines) asks a Clock, so a test
// can pin it with QA_CLOCK or move it explicitly instead of depending on when it happens to run.

export const CLOCK_VARIABLE = 'QA_CLOCK';

export interface Clock {
  now(): Date;
  /** Milliseconds since the epoch, like `Date.now()`. */
  epochMs(): number;
}

export interface ManualClock extends Clock {
  /** Move the clock forward (or back, with a negative value). Nothing waits: time is only a value. */
  advance(ms: number): void;
  set(at: Date): void;
}

export const systemClock: Clock = {
  now: () => new Date(),
  epochMs: () => Date.now(),
};

export function manualClock(start: Date): ManualClock {
  let current = start.getTime();
  return {
    now: () => new Date(current),
    epochMs: () => current,
    advance: (ms) => {
      current += ms;
    },
    set: (at) => {
      current = at.getTime();
    },
  };
}

/** A manual clock pinned to QA_CLOCK (ISO 8601) when it is set, the system clock otherwise. */
export function clockFromEnv(env: NodeJS.ProcessEnv = process.env): Clock {
  const pinned = env[CLOCK_VARIABLE]?.trim();
  if (!pinned) return systemClock;
  const at = new Date(pinned);
  if (Number.isNaN(at.getTime())) {
    throw new Error(`${CLOCK_VARIABLE} must be an ISO 8601 date-time, got "${pinned}".`);
  }
  return manualClock(at);
}
