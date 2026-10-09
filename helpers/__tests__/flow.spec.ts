import { test, expect, type APIResponse } from '@playwright/test';
import { expectStatus, step } from '../flow';

function fakeResponse(status: number, body: string): APIResponse {
  return { status: () => status, text: async () => body } as unknown as APIResponse;
}

test.describe('expectStatus', () => {
  test('returns the parsed body on an expected status', async () => {
    expect(await expectStatus(fakeResponse(201, '{"id":1}'), [200, 201], 'create')).toEqual({
      id: 1,
    });
  });

  test('returns undefined for an empty body', async () => {
    expect(await expectStatus(fakeResponse(204, ''), 204, 'delete')).toBeUndefined();
  });

  test('names the step and redacts the body on an unexpected status', async () => {
    const response = fakeResponse(401, '{"error":"denied","token":"abc"}');
    await expect(expectStatus(response, 200, 'create pet')).rejects.toThrow(
      'create pet: expected HTTP 200, got 401. Body: {"error":"denied","token":"***"}',
    );
  });
});

test('step runs its body and returns its value', async () => {
  expect(await step('compute', async () => 41 + 1)).toBe(42);
});
