import { test, expect } from '@playwright/test';
import { anonymize, generalize, hash, mask, substitute } from '../anonymize';
import { pseudonym } from '../redact';

test.describe('anonymizers', () => {
  test('mask keeps the shape and the last characters', () => {
    expect(mask(4)('5551234567')).toBe('******4567');
    expect(mask()('abc')).toBe('***');
    expect(mask(10)('ab')).toBe('ab');
  });

  test('hash is the run pseudonym', () => {
    expect(hash()('x')).toBe(pseudonym('x'));
  });

  test('substitute replaces with the generated value', () => {
    expect(substitute(() => 'Jane Doe')('Real Name')).toBe('Jane Doe');
  });

  test('generalize keeps a coarser value', () => {
    expect(generalize.date('month')('2026-10-09T13:00:00Z')).toBe('2026-10');
    expect(generalize.number(10)(37)).toBe('30-39');
    expect(generalize.emailDomain()('ana@example.org')).toBe('*@example.org');
  });

  test('null and undefined pass through every technique', () => {
    for (const technique of [mask(2), hash(), substitute(() => 'x')]) {
      expect(technique(null)).toBeNull();
      expect(technique(undefined)).toBeUndefined();
    }
  });
});

test('anonymize applies rules by field name at any depth', () => {
  const captured = {
    user: { Email: 'ana@example.org', phone: '5551234567', city: 'Lima' },
    orders: [{ shipDate: '2026-10-09T13:00:00Z', quantity: 2 }],
  };
  expect(
    anonymize(captured, {
      email: generalize.emailDomain(),
      phone: mask(2),
      shipdate: generalize.date('day'),
    }),
  ).toEqual({
    user: { Email: '*@example.org', phone: '********67', city: 'Lima' },
    orders: [{ shipDate: '2026-10-09', quantity: 2 }],
  });
});
