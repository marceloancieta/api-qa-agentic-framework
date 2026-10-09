import { test, expect } from '@playwright/test';
import { clockFromEnv, manualClock, systemClock } from '../clock';
import { createRng, hashSeed, rootSeed, testSeed } from '../rng';

test.describe('rng', () => {
  test('the same seed gives the same sequence', () => {
    const a = createRng(7);
    const b = createRng(7);
    expect([a.next(), a.int(1, 6), a.pick(['x', 'y', 'z'])]).toEqual([
      b.next(),
      b.int(1, 6),
      b.pick(['x', 'y', 'z']),
    ]);
  });

  test('different seeds diverge', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  test('int stays within its inclusive bounds', () => {
    const rng = createRng(3);
    const seen = new Set(Array.from({ length: 500 }, () => rng.int(1, 3)));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  test('int and pick reject impossible requests', () => {
    expect(() => createRng(1).int(5, 1)).toThrow(/min <= max/);
    expect(() => createRng(1).pick([])).toThrow(/at least one/);
  });

  test('test seeds depend on the root and the title path only', () => {
    expect(testSeed('42', ['a', 'b'])).toBe(testSeed('42', ['a', 'b']));
    expect(testSeed('42', ['a', 'b'])).not.toBe(testSeed('43', ['a', 'b']));
    expect(testSeed('42', ['a', 'b'])).not.toBe(testSeed('42', ['ab']));
  });

  test('hashSeed is a known FNV-1a value', () => {
    expect(hashSeed('')).toBe(0x811c9dc5);
    expect(hashSeed('a')).toBe(0xe40c292c);
  });

  test('QA_SEED replays a run', () => {
    expect(rootSeed({ QA_SEED: ' 1234 ' })).toBe('1234');
    expect(rootSeed({})).toMatch(/^\d+$/);
  });
});

test.describe('clock', () => {
  test('a manual clock only moves when told to', () => {
    const clock = manualClock(new Date('2026-01-01T00:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    clock.advance(90_000);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:01:30.000Z');
    clock.set(new Date('2030-05-05T05:05:05Z'));
    expect(clock.epochMs()).toBe(Date.parse('2030-05-05T05:05:05Z'));
  });

  test('QA_CLOCK pins the clock; without it the system clock is used', () => {
    expect(clockFromEnv({ QA_CLOCK: '2026-02-03T04:05:06Z' }).now().toISOString()).toBe(
      '2026-02-03T04:05:06.000Z',
    );
    expect(clockFromEnv({})).toBe(systemClock);
  });

  test('an invalid QA_CLOCK fails by name', () => {
    expect(() => clockFromEnv({ QA_CLOCK: 'tomorrow' })).toThrow(/QA_CLOCK/);
  });
});
