# Users contract

> **Approved** at the intake review gate on 2026-10-16. Read-only intake against the local Keycloak;
> the behaviour of the writes is **unmeasured** until the spec run of the registry.

| | |
|---|---|
| Pack and version | `keycloak` `v26` (Keycloak 26.7.5, pinned by digest in `docker-compose.yml`) |
| Feature code | `USERS` (case ids `TC-USERS-NN`), agreed at the intake review gate (A4) |
| Endpoints | `GET /admin/realms/{realm}/users`<br>`POST /admin/realms/{realm}/users`<br>`GET /admin/realms/{realm}/users/count`<br>`GET /admin/realms/{realm}/users/{user-id}`<br>`PUT /admin/realms/{realm}/users/{user-id}`<br>`DELETE /admin/realms/{realm}/users/{user-id}` |
| Sources | [`openapi.json`](../../openapi.json) (the document Keycloak publishes for 26.7.5, OpenAPI 3.0.3, [digest](../../../../docs/discovery/keycloak-digest.json)), [contract notes](../contract-notes.md) KN-01 to KN-09, the realm the pack imports ([`realm/qa-realm.json`](../../realm/qa-realm.json)), read-only measurements on the local container |
| Intake date | 2026-10-16 (read-only) |

Source tags used below: **spec** (the OpenAPI document), **KN-NN** (a contract note), **M-NN** (a
read-only measurement, listed under [Measurements](#measurements)), **realm** (the realm file the
pack imports), **assumption** (listed at the end).

The Users resource has 34 operations in the contract; this feature takes the six that create,
read, list, count, update and delete a user, the sample of FUT-15. The others are
[out of scope](#out-of-scope).

## Endpoint contract

Every operation takes the path parameter `realm`, the realm's name ("not id!", spec), always `qa`
here. The user body and answer are `UserRepresentation` (`components.schemas`, no required
property, spec). Value sets and the probe matrix are generated in `generated/`; the derived floors
are 3, 6, 3, 4, 7 and 5 cases for the operations in the order of the table above, 28 in all
(`npm run contract:floor -- --service keycloak`), and count no security case because the contract
declares none (KN-01).

| Operation | Parameters (spec) | Declared answers (spec) | Measured |
|---|---|---|---|
| `GET /users` | query `briefRepresentation`, `createdAfter`, `createdBefore`, `email`, `emailVerified`, `enabled`, `exact`, `first` (int32, offset), `firstName`, `idpAlias`, `idpUserId`, `lastName`, `max` (int32, default 100), `q`, `search`, `username` | `200` array of `UserRepresentation`; `403` | `401` (M-01), `404` on a malformed integer (KN-03, M-06), `400` on a malformed date (KN-06, M-08) |
| `POST /users` | body `UserRepresentation` ("Username must be unique") | `201`; `400`, `403`, `409`, `500`, bodies with an empty schema | unmeasured |
| `GET /users/count` | the filters of the list, without `first`, `max` and `briefRepresentation` | `200` int32; `403` | `401` (M-01); an unknown parameter is ignored (M-07) |
| `GET /users/{user-id}` | path `user-id` (string); query `userProfileMetadata` | `200` `UserRepresentation`; `403` | `404` for an unknown id (KN-02, M-09) |
| `PUT /users/{user-id}` | path `user-id`; body `UserRepresentation` | `204`; `400`, `403`, `409`, `500` | unmeasured |
| `DELETE /users/{user-id}` | path `user-id` | `204`; `400`, `403` | unmeasured |

Not declared anywhere: `401` (KN-01, KN-02), `404` for an unknown user or realm (KN-02), the
`Location` header of the `201` (assumption A2). Error bodies have two shapes (KN-07); the
`error-envelopes.json` catalogue is written by `qa-automate`.

## Business rules

1. **R1** A username is unique in a realm; creating a second user with it is refused with `409`
   (spec: summary of `POST` and its `409`; unmeasured).
2. **R2** The list returns at most `max` users, 100 when `max` is absent, starting at offset
   `first` (spec, parameter descriptions; unmeasured with data, the realm has no listed user, M-03).
3. **R3** `username`, `email`, `firstName` and `lastName` match as substrings unless `exact=true`
   (spec, `exact`); `search` matches username, first or last name, or email (spec).
4. **R4** The count answers the number of users the same filters would list (spec, description of
   the count), with the exception of KN-05.
5. **R5** Service-account users are not listed or counted without a filter, but a `username` search
   finds them (KN-05, M-04, M-05).
6. **R6** Reads need a role that views users; writes need one that manages users. Without a token
   the answer is `401`, with a token lacking the role `403` (KN-01, M-01, M-02, realm).
7. **R7** A token is valid for 60 seconds; an expired one is refused with `401` (realm, M-12).
8. **R8** The roles of one realm give no access to another: the `qa` admin is refused with `403` on
   `master` (M-11).

## Acceptance criteria

- **Given** a user created by the case, **when** `admin` reads it by id, **then** `200` and a
  `UserRepresentation` whose `username` is the one sent.
- **Given** that user, **when** `viewer` lists with `username=<USERNAME>&exact=true`, **then** `200`
  and exactly that user; the count with the same filter is `1`.
- **Given** that user, **when** `admin` updates its `firstName`, **then** `204`, and a read shows
  the new `firstName` with the other fields unchanged.
- **Given** that user, **when** `admin` deletes it, **then** `204`, and a read answers `404`.
- **Given** any of the six operations, **when** it is called without a token, **then** `401`;
  with `no-role`, **then** `403`; a write with `viewer`, **then** `403`, and nothing changed.

## Access and ownership

| Operation | `anonymous` | `no-role` | `viewer` | `admin` |
|---|---|---|---|---|
| `GET /users`, `GET /users/count`, `GET /users/{user-id}` | `401` (M-01) | `403` (M-02) | `200` (M-02) | `200` (M-02) |
| `POST /users`, `PUT /users/{user-id}`, `DELETE /users/{user-id}` | `401` (assumption A1) | `403` (assumption A1) | `403` (assumption A1) | `201` / `204` (spec) |

Roles come from the realm: `qa-admin` has `view-users`, `query-users`, `manage-users`,
`query-groups` and `view-realm`; `qa-viewer` the same without `manage-users`; `qa-no-role` none.
This is function-level authorization (BFLA): every case of a write runs as `viewer` too. The ids in
the path are realm-wide, not owned by a caller: there is no object-level ownership to check inside a
realm, and the realm boundary is R8. Actors: `default` (= `admin`), `anonymous`, `admin`, `viewer`,
`no-role` (qa-config).

## Edge and negative cases

- Malformed integers in `first` and `max` (letters, a fraction, above the int32 maximum): `404`
  (KN-03); negative values: accepted with `200` (M-06).
- A boolean query parameter that is not a boolean: accepted (KN-04).
- A malformed `createdAfter`: `400` whose message names an epoch timestamp too (KN-06).
- An unknown, malformed (`not-a-uuid`), overlong (300 characters) or encoded-slash `user-id`: `404`
  `User not found` (M-09, M-10).
- An unknown realm: `404` `Realm not found.` (M-11).
- Body cases of `POST` and `PUT`, unmeasured: missing or empty `username` (seen once at setup as
  `400` `{"errorMessage": "User name is missing"}`, KN-07), a duplicate username (`409`, R1),
  unknown properties, wrong types and nulls (the probe matrix lists 104 wrong-type and 104 null
  probes per write), malformed JSON, a wrong content type, a `PUT` that changes `username` or `id`.
- `HEAD /users` answers `200` with a token, and `OPTIONS` `200` without one (M-13); neither is in the
  contract.

## Test data

| Placeholder | Stands for | How a case gets it |
|---|---|---|
| `<REALM>` | the realm, always `qa` | the pack's realm file |
| `<USERNAME>` | a unique username | a builder (`aUser`), seeded |
| `<USER_ID>` | the id of a user the case created | the `Location` header of the `201`, or a `username` search (assumption A2) |
| `<UNKNOWN_ID>` | an id no user has | the nil UUID |

The realm starts with no listed user (M-03), so every case creates the users it reads and deletes
them afterwards. The three service-account users are shared records and are never changed.

## State transitions

- Absent → created (`POST`, `201`); created → updated (`PUT`, `204`); created → deleted (`DELETE`,
  `204`); deleted → absent (a read answers `404`).
- Repeats: a second `POST` with the same username is refused (`409`, R1); a second `DELETE` of the
  same id is expected to answer `404` (assumption A3); a `PUT` sent twice leaves the same state.

## Measurements

All on 2026-10-16, local container, realm `qa`, tokens obtained through `laneCredential` (the
credential exchange); `GET`, `HEAD` and `OPTIONS` only.

| # | Request | Answer |
|---|---|---|
| M-01 | `GET /users`, `/users/count`, `/users/<UNKNOWN_ID>` without a token, and with `Bearer not-a-token` | `401` `application/json` `{"error": "HTTP 401 Unauthorized"}` |
| M-02 | the same reads as `no-role`, `viewer`, `admin` | `no-role` `403` `{"error": "HTTP 403 Forbidden"}`; `viewer` and `admin` `200` |
| M-03 | `GET /users` and `/users/count` as `admin`, `viewer` | `200` `[]` and `200` `0` |
| M-04 | `GET /users?username=service-account&exact=false` as `admin` | `200`, three users; keys `access`, `createdTimestamp`, `disableableCredentialTypes`, `emailVerified`, `enabled`, `id`, `notBefore`, `requiredActions`, `totp`, `username` |
| M-05 | `GET /users?search=*`, `?briefRepresentation=true`, `?max=0` | `200` `[]` |
| M-06 | `GET /users?max=abc`, `?max=<INT32_MAX+1>`, `?first=abc`, `?first=1.5`; `?max=-1`, `?first=-1` | `404` `{"error": "HTTP 404 Not Found"}`; the negatives `200` |
| M-07 | `GET /users/count?enabled=maybe`, `?username=<NO_MATCH>`, `?max=1`; `GET /users?enabled=maybe` | `200` `0`; the list `200` `[]` |
| M-08 | `GET /users?createdAfter=not-a-date` | `400` `{"error": "Invalid value for 'createdAfter', expected format is yyyy-MM-dd or an Epoch timestamp"}` |
| M-09 | `GET /users/<UNKNOWN_ID>`, `/users/not-a-uuid`, a 300-character id, `/users/a%2Fb` as `admin` | `404` `{"error": "User not found"}` |
| M-10 | `GET /users/<UNKNOWN_ID>` as `no-role` | `403`, before the id is looked up |
| M-11 | `GET /admin/realms/<UNKNOWN_REALM>/users`, `GET /admin/realms/master/users` as `admin` | `404` `{"error": "Realm not found."}`; `403` |
| M-12 | `GET /users` as `admin` with a token obtained 65 seconds earlier | `401`; `laneCredential` reported the renewal at 54 seconds |
| M-13 | `OPTIONS /users` without a token; `HEAD /users` as `admin` | `200`, no `Allow` header; `200` |

While the pack was set up, before this intake, a probe of the infrastructure also sent two writes to
the disposable in-memory container: `POST /users` as `viewer` (`403`) and as `admin` (`201`), and an
empty username (`400` `{"errorMessage": "User name is missing"}`). Design must not rely on them:
they were not an intake measurement, and the writes stay unmeasured until a spec run.

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | No security scheme declared; `401` and `403` behaviour comes from the realm, not the contract | KN-01, M-01, M-02 | searched, none |
| G2 | `401` and `404` not declared for the six operations | KN-02, M-01, M-09 | searched, none |
| G3 | A malformed integer query parameter answers `404`, not `400` | KN-03, M-06 | searched, none |
| G4 | A non-boolean value of a boolean query parameter is accepted | KN-04, M-07 | searched, none |
| G5 | Service accounts hidden from the unfiltered list and the count, found by a `username` search | KN-05, M-03, M-04 | searched, none |
| G6 | `createdAfter` and `createdBefore` take an epoch timestamp the spec does not mention | KN-06, M-08 | searched, none |
| G7 | Two error body shapes; `400` and `409` bodies have an empty schema | KN-07 | searched, none |
| G8 | The derived floor has no security case, so it understates what this feature needs | KN-01 | searched, none |
| G9 | The `201` of `POST` declares no `Location` header and no body: how a case learns the new id is unmeasured | spec | searched, none |

## Out of scope

The other 28 operations of the Users resource (credentials, role mappings, groups of a user,
sessions, consents, federated identities, required actions, impersonation, the user profile), the
token endpoint itself (KN-08), other realms beyond the boundary check of R8, and any operation
outside Users.

## Assumptions to confirm

- **A1** The writes refuse `anonymous` with `401` and `no-role` and `viewer` with `403`, as the reads
  do. Confirmed only by a spec run.
- **A2** The `201` of `POST` carries a `Location` header that ends with the new user's id; if not, a
  case finds the id with an exact `username` search.
- **A3** A second `DELETE` of the same id answers `404`; the spec declares no `404` for `DELETE`.
- **A4** Confirmed at the gate: the feature code is `USERS` (the scaffolder's suggestion);
  Petstore's user feature uses `USER`, and codes only need to be unique within a pack.
