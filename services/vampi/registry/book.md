---
feature: BOOK
title: Book authorization
endpoints:
  - GET /books/v1/{book_title}
contract: docs/features/books.md
auth: [user-a, user-b, anonymous]
test_data:
  <BOOK_TITLE>: a title no other case uses, from the seeded faker with a unique suffix; titles are unique across every user
  <SECRET>: the secret user-a stores with the book, from the seeded faker
  <UNKNOWN_TITLE>: a title no book has, from the seeded faker with a unique suffix
  <MALFORMED_TOKEN>: a bearer value that is not a JWT, from the seeded faker
requirements:
  - { id: REQ-BOOK-01, text: Only the owner of a book may retrieve it with its secret }
  - { id: REQ-BOOK-02, text: A request without a valid bearer token is refused with 401 }
  - { id: REQ-BOOK-03, text: A title no book has answers 404 }
beyond_floor: []
---

# `Book authorization` test cases

Contract: [`docs/features/books.md`](../docs/features/books.md).

An actor-based authorization matrix (OWASP API1:2023 Broken Object Level Authorization) over one
book that `user-a` owns. The same cases run on the `local` environment (VAmPI in secure mode) and on
`local-vulnerable` (the same image with `vulnerable=1`): secure mode passes, and vulnerable mode
fails TC-BOOK-02, which is the flaw the matrix exists to detect.

- **Users** are registered by the pack fixtures from the `login` credentials in qa-config (VN-07);
  no case relies on the sample data `GET /createdb` seeds (VN-05).
- **Books cannot be deleted**: VAmPI has no operation for it. Each case adds a book under a title no
  other run uses, and `npm run vampi:up` recreates the database (`create-db.mjs` calls
  `GET /createdb`, which drops and reseeds the tables, VN-05).
- **The secret is masked in evidence** (`redact.ts` treats `secret` as a secret key), so a report
  never shows it, even when a case proves it leaked.

## Cases

| ID | Title | Requirement | Technique | Priority | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|
| TC-BOOK-01 | The owner reads their own book with its secret | REQ-BOOK-01 | use-case | high | automated | specs/books-authorization.spec.ts | |
| TC-BOOK-02 | Another user cannot read the owner's book or its secret | REQ-BOOK-01 | decision-table | high | automated | specs/books-authorization.spec.ts | |
| TC-BOOK-03 | A request without a token is refused | REQ-BOOK-02 | equivalence-partition | high | automated | specs/books-authorization.spec.ts | |
| TC-BOOK-04 | A request with a token that cannot be decoded is refused | REQ-BOOK-02 | equivalence-partition | medium | automated | specs/books-authorization.spec.ts | |
| TC-BOOK-05 | A title no book has answers not found to its owner too | REQ-BOOK-03 | equivalence-partition | medium | automated | specs/books-authorization.spec.ts | |

## Case details

### TC-BOOK-01

- **Preconditions**: `user-a` adds a book `<BOOK_TITLE>` with `<SECRET>` (`POST /books/v1`).
- **Request**: `GET /books/v1/<BOOK_TITLE>` as `user-a`.
- **Expected**: `200`; the body names `<BOOK_TITLE>`, `user-a`'s username as owner and `<SECRET>`.
  The contract declares an array of books; the service answers one object (VN-08), which the case
  reads.
- **Verification**: response only.
- **Tags**: `@smoke @security @contract-drift`.

### TC-BOOK-02

- **Preconditions**: `user-a` adds a book `<BOOK_TITLE>` with `<SECRET>`.
- **Request**: `GET /books/v1/<BOOK_TITLE>` as `user-b`, with a valid token of its own.
- **Expected**: `404` with the `fail` envelope, and nowhere in the body `<SECRET>` or `user-a`'s
  username. The contract allows only `401` and `404` here; secure mode answers `404`, the same as a
  missing title, so the book's existence is not revealed either (VN-09).
- **Verification**: the two actors are distinct users, and the owner reads the book first (`200`),
  so the `404` is about who asks; the body equals the answer to `<UNKNOWN_TITLE>` for the same
  user. On `local-vulnerable` the service answers `200` with the secret: the case fails there,
  which is the finding.
- **Tags**: `@regression @security`.

### TC-BOOK-03

- **Preconditions**: `user-a` adds a book `<BOOK_TITLE>`.
- **Request**: `GET /books/v1/<BOOK_TITLE>` without an `Authorization` header (`anonymous`).
- **Expected**: `401` with the `problem` envelope (VN-03), and no `<SECRET>` in the body.
- **Verification**: response only.
- **Tags**: `@regression @security`.

### TC-BOOK-04

- **Preconditions**: `user-a` adds a book `<BOOK_TITLE>`.
- **Request**: `GET /books/v1/<BOOK_TITLE>` with `Authorization: Bearer <MALFORMED_TOKEN>`, a value
  that is not a JWT.
- **Expected**: `401` with the `fail` envelope (VN-03), and no `<SECRET>` in the body. The login
  strategy must not replace a token the case set itself.
- **Verification**: response only.
- **Tags**: `@regression @security`.

### TC-BOOK-05

- **Preconditions**: none beyond a registered `user-a`.
- **Request**: `GET /books/v1/<UNKNOWN_TITLE>` as `user-a`.
- **Expected**: `404` with the `fail` envelope. With TC-BOOK-02 it shows that a missing title and
  another user's title answer alike in secure mode.
- **Verification**: response only.
- **Tags**: `@regression`.
