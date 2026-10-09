import { test, expect, type APIResponse } from '@playwright/test';
import {
  checkErrorEnvelope,
  expectErrorEnvelope,
  valuesAt,
  type EnvelopeCatalog,
  type EnvelopeKind,
} from '../error-envelope';

const validation: EnvelopeKind = {
  description: 'framework validation',
  status: [400, 422],
  content_type: 'application/problem+json',
  schema: {
    type: 'object',
    required: ['title', 'errors'],
    properties: { errors: { type: 'array', items: { type: 'object', required: ['field'] } } },
  },
  field_paths: ['errors[].field', 'param'],
};

const ok = {
  status: 422,
  contentType: 'application/problem+json; charset=utf-8',
  body: { title: 'Invalid', errors: [{ field: 'body.photo_urls' }, { field: 'name' }] },
};

test.describe('checkErrorEnvelope', () => {
  test('accepts a matching envelope and a field under another spelling', () => {
    expect(checkErrorEnvelope(ok, validation, 'photoUrls')).toEqual({ shape: [], meaning: [] });
  });

  test('reports shape problems separately from meaning problems', () => {
    const result = checkErrorEnvelope(
      { status: 500, contentType: 'text/html', body: '<h1>oops</h1>' },
      validation,
      'name',
    );
    expect(result.shape).toEqual([
      'status 500, expected 400 or 422',
      'content type "text/html", expected "application/problem+json"',
      'body (root) must be object',
    ]);
    expect(result.meaning).toEqual(['field "name" not reported; reported: []']);
  });

  test('a field is never matched against message text', () => {
    const body = { title: 'name is required', errors: [{ field: 'status' }] };
    expect(checkErrorEnvelope({ ...ok, body }, validation, 'name').meaning).toHaveLength(1);
  });

  test('an envelope without field keys refuses a field assertion with a reason', () => {
    const kind = { ...validation, field_paths: [] };
    expect(checkErrorEnvelope(ok, kind, 'name').meaning[0]).toMatch(/does not report which field/);
  });
});

test('valuesAt follows objects and arrays', () => {
  expect(valuesAt({ a: { b: 1 } }, 'a.b')).toEqual([1]);
  expect(valuesAt({ e: [{ f: 'x' }, { f: 'y' }, {}] }, 'e[].f')).toEqual(['x', 'y']);
  expect(valuesAt({ e: 'not a list' }, 'e[].f')).toEqual([]);
});

test.describe('expectErrorEnvelope', () => {
  const catalog: EnvelopeCatalog = { envelopes: { validation } };
  const response = (status: number, contentType: string, body: string) =>
    ({
      status: () => status,
      headers: () => ({ 'content-type': contentType }),
      text: async () => body,
    }) as unknown as APIResponse;

  test('returns the parsed body when the envelope matches', async () => {
    const body = await expectErrorEnvelope(
      response(400, 'application/problem+json', JSON.stringify(ok.body)),
      catalog,
      'validation',
      { field: 'name' },
    );
    expect(body).toEqual(ok.body);
  });

  test('lists every problem in one error', async () => {
    await expect(
      expectErrorEnvelope(response(404, 'text/plain', 'gone'), catalog, 'validation'),
    ).rejects.toThrow(/not a "validation" error envelope:\n {2}shape: status 404/);
  });

  test('an unknown kind fails and lists the known ones', async () => {
    await expect(expectErrorEnvelope(response(400, '', ''), catalog, 'auth')).rejects.toThrow(
      /Known: validation/,
    );
  });
});
