import { test, expect } from '@playwright/test';
import { MASK, pseudonym, redact, redactUrl } from '../redact';

test.describe('redact', () => {
  test('masks secret keys at any depth and keeps the rest', () => {
    const input = {
      name: 'rex',
      password: 'p',
      nested: { Authorization: 'Bearer x', list: [{ api_key: 'k', id: 1 }] },
    };
    expect(redact(input)).toEqual({
      name: 'rex',
      password: MASK,
      nested: { Authorization: MASK, list: [{ api_key: MASK, id: 1 }] },
    });
  });

  test('masks extra secret keys case-insensitively', () => {
    expect(redact({ 'X-Client': 'c', other: 1 }, { secretKeys: ['x-client'] })).toEqual({
      'X-Client': MASK,
      other: 1,
    });
  });

  test('pseudonymizes identity fields, stable within a run', () => {
    const policy = { identityFields: ['email', 'phone'] };
    const out = redact(
      { email: 'a@b.c', phone: 5551234, other: { email: 'a@b.c' }, name: 'x' },
      policy,
    ) as Record<string, unknown>;
    expect(out.email).toMatch(/^anon:[0-9a-f]{12}$/);
    expect(out.email).not.toContain('a@b.c');
    expect((out.other as Record<string, unknown>).email).toBe(out.email);
    expect(out.phone).toBe(pseudonym(5551234));
    expect(out.name).toBe('x');
  });

  test('an identity field holding a list pseudonymizes every item; null stays null', () => {
    const out = redact(
      { emails: ['a', 'b'], email: null },
      { identityFields: ['emails', 'email'] },
    );
    expect(out).toEqual({ emails: [pseudonym('a'), pseudonym('b')], email: null });
  });

  test('a secret wins over an identity field of the same name', () => {
    expect(redact({ token: 't' }, { identityFields: ['token'] })).toEqual({ token: MASK });
  });

  test('does not modify its input and passes primitives through', () => {
    const input = { token: 't' };
    redact(input);
    expect(input).toEqual({ token: 't' });
    expect(redact('text')).toBe('text');
    expect(redact(null)).toBeNull();
  });
});

test.describe('redactUrl', () => {
  test('masks secret query values and pseudonymizes identity ones', () => {
    const masked = redactUrl('http://h/p?api_key=k&status=sold&sig=s&email=a@b.c', {
      secretKeys: ['sig'],
      identityFields: ['email'],
    });
    const params = new URL(masked).searchParams;
    expect(params.get('api_key')).toBe(MASK);
    expect(params.get('sig')).toBe(MASK);
    expect(params.get('email')).toBe(pseudonym('a@b.c'));
    expect(params.get('status')).toBe('sold');
  });

  test('returns unparseable input unchanged', () => {
    expect(redactUrl('not a url')).toBe('not a url');
  });
});
