import { test, expect } from '@playwright/test';
import { MASK, redact, redactUrl } from '../redact';

test.describe('redact', () => {
  test('masks sensitive keys at any depth and keeps the rest', () => {
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

  test('masks extra keys case-insensitively', () => {
    expect(redact({ 'X-Client': 'c', other: 1 }, ['x-client'])).toEqual({
      'X-Client': MASK,
      other: 1,
    });
  });

  test('does not modify its input', () => {
    const input = { token: 't' };
    redact(input);
    expect(input).toEqual({ token: 't' });
  });

  test('passes primitives through', () => {
    expect(redact('text')).toBe('text');
    expect(redact(null)).toBeNull();
  });
});

test.describe('redactUrl', () => {
  test('masks sensitive query values only', () => {
    const masked = redactUrl('http://h/p?api_key=k&status=sold&sig=s', ['sig']);
    const params = new URL(masked).searchParams;
    expect(params.get('api_key')).toBe(MASK);
    expect(params.get('sig')).toBe(MASK);
    expect(params.get('status')).toBe('sold');
  });

  test('returns unparseable input unchanged', () => {
    expect(redactUrl('not a url')).toBe('not a url');
  });
});
