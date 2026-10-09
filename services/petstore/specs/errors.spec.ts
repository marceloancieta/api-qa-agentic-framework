// Error envelopes: each rejection is checked against the envelope kind the pack documents for it
// (error-envelopes.json). Petstore mentions the offending field only in its message text; the
// checks here stop at the kind and its shape and never read the wording.

import { test, expect } from '../fixtures';
import { expectErrorEnvelope } from '../../../helpers/error-envelope';
import { GENERATED_ID_MAX } from '../builders/pet-builder';

test.describe('Petstore error envelopes', { tag: '@negative' }, () => {
  test('a non-numeric pet id is rejected as an input error', async ({ pets, envelopes }) => {
    await expectErrorEnvelope(await pets.getById('abc'), envelopes, 'input-error');
  });

  test('a status outside the enum is rejected as an input error', async ({ pets, envelopes }) => {
    await expectErrorEnvelope(await pets.findByStatus('lost'), envelopes, 'input-error');
  });

  test('an unknown pet id answers not-found', async ({ pets, envelopes }) => {
    // Above every generated id, and never created by any case.
    const response = await pets.getById(GENERATED_ID_MAX + 1);
    const body = await expectErrorEnvelope(response, envelopes, 'not-found');
    expect(typeof body).toBe('string');
  });
});
