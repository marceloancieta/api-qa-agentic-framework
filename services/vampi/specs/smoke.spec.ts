// Smoke: every GET that needs no parameter answers one of its declared success statuses. Generated
// by scaffold-service as a first check of configuration and auth; designed cases replace it.
// GET /createdb and GET /users/v1/_debug were removed from the generated set: the first resets the
// database and the second exposes every user's password (docs/contract-notes.md).

import { test, expect } from '../fixtures';

test.describe('VAmPI smoke', { tag: '@smoke' }, () => {
  test('GET / answers a declared success status', async ({ home }) => {
    const response = await home.apiViewsMainBasic();
    expect([200]).toContain(response.status());
  });

  test('GET /users/v1 answers a declared success status', async ({ users }) => {
    const response = await users.apiViewsUsersGetAllUsers();
    expect([200]).toContain(response.status());
  });

  test('GET /me answers a declared success status', async ({ users }) => {
    const response = await users.apiViewsUsersMe();
    expect([200]).toContain(response.status());
  });

  test('GET /books/v1 answers a declared success status', async ({ books }) => {
    const response = await books.apiViewsBooksGetAllBooks();
    expect([200]).toContain(response.status());
  });
});
