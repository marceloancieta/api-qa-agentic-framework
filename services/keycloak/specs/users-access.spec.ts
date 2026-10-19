// Users access matrix (registry/users.md): function-level authorization (OWASP API5:2023). The reads
// are sent as `no-role` and the writes as `viewer` and `no-role`, without a token, across the realm
// boundary and with an expired token. Every refusal comes after a positive control (the same request
// as a client that may send it, or a read that proves the user exists), and every refused write is
// followed by a read as `admin` that shows nothing changed. Each case creates its own users under the
// `qa-access` prefix as `admin` and removes them in `finally`.

import { test, expect } from '../fixtures';
import { caseDescription, operation } from '../../../helpers/case-meta';
import { skipUnless } from '../../../helpers/data-gate';
import { expectErrorEnvelope } from '../../../helpers/error-envelope';
import { expectSameState } from '../../../helpers/state-compare';
import { REALM, aUser, aUsername } from '../builders/user-builder';
import { createUser, findByUsername, readUser, removeByUsername, removeUser } from '../flows/users';
import { USER_FIELDS } from '../state-models';
import type { Faker } from '@faker-js/faker';
import type { APIResponse } from '@playwright/test';

const AREA = 'Users';
const PREFIX = 'qa-access';
const USERS = { path: '/admin/realms/{realm}/users', area: AREA } as const;
const COUNT = { path: '/admin/realms/{realm}/users/count', area: AREA } as const;
const BY_ID = { path: '/admin/realms/{realm}/users/{user-id}', area: AREA } as const;
/** A realm other than the one the pack's clients belong to (R8). */
const OTHER_REALM = 'master';
/** The realm's access token lifetime is 60 seconds (R7); the stale token is resent after this. */
const TOKEN_AGE_MS = 65_000;

/** A first name the builder gave nobody in this case: differs from `current`. */
function anotherFirstName(faker: Faker, current: string | undefined): string {
  let name = faker.person.firstName();
  while (name === current) name = faker.person.firstName();
  return name;
}

test.describe('Users access', () => {
  test('TC-USERS-03 A client without a role cannot list users @regression @security', async ({
    actor,
    qa,
    faker,
    envelopes,
    contract,
  }) => {
    await operation({ method: 'GET', ...USERS, severity: 'critical' });
    await caseDescription(
      '`admin` creates `<USERNAME>`. `GET /admin/realms/qa/users?username=<USERNAME>&exact=true` ' +
        'as `viewer` answers `200` with exactly that user, a `UserRepresentation` (positive ' +
        'control); `GET /admin/realms/qa/users` as `no-role` answers `403` with the `error` ' +
        'envelope (spec declares `403`; M-02), so the refusal is about the role.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const user = aUser(faker, {}, PREFIX);
    try {
      const id = await createUser(admin, user);
      const viewer = await actor('viewer');
      const allowed = await viewer.users.getAdminRealmsRealmUsers(REALM, {
        params: { username: user.username, exact: true },
      });
      expect(allowed.status(), 'viewer lists the users').toBe(200);
      const listed = (await allowed.json()) as unknown[];
      expect(listed, 'the filter finds the created user').toHaveLength(1);
      expect(listed[0]).toMatchSchema(contract, 'UserRepresentation');
      expect((listed[0] as { id?: unknown }).id).toBe(id);

      const noRole = await actor('no-role');
      const refused = await noRole.users.getAdminRealmsRealmUsers(REALM);
      expect(refused.status()).toBe(403);
      await expectErrorEnvelope(refused, envelopes, 'error');
    } finally {
      await removeByUsername(admin, user.username);
    }
  });

  test('TC-USERS-07 A viewer cannot create a user, and none is created @regression @security @data-integrity', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'POST', ...USERS, severity: 'critical' });
    await caseDescription(
      '`POST /admin/realms/qa/users` as `viewer` with a valid body for `<USERNAME>` answers `403` ' +
        'with the `error` envelope (spec; A1). An exact `username` search for `<USERNAME>` as ' +
        '`admin` then answers `[]`. Positive control: `admin` sends the same body and gets `201`, ' +
        'so the refusal is about the role, not the body.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const viewer = await actor('viewer');
    const user = aUser(faker, {}, PREFIX);
    try {
      await test.step('Act', async () => {
        const response = await viewer.users.postAdminRealmsRealmUsers(REALM, { data: user });
        expect(response.status()).toBe(403);
        await expectErrorEnvelope(response, envelopes, 'error');
      });
      await test.step('Assert', async () => {
        expect(await findByUsername(admin, user.username), 'no user was created').toEqual([]);
        await createUser(admin, user);
      });
    } finally {
      // Every username the case sent in a create, so a refused create that stored a user anyway
      // leaves nothing behind.
      await removeByUsername(admin, user.username);
    }
  });

  test('TC-USERS-13 A client without a role cannot count users @regression @security', async ({
    actor,
    envelopes,
  }) => {
    await operation({ method: 'GET', ...COUNT, severity: 'critical' });
    await caseDescription(
      '`GET /admin/realms/qa/users/count` as `viewer` answers `200` with an integer (positive ' +
        'control); the same request as `no-role` answers `403` with the `error` envelope (spec; ' +
        'M-02).',
    );

    const viewer = await actor('viewer');
    const allowed = await viewer.users.getAdminRealmsRealmUsersCount(REALM);
    expect(allowed.status(), 'viewer counts the users').toBe(200);
    const count: unknown = await allowed.json();
    expect(Number.isInteger(count), 'the count is an integer').toBe(true);

    const noRole = await actor('no-role');
    const refused = await noRole.users.getAdminRealmsRealmUsersCount(REALM);
    expect(refused.status()).toBe(403);
    await expectErrorEnvelope(refused, envelopes, 'error');
  });

  test('TC-USERS-17 A client without a role cannot read an existing user @regression @security', async ({
    actor,
    qa,
    faker,
    envelopes,
    contract,
  }) => {
    await operation({ method: 'GET', ...BY_ID, severity: 'critical' });
    await caseDescription(
      '`admin` creates `<USERNAME>`. `GET /admin/realms/qa/users/<USER_ID>` as `viewer` answers ' +
        '`200` with that user (positive control: the user exists); as `no-role` it answers `403` ' +
        'with the `error` envelope (spec; M-10), and `<USERNAME>` appears nowhere in the body.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const user = aUser(faker, {}, PREFIX);
    const id = await createUser(admin, user);
    try {
      const viewer = await actor('viewer');
      const allowed = await viewer.users.getAdminRealmsRealmUsersUserId(REALM, id);
      expect(allowed.status(), 'viewer reads the user').toBe(200);
      const read: unknown = await allowed.json();
      expect(read).toMatchSchema(contract, 'UserRepresentation');
      expect((read as { id?: unknown }).id).toBe(id);
      expect((read as { username?: unknown }).username).toBe(user.username);

      const noRole = await actor('no-role');
      const refused = await noRole.users.getAdminRealmsRealmUsersUserId(REALM, id);
      const text = await refused.text();
      expect(text.includes(user.username), 'the refusal names the user').toBe(false);
      expect(refused.status()).toBe(403);
      await expectErrorEnvelope(refused, envelopes, 'error');
    } finally {
      await removeUser(admin, id);
    }
  });

  test('TC-USERS-21 A viewer cannot update a user, and the user is unchanged @regression @security @data-integrity', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'PUT', ...BY_ID, severity: 'critical' });
    await caseDescription(
      '`admin` creates `<USERNAME>` with `firstName` `<FIRST_NAME>` and reads it (the user exists). ' +
        '`PUT /admin/realms/qa/users/<USER_ID>` as `viewer` with another `firstName` answers `403` ' +
        'with the `error` envelope (spec; A1). The read-back as `admin` still shows `<FIRST_NAME>` ' +
        'and equals the state before the request.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const user = aUser(faker, {}, PREFIX);
    const id = await createUser(admin, user);
    try {
      const before = await readUser(admin, id);
      expect(before.firstName, 'the user was created with its first name').toBe(user.firstName);
      const renamed = anotherFirstName(faker, user.firstName);

      await test.step('Act', async () => {
        const viewer = await actor('viewer');
        const response = await viewer.users.putAdminRealmsRealmUsersUserId(REALM, id, {
          data: { ...user, firstName: renamed },
        });
        expect(response.status()).toBe(403);
        await expectErrorEnvelope(response, envelopes, 'error');
      });
      await test.step('Assert', async () => {
        const after = await readUser(admin, id);
        expect(after.firstName).toBe(user.firstName);
        expectSameState(before, after, USER_FIELDS);
      });
    } finally {
      await removeUser(admin, id);
    }
  });

  test('TC-USERS-27 A viewer cannot delete a user, and the user still exists @regression @security @data-integrity', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'DELETE', ...BY_ID, severity: 'critical' });
    await caseDescription(
      '`admin` creates `<USERNAME>` and reads it (the user exists). ' +
        '`DELETE /admin/realms/qa/users/<USER_ID>` as `viewer` answers `403` with the `error` ' +
        'envelope (spec; A1). `GET /admin/realms/qa/users/<USER_ID>` as `admin` still answers `200` ' +
        'with the same user.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const id = await createUser(admin, aUser(faker, {}, PREFIX));
    try {
      const before = await readUser(admin, id);

      await test.step('Act', async () => {
        const viewer = await actor('viewer');
        const response = await viewer.users.deleteAdminRealmsRealmUsersUserId(REALM, id);
        expect(response.status()).toBe(403);
        await expectErrorEnvelope(response, envelopes, 'error');
      });
      await test.step('Assert', async () => {
        expectSameState(before, await readUser(admin, id), USER_FIELDS);
      });
    } finally {
      await removeUser(admin, id);
    }
  });

  test('TC-USERS-29 A client without a role cannot delete a user @regression @security @data-integrity', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'DELETE', ...BY_ID, severity: 'critical' });
    await caseDescription(
      '`admin` creates `<USERNAME>` and reads it (the user exists). ' +
        '`DELETE /admin/realms/qa/users/<USER_ID>` as `no-role` answers `403` with the `error` ' +
        'envelope (spec; A1). `GET /admin/realms/qa/users/<USER_ID>` as `admin` still answers `200` ' +
        'with the same user.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const id = await createUser(admin, aUser(faker, {}, PREFIX));
    try {
      const before = await readUser(admin, id);

      await test.step('Act', async () => {
        const noRole = await actor('no-role');
        const response = await noRole.users.deleteAdminRealmsRealmUsersUserId(REALM, id);
        expect(response.status()).toBe(403);
        await expectErrorEnvelope(response, envelopes, 'error');
      });
      await test.step('Assert', async () => {
        expectSameState(before, await readUser(admin, id), USER_FIELDS);
      });
    } finally {
      await removeUser(admin, id);
    }
  });

  test('TC-USERS-31 Every users operation refuses a request without a token @regression @security @contract-drift @data-integrity', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'GET', ...USERS, severity: 'critical' });
    await caseDescription(
      'The contract declares no security scheme and no `401` (KN-01, KN-02). `admin` creates ' +
        '`<USERNAME>` and reads it. Each of the six operations is then sent without a token, one ' +
        'step each: the list and the count filtered by `<USERNAME>`, a create of `<OTHER_USERNAME>`, ' +
        'the read, an update with another `firstName` and the delete of `<USER_ID>`. Each answers ' +
        '`401` with the `error` envelope `HTTP 401 Unauthorized` (M-01; A1 for the writes). The ' +
        'read-back as `admin` shows `<USERNAME>` unchanged, and an exact search for ' +
        '`<OTHER_USERNAME>` answers `[]`.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const anonymous = await actor('anonymous');
    const user = aUser(faker, {}, PREFIX);
    const other = aUser(faker, {}, PREFIX);
    const unauthorized = async (response: APIResponse): Promise<void> => {
      expect(response.status()).toBe(401);
      const body = await expectErrorEnvelope(response, envelopes, 'error');
      expect((body as { error?: unknown }).error).toBe('HTTP 401 Unauthorized');
    };
    try {
      const id = await createUser(admin, user);
      const before = await readUser(admin, id);
      const filter = { params: { username: user.username, exact: true } };

      await test.step('Assert: GET /users without a token', async () => {
        await unauthorized(await anonymous.users.getAdminRealmsRealmUsers(REALM, filter));
      });
      await test.step('Assert: POST /users without a token', async () => {
        await unauthorized(await anonymous.users.postAdminRealmsRealmUsers(REALM, { data: other }));
      });
      await test.step('Assert: GET /users/count without a token', async () => {
        await unauthorized(await anonymous.users.getAdminRealmsRealmUsersCount(REALM, filter));
      });
      await test.step('Assert: GET /users/{user-id} without a token', async () => {
        const response = await anonymous.users.getAdminRealmsRealmUsersUserId(REALM, id);
        const text = await response.text();
        expect(text.includes(user.username), 'the refusal names the user').toBe(false);
        await unauthorized(response);
      });
      await test.step('Assert: PUT /users/{user-id} without a token', async () => {
        const data = { ...user, firstName: anotherFirstName(faker, user.firstName) };
        await unauthorized(
          await anonymous.users.putAdminRealmsRealmUsersUserId(REALM, id, { data }),
        );
      });
      await test.step('Assert: DELETE /users/{user-id} without a token', async () => {
        await unauthorized(await anonymous.users.deleteAdminRealmsRealmUsersUserId(REALM, id));
      });
      await test.step('Assert', async () => {
        expectSameState(before, await readUser(admin, id), USER_FIELDS);
        expect(await findByUsername(admin, other.username), 'no user was created').toEqual([]);
      });
    } finally {
      // Every username the case sent in a create, so a refused create that stored a user anyway
      // leaves nothing behind.
      for (const sent of [user, other]) await removeByUsername(admin, sent.username);
    }
  });

  test('TC-USERS-32 A client of one realm cannot list the users of another @regression @security', async ({
    actor,
    qa,
    faker,
    envelopes,
    contract,
  }) => {
    await operation({ method: 'GET', ...USERS, severity: 'critical' });
    await caseDescription(
      'The realm boundary comes from the realm roles, not the contract (R8). `admin` creates ' +
        '`<USERNAME>`; `GET /admin/realms/qa/users?username=<USERNAME>&exact=true` as `admin` ' +
        'answers `200` with exactly that user, a `UserRepresentation` (positive control); ' +
        '`GET /admin/realms/master/users` as the same client answers `403` with the `error` ' +
        'envelope (M-11).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const user = aUser(faker, {}, PREFIX);
    try {
      const id = await createUser(admin, user);
      const own = await admin.users.getAdminRealmsRealmUsers(REALM, {
        params: { username: user.username, exact: true },
      });
      expect(own.status(), 'admin lists the users of its own realm').toBe(200);
      const listed = (await own.json()) as unknown[];
      expect(listed, 'the filter finds the created user').toHaveLength(1);
      expect(listed[0]).toMatchSchema(contract, 'UserRepresentation');
      expect((listed[0] as { id?: unknown }).id).toBe(id);

      const refused = await admin.users.getAdminRealmsRealmUsers(OTHER_REALM);
      expect(refused.status()).toBe(403);
      await expectErrorEnvelope(refused, envelopes, 'error');
    } finally {
      await removeByUsername(admin, user.username);
    }
  });

  test('TC-USERS-33 An expired token is refused and the strategy renews it @regression @security', async ({
    actor,
    bearerOf,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'GET', ...USERS, severity: 'normal' });
    await caseDescription(
      'The realm sets a token lifetime of 60 seconds (R7). `admin` takes its current token, waits ' +
        '65 seconds and sends `GET /admin/realms/qa/users?username=<USERNAME>&exact=true` with that ' +
        'token as its own `Authorization` header: `401` with the `error` envelope (M-12). The same ' +
        'request through the `admin` client answers `200` with `[]`, because its strategy renewed ' +
        'the token. The client never renews a token the caller set; sent right after it was taken, ' +
        'it answers `200`, so the later `401` is about its age.',
    );
    test.setTimeout(TOKEN_AGE_MS + 60_000);

    const admin = await actor('admin');
    const filter = { username: aUsername(faker, PREFIX), exact: true };
    const stale = await bearerOf('admin');

    await test.step('Assert: the fresh token is accepted', async () => {
      const response = await admin.users.getAdminRealmsRealmUsers(REALM, {
        params: filter,
        bearer: stale,
      });
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual([]);
    });
    await test.step('Arrange: wait until the token expires', async () => {
      await new Promise((resolve) => setTimeout(resolve, TOKEN_AGE_MS));
    });
    await test.step('Assert: the expired token is refused', async () => {
      const response = await admin.users.getAdminRealmsRealmUsers(REALM, {
        params: filter,
        bearer: stale,
      });
      expect(response.status()).toBe(401);
      await expectErrorEnvelope(response, envelopes, 'error');
    });
    await test.step('Assert: the admin client renews its token', async () => {
      const response = await admin.users.getAdminRealmsRealmUsers(REALM, { params: filter });
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual([]);
    });
  });
});
