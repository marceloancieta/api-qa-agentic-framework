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

CI runs both modes in the `e2e-vampi` job ([CI](../../docs/ci.md#e2e-vampi)): the vulnerable mode
must fail exactly TC-BOOK-02 ([`check-bola-detection.mjs`](check-bola-detection.mjs)), then the
pack runs on the secure mode. Jenkins runs the secure mode after the Petstore.

## DAST

`npm run lanes:dast -- --service vampi` scans the pack with OWASP ZAP (`QA_ENV=local-vulnerable`
and `--out vampi-vulnerable` for the vulnerable mode). Its policy lives here:
[`dast-rules.tsv`](dast-rules.tsv) sets each ZAP rule to IGNORE, WARN or FAIL with its reason, and
[`dast-exclude.txt`](dast-exclude.txt) keeps `GET /createdb` (VN-05) and `GET /users/v1/_debug`
(VN-06) out of the scan, its import included. The secure mode
passes the quality gate's `dast` check; the vulnerable mode fails on SQL injection (VN-11). The
scan is not authenticated, so the 6 operations that need a token answer `401` and are not
attacked. A scan writes to the API: run it only against these local containers, then
`npm run vampi:up` before the specs.

## Performance

`npm run lanes:perf -- --service vampi` sends the pack's unauthenticated `GET` operations with k6
([the performance lane](../../docs/quality-gates.md#performance-lane)). Parameter values come from
the contract's examples. [`perf.json`](perf.json) keeps out `GET /createdb` (it reseeds the
database, VN-05) and `GET /users/v1/_debug` (it answers with every password, VN-06). `GET /me` and
`GET /books/v1/{book_title}` need a token and are left out until the lane can authenticate.

Authentication is the core `login` strategy: it logs in as the actor's user on its first request
and logs in again when a token it sent expires (`tokentimetolive` is 60 seconds). Actors are
`user-a` (also the default credential), `user-b` and the built-in `anonymous`.

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
