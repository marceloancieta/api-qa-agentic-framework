// Fixture: pack fixtures build clients from the request fixture; pack code is neither core nor a
// spec, so neither rule applies.
import { test as base } from '../../fixtures';
import { BaseClient } from '../../helpers/base-client';

export const test = base.extend<{ pets: BaseClient }>({
  pets: async ({ request }, use) => {
    await use(new BaseClient(request));
  },
});
