---
name: petstore-api
description: >-
  What an agent must know about the Swagger Petstore (OpenAPI 3.0) API, the example service pack in
  services/petstore/: where its contract lives, how it authenticates, its resources and clients, its
  error formats and where it departs from its contract. Use when designing, automating or running
  tests for Petstore, or when a phase skill needs facts about it that the OpenAPI document does not
  state.
---

# Swagger Petstore (petstore v3)

Created with `npm run scaffold:service -- --name petstore --spec <file|url> --write --skill-only`
and completed by hand from the pack. Facts the pack already owns are linked, not copied
(`.claude/rules/documentation.md`).

## Contract

- Tracked copy: `services/petstore/openapi.json` (OpenAPI 3.0, 19 operations). Its digest is
  `docs/discovery/petstore-digest.json`; `npm run contract:digest:live -- --service petstore`
  compares it with the running service.
- Departures from the contract, with their status: `services/petstore/docs/contract-notes.md`.
  Read it before designing; several entries change what a case may expect.

## Environments and writes

qa-config gives the `petstore` pack an entry in three environments
(`api.environments.<env>.packs.petstore`): `local` (the Docker image started with
`npm run petstore:up`, the system under test for every write), `reference` (an earlier release for
the differential lane, started with `npm run petstore:reference:up`, read-only) and `public`, the
demo, which is read-only for this suite. The seed pets 1 to 10 are shared data: a case that changes one runs inside `withResourceGuard` with
`seedPet(pets, id)` (`services/petstore/guards.ts`).

## Authentication and actors

The contract declares `petstore_auth` (OAuth2) and `api_key` (header `api_key`). The service does
not enforce `api_key` (PN-05), so authorization matrices are shown on the VAmPI pack (`vampi-api`).

## Resources

| Resource | Client | Fixture | Operations | Suggested code |
|---|---|---|---|---|
| `pet` | `PetClient` (`clients/pet-client.ts`) | `pets` | 8 | `PET` |
| `store` | `StoreClient` (`clients/store-client.ts`) | `store` | 4 | `STOR` |
| `user` | `UserClient` (`clients/user-client.ts`) | `users` | 7 | `USER` |

Codes are confirmed at the first design gate and are permanent once a case is published
(`.claude/rules/registry.md`).

## Data

- Identity fields pseudonymized in evidence: `service.json` `identity_fields` (the user fields).
- Builders: `aPet`, `anOrder`, `aUser` and the `PetMother` in `services/petstore/builders/`.
- Value sets (pet and order status): `services/petstore/generated/enums.ts`.

## Errors

`services/petstore/error-envelopes.json` catalogues the input-error, server-error and not-found
formats. Input errors name the field only inside the message, so cases assert the error kind.

## Verification

A write is confirmed by reading the resource back and comparing it with the field models in
`services/petstore/state-models.ts` (`expectSameState`, `expectOnlyChanged`).

## Lanes

The service loses data under parallel writers, so `service.json` sets `workers: 1` (PN-26), which
also limits the DAST lane's scan threads. The `local` entry's `recovery` restarts the container
after the destructive and DAST lanes. The lane files (`dast-false-positives.tsv`, `perf.json`,
`diff.json`) are listed in the layout of `services/petstore/README.md`.
