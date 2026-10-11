// Destructive user case (registry/user.md, L-59). A user stored without a username makes every read
// of an unknown username answer 500 to every caller, and no API call can remove it (PN-19, LOCAL-1):
// only a restart of the service clears it. So this file holds only destructive cases: every other
// run leaves them out and `npm run lanes:destructive` runs each alone, followed by the environment's
// recovery (for the local Petstore, a container restart).

import { test, expect } from '../fixtures';
import { caseDescription, knownGap, operation } from '../../../helpers/case-meta';
import { skipUnless } from '../../../helpers/data-gate';
import { expectErrorEnvelope } from '../../../helpers/error-envelope';
import { unknownUsername } from '../builders/user-builder';

const AREA = 'user';

test('TC-USER-03 An empty object body is refused and stores nothing @regression @destructive @known-gap @data-integrity', async ({
  users,
  qa,
  faker,
  envelopes,
}) => {
  await operation({ method: 'POST', path: '/user', area: AREA });
  await caseDescription(
    '`POST /user` with `{}`, on a service where `GET /user/<UNKNOWN_USERNAME>` answers `404` ' +
      'first. The create is refused with `400` and the `input-error` envelope, and the unknown ' +
      'username still answers `404` with the `not-found` envelope. Today the empty body is stored ' +
      'as a nameless user and every unknown-name read answers `500` (PN-19, `LOCAL-1`). Recovery: ' +
      'restart the service, then confirm `<UNKNOWN_USERNAME>` answers `404`.',
  );
  skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);
  const unknown = unknownUsername(faker);
  await expectErrorEnvelope(await users.getByName(unknown), envelopes, 'not-found');

  test.fail(true, await knownGap('LOCAL-1', 'an empty body is stored as a nameless user'));
  await expect
    .soft(expectErrorEnvelope(await users.create({}), envelopes, 'input-error'))
    .resolves.toBeDefined();

  await expectErrorEnvelope(await users.getByName(unknown), envelopes, 'not-found');
});
