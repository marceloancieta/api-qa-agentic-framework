// Users: create, read, list, count, update and delete (registry/users.md). Every case creates its
// own users as `admin` under the `qa-crud` prefix and removes them in `finally`, by the ids the
// creates returned, whatever the case's result. Lists and counts are always filtered by the case's
// own username (or its own prefix, TC-USERS-02), never read unfiltered: other cases create users in
// the same realm at the same time (L-25, L-60). The writes were unmeasured at intake (A1 to A3 of
// the users contract): each case asserts what its registry row says.

import { test, expect } from '../fixtures';
import { caseDescription, operation } from '../../../helpers/case-meta';
import { skipUnless } from '../../../helpers/data-gate';
import { expectErrorEnvelope } from '../../../helpers/error-envelope';
import { expectOnlyChanged, expectSameState } from '../../../helpers/state-compare';
import { REALM, aUser, aUsername, withPasswordCredential } from '../builders/user-builder';
import {
  createUser,
  credentialTypes,
  findByUsername,
  readUser,
  removeByUsername,
  removeUser,
} from '../flows/users';
import { USER_FIELDS } from '../state-models';
import type { User } from '../types';

const AREA = 'users';
const PREFIX = 'qa-crud';
const USERS = { path: '/admin/realms/{realm}/users', area: AREA } as const;
const COUNT = { path: '/admin/realms/{realm}/users/count', area: AREA } as const;
const BY_ID = { path: '/admin/realms/{realm}/users/{user-id}', area: AREA } as const;

test.describe('Users CRUD', () => {
  test('TC-USERS-01 A user created by admin can be found by its exact username @smoke', async ({
    actor,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'GET', ...USERS, severity: 'critical' });
    await caseDescription(
      '`admin` creates `<USERNAME>`, then lists `GET /admin/realms/qa/users?username=<USERNAME>&exact=true`. ' +
        'The answer is `200`, an array of `UserRepresentation` with exactly one user, whose ' +
        '`username` is `<USERNAME>` and whose `id` is `<USER_ID>`, the one the create returned.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const ids: string[] = [];
    try {
      const user = aUser(faker, {}, PREFIX);
      ids.push(await createUser(admin, user));

      const response = await admin.users.getAdminRealmsRealmUsers(REALM, {
        params: { username: user.username, exact: true },
      });
      expect(response.status()).toBe(200);
      const body: unknown = await response.json();
      expect(Array.isArray(body)).toBe(true);
      for (const listed of body as unknown[])
        expect(listed).toMatchSchema(contract, 'UserRepresentation');
      const listed = body as User[];
      expect(listed).toHaveLength(1);
      expect(listed[0]!.username).toBe(user.username);
      expect(listed[0]!.id).toBe(ids[0]);
    } finally {
      for (const id of ids) await removeUser(admin, id);
    }
  });

  test('TC-USERS-02 The list pages with first and max over the users of one filter @regression', async ({
    actor,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'GET', ...USERS, severity: 'normal' });
    await caseDescription(
      '`admin` creates two users whose usernames share the unique prefix `<USERNAME>`, then lists ' +
        '`GET /admin/realms/qa/users?username=<USERNAME>&max=1`, then `&first=1&max=1`, then ' +
        '`&first=2&max=1`. Each answer is `200`: one user, the other user, then `[]`. The two pages ' +
        'together hold both created ids, each once (R2, R3).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const ids: string[] = [];
    try {
      // A prefix of the case's own: only its two users match the substring filter.
      const shared = aUsername(faker, PREFIX);
      ids.push(await createUser(admin, aUser(faker, {}, shared)));
      ids.push(await createUser(admin, aUser(faker, {}, shared)));

      const pages: User[][] = [];
      const windows: Record<string, number>[] = [
        { max: 1 },
        { first: 1, max: 1 },
        { first: 2, max: 1 },
      ];
      for (const window of windows) {
        const response = await admin.users.getAdminRealmsRealmUsers(REALM, {
          params: { username: shared, ...window },
        });
        expect(response.status(), `page ${JSON.stringify(window)}`).toBe(200);
        const body: unknown = await response.json();
        expect(Array.isArray(body)).toBe(true);
        for (const listed of body as unknown[])
          expect(listed).toMatchSchema(contract, 'UserRepresentation');
        pages.push(body as User[]);
      }

      expect(pages[0], 'first page').toHaveLength(1);
      expect(pages[1], 'second page').toHaveLength(1);
      expect(pages[2], 'third page, past the two users').toEqual([]);
      const paged = [...pages[0]!, ...pages[1]!].map((listed) => listed.id);
      expect(paged.sort()).toEqual([...ids].sort());
    } finally {
      for (const id of ids) await removeUser(admin, id);
    }
  });

  test('TC-USERS-06 Admin creates a user and reads it back by id @smoke @data-integrity', async ({
    actor,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'POST', ...USERS, severity: 'critical' });
    await caseDescription(
      '`POST /admin/realms/qa/users` as `admin` with `<USERNAME>`, `email`, `firstName`, ' +
        '`lastName` and `enabled: true` from the builder. The answer is `201`. The new id comes ' +
        'from the `Location` header or, when there is none, from an exact `username` search (A2, ' +
        'recorded as an annotation). `GET /admin/realms/qa/users/<USER_ID>` answers `200`, a ' +
        '`UserRepresentation` with every field sent.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const ids: string[] = [];
    const user = aUser(faker, {}, PREFIX);
    try {
      const created = await admin.users.postAdminRealmsRealmUsers(REALM, { data: user });
      const fromLocation = created.headers()['location']?.split('/').pop();
      if (fromLocation) ids.push(fromLocation);
      expect(created.status()).toBe(201);

      test.info().annotations.push({
        type: 'A2',
        description: fromLocation
          ? 'the 201 carries a Location header ending with the new id'
          : 'the 201 carries no Location header; the id comes from an exact username search',
      });
      const id = fromLocation ?? (await findByUsername(admin, user.username))[0]?.id;
      expect(id, 'the id of the created user').toBeTruthy();
      if (!fromLocation) ids.push(id!);

      const read = await admin.users.getAdminRealmsRealmUsersUserId(REALM, id!);
      expect(read.status()).toBe(200);
      const stored: unknown = await read.json();
      expect(stored).toMatchSchema(contract, 'UserRepresentation');
      expect(stored).toMatchObject({ ...user, id });
    } finally {
      for (const id of ids) await removeUser(admin, id);
      // A user stored with another status or without a Location header is still removed.
      await removeByUsername(admin, user.username);
    }
  });

  test('TC-USERS-08 A second user with the same username is refused and the first is unchanged @regression @data-integrity', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'POST', ...USERS, severity: 'critical' });
    await caseDescription(
      '`admin` creates `<USERNAME>` with `firstName` `<FIRST_NAME>`, then sends ' +
        '`POST /admin/realms/qa/users` again with `<USERNAME>`, another `firstName` and another ' +
        '`email`, so the username is the only value the two share. The answer is `409` with the ' +
        '`errorMessage` envelope (R1). The exact `username` search finds one user, the first, ' +
        'still with `<FIRST_NAME>`, and its read-back by `<USER_ID>` equals the read right after ' +
        'its create.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const ids: string[] = [];
    const first = aUser(faker, {}, PREFIX);
    try {
      ids.push(await createUser(admin, first));
      const before = await readUser(admin, ids[0]!);
      // Everything but the username comes from another built user.
      const second = { ...aUser(faker, {}, PREFIX), username: first.username };
      expect(second.firstName, 'the second create sends another firstName').not.toBe(
        first.firstName,
      );

      const response = await admin.users.postAdminRealmsRealmUsers(REALM, { data: second });
      const duplicate = response.headers()['location']?.split('/').pop();
      if (duplicate) ids.push(duplicate);
      expect(response.status()).toBe(409);
      await expectErrorEnvelope(response, envelopes, 'error-message');

      const found = await findByUsername(admin, first.username);
      expect(found).toHaveLength(1);
      expect(found[0]!.id).toBe(ids[0]);
      expect(found[0]!.firstName).toBe(first.firstName);
      expectSameState(before, await readUser(admin, ids[0]!), USER_FIELDS);
    } finally {
      for (const id of ids) await removeUser(admin, id);
      // Both creates sent this username: a second user stored despite the refusal is removed too.
      await removeByUsername(admin, first.username);
    }
  });

  test('TC-USERS-12 The count of an exact username filter follows create and delete @regression @data-integrity', async ({
    actor,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'GET', ...COUNT, severity: 'critical' });
    await caseDescription(
      '`admin` creates a decoy `<USERNAME>-decoy`. Then ' +
        '`GET /admin/realms/qa/users/count?username=<USERNAME>&exact=true` as `viewer`: before ' +
        '`admin` creates `<USERNAME>`, after the create, and after `admin` deletes it. The answers ' +
        'are `200` with `0`, `1` and `0`; after the create, the list with the same filter holds ' +
        'exactly as many users as the count (R4), and that user is `<USERNAME>`, not the decoy.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const viewer = await actor('viewer');
    const user = aUser(faker, {}, PREFIX);
    const decoy = aUser(faker, { username: `${user.username}-decoy` }, PREFIX);
    const filter = { username: user.username, exact: true };
    const ids: string[] = [];
    try {
      // The decoy contains the username: a count or list that matched a substring, or ignored the
      // filter, would see it and break the 0, 1, 0 sequence.
      ids.push(await createUser(admin, decoy));

      // The count answers a bare int32; toBe on the parsed body checks its type and its value.
      const before = await viewer.users.getAdminRealmsRealmUsersCount(REALM, { params: filter });
      expect(before.status()).toBe(200);
      expect(await before.json()).toBe(0);

      const userId = await createUser(admin, user);
      ids.push(userId);
      const afterCreate = await viewer.users.getAdminRealmsRealmUsersCount(REALM, {
        params: filter,
      });
      expect(afterCreate.status()).toBe(200);
      const count: unknown = await afterCreate.json();
      expect(count).toBe(1);
      const list = await viewer.users.getAdminRealmsRealmUsers(REALM, { params: filter });
      expect(list.status()).toBe(200);
      const listed: unknown = await list.json();
      expect(Array.isArray(listed)).toBe(true);
      for (const one of listed as unknown[])
        expect(one).toMatchSchema(contract, 'UserRepresentation');
      expect(listed as User[]).toHaveLength(count as number);
      expect((listed as User[]).map((one) => one.id)).toEqual([userId]);

      const deleted = await admin.users.deleteAdminRealmsRealmUsersUserId(REALM, userId);
      expect(deleted.status()).toBe(204);
      const afterDelete = await viewer.users.getAdminRealmsRealmUsersCount(REALM, {
        params: filter,
      });
      expect(afterDelete.status()).toBe(200);
      expect(await afterDelete.json()).toBe(0);
    } finally {
      for (const id of ids) await removeUser(admin, id);
    }
  });

  test('TC-USERS-15 A viewer reads a user by id with the documented representation and without its credentials @smoke @security', async ({
    actor,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'GET', ...BY_ID, severity: 'critical' });
    await caseDescription(
      '`admin` creates `<USERNAME>` with `email`, `firstName`, `lastName` and a password credential ' +
        '`<PASSWORD>`; `viewer` reads `GET /admin/realms/qa/users/<USER_ID>`. The answer is `200`, a ' +
        '`UserRepresentation` with the fields sent, `enabled` true and a `createdTimestamp`, no ' +
        '`credentials` value and `<PASSWORD>` nowhere in the body: the user stores a credential, so ' +
        'its absence from the read is a real check.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const viewer = await actor('viewer');
    const ids: string[] = [];
    const profile = aUser(faker, {}, PREFIX);
    const user = withPasswordCredential(profile, faker);
    const stored = user.credentials![0]!.value;
    try {
      ids.push(await createUser(admin, user));
      // The precondition holds: the user stores the password, so its absence below is a real check.
      expect(await credentialTypes(admin, ids[0]!), 'the user stores its password').toEqual([
        'password',
      ]);

      const response = await viewer.users.getAdminRealmsRealmUsersUserId(REALM, ids[0]!);
      expect(response.status()).toBe(200);
      const text = await response.text();
      // Compared, never shown: a failure diff would print the password (L-42).
      expect(text.includes(stored), 'the read carries the stored password').toBe(false);
      const body: unknown = JSON.parse(text);
      expect(body).toMatchSchema(contract, 'UserRepresentation');
      const read = body as User;
      expect(read).toMatchObject({ ...profile, id: ids[0], enabled: true });
      expect(typeof read.createdTimestamp, 'createdTimestamp is a number').toBe('number');
      expect(read.createdTimestamp).toBeGreaterThan(0);
      expect(read['credentials'] === undefined, 'the read carries no credentials').toBe(true);
    } finally {
      for (const id of ids) await removeUser(admin, id);
      // A create that stored the user without answering 201 is removed too.
      await removeByUsername(admin, profile.username);
    }
  });

  test("TC-USERS-19 Admin updates a user's first name and the read-back shows it @smoke @data-integrity", async ({
    actor,
    qa,
    faker,
  }) => {
    await operation({ method: 'PUT', ...BY_ID, severity: 'critical' });
    await caseDescription(
      '`admin` creates `<USERNAME>` with `firstName` `<FIRST_NAME>` and reads it back, then sends ' +
        '`PUT /admin/realms/qa/users/<USER_ID>` with that full representation and another ' +
        '`firstName`. The answer is `204`. The read-back shows the new `firstName`, and every ' +
        'other field equals the representation before the update.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const ids: string[] = [];
    try {
      const user = aUser(faker, {}, PREFIX);
      ids.push(await createUser(admin, user));
      const before = await readUser(admin, ids[0]!);
      const firstName = aUser(faker, {}, PREFIX).firstName!;
      expect(firstName, 'the update sends another firstName').not.toBe(before.firstName);

      const response = await admin.users.putAdminRealmsRealmUsersUserId(REALM, ids[0]!, {
        data: { ...before, firstName },
      });
      expect(response.status()).toBe(204);

      const after = await readUser(admin, ids[0]!);
      expect(after.firstName).toBe(firstName);
      expectOnlyChanged(before, after, USER_FIELDS, ['firstName']);
    } finally {
      for (const id of ids) await removeUser(admin, id);
    }
  });

  test('TC-USERS-20 An update that omits a field keeps its value @regression @data-integrity', async ({
    actor,
    qa,
    faker,
  }) => {
    await operation({ method: 'PUT', ...BY_ID, severity: 'critical' });
    await caseDescription(
      '`admin` creates `<USERNAME>` with a `lastName` and an `email` (no user has them by ' +
        'default), then sends `PUT /admin/realms/qa/users/<USER_ID>` with only a new `firstName`. ' +
        'The answer is `204`. The read-back keeps `lastName` and `email`, shows the new ' +
        '`firstName`, and no other field changed (preserve-on-omit, L-20).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const ids: string[] = [];
    try {
      const user = aUser(faker, {}, PREFIX);
      ids.push(await createUser(admin, user));
      const before = await readUser(admin, ids[0]!);
      // Values set at create time, so keeping them is not the same as falling back to a default.
      expect(before.lastName, 'the user starts with a lastName').toBe(user.lastName);
      expect(before.email, 'the user starts with an email').toBe(user.email);
      const firstName = aUser(faker, {}, PREFIX).firstName!;
      expect(firstName, 'the update sends another firstName').not.toBe(before.firstName);

      const response = await admin.users.putAdminRealmsRealmUsersUserId(REALM, ids[0]!, {
        data: { firstName },
      });
      expect(response.status()).toBe(204);

      const after = await readUser(admin, ids[0]!);
      expect(after.firstName).toBe(firstName);
      expect(after.lastName, 'lastName, omitted from the update').toBe(user.lastName);
      expect(after.email, 'email, omitted from the update').toBe(user.email);
      expectOnlyChanged(before, after, USER_FIELDS, ['firstName']);
    } finally {
      for (const id of ids) await removeUser(admin, id);
    }
  });

  test("TC-USERS-22 Renaming a user to another user's username is refused and both are unchanged @regression @data-integrity", async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'PUT', ...BY_ID, severity: 'critical' });
    await caseDescription(
      '`admin` creates `<USERNAME>` and `<OTHER_USERNAME>`, then sends ' +
        '`PUT /admin/realms/qa/users/<USER_ID>` for the first with its own representation and ' +
        '`username: <OTHER_USERNAME>`. The answer is `409` with the `errorMessage` envelope (R1). ' +
        'Both users read back as they were before the request.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const ids: string[] = [];
    try {
      const user = aUser(faker, {}, PREFIX);
      const other = aUser(faker, {}, PREFIX);
      ids.push(await createUser(admin, user));
      ids.push(await createUser(admin, other));
      const [userId, otherId] = [ids[0]!, ids[1]!];
      const userBefore = await readUser(admin, userId);
      const otherBefore = await readUser(admin, otherId);

      const response = await admin.users.putAdminRealmsRealmUsersUserId(REALM, userId, {
        data: { ...userBefore, username: other.username },
      });
      expect(response.status()).toBe(409);
      await expectErrorEnvelope(response, envelopes, 'error-message');

      expectSameState(userBefore, await readUser(admin, userId), USER_FIELDS);
      expectSameState(otherBefore, await readUser(admin, otherId), USER_FIELDS);
    } finally {
      for (const id of ids) await removeUser(admin, id);
    }
  });

  test('TC-USERS-26 Admin deletes a user and a read answers not found @smoke @data-integrity', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'DELETE', ...BY_ID, severity: 'critical' });
    await caseDescription(
      '`admin` creates `<USERNAME>`, then sends `DELETE /admin/realms/qa/users/<USER_ID>`. The ' +
        'answer is `204`. `GET /admin/realms/qa/users/<USER_ID>` then answers `404` with the ' +
        '`error` envelope, and the exact `username` search answers `[]`.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const ids: string[] = [];
    try {
      const user = aUser(faker, {}, PREFIX);
      ids.push(await createUser(admin, user));

      const response = await admin.users.deleteAdminRealmsRealmUsersUserId(REALM, ids[0]!);
      expect(response.status()).toBe(204);

      const read = await admin.users.getAdminRealmsRealmUsersUserId(REALM, ids[0]!);
      expect(read.status()).toBe(404);
      await expectErrorEnvelope(read, envelopes, 'error');
      expect(await findByUsername(admin, user.username)).toEqual([]);
    } finally {
      for (const id of ids) await removeUser(admin, id);
    }
  });

  test('TC-USERS-28 Deleting the same user twice answers not found the second time @regression @contract-drift', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ method: 'DELETE', ...BY_ID, severity: 'normal' });
    await caseDescription(
      '`admin` creates `<USERNAME>` and deletes it (`204`), then sends ' +
        '`DELETE /admin/realms/qa/users/<USER_ID>` again. The answer is `404` with the `error` ' +
        'envelope (A3); the contract declares no `404` for `DELETE` (KN-02).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const admin = await actor('admin');
    const ids: string[] = [];
    try {
      ids.push(await createUser(admin, aUser(faker, {}, PREFIX)));
      const first = await admin.users.deleteAdminRealmsRealmUsersUserId(REALM, ids[0]!);
      expect(first.status(), 'the first delete').toBe(204);

      const second = await admin.users.deleteAdminRealmsRealmUsersUserId(REALM, ids[0]!);
      expect(second.status()).toBe(404);
      await expectErrorEnvelope(second, envelopes, 'error');
    } finally {
      for (const id of ids) await removeUser(admin, id);
    }
  });
});
