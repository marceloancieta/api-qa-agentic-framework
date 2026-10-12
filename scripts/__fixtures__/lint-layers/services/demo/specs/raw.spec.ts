// Fixture: a spec that sends requests without a client, once per shape.
import { test, expect, request } from '@playwright/test'; // expect-finding: spec-sends-request
import axios from 'axios'; // expect-finding: spec-sends-request
import { get } from 'node:https'; // expect-finding: spec-sends-request

test.beforeEach(async ({ request }) => void (await request.get('health'))); // expect-finding: spec-sends-request

test('TC-DEMO-01 uses the request fixture under another name @regression', async ({
  request: api, // expect-finding: spec-sends-request
}) => {
  expect((await api.get('pets/1')).status()).toBe(200);
});

test('TC-DEMO-02 calls the global fetch @regression', async () => {
  const response = await fetch('pets/1'); // expect-finding: spec-sends-request
  expect(response.status).toBe(200);
});

test('TC-DEMO-03 opens its own request context @regression', async ({ playwright }) => {
  const context = await playwright.request.newContext(); // expect-finding: spec-sends-request
  expect(context).toBeDefined();
});

test('TC-DEMO-04 the imported clients are used @regression', async () => {
  expect([request, axios, get]).toHaveLength(3);
});
