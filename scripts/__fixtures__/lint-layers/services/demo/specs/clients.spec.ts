// Fixture: a spec that drives the API through its clients only. Names that look like a raw
// request - a body called request, a client method called fetch, a local fetch, a request
// property on data - are not one, and nothing here is a finding.
import { test, expect } from '../fixtures';
import { caseDescription } from '../../../helpers/case-meta';
import { aPet } from '../builders/pet';

test('TC-DEMO-10 creates through the client @regression', async ({ pets, faker }) => {
  await caseDescription('A body built by a builder, sent by the pets client.');
  const request = aPet(faker).build();
  const response = await pets.create(request);
  expect(response.status()).toBe(200);
  expect((await pets.fetch(request.id)).status()).toBe(200);
});

test('TC-DEMO-11 a fetch the file declares is not the global one @regression', async ({ pets }) => {
  const fetch = (id: number) => pets.read(id);
  expect((await fetch(1)).status()).toBe(200);
});

test('TC-DEMO-12 data with a request field is not the fixture @regression', async ({ pets }) => {
  const { request } = { request: { id: 1 } };
  const context = { request: { newContext: () => 'not a context' } };
  expect((await pets.read(request.id)).status()).toBe(200);
  expect(context.request).toBeDefined();
});
