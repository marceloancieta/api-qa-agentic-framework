# Service pack: vampi

VAmPI, version `v0`, scaffolded on 2026-10-12 by `npm run scaffold:service`.
The layout and the layers follow `services/petstore/`, the worked example.

## Resources

| Resource | Client | Fixture | Operations | Suggested code |
|---|---|---|---|---|
| `db-init` | `clients/db-init-client.ts` | `dbInit` | 1 | `DBINIT` |
| `home` | `clients/home-client.ts` | `home` | 1 | `HOME` |
| `users` | `clients/users-client.ts` | `users` | 9 | `USERS` |
| `books` | `clients/books-client.ts` | `books` | 3 | `BOOKS` |

Suggested codes are confirmed at the first design gate and are permanent once a case is published.
The book cases use `BOOK`.

## Layout

The same layers as the Petstore pack ([its layout](../petstore/README.md#layout)); this pack holds:

| Path | Holds |
|---|---|
| `service.json` | Name, API version, identity fields to pseudonymize in evidence, contract file. |
| `openapi.yaml` | The contract under test (upstream VAmPI, one example edited, see [contract notes](docs/contract-notes.md)). |
| `generated/` | Contract outputs (do not edit): `value-sets.json`, `enums.ts`, `probe-matrix.json`. |
| `error-envelopes.json` | The error formats this API answers with: the declared `fail` envelope, `problem` and `server-error` (VN-01 to VN-04). |
| `clients/` | One client per resource (table above). |
| `fixtures.ts` | The core `test` extended with this pack's clients, `actor(name)`, and the registration of the `login` users before the first case. |
| `builders/book-builder.ts` | Book test data (`aBook`), an unknown title and a malformed token. |
| `flows/books.ts` | `addBook(actor, book)` and `usernameOf(actor)`, the book cases' preconditions. |
| `registry/book.md` | The designed book cases (`BOOK`). |
| `specs/` | `books-authorization.spec.ts` (the authorization matrix) and `smoke.spec.ts`. |
| `docs/` | `contract-notes.md` and the feature contract in `features/`. |
| `create-db.mjs` | Creates the tables of both containers after `vampi:up`, retrying a colliding seed (VN-14). |
| `register-users.mjs` | `npm run vampi:users`: registers the `login` users for the lanes. |
| `check-bola-detection.mjs` | CI check that the vulnerable mode fails exactly TC-BOOK-02. |
| `dast-rules.tsv`, `dast-exclude.txt`, `dast-false-positives.tsv` | The DAST lane's rule policy, excluded URLs and known false positives (see DAST below). |
| `perf.json` | The performance lane's exclusions (see Performance below). |

## Running

VAmPI runs in two modes from one pinned image (`docker-compose.yml`), each on localhost only:

| Mode | Service | qa-config environment | Base URL |
|---|---|---|---|
| secure (`vulnerable=0`) | `vampi-secure` | `local`, next to the Petstore | `http://localhost:5001` |
| vulnerable (`vulnerable=1`) | `vampi-vulnerable` | `local-vulnerable` | `http://localhost:5002` |

1. `npm run vampi:up` starts both containers and creates their databases
   ([`create-db.mjs`](create-db.mjs); a fresh container has no tables, VN-01).
2. Set `VAMPI_USER_A_NAME`, `VAMPI_USER_A_PASSWORD`, `VAMPI_USER_B_NAME` and
   `VAMPI_USER_B_PASSWORD` in the local env file (`.env.example` lists them). Any values work: the
   pack fixtures register those users before the first case (VN-07).
3. `npx playwright test --project=api-vampi` runs against secure mode; with `QA_ENV=local-vulnerable`
   it runs against vulnerable mode, where TC-BOOK-02 fails: that failure is the finding the
   authorization matrix exists to show (VN-09).
4. `npm run vampi:down` removes both containers.

CI runs both modes in the `e2e-vampi` job ([CI](../../docs/ci.md#e2e-vampi)): the vulnerable mode
must fail exactly TC-BOOK-02 ([`check-bola-detection.mjs`](check-bola-detection.mjs)), then the
pack runs on the secure mode. Jenkins runs the secure mode after the Petstore.

## Authentication and actors

Authentication is the core `login` strategy: it logs in as the actor's user on its first request
and logs in again when the token expires (its lifetime is `tokentimetolive` in
`docker-compose.yml`). Actors are `user-a` (also the `default` credential), `user-b` and the
built-in `anonymous`. The specs and both lanes use them.

Both lanes log in without Playwright, so the users must exist first: `npm run vampi:users`
registers the users of the active environment's `login` credentials (the pack fixtures do the same
before a Playwright run).

## DAST

`npm run lanes:dast -- --service vampi` scans the pack with OWASP ZAP
([the lanes](../../docs/quality-gates.md#lanes); `QA_ENV=local-vulnerable`, `--out vampi-vulnerable`
and `--actor anonymous` for the vulnerable mode). Its policy lives here:
[`dast-rules.tsv`](dast-rules.tsv) sets each ZAP rule to IGNORE, WARN or FAIL with its reason, and
[`dast-exclude.txt`](dast-exclude.txt) keeps `GET /createdb` (VN-05) and `GET /users/v1/_debug`
(VN-06) out of the scan, its import included, and `PUT /users/v1/{username}/password`, which in the
secure mode changes the password of the scan user itself. The scan logs in as the actor's user
(`--actor`, default `default`, the entry's `auth`, which logs in as user A) and renews the token
while it runs, so the operations that need a token are attacked too. The secure mode passes the quality gate's `dast` check; the
vulnerable mode fails on SQL injection (VN-11) and is scanned with `--actor anonymous`, because a
token lets ZAP reach a Regex DoS that hangs it (VN-15).
[`dast-false-positives.tsv`](dast-false-positives.tsv) marks the SQL injection an authenticated
scan reports on the secure mode's registration as false (VN-16). A scan writes to the API: run it only
against these local containers, then `npm run vampi:up` before the specs.

## Performance

`npm run lanes:perf -- --service vampi` sends the pack's `GET` operations with k6, as the default
actor ([the performance lane](../../docs/quality-gates.md#performance-lane)). Parameter values come
from the contract's examples. [`perf.json`](perf.json) keeps out `GET /createdb` (it reseeds the
database, VN-05), `GET /users/v1/_debug` (it answers with every password, VN-06) and
`GET /books/v1/{book_title}`: a book is read only by its owner (VN-09), the actor owns none, and the
lane sends reads only. k6 cannot renew the token, so a run that would outlive it is refused; with
the compose file's token lifetime, keep `--duration` under about 40 seconds.

Where the API departs from its contract is recorded in
[`docs/contract-notes.md`](docs/contract-notes.md).

## Features

| Feature | Contract | Registry |
|---|---|---|
| Book authorization | [`docs/features/books.md`](docs/features/books.md) | [`registry/book.md`](registry/book.md) |

## Smoke spec

`specs/smoke.spec.ts` was trimmed after scaffolding: `GET /createdb` and `GET /users/v1/_debug`
were removed because the first resets the database and the second exposes every user's password
(contract notes VN-05 and VN-06).
