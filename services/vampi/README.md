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
