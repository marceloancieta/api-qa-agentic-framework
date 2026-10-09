# Petstore contract notes

Observed behaviour of the local Petstore image (`swaggerapi/petstore3:1.0.28`) that differs from its
OpenAPI document (`../openapi.json`) or that a case must know about. Each entry says how to reproduce
it and how it is tracked. In E6 every entry becomes a designed case; a defect becomes a known gap
linked to an issue once the repository has a tracker.

**Status:** `untracked` (observed, no issue yet) · `tracked` (issue filed, key given) · `by-design`
(a difference to tolerate, not a defect).

| Id | Observation | Reproduce | Kind | Status |
|---|---|---|---|---|
| PN-01 | A pet body whose `name` has the wrong JSON type (a number) answers `500` with a log reference, where a `400` input error is expected. A body missing `name` does the same. | `POST /pet` with `{"name": 5}` or `{"photoUrls": []}` | defect | `untracked` |
| PN-02 | "Not found" answers (pet, order, user) are plain text (`Pet not found`) served as `Content-Type: application/xml`. The document declares no body for these 404s. | `GET /pet/{id}` for an id that was never created | contract drift | `untracked` |
| PN-03 | Input errors name the offending parameter only inside `message`; no key carries the field, so a case can assert the error kind but not which field was blamed. | `GET /pet/findByStatus?status=lost` | contract gap | `by-design` |
| PN-04 | `shipDate` is echoed with a `+00:00` offset where the request sent `Z` (`2026-10-09T10:00:00.000Z` comes back as `2026-10-09T10:00:00.000+00:00`). Same instant, different text. | `POST /store/order`, then `GET /store/order/{id}` | format difference | `by-design` |
| PN-05 | The `api_key` header is accepted with any value and not required for the operations used so far, so this API cannot demonstrate an authorization matrix (see backlog FUT-07). | Any request with or without `api_key` | environment limit | `by-design` |

The error formats themselves are catalogued in `../error-envelopes.json`; PN-01 and PN-02 are why
`server-error` and `not-found` exist there.
