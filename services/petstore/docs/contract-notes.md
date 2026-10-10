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
| PN-02 | "Not found" answers (pet, order, user) are plain text (`Pet not found`). The content type follows `Accept`: `application/xml` with no `Accept` or a wildcard, `application/json` when JSON is asked, although the body is not JSON. The document declares no body for these 404s. | `GET /pet/{id}` for an id that was never created, with and without `Accept: application/json` | contract drift | `untracked` |
| PN-03 | Input errors name the offending parameter only inside `message`; no key carries the field. Cases check the error kind; which field was blamed is not observable. | `GET /pet/findByStatus?status=lost` | contract gap | `by-design` |
| PN-04 | `shipDate` is echoed with a `+00:00` offset where the request sent `Z` (`2026-10-09T10:00:00.000Z` comes back as `2026-10-09T10:00:00.000+00:00`). Same instant, different text. | `POST /store/order`, then `GET /store/order/{id}` | format difference | `by-design` |
| PN-05 | The `api_key` header is accepted with any value and not required for the operations used so far, so this API cannot demonstrate an authorization matrix (see backlog FUT-07). | Any request with or without `api_key` | environment limit | `by-design` |
| PN-06 | `PUT /pet` stores a pet whose `status` is outside the enum (`lost`) or that lacks the required `name`, and answers `200`. Found while designing the shared-data guard: a probe of this kind corrupted seed pet 1 until it was restored by hand. Cases that probe it must use a dedicated pet or run inside `withResourceGuard(..., { expectChange: false })`. | `PUT /pet` with `{"id": <id>, "name": "x", "photoUrls": [], "status": "lost"}` | defect | `untracked` |
| PN-07 | Answers disclose the implementation: input errors name the Java type (`class java.lang.Long`) and echo the raw input, injection strings included; every answer carries a `Server` header with the web server version; `OPTIONS` returns a WADL document naming the framework version. | `GET /pet/abc`; `OPTIONS /store/order/1` | information exposure | `untracked` |
| PN-08 | Error formats the document does not declare: unsupported methods answer `405` with a `{code, message}` JSON body; with `Accept: application/xml`, `400` and `405` answers use an `<ApiError>` XML body; an empty `tags` answers `400` with the plain text `No tags provided. Try again?`; a path of about 8 KB answers `414` as an HTML page without CORS headers. | `GET /pet`, `GET /store/order`, `GET /user/`; `GET /pet/abc` with `Accept: application/xml`; `GET /pet/findByTags?tags=` | contract gap | `untracked` |
| PN-09 | The inventory is described as pet counts by status, but its keys are order statuses (`placed`, `approved`, `delivered`) and each value is the sum of the quantities of the orders in that status. | `GET /store/inventory`, compared with `GET /store/order/1` to `/3` | contract drift | `untracked` |
| PN-10 | `findByStatus` is described as taking comma-separated values. A comma list answers `400`, and with repeated `status` parameters only the first is used and validated (`?status=available&status=lost` answers `200`). | `GET /pet/findByStatus?status=available,sold`; `?status=available&status=lost` | contract drift | `untracked` |
| PN-11 | `findByTags` is described as taking comma-separated tags. A comma list is matched as one literal tag and returns `[]`; repeated `tags` parameters list a pet once per matching tag, so the same tag twice returns every match twice. | `GET /pet/findByTags?tags=tag1,tag2`; `?tags=tag1&tags=tag1` | defect | `untracked` |
| PN-12 | `GET /user/login` answers `200` with a new session for any input: no parameters, an unknown user or a wrong password. The declared `400` is never produced. Its `X-Expires-After` header is Java date text rather than `date-time`, and with `Accept: application/json` the plain-text body is labelled JSON. | `GET /user/login` without parameters; the same with `Accept: application/json` | defect | `untracked` |
| PN-13 | Reading a user returns its stored `password` to any caller, anonymous included. The schema has the field, so this conforms to the document, but it exposes a credential. | `GET /user/<SEED_USERNAME>` | information exposure | `untracked` |
| PN-14 | XML representations differ from the schema: the user root element is `User` (declared `user`); an order's `shipDate` is epoch milliseconds; the inventory, declared JSON only, is served as XML when asked. An unsupported `Accept` answers `200` JSON instead of `406`. | `GET /user/<SEED_USERNAME>`, `GET /store/order/1`, `GET /store/inventory` with `Accept: application/xml`; `GET /pet/1` with `Accept: text/plain` | format difference | `untracked` |
| PN-15 | What an invalid id is stays undefined. Zero and negative pet or order ids answer `404`, not the declared `400`. The order read's prose says ids up to 5 or above 10 are valid and others raise errors; every unknown id answers `404`. | `GET /pet/0`, `GET /pet/-1`, `GET /store/order/7` | contract drift | `untracked` |
| PN-16 | Path ids are parsed leniently: a leading `+`, a leading zero and a trailing slash resolve to the same record. | `GET /pet/+1`, `GET /pet/01`, `GET /store/order/01` | format difference | `by-design` |

PN-07 to PN-16 were measured read-only at intake on 2026-10-10; the feature contracts in
[`features/`](features/) hold the full measurements.

The error formats themselves are catalogued in `../error-envelopes.json`; PN-01 and PN-02 are why
`server-error` and `not-found` exist there.
