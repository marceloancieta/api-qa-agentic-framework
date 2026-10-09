// Fixture: assertions that cannot fail because they run only under their own condition.

import { test, expect } from '../fixtures';
import { expectSameState } from '../../../helpers/state-compare';
import { PET_FIELDS } from '../state-models';

test('guarded by the checked value', async ({ pets }) => {
  const body = await (await pets.getById(1)).json();
  if (body.name) {
    expect(body.name).toBe('Rex'); // expect-finding: optional-assertion
  }
  if (body.tags.length > 0) expect(body.tags[0].name).toBe('a'); // expect-finding: optional-assertion
});

test('guarded by the response status', async ({ pets }) => {
  const response = await pets.findByStatus('sold');
  if (response.ok()) {
    const list = await response.json();
    expect(list.length).toBeGreaterThan(0); // expect-finding: optional-assertion
  }
  if (response.status() === 200) expectSameState({}, {}, PET_FIELDS); // expect-finding: optional-assertion
});

test('early return before the check', async ({ pets }) => {
  const response = await pets.findByStatus('sold');
  if (!response.ok()) return;
  expect(await response.json()).toHaveLength(3); // expect-finding: optional-assertion
});

test('short-circuit and optional chaining', async ({ pets }) => {
  const body = await (await pets.getById(1)).json();
  body.category && expect(body.category.name).toBe('dogs'); // expect-finding: optional-assertion
  body.tags?.forEach((tag: { name: string }) => {
    expect(tag.name).toBeTruthy(); // expect-finding: optional-assertion
  });
});

test('assertion in a catch that nothing forces', async ({ pets }) => {
  try {
    await pets.getById('abc');
  } catch (error) {
    expect(String(error)).toContain('400'); // expect-finding: optional-assertion
  }
});

// Look-alikes that are correct.

test('both branches assert', async ({ pets }) => {
  const body = await (await pets.getById(1)).json();
  if (body.status === 'sold') {
    expect(body.name).toBeTruthy();
  } else {
    expect(body.status).toBe('available');
  }
});

test('condition unrelated to what is checked', async ({ pets, qa }) => {
  if (qa.allowWrites) {
    const response = await pets.findByStatus('pending');
    expect(response.status()).toBe(200);
  }
});

test('loop over a value already asserted', async ({ pets }) => {
  const response = await pets.findByStatus('sold');
  expect(response.status()).toBe(200);
  const list = await response.json();
  expect(list.length).toBeGreaterThan(0);
  for (const pet of list) expect(pet.status).toBe('sold');
});

test('catch that rethrows, and a try that forces the failure', async ({ pets }) => {
  try {
    await pets.getById('abc');
    throw new Error('expected the call to throw');
  } catch (error) {
    expect(String(error)).toContain('400');
  }
  await expect(pets.getById('abc')).rejects.toThrow();
});

test('optional chaining inside the checked value', async ({ pets }) => {
  const body = await (await pets.getById(1)).json();
  expect(body?.category?.name).toBe('dogs');
});
