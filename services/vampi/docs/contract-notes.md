# VAmPI: contract notes

Observed behaviour of the local VAmPI image (`erev0s/vampi`, pinned by digest in
`docker-compose.yml`) that differs from its OpenAPI document (`../openapi.yaml`) or that a case must
know about. The image runs in two modes, `vampi-secure` (`vulnerable=0`) and `vampi-vulnerable`
(`vulnerable=1`); an entry applies to both unless it names one. Each entry says how to reproduce it
and how it is tracked. At design time every entry becomes a designed case, and a defect becomes a
known gap linked to its tracker issue.

**Status:** `untracked` (observed, no issue yet) · `tracked` (issue filed, key given) · `by-design`
(a difference to tolerate, not a defect).

| Id | Observation | Reproduce | Kind | Status |
|---|---|---|---|---|
| VN-01 | A fresh container has no database tables. Every read that touches storage (`GET /books/v1`, `GET /users/v1`, `GET /users/v1/{username}`) answers `500` until `GET /createdb` has run; the spec declares only `200` for the list reads. | `GET /books/v1` on a container just started | environment limit | `by-design` |
| VN-02 | Unhandled errors answer with the Werkzeug interactive debugger page (`text/html`, `EVALEX = true`): stack trace, the failing SQL statement with every column of the table, and source paths. Every answer carries `Server: Werkzeug/<version> Python/<version>`. Same in both modes. | `GET /books/v1` on a fresh container (VN-01) | information exposure | `untracked` |
| VN-03 | `401` comes in two formats. A missing token, or an `Authorization` header that is not `Bearer`, is refused by the framework with `application/problem+json` `{type, title, status, detail}` ("No authorization token provided"). A bearer token that cannot be decoded reaches the handler and answers the declared `{status: "fail", message}` ("Invalid token. Please log in again."). The spec declares only the second, and `GET /me` lists its `401` messages as a value set that lacks the first. | `GET /me` and `GET /books/v1/<UNKNOWN_TITLE>` without `Authorization`, with `Basic <ANY>` and with `Bearer <NOT_A_JWT>` | contract drift | `untracked` |
| VN-04 | An unknown path answers `404` as `application/problem+json`. No operation declares it; it is the framework's format, not the handlers' `{status, message}`. | `GET /<UNKNOWN_PATH>` | contract gap | `by-design` |
| VN-05 | `GET /createdb` is not safe: it creates the tables and seeds users and books. It is left out of the smoke spec and out of read-only intake; a case that needs seeded data treats it as a write. | `GET /createdb` (not sent at intake) | contract gap | `by-design` |
| VN-06 | `GET /users/v1/_debug` returns every user's details, password included, to any caller; the spec's schema has the field, so it conforms to the document while exposing credentials. It is left out of the smoke spec so no run stores passwords in its evidence. Not called at intake. | `GET /users/v1/_debug` (not sent at intake) | information exposure | `untracked` |

| VN-07 | A duplicate registration and a failed login answer `200` with `{status: "fail", message}`, where the spec declares `400`. The pack fixtures register the users of the `login` credentials on every worker and rely on this: a user that already exists is not an error, and its next login proves the password. | `POST /users/v1/register` twice with one username | contract drift (status) | `untracked` |
| VN-08 | `GET /books/v1/{book_title}` answers `200` with one object `{book_title, owner, secret}`; the spec declares an array of them. Same in both modes. | as the owner, `GET /books/v1/<BOOK_TITLE>` (TC-BOOK-01) | contract drift (shape) | `untracked` |
| VN-09 | Another user's book: `vampi-secure` answers `404` with the `fail` envelope ("Book not found!"), the same as a title no book has, so not even the book's existence leaks. `vampi-vulnerable` answers `200` with the owner and the secret: Broken Object Level Authorization (OWASP API1:2023), the flaw that mode exists to show. | as another user, `GET /books/v1/<BOOK_TITLE>` (TC-BOOK-02) | authorization (vulnerable mode) | `by-design` |

| VN-10 | A registration answered `500` once, while several workers registered the same users at the same moment (2026-10-12, secure mode); sequential runs never did. The likely cause is the unique username racing between the existence check and the insert. The pack fixtures accept a failed registration only when the same credentials then log in. | several workers sending `POST /users/v1/register` for one username at once | robustness (concurrency) | `untracked` |

The tracked `../openapi.yaml` is the upstream document with one edit: the example `auth_token` of
`POST /users/v1/login` (a real-looking JWT) reads `<AUTH_TOKEN>`, so no token-shaped value is
committed. Examples are not part of the digest.

VN-01 to VN-04 were measured read-only on both containers on 2026-10-12. VN-05 and VN-06 come from
the spec and the implementation, without a call. VN-08 and VN-09 were measured by the spec run of
the book registry in both modes on 2026-10-12; VN-07 comes from the implementation, and the pack
fixtures depend on it. The feature contracts in [`features/`](features/)
hold the full measurements and the implementation reading: [books](features/books.md).

The error formats themselves are catalogued in `../error-envelopes.json`; VN-01 to VN-04 are why
`server-error` and `problem` exist there next to the declared `fail`.
