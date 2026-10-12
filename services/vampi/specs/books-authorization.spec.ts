// Book authorization matrix (registry/book.md): OWASP API1:2023 Broken Object Level Authorization.
// One book owned by user-a is read by its owner, by user-b, without a token and with a token that
// cannot be decoded. The same cases run on `local` (VAmPI secure) and `local-vulnerable`
// (vulnerable=1); secure mode passes, and vulnerable mode fails TC-BOOK-02: that failure is the
// finding. Books cannot be deleted (no operation), so each case adds its own under a unique title.
// The secret is masked in the evidence; the cases compare it, never print it.

import { test, expect } from '../fixtures';
import { caseDescription, operation } from '../../../helpers/case-meta';
import { skipUnless } from '../../../helpers/data-gate';
import { expectErrorEnvelope } from '../../../helpers/error-envelope';
import { aBook, malformedToken, unknownTitle } from '../builders/book-builder';
import { addBook, usernameOf } from '../flows/books';

const AREA = 'book';
const BY_TITLE = { method: 'GET', path: '/books/v1/{book_title}', area: AREA } as const;

test.describe('Book authorization', () => {
  test('TC-BOOK-01 The owner reads their own book with its secret @smoke @security @contract-drift', async ({
    actor,
    qa,
    faker,
  }) => {
    await operation({ ...BY_TITLE, severity: 'critical' });
    await caseDescription(
      '`user-a` adds `<BOOK_TITLE>` with `<SECRET>`, then reads `GET /books/v1/<BOOK_TITLE>`. The ' +
        'answer is `200` and names the title, `user-a` as owner and the secret. The contract ' +
        'declares an array; the service answers one object (VN-08).',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const owner = await actor('user-a');
    const book = aBook(faker);
    await addBook(owner, book);

    const response = await owner.books.apiViewsBooksGetByTitle(book.book_title);
    expect(response.status()).toBe(200);
    // Owner and secret are compared, never shown: a failure diff would print them (L-42).
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['book_title', 'owner', 'secret']);
    expect(body['book_title']).toBe(book.book_title);
    const ownerName = await usernameOf(owner);
    expect(body['owner'] === ownerName, 'the answer names user-a as the owner').toBe(true);
    expect(body['secret'] === book.secret, 'the answer carries the stored secret').toBe(true);
  });

  test("TC-BOOK-02 Another user cannot read the owner's book or its secret @regression @security", async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ ...BY_TITLE, severity: 'critical' });
    await caseDescription(
      '`user-a` adds `<BOOK_TITLE>` with `<SECRET>`; `user-b`, with a valid token of its own, reads ' +
        '`GET /books/v1/<BOOK_TITLE>` (the owner reads it first: `200`). The answer is `404` with ' +
        'the `fail` envelope, equal to the answer for `<UNKNOWN_TITLE>`, and carries neither the ' +
        'secret nor the owner (VN-09). On `local-vulnerable` the ' +
        'service answers `200` with the secret: this case fails there, which is the finding.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const owner = await actor('user-a');
    const other = await actor('user-b');
    const ownerName = await usernameOf(owner);
    // Two distinct users, or a red result here would not be a BOLA finding.
    expect(await usernameOf(other), 'user-b is another user than user-a').not.toBe(ownerName);
    const book = aBook(faker);
    await addBook(owner, book);
    // Positive control: the book is readable, so a 404 below is about who asks.
    expect((await owner.books.apiViewsBooksGetByTitle(book.book_title)).status()).toBe(200);

    const response = await other.books.apiViewsBooksGetByTitle(book.book_title);
    const text = await response.text();
    expect(text.includes(book.secret), 'the answer carries the secret of the owner').toBe(false);
    expect(text.includes(ownerName), 'the answer names the owner').toBe(false);
    expect(response.status()).toBe(404);
    await expectErrorEnvelope(response, envelopes, 'fail');

    // Alike to a title no book has, so the answer does not reveal that the book exists.
    const missing = await other.books.apiViewsBooksGetByTitle(unknownTitle(faker));
    expect(missing.status()).toBe(404);
    expect(JSON.parse(text)).toEqual(await missing.json());
  });

  test('TC-BOOK-03 A request without a token is refused @regression @security', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ ...BY_TITLE, severity: 'critical' });
    await caseDescription(
      '`user-a` adds `<BOOK_TITLE>`; `GET /books/v1/<BOOK_TITLE>` is sent without an ' +
        '`Authorization` header. The answer is `401` with the `problem` envelope (VN-03) and no ' +
        'secret.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const book = aBook(faker);
    await addBook(await actor('user-a'), book);

    const anonymous = await actor('anonymous');
    const response = await anonymous.books.apiViewsBooksGetByTitle(book.book_title);
    const leaked = (await response.text()).includes(book.secret);
    expect(leaked, 'the answer carries the secret').toBe(false);
    expect(response.status()).toBe(401);
    await expectErrorEnvelope(response, envelopes, 'problem');
  });

  test('TC-BOOK-04 A request with a token that cannot be decoded is refused @regression @security', async ({
    actor,
    qa,
    faker,
    envelopes,
  }) => {
    await operation({ ...BY_TITLE, severity: 'normal' });
    await caseDescription(
      '`user-a` adds `<BOOK_TITLE>`; `GET /books/v1/<BOOK_TITLE>` is sent with ' +
        '`Authorization: Bearer <MALFORMED_TOKEN>`. The answer is `401` with the `fail` envelope ' +
        '(VN-03) and no secret; the login strategy keeps the token the case set.',
    );
    skipUnless(qa.allowWrites, `environment "${qa.environment}" does not allow writes`);

    const owner = await actor('user-a');
    const book = aBook(faker);
    await addBook(owner, book);

    const response = await owner.books.apiViewsBooksGetByTitle(book.book_title, {
      bearer: malformedToken(faker),
    });
    const leaked = (await response.text()).includes(book.secret);
    expect(leaked, 'the answer carries the secret').toBe(false);
    expect(response.status()).toBe(401);
    await expectErrorEnvelope(response, envelopes, 'fail');
  });

  test('TC-BOOK-05 A title no book has answers not found to its owner too @regression', async ({
    actor,
    faker,
    envelopes,
  }) => {
    await operation({ ...BY_TITLE, severity: 'normal' });
    await caseDescription(
      '`GET /books/v1/<UNKNOWN_TITLE>` as `user-a`. The answer is `404` with the `fail` envelope, ' +
        "the same answer TC-BOOK-02 expects for another user's title.",
    );

    const owner = await actor('user-a');
    const response = await owner.books.apiViewsBooksGetByTitle(unknownTitle(faker));
    expect(response.status()).toBe(404);
    await expectErrorEnvelope(response, envelopes, 'fail');
  });
});
