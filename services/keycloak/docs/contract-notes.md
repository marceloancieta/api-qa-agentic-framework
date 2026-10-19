# Keycloak Admin REST API: contract notes

Observed departures from the published contract, one entry per finding, each with its status and,
when filed, its issue key. Written by the phases (`qa-intake` measures, `qa-run` observes).
Observed on the local Keycloak 26.7.5 (`docker-compose.yml`, service `keycloak`, realm `qa`)
against the published OpenAPI document (`../openapi.json`).

Each entry is a row of the table below, with an id `<PREFIX>-NN` that keeps for good. Choose a
prefix for this pack that no other pack uses and that is not an id family of the repository (`L`,
`TC`, `REQ`, the backlog prefixes such as `CI` or `GATE`); the example packs use `PN` and
`VN`. `lint-docs` checks every cited id against this table.

**Status:** `untracked` (observed, no issue yet) · `tracked` (issue filed, key given) · `by-design`
(a difference to tolerate, not a defect).

| Id | Observation | Reproduce | Kind | Status |
|---|---|---|---|---|
| KN-01 | The contract declares no security scheme and no `security` requirement, yet every admin operation answers `401` without a bearer token and `403` to a token whose client lacks the `realm-management` role the operation needs. The derived floor therefore counts no security case. | `GET /admin/realms/qa/users` without a token, then with the `no-role` actor | contract gap | `untracked` |
| KN-02 | The users operations declare neither `401` nor `404`. An unknown user id answers `404` `{"error": "User not found"}`, an unknown realm `404` `{"error": "Realm not found."}`, and an expired or missing token `401`. | `GET /admin/realms/qa/users/<UNKNOWN_ID>` as `admin` | contract gap | `untracked` |
| KN-03 | A query parameter of the wrong type (`max=abc`, `first=1.5`, `max` above the int32 maximum) answers `404` `{"error": "HTTP 404 Not Found"}`, not a `400`: the parameter conversion fails before the operation runs. | `GET /admin/realms/qa/users?max=abc` as `admin` | error-code mismatch | `untracked` |
| KN-04 | A boolean query parameter with a value that is not a boolean (`enabled=maybe`) is accepted with `200`, on the list and on the count. | `GET /admin/realms/qa/users?enabled=maybe` as `admin` | weak validation | `untracked` |
| KN-05 | Service-account users are left out of the unfiltered list and of the count (`[]` and `0` on a realm whose only users are its three service accounts), but a `username` search returns them. | `GET /admin/realms/qa/users`, then `?username=service-account&exact=false`, as `admin` | inconsistency | `untracked` |
| KN-06 | `createdAfter` and `createdBefore` also take an epoch timestamp: an invalid value answers `400` naming both formats, while the spec states ISO-8601 dates only. | `GET /admin/realms/qa/users?createdAfter=not-a-date` as `admin` | contract gap | `untracked` |
| KN-07 | Errors come in three shapes: `{"error": "<text>"}` for `401`, `403`, `404` and query validation; `{"errorMessage": "<text>"}` for a body the server refuses after reading it (a missing username `400`, a duplicate username `409`); and `{"error": "unknown_error", "error_description": "Cannot parse the JSON"}` (`400`) for a body field of the wrong type, where `error` is a code, not text. The spec gives the `400` and `409` bodies an empty schema. Measured by the spec run of the users registry on 2026-10-16. | `POST /admin/realms/qa/users` as `admin` with `enabled: "yes"` | contract gap | `untracked` |
| KN-08 | The token endpoint answers a wrong client secret with `401` and `error` `unauthorized_client`; RFC 6749 section 5.2 names `invalid_client` for a failed client authentication. Outside the admin API's contract. | token request for `qa-admin` with a wrong secret | standard departure | `untracked` |
| KN-09 | The running server does not serve its OpenAPI document; the contract is the file Keycloak publishes for the release, so `spec_url` points there and `contract:digest:live` reads it. | the pack's `spec_url` in qa-config | environment limit | `by-design` |
