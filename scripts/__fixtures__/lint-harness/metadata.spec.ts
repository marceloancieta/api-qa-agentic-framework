// Fixture: metadata written after something that can skip the case (metadata-after-skip).

import * as allure from 'allure-js-commons';
import { test, expect } from '../fixtures';
import { caseDescription, operation } from '../../../helpers/case-meta';
import { requireData, skipUnless } from '../../../helpers/data-gate';

test('TC-PET-01 metadata after skipUnless', async ({ pets, qa }) => {
  skipUnless(qa.allowWrites, 'read-only environment');
  await operation({ method: 'put', path: '/pet' }); // expect-finding: metadata-after-skip
  expect((await pets.findByStatus('sold')).status()).toBe(200);
});

test('TC-PET-02 metadata after a data gate', async ({ pets }) => {
  const pet = await requireData('a sold pet', async () => null);
  await caseDescription('Reads a sold pet.'); // expect-finding: metadata-after-skip
  await allure.severity('critical'); // expect-finding: metadata-after-skip
  expect(pet).toBeTruthy();
  expect((await pets.findByStatus('sold')).status()).toBe(200);
});

test('TC-PET-03 metadata after a conditional test.skip', async ({ pets, qa }) => {
  test.skip(qa.environment === 'prod', 'never on production');
  await allure.owner('qa'); // expect-finding: metadata-after-skip
  expect((await pets.findByStatus('sold')).status()).toBe(200);
});

test('TC-PET-04 metadata first, then the skip', async ({ pets, qa }) => {
  await operation({ method: 'get', path: '/pet/findByStatus', area: 'pet' });
  await caseDescription('Lists sold pets.');
  skipUnless(qa.allowWrites, 'read-only environment');
  expect((await pets.findByStatus('sold')).status()).toBe(200);
});

test('TC-PET-05 no skip at all', async ({ pets }) => {
  expect((await pets.findByStatus('sold')).status()).toBe(200);
  await allure.attachment('note', 'text', 'text/plain');
});

test.skip('TC-PET-06 a skipped declaration is not a skip call', async ({ pets }) => {
  await operation({ method: 'get', path: '/pet/findByStatus' });
  expect((await pets.findByStatus('sold')).status()).toBe(200);
});
