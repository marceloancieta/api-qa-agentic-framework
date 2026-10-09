# Service pack: petstore

The example API under test, Swagger Petstore v3, run locally with `npm run petstore:up`. Every API
under test gets a pack like this one under `services/<name>/` (ADR 0007). The core (`helpers/`,
`fixtures/`, `scripts/`) never imports from a pack.

## Layout

| Path | Holds | Status |
|---|---|---|
| `service.json` | Name and API version; the version is part of every case identity. | present |
| `types.ts` | Request and response types (generated from the OpenAPI document from E2 on). | present |
| `clients/` | One client per resource, extending `helpers/base-client.ts`. Methods return the raw response. | present |
| `fixtures.ts` | The core `test` extended with this pack's clients. Specs import from here. | present |
| `specs/` | Playwright specs, run by the `api` project. | present |
| `flows/` | Multi-step business sequences over an actor's clients. | CORE-05 |
| `builders/` | Test Data Builders and the Object Mother. | CORE-06 |
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
