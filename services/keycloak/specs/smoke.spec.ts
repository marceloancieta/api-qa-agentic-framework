// Smoke: every GET that needs no parameter answers one of its declared success statuses. Generated
// by scaffold-service as a first check of configuration and auth; designed cases replace it.

import { test, expect } from '../fixtures';

test.describe('Keycloak Admin REST API smoke', { tag: '@smoke' }, () => {
  test('GET /admin/realms answers a declared success status', async ({ realmsAdmin }) => {
    const response = await realmsAdmin.getAdminRealms();
    expect([200]).toContain(response.status());
  });
});
