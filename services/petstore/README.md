# Service pack: petstore

The example API under test, Swagger Petstore v3, run locally with `npm run petstore:up`. Every API
under test gets a pack like this one under `services/<name>/` (ADR 0007). The core (`helpers/`,
`fixtures/`, `scripts/`) never imports from a pack.

## Layout

| Path | Holds | Status |
|---|---|---|
| `service.json` | Name, API version (part of every case identity), identity fields to pseudonymize in evidence, contract file. | present |
| `openapi.json` | The contract under test (Petstore 1.0.28, OpenAPI 3.0.4, Apache-2.0). Response bodies are validated against its schemas. | present |
| `generated/` | Contract outputs (do not edit): `value-sets.json`, `enums.ts`, `probe-matrix.json`. See `docs/contract-tooling.md`. | present |
| `error-envelopes.json` | The error formats this API answers with, by kind, for `expectErrorEnvelope`. | present |
| `types.ts` | Request and response interfaces, written by hand, and aliases of the enum value sets generated in `generated/enums.ts`. | present |
| `clients/` | One client per resource, extending `helpers/base-client.ts`. Paths with parameters use `this.route('pet/{petId}', { petId })`. Methods return the raw response. | present |
| `fixtures.ts` | The core `test` extended with this pack's clients and `actor(name)`. Specs import from here. | present |
| `specs/` | Playwright specs, run by the `api` project. | present |
| `__tests__/` | Offline unit tests of the pack (builders), run by the `unit` project. | present |
| `flows/` | Multi-step business sequences over an actor's clients, one named step each (`purchasePet`), and cleanup confirmed by a read (`removePet`, `removeOrder`, `removeUser`). | present |
| `builders/` | Test Data Builders (`aPet`, `anOrder`, `aUser`) and the Object Mother (`PetMother`). | present |
| `state-models.ts` | Field buckets (identity, business, provenance, volatile) for comparing pets, orders and users. | present |
| `guards.ts` | Resource guards for shared seed data (`seedPet(pets, id)`). | present |
| `assertions.ts` | Checks several specs share, for shapes the contract declares inline (`expectInventoryMap`). | present |
| `rules/` | Decision tables as YAML, generated into `generated/decision-tables.ts` (`npm run contract:decision-tables`). | present |
| `registry/` | Designed test cases and their status, one or more files per feature code (see Feature contracts below). | present |
| `docs/` | `contract-notes.md`: observed departures from the contract and their status. `features/`: the feature contracts written at intake, one per registry code. | present |

## Writing a spec

```ts
import { test, expect } from '../fixtures';

test('GET /store/inventory answers 200', { tag: '@smoke' }, async ({ store }) => {
  expect((await store.inventory()).status()).toBe(200);
});
```

Clients attach every request and response, redacted, to the running test, so a spec only asserts.
Cases that write check `qa.allowWrites` and skip with the reason when the environment is read-only.

## Layers you can opt into

- **Actors.** `await actor('user')` returns the same clients bound to another credential, each actor with
  its own request context. `default` is `api.auth`, `anonymous` sends no credential, and any other name
  comes from `api.actors` in qa-config. This is how an authorization matrix is written.
- **Flows.** `purchasePet(actor, pet, order)` runs the steps a case needs as its precondition. A step
  that gets an unexpected status stops the flow with the step name, the status and a redacted body.
- **Data.** Use the `faker`, `rng` and `clock` fixtures, never `Math.random` or `Date.now()`. Every
  test records its `QA_SEED`; rerun with that value to get the same data. `QA_CLOCK` pins "now".

See TC-STOR-01 in `specs/store.spec.ts` for all three together, and TC-PET-26 in `specs/pet.spec.ts`
for two actors side by side.

## Shared data and preconditions

- **Prefer dedicated data.** Builders create what a case needs. When a case must touch shared data
  (Petstore's seed pets 1-10), wrap it in `withResourceGuard(seedPet(pets, id), { expectChange }, ...)`:
  the pet is compared after the case and repaired only where it differs, and a change the case did not
  expect is reported as a finding. See `specs/shared-data.spec.ts`.
- **Compare states by field bucket.** `expectSameState(sent, readBack, ORDER_FIELDS)` and
  `expectOnlyChanged(before, after, PET_FIELDS, ['status'])` compare field by field; date-times are
  compared as instants and generated values are never asserted as literals.
- **Skips are visible.** `skipUnless(condition, reason)` and `requireData(what, find, problems)` warn
  and annotate when a case cannot run, and fail (rather than skip) when data exists in the wrong state.

## Contract checks

- **Schemas.** `expect(body).toMatchSchema(contract, 'Pet')` validates a body against the OpenAPI
  schema (every version normalized to JSON Schema 2020-12 first) and lists every mismatch.
- **Error envelopes.** `await expectErrorEnvelope(response, envelopes, 'input-error')` checks status,
  content type and body shape of a documented error kind. Pass `{ field }` only for envelopes that
  report the field in a key; Petstore's do not, so its cases assert the kind only.
- **Identity.** A title that starts with a case id (`TC-PET-01 ...`) gives the result the stable
  identity `petstore-v3-TC-PET-01`; tags in the title or `{ tag }` reach the results unchanged.
- **Probe coverage.** `npm run contract:probes` lists the contract probes of every operation. A spec
  covers one by containing `probe:<id>`, usually at the end of the test title; `--gaps` lists the
  uncovered ones, and `npm run contract:probes:write` records new coverage.
- **Known gaps.** When an open issue keeps a case red, mark it with `test.fail` and take its
  reason from `knownGap(key, why)`, which also adds the issue link to the result. It needs
  `tracker.key_pattern` and `tracker.issue_url` in qa-config.

Where this API departs from its contract is recorded in [`docs/contract-notes.md`](docs/contract-notes.md).

## Specs

The specs automate a representative sample of the designed cases (`npm run coverage:status` counts
them per status; backlog PET-02): every technique, layer and category tag in use, the `input-error` and `not-found`
envelopes, the three decision tables and the two actors. A `server-error` is never the expected
answer; it shows only as the departure an armed known gap reproduces. The other cases stay
`approved` as design examples.

| Spec | Cases |
|---|---|
| `specs/pet.spec.ts` | create, read and delete pets; an int64 edge; a mislabelled body; two actors |
| `specs/pet-search.spec.ts` | the find-by-status and find-by-tags decision tables; hostile tags; status moves |
| `specs/store.spec.ts` | orders through the purchase flow, every status and complete combination, malformed bodies, the inventory |
| `specs/user.spec.ts` | users, an int32 edge, two known gaps (password exposure, the login decision table) |
| `specs/store-destructive.spec.ts`, `specs/user-destructive.spec.ts` | `@destructive` cases: left out of every run, run by `npm run lanes:destructive` |
| `specs/errors.spec.ts`, `specs/shared-data.spec.ts` | examples without a case id: path errors, and a resource guard on a seed pet |

## Feature contracts

| Code | Feature | Contract | Registry |
|---|---|---|---|
| `PET` | Pets | [`docs/features/pet.md`](docs/features/pet.md) | [`registry/pet.md`](registry/pet.md), [`pet-update.md`](registry/pet-update.md), [`pet-search.md`](registry/pet-search.md) |
| `STOR` | Store orders and inventory | [`docs/features/store.md`](docs/features/store.md) | [`registry/store.md`](registry/store.md) |
| `USER` | Users and sessions | [`docs/features/user.md`](docs/features/user.md) | [`registry/user.md`](registry/user.md), [`user-record.md`](registry/user-record.md), [`user-session.md`](registry/user-session.md) |
