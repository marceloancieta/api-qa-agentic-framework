// Users: negative inputs, unknown ids and realms, and the measured departures from the contract
// (registry/users.md). Every username this file creates or sends starts with `qa-errors`, so the
// exact searches below never see another file's users (L-60). A refused write is followed by a read
// that shows nothing was created or changed. At the end, even when the case fails, a user a case
// created is removed by its id, and every username a case sent in a write that should not store a
// user is removed with `removeByUsername`, in case it was stored anyway. TC-USERS-34 reads the
// shared service-account users and changes nothing.

import { test, expect } from '../fixtures';
import { caseDescription, operation } from '../../../helpers/case-meta';
import { skipUnless } from '../../../helpers/data-gate';
import { expectErrorEnvelope } from '../../../helpers/error-envelope';
import { expectSameState } from '../../../helpers/state-compare';
import { REALM, UNKNOWN_ID, aUser, aUsername, unknownRealm } from '../builders/user-builder';
import { createUser, findByUsername, readUser, removeByUsername, removeUser } from '../flows/users';
import { USER_FIELDS } from '../state-models';
import type { NewUser, User } from '../types';

const AREA = 'Users';
const PREFIX = 'qa-errors';
const LIST = { method: 'GET', path: '/admin/realms/{realm}/users', area: AREA } as const;
const CREATE = { method: 'POST', path: '/admin/realms/{realm}/users', area: AREA } as const;
const COUNT = { method: 'GET', path: '/admin/realms/{realm}/users/count', area: AREA } as const;
const READ = { method: 'GET', path: '/admin/realms/{realm}/users/{user-id}', area: AREA } as const;
const UPDATE = {
  method: 'PUT',
  path: '/admin/realms/{realm}/users/{user-id}',
  area: AREA,
} as const;
const DELETE = {
  method: 'DELETE',
  path: '/admin/realms/{realm}/users/{user-id}',
  area: AREA,
} as const;
const INT32_OVERFLOW = 2 ** 31;
const SERVICE_ACCOUNT = 'service-account-';
const QA_SERVICE_ACCOUNT = 'service-account-qa-';
// The realm imports three service-account clients: admin, viewer and no-role (realm/qa-realm.json).
const QA_SERVICE_ACCOUNTS = 3;

/**
 * The id in the `Location` header of a create that answered `201`. TC-USERS-09 sends no username,
 * so `removeByUsername` cannot find what it might store; this id lets its cleanup remove a user
 * that a create expected to be refused stored anyway.
 */
const idCreatedBy = (status: number, location: string | undefined): string | undefined =>
  status === 201 ? location?.split('/').pop() : undefined;

test.describe('Users: errors and departures', () => {
  test('TC-USERS-04 Listing the users of an unknown realm answers not found @regression @contract-drift', async ({
    actor,
    faker,
    envelopes,
  }) => {
    await operation(LIST);
    await caseDescription(
      '`GET /admin/realms/<UNKNOWN_REALM>/users` as `admin`. The answer is `404` with the `error` ' +
        'envelope `Realm not found.` (M-11), a status the contract does not declare (KN-02).',
    );

    const admin = await actor('admin');
    const response = await admin.users.getAdminRealmsRealmUsers(unknownRealm(faker));
    expect(response.status()).toBe(404);
    const body = (await expectErrorEnvelope(response, envelopes, 'error')) as { error: string };
    expect(body.error).toBe('Realm not found.');
  });

  test('TC-USERS-05 A malformed integer in max or first answers not found, not bad request @regression @contract-drift probe:p-fe008810b6 probe:p-43dd928731', async ({
    actor,
    faker,
    envelopes,
  }) => {
    await operation(LIST);
    await caseDescription(
      '`GET /admin/realms/qa/users` as `admin` with `max=abc`, `first=1.5` and `max=<INT32_MAX+1>`, ' +
        'one step each. Each answers `404` with the `error` envelope `HTTP 404 Not Found`, where a ' +
        '`400` would be expected for a malformed parameter (KN-03, M-06). A negative `max` or ' +
        '`first` answers `200` (M-06); those two are filtered by an exact `<USERNAME>` no user has, ' +
        'so the answer is `[]`.',
    );

    const admin = await actor('admin');
    const malformed: Array<[string, Record<string, string | number>]> = [
      ['max=abc', { max: 'abc' }],
      ['first=1.5', { first: '1.5' }],
      ['max=<INT32_MAX+1>', { max: INT32_OVERFLOW }],
    ];
    for (const [label, params] of malformed) {
      await test.step(`Assert: ${label} answers 404, not 400`, async () => {
        const response = await admin.users.getAdminRealmsRealmUsers(REALM, { params });
        expect(response.status()).toBe(404);
        const body = (await expectErrorEnvelope(response, envelopes, 'error')) as {
          error: string;
        };
        expect(body.error).toBe('HTTP 404 Not Found');
      });
    }

    const nobody = aUsername(faker, PREFIX);
    for (const [label, params] of [
      ['max=-1', { max: -1 }],
      ['first=-1', { first: -1 }],
    ] as const) {
      await test.step(`Assert: ${label} is accepted with 200`, async () => {
        const response = await admin.users.getAdminRealmsRealmUsers(REALM, {
          params: { username: nobody, exact: true, ...params },
        });
        expect(response.status()).toBe(200);
        expect(await response.json()).toEqual([]);
      });
    }
  });

  test('TC-USERS-09 A user without a username is refused and none is created @regression', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation(CREATE);
    await caseDescription(
      '`POST /admin/realms/qa/users` as `admin` with a `firstName` and no `username`, then with ' +
        '`username: ""`. Each answers `400` with the `error-message` envelope (KN-07). An exact ' +
        '`firstName` search for the value sent then answers `[]`. The `firstName` is a unique ' +
        '`qa-errors` value, so no other user can match it.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const firstName = aUsername(faker, PREFIX);
    const withoutUsername: Partial<NewUser> = aUser(faker, { firstName }, PREFIX);
    delete withoutUsername.username;
    const bodies: Array<[string, Partial<NewUser>]> = [
      ['no username', withoutUsername],
      ['an empty username', { ...withoutUsername, username: '' }],
    ];
    const stored: string[] = [];
    try {
      for (const [label, data] of bodies) {
        await test.step(`Assert: ${label} is refused with 400`, async () => {
          const response = await admin.users.postAdminRealmsRealmUsers(REALM, { data });
          const id = idCreatedBy(response.status(), response.headers()['location']);
          if (id) stored.push(id);
          expect(response.status()).toBe(400);
          await expectErrorEnvelope(response, envelopes, 'error-message');
        });
      }

      await test.step('Assert: no user has the first name sent', async () => {
        const search = await admin.users.getAdminRealmsRealmUsers(REALM, {
          params: { firstName, exact: true },
        });
        expect(search.status()).toBe(200);
        expect(await search.json()).toEqual([]);
      });
    } finally {
      for (const id of stored) await removeUser(admin, id);
    }
  });

  test('TC-USERS-10 A field of the wrong type is refused and no user is created @regression', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation(CREATE);
    await caseDescription(
      '`POST /admin/realms/qa/users` as `admin` with `<USERNAME>` and `enabled: "yes"`, a string ' +
        'where `UserRepresentation` has a boolean. The contract declares `400`; the answer is ' +
        'unmeasured. The case expects `400` with the `error` envelope: the first run answered ' +
        '`{error, error_description}` from the JSON parser, not the `errorMessage` of a refused ' +
        'body (KN-07). An exact `username` search for `<USERNAME>` then answers `[]`.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const user = aUser(faker, {}, PREFIX);
    try {
      const response = await admin.users.postAdminRealmsRealmUsers(REALM, {
        data: { ...user, enabled: 'yes' },
      });
      expect(response.status()).toBe(400);
      await expectErrorEnvelope(response, envelopes, 'error');

      expect(await findByUsername(admin, user.username)).toEqual([]);
    } finally {
      await removeByUsername(admin, user.username);
    }
  });

  test('TC-USERS-11 Creating a user in an unknown realm answers not found @regression @contract-drift', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ ...CREATE, severity: 'minor' });
    await caseDescription(
      '`POST /admin/realms/<UNKNOWN_REALM>/users` as `admin` with `<USERNAME>`. The answer is `404` ' +
        'with the `error` envelope (M-11 for the read; unmeasured for the write), a status the ' +
        'contract does not declare (KN-02). An exact `username` search in `qa` answers `[]`.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const user = aUser(faker, {}, PREFIX);
    try {
      const response = await admin.users.postAdminRealmsRealmUsers(unknownRealm(faker), {
        data: user,
      });
      expect(response.status()).toBe(404);
      await expectErrorEnvelope(response, envelopes, 'error');

      expect(await findByUsername(admin, user.username)).toEqual([]);
    } finally {
      await removeByUsername(admin, user.username);
    }
  });

  test('TC-USERS-14 Counting the users of an unknown realm answers not found @regression @contract-drift', async ({
    actor,
    faker,
    envelopes,
  }) => {
    await operation({ ...COUNT, severity: 'minor' });
    await caseDescription(
      '`GET /admin/realms/<UNKNOWN_REALM>/users/count` as `admin`. The answer is `404` with the ' +
        '`error` envelope `Realm not found.` (M-11), a status the contract does not declare (KN-02).',
    );

    const admin = await actor('admin');
    const response = await admin.users.getAdminRealmsRealmUsersCount(unknownRealm(faker));
    expect(response.status()).toBe(404);
    const body = (await expectErrorEnvelope(response, envelopes, 'error')) as { error: string };
    expect(body.error).toBe('Realm not found.');
  });

  test('TC-USERS-16 An unknown user id answers not found @regression @contract-drift', async ({
    actor,
    envelopes,
  }) => {
    await operation(READ);
    await caseDescription(
      '`GET /admin/realms/qa/users/<UNKNOWN_ID>` as `admin`. The answer is `404` with the `error` ' +
        'envelope `User not found` (M-09), a status the contract does not declare (KN-02).',
    );

    const admin = await actor('admin');
    const response = await admin.users.getAdminRealmsRealmUsersUserId(REALM, UNKNOWN_ID);
    expect(response.status()).toBe(404);
    const body = (await expectErrorEnvelope(response, envelopes, 'error')) as { error: string };
    expect(body.error).toBe('User not found');
  });

  test('TC-USERS-18 A malformed user id answers not found @regression @contract-drift', async ({
    actor,
    envelopes,
  }) => {
    await operation({ ...READ, severity: 'minor' });
    await caseDescription(
      '`GET /admin/realms/qa/users/not-a-uuid` and `GET /admin/realms/qa/users/a%2Fb` as `admin`, ' +
        'one step each. The client percent-encodes the route parameter, so `a/b` travels as the ' +
        'single segment `a%2Fb`. Each answers `404` with the `error` envelope `User not found` ' +
        '(M-09), a status the contract does not declare (KN-02).',
    );

    const admin = await actor('admin');
    for (const [label, id] of [
      ['not-a-uuid', 'not-a-uuid'],
      ['a%2Fb', 'a/b'],
    ] as const) {
      await test.step(`Assert: ${label} answers 404 User not found`, async () => {
        const response = await admin.users.getAdminRealmsRealmUsersUserId(REALM, id);
        expect(response.status()).toBe(404);
        const body = (await expectErrorEnvelope(response, envelopes, 'error')) as {
          error: string;
        };
        expect(body.error).toBe('User not found');
      });
    }
  });

  test('TC-USERS-23 An update with a field of the wrong type is refused and the user is unchanged @regression @data-integrity', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation(UPDATE);
    await caseDescription(
      '`admin` creates `<USERNAME>` disabled and reads it back. `PUT /admin/realms/qa/users/<USER_ID>` as ' +
        '`admin` with that representation and `enabled: "yes"`, a string where the schema has a ' +
        'boolean. The contract declares `400`; the answer is unmeasured. The case expects `400` with ' +
        'the `error` envelope (the JSON parser refuses it, as in TC-USERS-10; not the `errorMessage` ' +
        'of KN-07), and a read-back equal to the representation before the request. The user is ' +
        'created with `enabled: false`, so an update that applied the value would show in the ' +
        'read-back.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const id = await createUser(admin, aUser(faker, { enabled: false }, PREFIX));
    try {
      const before: User = await readUser(admin, id);

      const response = await admin.users.putAdminRealmsRealmUsersUserId(REALM, id, {
        data: { ...before, enabled: 'yes' },
      });
      expect(response.status()).toBe(400);
      await expectErrorEnvelope(response, envelopes, 'error');

      expectSameState(before, await readUser(admin, id), USER_FIELDS);
    } finally {
      await removeUser(admin, id);
    }
  });

  test('TC-USERS-24 Updating an unknown user id answers not found @regression @contract-drift', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation(UPDATE);
    await caseDescription(
      '`PUT /admin/realms/qa/users/<UNKNOWN_ID>` as `admin` with a valid representation for ' +
        '`<USERNAME>`. The answer is `404` with the `error` envelope (KN-02; unmeasured for the ' +
        'write), and an exact `username` search for `<USERNAME>` answers `[]`: the update created ' +
        'no user.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const user = aUser(faker, {}, PREFIX);
    try {
      const response = await admin.users.putAdminRealmsRealmUsersUserId(REALM, UNKNOWN_ID, {
        data: user,
      });
      expect(response.status()).toBe(404);
      await expectErrorEnvelope(response, envelopes, 'error');

      expect(await findByUsername(admin, user.username)).toEqual([]);
    } finally {
      await removeByUsername(admin, user.username);
    }
  });

  test('TC-USERS-25 Updating a user in an unknown realm answers not found @regression @contract-drift', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ ...UPDATE, severity: 'minor' });
    await caseDescription(
      '`PUT /admin/realms/<UNKNOWN_REALM>/users/<UNKNOWN_ID>` as `admin` with a valid ' +
        'representation for `<USERNAME>`. The answer is `404` with the `error` envelope ' +
        '`Realm not found.` (M-11), so the realm is what was not found, not the user; a status the ' +
        'contract does not declare (KN-02; unmeasured for the write).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const user = aUser(faker, {}, PREFIX);
    try {
      const response = await admin.users.putAdminRealmsRealmUsersUserId(
        unknownRealm(faker),
        UNKNOWN_ID,
        { data: user },
      );
      expect(response.status()).toBe(404);
      const body = (await expectErrorEnvelope(response, envelopes, 'error')) as { error: string };
      expect(body.error).toBe('Realm not found.');
    } finally {
      await removeByUsername(admin, user.username);
    }
  });

  test('TC-USERS-30 Deleting an unknown user id answers not found @regression @contract-drift', async ({
    actor,
    qa,
    envelopes,
  }) => {
    await operation({ ...DELETE, severity: 'minor' });
    await caseDescription(
      '`DELETE /admin/realms/qa/users/<UNKNOWN_ID>` as `admin`. The answer is `404` with the ' +
        '`error` envelope, a status the contract does not declare for `DELETE` (KN-02; unmeasured).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const response = await admin.users.deleteAdminRealmsRealmUsersUserId(REALM, UNKNOWN_ID);
    expect(response.status()).toBe(404);
    await expectErrorEnvelope(response, envelopes, 'error');
  });

  test('TC-USERS-34 Service accounts are left out of the unfiltered list but found by username @regression @contract-drift', async ({
    actor,
    contract,
  }) => {
    await operation({ ...LIST, severity: 'minor' });
    await caseDescription(
      '`GET /admin/realms/qa/users?max=1000` and `GET /admin/realms/qa/users?username=' +
        'service-account-qa-&exact=false` as `admin`. Both answer `200` with an array of ' +
        '`UserRepresentation`. The list holds no user whose `username` starts with ' +
        '`service-account-`, while the search returns the three service accounts of the realm ' +
        '(KN-05). Read only: the service accounts are shared records. The count is not compared, ' +
        "since other cases' users can change it while this one runs.",
    );

    const admin = await actor('admin');
    await test.step('Assert: the unfiltered list leaves the service accounts out', async () => {
      const response = await admin.users.getAdminRealmsRealmUsers(REALM, {
        params: { max: 1000 },
      });
      expect(response.status()).toBe(200);
      const users = (await response.json()) as User[];
      for (const user of users) expect(user).toMatchSchema(contract, 'UserRepresentation');
      const serviceAccounts = users.filter((user) => user.username.startsWith(SERVICE_ACCOUNT));
      expect(serviceAccounts).toEqual([]);
    });

    await test.step('Assert: a username search finds the three service accounts', async () => {
      const response = await admin.users.getAdminRealmsRealmUsers(REALM, {
        params: { username: QA_SERVICE_ACCOUNT, exact: false },
      });
      expect(response.status()).toBe(200);
      const users = (await response.json()) as User[];
      for (const user of users) expect(user).toMatchSchema(contract, 'UserRepresentation');
      expect(users).toHaveLength(QA_SERVICE_ACCOUNTS);
      for (const user of users) expect(user.username.startsWith(QA_SERVICE_ACCOUNT)).toBe(true);
    });
  });
});
