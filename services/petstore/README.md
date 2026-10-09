# Service pack: petstore

The example API under test, Swagger Petstore v3, run locally with `npm run petstore:up`. Every API
under test gets a pack like this one under `services/<name>/` (ADR 0007). The core (`helpers/`,
`fixtures/`, `scripts/`) never imports from a pack.

## Layout

| Path | Holds | Status |
|---|---|---|
| `service.json` | Name, API version (part of every case identity), identity fields to pseudonymize in evidence, contract file. | present |
| `openapi.json` | The contract under test (Petstore 1.0.28, OpenAPI 3.0.4, Apache-2.0). Response bodies are validated against its schemas. | present |
| `error-envelopes.json` | The error formats this API answers with, by kind, for `expectErrorEnvelope`. | present |
| `types.ts` | Request and response types and enum value sets (generated from the OpenAPI document from E2 on). | present |
| `clients/` | One client per resource, extending `helpers/base-client.ts`. Paths with parameters use `this.route('pet/{petId}', { petId })`. Methods return the raw response. | present |
| `fixtures.ts` | The core `test` extended with this pack's clients and `actor(name)`. Specs import from here. | present |
| `specs/` | Playwright specs, run by the `api` project. | present |
| `__tests__/` | Offline unit tests of the pack (builders), run by the `unit` project. | present |
| `flows/` | Multi-step business sequences over an actor's clients, one named step each. | present |
| `builders/` | Test Data Builders (`aPet`, `anOrder`) and the Object Mother (`PetMother`). | present |
| `rules/` | Business rules and decision tables as YAML. | E5 |
| `registry/` | Designed test cases and their status. | E5/E6 |
| `docs/` | Contract notes, error envelopes, API map. | E5/E6 |

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

See `specs/purchase.spec.ts` for all three together.

## Contract checks

- **Schemas.** `expect(body).toMatchSchema(contract, 'Pet')` validates a body against the OpenAPI
  schema with the JSON Schema dialect of the document's version, and lists every mismatch.
- **Error envelopes.** `await expectErrorEnvelope(response, envelopes, 'input-error')` checks status,
  content type and body shape of a documented error kind. Pass `{ field }` only for envelopes that
  report the field in a key; Petstore's do not, so its cases assert the kind only.
- **Identity.** A title that starts with a case id (`TC-PET-01 ...`) gives the result the stable
  identity `petstore-v3-TC-PET-01`; tags in the title or `{ tag }` reach the results unchanged.
- **Known gaps.** When an open issue keeps a case red, mark it with `test.fail` and take its
  reason from `knownGap(key, why)`, which also adds the issue link to the result. It needs
  `tracker.key_pattern` and `tracker.issue_url` in qa-config.

Observed and not yet tracked: a pet body whose `name` is a number answers `500` (server-error)
instead of `400`, and not-found bodies are plain text served as `application/xml`.
