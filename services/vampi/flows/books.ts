// Business steps over an actor's clients (ADR 0007 flows). Each step stops on an unexpected answer,
// so a case never runs its check against a precondition that did not happen.
import { expect } from '@playwright/test';
import type { Book } from '../builders/book-builder';
import type { Actor } from '../fixtures';

/** The actor adds `book`; it must answer 200 with status "success". */
export async function addBook(actor: Actor, book: Book): Promise<void> {
  const response = await actor.books.apiViewsBooksAddNewBook({ data: book });
  expect(response.status(), `${actor.name} adds a book`).toBe(200);
  expect(await response.json(), `${actor.name} adds a book`).toMatchObject({ status: 'success' });
}

/** The username behind the actor's credential, as the service knows it (`GET /me`). */
export async function usernameOf(actor: Actor): Promise<string> {
  const response = await actor.users.apiViewsUsersMe();
  expect(response.status(), `${actor.name} reads /me`).toBe(200);
  const body = (await response.json()) as { data?: { username?: unknown } };
  const username = body.data?.username;
  expect(typeof username, `${actor.name}'s /me names a username`).toBe('string');
  return username as string;
}
