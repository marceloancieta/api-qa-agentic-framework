// Business steps over an actor's clients (ADR 0007 flows). Each step stops on an unexpected answer,
// so a case never runs its check against a precondition that did not happen.
import { expect } from '@playwright/test';
import { REALM } from '../builders/user-builder';
import type { Actor } from '../fixtures';
import type { NewUser, User } from '../types';

/** The users with exactly `username` in the realm (`GET /users?username=...&exact=true`). */
export async function findByUsername(actor: Actor, username: string): Promise<User[]> {
  const response = await actor.users.getAdminRealmsRealmUsers(REALM, {
    params: { username, exact: true },
  });
  expect(response.status(), `${actor.name} searches for a username`).toBe(200);
  return (await response.json()) as User[];
}

/**
 * The actor creates `user`; it must answer 201. Returns the new id, from the `Location` header
 * when there is one (assumption A2 of the users contract), otherwise from an exact username search.
 */
export async function createUser(actor: Actor, user: NewUser): Promise<string> {
  const response = await actor.users.postAdminRealmsRealmUsers(REALM, { data: user });
  // Any other answer fails the case; a user it stored anyway is removed first, so none is left.
  if (response.status() !== 201) await removeByUsername(actor, user.username);
  expect(response.status(), `${actor.name} creates a user`).toBe(201);
  const location = response.headers()['location'];
  const fromLocation = location?.split('/').pop();
  if (fromLocation) return fromLocation;
  const found = await findByUsername(actor, user.username);
  expect(found, `${actor.name} finds the user it created`).toHaveLength(1);
  return found[0]!.id;
}

/**
 * The types of the credentials the user with `id` stores (`GET /users/{id}/credentials`), read by
 * the actor; it must answer 200. Only the types: the values never leave the server's answer.
 */
export async function credentialTypes(actor: Actor, id: string): Promise<string[]> {
  const response = await actor.users.getAdminRealmsRealmUsersUserIdCredentials(REALM, id);
  expect(response.status(), `${actor.name} reads a user's credentials`).toBe(200);
  return ((await response.json()) as { type?: string }[]).map((credential) =>
    String(credential.type),
  );
}

/** The user with `id`, read by the actor; it must answer 200. */
export async function readUser(actor: Actor, id: string): Promise<User> {
  const response = await actor.users.getAdminRealmsRealmUsersUserId(REALM, id);
  expect(response.status(), `${actor.name} reads a user`).toBe(200);
  return (await response.json()) as User;
}

/**
 * Removes every user with exactly `username`, at the end of a case that sent it in a request that
 * should not have stored a user (a refused create, an update of an unknown id). The username is
 * the case's own, unique and under its author's prefix, so nothing of another case is touched.
 */
export async function removeByUsername(actor: Actor, username: string): Promise<void> {
  for (const user of await findByUsername(actor, username)) await removeUser(actor, user.id);
}

/**
 * Removes a user a case created, at the end of the case. A user that is already gone (`404`) is
 * not an error here: the case may have deleted it itself.
 */
export async function removeUser(actor: Actor, id: string): Promise<void> {
  const response = await actor.users.deleteAdminRealmsRealmUsersUserId(REALM, id);
  expect([204, 404], `${actor.name} removes a user the case created`).toContain(response.status());
}
