// Fixture: the core fixtures open the request context every client is built on. The spec rule
// does not apply outside specs.
import { test as base } from '@playwright/test';

export const test = base.extend<{ api: unknown }>({
  api: async ({ playwright }, use) => {
    const context = await playwright.request.newContext();
    await use(context);
    await context.dispose();
  },
});
