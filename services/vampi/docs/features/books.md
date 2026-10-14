# Books authorization contract

> **Approved.** Read-only intake on 2026-10-12; the writes were then measured by the spec run of
> [the book registry](../../registry/book.md) in both modes on 2026-10-12 (answers below).

| | |
|---|---|
| Pack and version | `vampi` `v0` (image `erev0s/vampi`, pinned by digest in `docker-compose.yml`, upstream commit `f16052d`) |
| Feature code | `BOOK` (case ids `TC-BOOK-NN`), agreed at the intake review gate (Q9; the scaffolder suggested `BOOKS`) |
| Endpoints | `GET /books/v1`<br>`POST /books/v1`<br>`GET /books/v1/{book_title}`<br>and what they depend on: `POST /users/v1/register`<br>`POST /users/v1/login` |
| Sources | [`openapi.yaml`](../../openapi.yaml) (tracked copy, OpenAPI 3.0.1, [digest](../../../../docs/discovery/vampi-digest.json)), [contract notes](../contract-notes.md) VN-01 to VN-06, [error envelopes](../../error-envelopes.json), [pack skill](../../../../.claude/skills/vampi-api/SKILL.md), read-only measurements on both containers, and the implementation read inside the running container (`/vampi/api_views/`, `/vampi/models/`) |
| Intake date | 2026-10-12 (read-only) |

Source tags used below: **spec** (the OpenAPI document), **VN-NN** (a contract note), **M-NN** (a
read-only measurement, listed under [Measurements](#measurements)), **S** (the implementation:
completion sources 2 and 3 of
[contract analysis](../../../../docs/references/contract-analysis.md#completing-a-constraint), read
in the pinned image, not measured), **assumption** (listed at the end). Where S predicts a write's
behaviour, the behaviour stays **unmeasured** until an execution-mode run confirms it; a
measurement outranks S.

The two modes are two containers of the same image: **secure** (`vulnerable=0`, base URL port
`5001`) and **vulnerable** (`vulnerable=1`, port `5002`). `GET /` reports the mode as `vulnerable`
`0` or `1` (M-01). Every statement applies to both modes unless it names one.

## Endpoint contract

Value sets for the `status` fields are generated in `generated/enums.ts` (for example
`API_VIEWS_BOOKS_GET_BY_TITLE_RESPONSE_404_STATUS_VALUES`); the probe matrix is in
`generated/probe-matrix.json`. No schema is declared in `components.schemas`: every body is inline.

### `GET /books/v1` (get_all_books)

- No parameters, no security: anonymous callers may list (spec).
- Responses: `200` `{Books: [{book_title, user}]}` (spec). No error declared.
- S: lists every book of every user as `book_title` and the owner's username under `user`; the
  secret is never included.
- Measured: `500` `server-error` on a fresh container, before `GET /createdb` (M-02, VN-01).
  The `200` shape is unmeasured.

### `POST /books/v1` (add_new_book)

- Security: `bearerAuth` (spec). Body: `{book_title, secret}` as JSON, required (spec), with no
  property required by the spec. S validates both as required strings.
- Responses: `200` `{status, message}` ("Book has been added."), `400` `fail` ("Book Already
  exists!"), `401` `fail` (spec). No `201` for a create.
- S, in this order: body validation first (`400` "Please provide a proper JSON body."), then the
  token (`401`), then a duplicate check for the same user and title (`400`), then the insert. The
  new book belongs to the token's subject.
- S: the title column is unique across all users, while the duplicate check only looks at the
  caller's own books (G5).
- Unmeasured: every answer (writes are not sent at intake).

### `GET /books/v1/{book_title}` (get_by_title)

- Security: `bearerAuth`. Path `book_title`, string, required (spec).
- Description: "Retrieves book by title along with secret. Only the owner may retrieve it" (spec).
- Responses: `200` an **array** of `{book_title, owner, secret}`, `401` `fail`, `404` `fail` ("Book
  not found!") (spec). No `403` is declared, so a refused non-owner can only be `401` or `404`.
- S: the answer is a single **object** `{book_title, secret, owner}`, not an array (G3). In secure
  mode the lookup is by title and owner, so another user's book answers `404` "Book not found!",
  the same as a title that does not exist. In vulnerable mode the lookup is by title only, so any
  authenticated caller gets any book with its secret (BOLA, deliberate).
- Measured: the token is checked before the title, so an unknown title answers `401` without a
  usable token (M-05 to M-07).

### `POST /users/v1/register` (register_user)

- No security. Body `{username, password, email}` as JSON, required (spec), no property required by
  the spec. S requires all three as strings.
- Responses: `200` `{status, message}`, `400` with no body declared (spec).
- S: a schema failure answers `400` `fail` with the validator's message. An existing username
  answers `200` with `status: "fail"` ("User already exists. Please Log in."). In vulnerable mode a
  body `admin` is honoured and creates an administrator (mass assignment); secure mode ignores it.
- Unmeasured.

### `POST /users/v1/login` (login_user)

- No security. Body `{username, password}` as JSON, required (spec).
- Responses: `200` `{auth_token, message, status}`, `400` `fail` ("Password is not correct for the
  given username.") (spec).
- S: a wrong password or an unknown user answers **`200`** with `status: "fail"`, not the declared
  `400` (G4). Secure mode gives one message for both ("Username or Password Incorrect!"); vulnerable
  mode tells them apart ("Password is not correct for the given username." and "Username does not
  exist"), which enumerates users. A body that fails validation answers `400` `fail`.
- S: the token is an HS256 JWT with `sub` = username and `exp` = issue time plus `tokentimetolive`
  seconds (60 in `docker-compose.yml`). The signing key is a constant in the image's configuration
  (its value is not recorded here), so tokens can be forged in both modes (G6).
- Unmeasured.

## Business rules

1. Only the owner of a book may read its secret (spec, `GET /books/v1/{book_title}` description).
   S: enforced in secure mode only.
2. The list of books shows titles and owners, never secrets (spec schema; S).
3. A book belongs to the user whose token added it (S).
4. A user cannot add a title they already own: `400` "Book Already exists!" (spec example; S).
5. Reading or adding a book needs a valid bearer token; a missing token, a non-`Bearer` header and
   an undecodable token all answer `401`, in two formats (M-05 to M-09, VN-03). An expired token
   answers `401` "Signature expired. Please log in again." (spec `/me` value set; S); unmeasured.
6. A token expires `tokentimetolive` seconds after login (S; 60 s here).
7. Registration needs username, password and email; an existing username is refused with `200`
   `status: "fail"` (S).
8. The service has no data until `GET /createdb` runs (M-02, M-03, VN-01).

## Acceptance criteria

- Given user A owns book `<BOOK_TITLE>`, when A reads it, then `200` with A's secret and owner A.
- Given user A owns `<BOOK_TITLE>`, when user B reads it in **secure** mode, then B gets no secret:
  `404` `fail` per S (the spec allows `401` or `404`; no `403`).
- Given the same in **vulnerable** mode, then B receives A's secret (S): the case documents the
  BOLA and is expected to fail as a security finding, not to pass.
- Given no token, a non-`Bearer` header or an undecodable token, when anyone reads or adds a book,
  then `401` and no secret.
- Given anyone, when they list books, then no item carries a secret.
- Given A owns `<BOOK_TITLE>`, when A adds it again, then `400` "Book Already exists!" and the book
  is unchanged.

## Access and ownership

- **Identifier checked against the caller (BOLA):** the path `book_title` of
  `GET /books/v1/{book_title}`. `POST /books/v1` takes the owner from the token, never from the
  body (S); whether a body `owner` or `user` is ignored is unmeasured (G7).
- **Actors the cases need:** `anonymous`; `default` (owner, user A); a second user B (an entry in
  the pack's `actors`); an undecodable token and an expired token sent explicitly by the case.
  Users A and B do not exist on a fresh container: they are created by the run (register, then
  login), never read from seeded data.
- Credentials come from the environment through the pack's qa-config entry; none are written here.

## Edge and negative cases

- Missing, non-`Bearer`, undecodable, expired and forged tokens (G6), on both books operations.
- `POST /books/v1`: missing `book_title` or `secret`, wrong JSON types, an empty string, a title of
  129 characters (the column is `String(128)`, S; SQLite does not enforce the length, so the answer
  is unknown), an unknown property, malformed JSON.
- `GET /books/v1/{book_title}`: unknown title, another user's title, URL-encoded characters and
  `/` in the title, a title that differs only in case.
- A title containing `"`: S builds error bodies by string concatenation, so a message that echoes
  input could become invalid JSON. Only the validator's messages echo input today (register,
  login).
- Body validation runs before the token check on `POST /books/v1` (S): a bad body without a valid
  token answers `400`, not `401`, unless the framework already refused a missing token (M-05).

## Test data

| Placeholder | Stands for | How a case gets it |
|---|---|---|
| `<USER_A>`, `<USER_B>` | two ordinary users | registered by the run with builder values, unique per run |
| `<PASSWORD>`, `<EMAIL>` | their credentials and e-mail | builder values; never real data |
| `<BOOK_TITLE>` | a book owned by `<USER_A>` | added by the run, unique per run (titles are unique across all users, S) |
| `<SECRET>` | the book's secret | builder value, distinct per book so a leak is attributable |
| `<UNKNOWN_TITLE>` | a title no one owns | builder value never added |

No case depends on `GET /createdb` seed data; whether the run calls it to create the tables is
decided before design (Q1).

## State transitions

- A book is created and then only read: no update or delete operation exists for books.
- Adding the same title twice by the same user is refused and must not change the stored secret
  (unmeasured). By another user: G5.
- A user's token stops working `tokentimetolive` seconds after login.

## Measurements

Read-only, through a throwaway script, on 2026-10-12 against both containers right after they
started (fresh database). Requests sent only `GET`; nothing called `/createdb`, `_debug`, register,
login or any write. Answers were the same in both modes except M-01. Latency was under 120 ms for
every request.

| # | Request | Status | Content type | Body |
|---|---|---|---|---|
| M-01 | `GET /` | `200` | `application/json` | `{message, help, vulnerable}`; `vulnerable` is `0` on secure, `1` on vulnerable |
| M-02 | `GET /books/v1` | `500` | `text/html` | Werkzeug debugger page: "no such table: books" with the SQL statement (VN-01, VN-02) |
| M-03 | `GET /users/v1` | `500` | `text/html` | the same for table `users` |
| M-04 | `GET /users/v1/<UNKNOWN_USERNAME>` | `500` | `text/html` | the same for table `users` |
| M-05 | `GET /books/v1/<UNKNOWN_TITLE>` without `Authorization` | `401` | `application/problem+json` | `{type, title, status, detail}`, detail "No authorization token provided" (VN-03) |
| M-06 | the same with `Authorization: Basic <ANY>` | `401` | `application/problem+json` | as M-05 |
| M-07 | the same with `Authorization: Bearer <NOT_A_JWT>` | `401` | `application/json` | `{status: "fail", message: "Invalid token. Please log in again."}` |
| M-08 | `GET /me` without `Authorization` | `401` | `application/problem+json` | as M-05 |
| M-09 | `GET /me` with `Bearer <NOT_A_JWT>` | `401` | `application/json` | as M-07 |
| M-10 | `GET /<UNKNOWN_PATH>` | `404` | `application/problem+json` | `{type, title, status, detail}` (VN-04) |
| M-11 | every request | | | header `Server: Werkzeug/<version> Python/<version>` (VN-02) |

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | Reads answer `500` with the debugger page until `/createdb` runs | M-02 to M-04, VN-01, VN-02 | searched ("no such table", "Werkzeug debugger"), none |
| G2 | Two `401` formats; the missing-token one is undeclared | M-05 to M-09, VN-03 | searched ("problem+json 401", "Invalid token"), none |
| G3 | `GET /books/v1/{book_title}` declares an array; S returns one object | spec, S; unmeasured | searched ("book_title secret"), none |
| G4 | Failed login and duplicate registration answer `200` `status: "fail"`, not `400` | spec, S; unmeasured | searched ("vampi"), none |
| G5 | Title unique across users in storage, duplicate check per user only: a second user adding an existing title likely fails unhandled | S; unmeasured | searched ("vampi"), none |
| G6 | JWT signed with a constant key in the image: tokens forgeable in both modes, so the secure mode's owner check is bypassable | S; unmeasured | searched ("vampi"), none |
| G7 | Whether `POST /books/v1` ignores an owner field in the body | none; unmeasured | searched ("vampi"), none |
| G8 | The list item key is `user` while the single read uses `owner` for the same fact | spec | searched ("vampi"), none |

The tracker was searched on 2026-10-12 with the words given; no gap is filed. `qa-report-bug`
decides about filing.

## Out of scope

- The other user operations (`/me`, `GET`/`DELETE /users/v1/{username}`, email and password
  updates, `_debug`) except as preconditions; they belong to a users feature.
- `GET /createdb` as a case: it is setup (VN-05).
- Load and concurrency.

## Assumptions to confirm

Questions only a write can answer, for an execution-mode run against users and books that run
creates, before design:

- **Q1** How a run gets the tables: call `GET /createdb` once after the container starts (it also
  seeds users and books whose contents were not read at intake), or another way. Until then every
  storage read answers `500`.
- **Q2** Secure mode, user B reads user A's book: which status and body? S says `404` `fail` "Book
  not found!", indistinguishable from an unknown title.
- **Q3** Vulnerable mode, the same: S says `200` with A's secret and owner.
- **Q4** The `200` shape of `GET /books/v1/{book_title}`: array (spec) or object (S)?
- **Q5** A second user adding a title that already exists (G5): status and body.
- **Q6** An expired token (wait past 60 s): `401` "Signature expired. Please log in again." in the
  `fail` envelope?
- **Q7** Whether a forged token (G6) is in scope for cases: it needs the signing key, which would
  have to come from the environment like any secret, never from the repository.
- **Q8** The status of a failed login and of a duplicate registration (G4).
- **Q9** The feature code `BOOKS`.

### Answers (2026-10-12, spec runs on both modes)

The design took these from the run of [the book registry](../../registry/book.md) against users and
books that run created:

- **Q1** `npm run vampi:up` calls `GET /createdb` on both containers once they are healthy
  (`services/vampi/create-db.mjs`): provisioning, never a case. No case reads the seeded data.
- **Q2** `404` with the `fail` envelope, no secret and no owner in the body (VN-09, TC-BOOK-02
  passes on `local`).
- **Q3** `200` with the owner and the secret (VN-09, TC-BOOK-02 fails on `local-vulnerable`).
- **Q4** One object, in both modes (VN-08, TC-BOOK-01).
- **Q9** `BOOK`: the resource, singular, like the Petstore codes.
- **Still open:** Q5, Q6, Q7 and Q8 are not asserted by any case yet. Q8 comes from the
  implementation as VN-07, which the pack fixtures rely on.
