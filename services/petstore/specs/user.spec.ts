// Users and sessions (registry/user.md, user-record.md, user-session.md). Every case creates its own
// users with a unique username and an explicit id, and deletes them afterwards, confirmed by a read
// that answers 404: the delete's own status proves nothing (PN-22). Password values come from the
// builder and are masked in the evidence; no case compares or prints one.

import { test, expect } from '../fixtures';
import { caseDescription, knownGap, operation } from '../../../helpers/case-meta';
import { skipUnless } from '../../../helpers/data-gate';
import { describeRule } from '../../../helpers/decision-table';
import { expectErrorEnvelope } from '../../../helpers/error-envelope';
import { expectSameState } from '../../../helpers/state-compare';
import { aUser, unknownUsername } from '../builders/user-builder';
import { removeUser } from '../flows/cleanup';
import { decisionTables } from '../generated/decision-tables';
import { USER_FIELDS } from '../state-models';
import type { User } from '../types';

const AREA = 'user';
const INT32_MAX = 2 ** 31 - 1;

test.describe('Users', () => {
  test('TC-USER-01 A user created from a full JSON body reads back as sent @smoke @data-integrity', async ({
    users,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'POST', path: '/user', area: AREA, severity: 'critical' });
    await caseDescription(
      '`POST /user` with all eight `User` fields for `<USERNAME>`. The answer is `200` and matches ' +
        '`User`, and so does `GET /user/<USERNAME>`; both equal the sent body field by field, ' +
        '`password` apart (its exposure is TC-USER-21 and TC-USER-39).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const user = aUser(faker).build();
    const username = user.username as string;
    try {
      const created = await users.create(user);
      expect(created.status()).toBe(200);
      const answer: unknown = await created.json();
      expect(answer).toMatchSchema(contract, 'User');
      expectSameState(user, answer, USER_FIELDS);

      const read = await users.getByName(username);
      expect(read.status()).toBe(200);
      const stored: unknown = await read.json();
      expect(stored).toMatchSchema(contract, 'User');
      expectSameState(user, stored, USER_FIELDS);
    } finally {
      expect(await removeUser({ users }, username)).toBe(404);
    }
  });

  test('TC-USER-14 userStatus at the int32 maximum is stored and one beyond it is refused @regression @data-integrity probe:p-649b68c7ce', async ({
    users,
    qa,
    faker,
    envelopes,
    contract,
  }) => {
    await operation({ method: 'POST', path: '/user', area: AREA });
    await caseDescription(
      '`POST /user` for `<USERNAME>` with `userStatus` `<INT32_MAX>` answers `200` and reads back ' +
        'with that value. `POST /user` for `<OTHER_USERNAME>` with `<INT32_MAX>` plus one is ' +
        'refused with `400` and the `input-error` envelope, and `<OTHER_USERNAME>` reads `404`.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const atLimit = aUser(faker).withUserStatus(INT32_MAX).build();
    const beyond = aUser(faker)
      .withUserStatus(INT32_MAX + 1)
      .build();
    try {
      const created = await users.create(atLimit);
      expect(created.status()).toBe(200);
      const answer: unknown = await created.json();
      expect(answer).toMatchSchema(contract, 'User');
      const read = await users.getByName(atLimit.username as string);
      expect(read.status()).toBe(200);
      const stored: unknown = await read.json();
      expect(stored).toMatchSchema(contract, 'User');
      expect((stored as User).userStatus).toBe(INT32_MAX);

      await expectErrorEnvelope(await users.create(beyond), envelopes, 'input-error');
      await expectErrorEnvelope(
        await users.getByName(beyond.username as string),
        envelopes,
        'not-found',
      );
    } finally {
      for (const user of [atLimit, beyond]) {
        expect(await removeUser({ users }, user.username as string)).toBe(404);
      }
    }
  });

  test('TC-USER-32 A created user reads back with the declared User shape @sanity', async ({
    users,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'GET', path: '/user/{username}', area: AREA, severity: 'critical' });
    await caseDescription(
      '`GET /user/<USERNAME>` with `Accept: application/json`, for a user the case created with a ' +
        'full body. The answer is `200` `application/json`, matches `User`, and its username, id ' +
        'and business fields equal the ones stored.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const user = aUser(faker).build();
    const username = user.username as string;
    try {
      expect((await users.create(user)).status()).toBe(200);

      const read = await users.getByName(username, 'application/json');
      expect(read.status()).toBe(200);
      expect(read.headers()['content-type']).toContain('application/json');
      const body: unknown = await read.json();
      expect(body).toMatchSchema(contract, 'User');
      expectSameState(user, body, USER_FIELDS);
    } finally {
      expect(await removeUser({ users }, username)).toBe(404);
    }
  });

  test('TC-USER-39 A read never returns the stored password @regression @security @known-gap', async ({
    users,
    actor,
    qa,
    faker,
    contract,
  }) => {
    await operation({ method: 'GET', path: '/user/{username}', area: AREA, severity: 'blocker' });
    await caseDescription(
      '`GET /user/<USERNAME>` as `anonymous`, then as `default`, for a user the case created with ' +
        '`<PASSWORD>`. Each answer is `200` and `User`, with no `password` property. Today the ' +
        'stored password is returned to any caller (PN-13, `LOCAL-3`).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const user = aUser(faker).build();
    const username = user.username as string;
    const callers = [await actor('anonymous'), await actor('default')];
    try {
      expect((await users.create(user)).status()).toBe(200);

      test.fail(true, await knownGap('LOCAL-3', 'any caller reads the stored password'));
      for (const caller of callers) {
        const read = await caller.users.getByName(username);
        expect.soft(read.status(), caller.name).toBe(200);
        const body: unknown = await read.json();
        expect.soft(body, caller.name).toMatchSchema(contract, 'User');
        expect.soft(Object.keys(body as object), caller.name).not.toContain('password');
      }
    } finally {
      expect(await removeUser({ users }, username)).toBe(404);
    }
  });

  test('TC-USER-55 An anonymous update applies exactly like a default one @regression @security @data-integrity', async ({
    users,
    actor,
    qa,
    faker,
  }) => {
    await operation({ method: 'PUT', path: '/user/{username}', area: AREA });
    await caseDescription(
      '`PUT /user/<USERNAME>` as `anonymous`, with the full stored body and `firstName` changed, ' +
        'for a user created by `default`. It gets the answer a `default` update gets: `200`, and ' +
        'the change is stored. This records that any caller can change any user it can name ' +
        '(PN-05, by design); the refusal the prose implies cannot be tested on this API (FUT-07).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const user = aUser(faker).build();
    const username = user.username as string;
    const changed = { ...user, firstName: `${user.firstName}-changed` };
    try {
      expect((await users.create(user)).status()).toBe(200);
      const anonymous = await actor('anonymous');

      expect((await anonymous.users.update(username, changed)).status()).toBe(200);

      const read = await users.getByName(username);
      expect(read.status()).toBe(200);
      expectSameState(changed, await read.json(), USER_FIELDS);
    } finally {
      expect(await removeUser({ users }, username)).toBe(404);
    }
  });

  test('TC-USER-57 Deleting a user removes it @smoke @data-integrity', async ({
    users,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({
      method: 'DELETE',
      path: '/user/{username}',
      area: AREA,
      severity: 'critical',
    });
    await caseDescription(
      '`DELETE /user/<USERNAME>` for a user the case created answers `200`, and ' +
        '`GET /user/<USERNAME>` then answers `404` with the `not-found` envelope.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const user = aUser(faker).build();
    const username = user.username as string;
    try {
      expect((await users.create(user)).status()).toBe(200);

      expect((await users.remove(username)).status()).toBe(200);

      await expectErrorEnvelope(await users.getByName(username), envelopes, 'not-found');
    } finally {
      expect(await removeUser({ users }, username)).toBe(404);
    }
  });

  test("TC-USER-65 Login refuses every credential combination except the owner's @regression @security @known-gap", async ({
    users,
    qa,
    faker,
  }) => {
    const table = decisionTables['user-login'];
    await operation({ method: 'GET', path: '/user/login', area: AREA, severity: 'critical' });
    await caseDescription(
      "`GET /user/login` once per rule of `rules/user-login.yaml`: the owner's username, an " +
        "unknown one, an empty one or none, crossed with the owner's `<PASSWORD>`, " +
        "`<OTHER_PASSWORD>`, an empty one or none. The owner's credentials answer `200` with a " +
        'session (R1); every other combination answers `400`. Today every combination answers ' +
        '`200` with a new session (PN-12, `LOCAL-4`).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const builder = aUser(faker);
    const owner = builder.build();
    const usernames: Record<string, string | undefined> = {
      owner: owner.username,
      unknown: unknownUsername(faker),
      empty: '',
      omitted: undefined,
    };
    const passwords: Record<string, string | undefined> = {
      owner: owner.password,
      other: builder.otherPassword(),
      empty: '',
      omitted: undefined,
    };
    try {
      expect((await users.create(owner)).status()).toBe(200);
      expect((await users.getByName(usernames['unknown'] as string)).status()).toBe(404);

      test.fail(true, await knownGap('LOCAL-4', 'login opens a session for any credentials'));
      for (const rule of table.rules) {
        const when: Readonly<Record<string, string>> = rule.when;
        await test.step(describeRule(rule), async () => {
          // A condition the rule leaves out matches every class, so each class is sent.
          const names = when['username'] ? [when['username']] : table.conditions.username;
          const secrets = when['password'] ? [when['password']] : table.conditions.password;
          for (const name of names) {
            for (const secret of secrets) {
              const response = await users.login({
                username: usernames[name],
                password: passwords[secret],
              });
              const label = `username=${name}, password=${secret}`;
              expect.soft(response.status(), label).toBe(rule.then.status);
              // R1 answers with a session; its value is never compared with a literal.
              if (rule.then.status === 200) {
                expect.soft((await response.text()).length, `${label}: session`).toBeGreaterThan(0);
              }
            }
          }
        });
      }
    } finally {
      expect(await removeUser({ users }, owner.username as string)).toBe(404);
    }
  });
});
