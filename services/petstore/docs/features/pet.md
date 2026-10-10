# Pets contract

| | |
|---|---|
| Pack and version | `petstore` `v3` (image `swaggerapi/petstore3:1.0.28`) |
| Feature code | `PET` (case ids `TC-PET-NN`), from backlog PET-01; to be confirmed at the review gate |
| Endpoints | `PUT /pet`<br>`POST /pet`<br>`GET /pet/findByStatus`<br>`GET /pet/findByTags`<br>`GET /pet/{petId}`<br>`POST /pet/{petId}`<br>`DELETE /pet/{petId}`<br>`POST /pet/{petId}/uploadImage` |
| Sources | [`openapi.json`](../../openapi.json) (tracked copy; the live `spec_url` of `local` matched the tracked [digest](../../../../docs/discovery/petstore-digest.json) on 2026-10-10), [contract notes](../contract-notes.md) PN-01 to PN-16, [error envelopes](../../error-envelopes.json), [pack skill](../../../../.claude/skills/petstore-api/SKILL.md), read-only measurements on `local` |
| Intake date | 2026-10-10 |

Source tags used below: **spec** (the OpenAPI document), **PN-NN** (a contract note), **M-NN** (a
measurement in this doc), **assumption** (to confirm, listed at the end). There is no access to the
implementation's code, so completion sources 2 and 3 of
[contract analysis](../../../../docs/references/contract-analysis.md#completing-a-constraint) are
not available; open constraints go to the owner (source 4) or to observation (source 5).

## Endpoint contract

The `Pet`, `Category`, `Tag` and `ApiResponse` schemas live in the spec under
`components.schemas`; they are linked, not copied. `Pet` requires `name` and `photoUrls`; its
`status` is a value set (`Pet.status` in `generated/enums.ts`). The `findByStatus` query parameter
has its own value set with the same members (`FindPetsByStatusStatusParam`).

Every operation declares the `petstore_auth` OAuth2 scheme with `write:pets` and `read:pets`;
`GET /pet/{petId}` also accepts `api_key` (spec). Neither is enforced (PN-05, M-20).

### `PUT /pet` (updatePet)

- Body: `Pet`, required, as JSON, XML or `application/x-www-form-urlencoded` (spec). The pet to
  update is named by the body `id` (spec prose: "Update an existing pet by Id"), although `id` is
  not in `required` (spec). How a nested `category` or `tags` array is form-encoded is not stated
  (G14).
- Responses: `200` `Pet` (JSON or XML), `400` "Invalid ID supplied", `404` "Pet not found", `422`
  "Validation exception", `default` (spec). No error body schema is declared.
- Observed: stores a pet whose `status` is outside the value set or whose `name` is missing, and
  answers `200` (PN-06). Everything else about this operation is **unmeasured**.

### `POST /pet` (addPet)

- Body: `Pet`, required, same three media types (spec). Whether the server assigns an `id` when
  the body omits it, and what happens when the body names an existing `id`, is not stated
  (assumptions A2, A3).
- Responses: `200` `Pet`, `400` "Invalid input", `422` "Validation exception", `default` (spec).
  No `201` is declared for a create.
- Observed: a `name` of the wrong JSON type, or a body without `name`, answers `500` with the
  `server-error` envelope instead of `400` (PN-01). Everything else is **unmeasured**.

### `GET /pet/findByStatus` (findPetsByStatus)

- Query `status`: required, `explode: true`, a single string from the value set, `default:
  available` (spec). The prose says several values can be sent "with comma separated strings"
  (spec), which the schema (one string) and the service (M-09, M-10) both contradict (G1).
- Responses: `200` array of `Pet`, `400` "Invalid status value", `default` (spec).
- Measured: each value in the set answers `200` with only pets of that status (M-06); a value
  outside the set, an empty value, a wrong case or no parameter answer `400` `input-error`
  (M-07, M-08). The decision table `services/petstore/rules/find-by-status.yaml` already records
  these classes.

### `GET /pet/findByTags` (findPetsByTags)

- Query `tags`: required, `explode: true`, array of strings (spec). The prose says tags can be
  sent comma separated and suggests `tag1`, `tag2`, `tag3` for testing (spec).
- Responses: `200` array of `Pet`, `400` "Invalid tag value", `default` (spec).
- Measured: repeated `tags` parameters return the union of matches, with duplicates (M-12,
  G3); a comma-separated value is read as one literal tag (M-13, G2); an empty value answers `400`
  with a body outside the envelope catalogue (M-14, G4); no parameter answers `400`
  `input-error` (M-15).

### `GET /pet/{petId}` (getPetById)

- Path `petId`: required, `integer`, `int64` (spec). No range is declared.
- Responses: `200` `Pet` (JSON or XML), `400` "Invalid ID supplied", `404` "Pet not found",
  `default` (spec). The `404` declares no body (PN-02).
- Measured: an id that is not an int64 answers `400` `input-error`; zero, negative and unknown
  int64 ids answer `404` `not-found` (M-01 to M-04).

### `POST /pet/{petId}` (updatePetWithForm)

- Path `petId` as above. Query `name` and `status`, both optional plain strings (spec). Unlike
  `Pet.status`, this `status` declares no value set (G13).
- Responses: `200` `Pet`, `400` "Invalid input", `default` (spec). No `404` for an unknown pet
  is declared (G13).
- **Unmeasured** (write).

### `DELETE /pet/{petId}` (deletePet)

- Path `petId` as above. Header `api_key`, optional, string (spec).
- Responses: `200` "Pet deleted" with no body schema, `400` "Invalid pet value", `default` (spec).
  No `404` is declared, so the answer for an unknown or already-deleted pet is open (G15).
- **Unmeasured** (write).

### `POST /pet/{petId}/uploadImage` (uploadFile)

- Path `petId` as above. Query `additionalMetadata`, optional string. Body
  `application/octet-stream`, binary, **not** marked required (spec), while `400` "No file
  uploaded" is declared (G16).
- Responses: `200` `ApiResponse` (JSON only), `400`, `404` "Pet not found", `default` (spec).
- Whether the upload changes the pet (for example `photoUrls`) is not stated (G16). **Unmeasured**
  (write).

### Computed analysis

Run on 2026-10-10 against the tracked contract; the tools own the numbers, so rerun them rather
than copying values from here:

- `node scripts/derive-value-sets.mjs --service petstore` (no `--write`): the feature touches two
  value sets, `Pet.status` and the `findByStatus` `status` parameter. `POST /pet/{petId}` `status`
  is not a value set in the contract.
- `npm run contract:floor -- --service petstore`: every one of the eight operations has a
  security term and a positive term; `PUT /pet` and `POST /pet` add required-field, value-set and
  body terms; the four `{petId}` operations add a path-parameter term.
- `npm run contract:probes -- --service petstore --gaps`: the body operations carry the bulk of the
  scheduled and exploratory probes (missing required, int64 overflow, wrong type, null, unknown
  property, enum outside) plus the service-wide body probes; the `{petId}` operations carry the
  path probes. Two probes are already covered by `services/petstore/specs/errors.spec.ts`
  (`p-658044b361`, `p-71b75f7773`). Read-only probes measured in this intake: `p-9e9221c97f`
  (M-08), `p-d5d4a0da19` (M-15), `p-899ef8dbff` (M-03), `p-9785590d88` and `p-0515e92c4d` (M-04).
- `npm run contract:digest:check` and `contract:digest:live`: the tracked and the live contract
  match the tracked digest structurally.

## Business rules

1. A pet has a `name` and a list of `photoUrls`; both are required (spec `Pet.required`). The
   service does not enforce this on `PUT /pet` (PN-06) and answers `500` on `POST /pet` (PN-01).
2. A pet's `status` is one of the `Pet.status` value set (spec). Enforced on the `findByStatus`
   query (M-07); not enforced on the `PUT /pet` body (PN-06); **unmeasured** on `POST /pet` and
   `POST /pet/{petId}`.
3. Finding by status returns exactly the pets whose `status` equals the requested value (spec
   summary; M-06).
4. Finding by status accepts one value per request in practice: a comma-separated list is
   refused and only the first of repeated parameters is used and validated (M-09, M-10). The spec
   prose promises multiple values (G1).
5. Finding by tags returns the pets that carry at least one of the requested tags (spec summary;
   M-11, M-12). Matching is exact and case sensitive (M-13).
6. Matching of `status` and `tags` is case sensitive and does not trim spaces (M-07, M-13).
7. Reading a pet by id returns that pet, or `404` when no pet has that id (spec; M-01, M-02).
8. `PUT /pet` updates the pet named by the body `id`, and answers `404` when it does not exist
   (spec). Whether it creates instead is **unmeasured** (A3).
9. `POST /pet` adds a pet and returns it (spec). Id assignment and behaviour on an existing id are
   **unmeasured** (A2, A3).
10. `POST /pet/{petId}` changes `name` and/or `status` of an existing pet from query parameters
    (spec). Fields not sent keep their value (assumption A5, to prove with a non-default value,
    L-20).
11. `DELETE /pet/{petId}` removes the pet; a later read answers `404` (spec summary; the read-back
    is an assumption, A6).
12. `POST /pet/{petId}/uploadImage` attaches an image to an existing pet and answers an
    `ApiResponse`; it answers `404` for an unknown pet and `400` when no file is sent (spec).
13. Every operation requires OAuth2 `petstore_auth` (and `GET /pet/{petId}` alternatively
    `api_key`) according to the spec; the service requires neither (PN-05, M-20).

## Acceptance criteria

- **Given** a pet created by the case with status `<STATUS>`, **when** it is searched with
  `findByStatus?status=<STATUS>`, **then** the answer is `200`, every item has status `<STATUS>`
  and the created pet is among them (rules 3; L-25).
- **Given** any value outside the `findByStatus` value set (including empty and wrong case),
  **when** it is sent as `status`, **then** the answer is `400` with the `input-error` envelope
  (rule 2; M-07).
- **Given** a pet created by the case with tag `<TAG>`, **when** `findByTags?tags=<TAG>` is
  called, **then** the answer is `200` and the pet appears exactly once (rule 5; G3 for repeats).
- **Given** a pet that exists, **when** it is read by id, **then** the answer is `200` and the body
  matches the `Pet` schema (rule 7).
- **Given** an id that names no pet, **when** it is read, **then** the answer is `404` with the
  `not-found` envelope (rule 7; PN-02).
- **Given** a path id that is not an int64, **when** any `{petId}` operation is called, **then**
  the answer is `400` with the `input-error` envelope and nothing changes (spec; M-03, M-04 for
  `GET`; the write operations **unmeasured**).
- **Given** a pet body missing `name` or `photoUrls`, **when** it is sent to `POST /pet` or
  `PUT /pet`, **then** the spec expects a `400` or `422` and no stored change (rule 1); the
  service answers otherwise (PN-01, PN-06).
- **Given** a pet created by the case, **when** it is deleted and then read, **then** the delete
  answers `200` and the read answers `404` (rule 11; A6).
- **Given** a pet created by the case, **when** `POST /pet/{petId}` sends only `status`, **then**
  the read-back shows the new status and the other fields unchanged (rule 10; A5).

## Access and ownership

- Credentials: none needed by the service (PN-05). The contract declares OAuth2 scopes and an
  `api_key` header; the service ignores the header's presence and value (M-20).
- Roles: none observable. `read:pets` versus `write:pets` cannot be demonstrated (PN-05, backlog
  FUT-07).
- Object identifiers in paths and bodies: `petId` (path, four operations) and `id` (body of
  `PUT /pet` and `POST /pet`). The `Pet` model has no owner field, so object-level authorization
  (BOLA) has nothing to check against a caller on this API; any caller can read or change any pet
  (spec has no owner; PN-05).
- Actors the cases need: `default` and `anonymous`. With the current service both are expected to
  behave alike (PN-05); a difference would be a finding.

## Edge and negative cases

- **Path `petId`** (all four `{petId}` operations; service-wide, L-34): non-numeric, fraction,
  one above the int64 maximum, an overlong digit run, an encoded slash and an injection string
  answer `400` `input-error` on `GET` (M-03, M-04); zero, negative and int64-maximum ids answer
  `404` (M-02). Leading `+`, a leading zero and a trailing slash resolve to the same pet (M-05).
  Write operations **unmeasured**.
- **`findByStatus`**: out-of-set, empty, wrong case, padded with a space, comma list, missing
  (M-07 to M-09); repeated parameters where the first is valid and a later one is not (M-10);
  an unknown extra query parameter is ignored (M-19).
- **`findByTags`**: comma list, repeated tags, the same tag twice, an empty value alone or next to
  a valid one, wrong case, a tag no pet has, a long value, an injection string (M-11 to M-15).
  A query that matches nothing returns an empty array (M-13).
- **Bodies of `PUT /pet` and `POST /pet`**: missing `name`, missing `photoUrls`, wrong JSON types,
  `null`, unknown properties, int64 overflow on `id`, `category.id`, `tags[].id`, `status`
  outside the value set, malformed and truncated JSON, wrong content type, empty body (computed
  probes). Known so far: PN-01, PN-06. Rest **unmeasured**.
- **Form encoding** of `PUT /pet` and `POST /pet` and the XML body variant (spec; G14).
- **`uploadImage`**: no body, wrong content type, unknown pet (spec; G16). **Unmeasured**.
- **Content negotiation**: `Accept` JSON, XML, wildcard and unsupported types (M-16, M-17);
  error bodies change shape with `Accept` (M-17, G5, G7).
- **Method not allowed**: `GET` on `/pet` and on `uploadImage` answers an undeclared `405` (M-18,
  G9).
- **Information exposure**: input errors name an implementation type and echo the raw input
  (M-03, G6).
- **After an error on a write, check the state** (L-35): PN-06 shows a refusal-shaped input being
  stored, so every negative write case needs a read-back.

## Test data

| Placeholder | Stands for | How a case gets it |
|---|---|---|
| `<PET_ID>` | a pet the case owns | created by `aPet` / `PetMother` (`services/petstore/builders/pet-builder.ts`); the id comes from the builder's generated range and is taken from the create response |
| `<SEED_PET_ID>` | one of the shared seed pets 1 to 10 (pack skill) | read only, or changed inside `withResourceGuard(seedPet(pets, id), ...)` (`services/petstore/guards.ts`, L-39) |
| `<UNKNOWN_PET_ID>` | an int64 id no case creates | one above the builder's generated maximum, as `services/petstore/specs/errors.spec.ts` does |
| `<INT64_MAX>`, `<INT64_OVERFLOW>` | the largest int64 and one above it | computed in the spec, never typed |
| `<STATUS>` | a member of `Pet.status` | `generated/enums.ts` (L-36) |
| `<TAG>` | a tag name unique to the case | the builder; never the seed names `tag1`..`tag4`, which shared pets carry (M-11) |
| `<IMAGE_BYTES>` | a small binary payload | generated by the case |

Searches return shared data too (M-06, M-11): cases assert on their own pets being present or
absent, never on counts (L-25). `POST /pet` with an existing id may overwrite it (A3), so a case
never creates with a seed id.

## State transitions

- `status` moves between `available`, `pending` and `sold` through `PUT /pet` or
  `POST /pet/{petId}` (spec). The spec states no allowed or refused moves; whether every move is
  allowed (for example `sold` back to `available`) is an open question (A4). **Unmeasured**.
- Create, then read, then delete, then read `404` (rules 9, 7, 11). **Unmeasured**.
- Repeats that should be idempotent: the same `PUT /pet` twice, the same `POST /pet/{petId}`
  twice, `DELETE` of an already-deleted pet (answer open, G15). **Unmeasured**.

## Measurements

All on 2026-10-10 against the `local` environment, read-only (`GET`, `HEAD`, `OPTIONS`), with
`Accept: application/json` unless stated.

| # | Request | Observed |
|---|---|---|
| M-01 | `GET /pet/<SEED_PET_ID>` for each seed pet | `200` JSON, every body has `id`, `category`, `name`, `photoUrls`, `tags`, `status`; statuses in the value set (7 available, 2 pending, 1 sold); seed tags are `tag1`..`tag4` |
| M-02 | `GET /pet/0`, `GET /pet/-1`, `GET /pet/<UNKNOWN_PET_ID>`, `GET /pet/<INT64_MAX>` | `404`, body `Pet not found` |
| M-03 | `GET /pet/<INT64_OVERFLOW>`, `GET /pet/abc`, `GET /pet/1.5`, `GET /pet/%201` | `400` `input-error`; message names the Java type (`java.lang.Long`) and echoes the input |
| M-04 | `GET /pet/` + 300 digits, `GET /pet/1%2F2`, `GET /pet/` + an encoded `' OR '1'='1` | `400` `input-error`, input echoed decoded |
| M-05 | `GET /pet/+<SEED_PET_ID>`, `GET /pet/0<SEED_PET_ID>`, `GET /pet/<SEED_PET_ID>/`, `?foo=bar` added | `200`, the same pet |
| M-06 | `GET /pet/findByStatus?status=<STATUS>` for each member | `200` array; every item has the requested status |
| M-07 | `GET /pet/findByStatus?status=` with `lost`, empty, `AVAILABLE`, `%20available`, an injection string | `400` `input-error` naming the allowed values |
| M-08 | `GET /pet/findByStatus` (no parameter) | `400` `input-error`, "missing required query parameter" |
| M-09 | `GET /pet/findByStatus?status=available,sold` | `400` `input-error` (the comma list is one value) |
| M-10 | `?status=sold&status=available`; `?status=available&status=lost`; `?status=lost&status=available` | `200` with sold pets only; `200` with available pets only; `400`: only the first value is used and validated |
| M-11 | `GET /pet/findByTags?tags=tag1` (and `tag2`, `tag3`) | `200`, the seed pets carrying that tag |
| M-12 | `?tags=tag1&tags=tag2`; `?tags=tag1&tags=tag1` | `200`, union of matches, a pet carrying both tags listed twice; the same tag twice lists every match twice |
| M-13 | `?tags=tag1,tag2`, `?tags=tag1,%20tag2`, `?tags=TAG1`, a tag no pet has, a 2000-character tag, an injection string | `200` `[]` |
| M-14 | `?tags=` ; `?tags=tag1&tags=` ; `?tags=&tags=tag1` | `400` with plain-text body `No tags provided. Try again?`, `Content-Type` following `Accept` (JSON label with JSON accept, XML with `*/*` or XML); the two mixed forms answer `200` with the `tag1` matches |
| M-15 | `GET /pet/findByTags` (no parameter) | `400` `input-error`, "missing required query parameter" |
| M-16 | `GET /pet/<SEED_PET_ID>` with `Accept` XML, none, `*/*`, `text/plain` | XML for XML; JSON for the others, `text/plain` included (no `406`); XML lists use an `ArrayList`/`item` root |
| M-17 | `GET /pet/<UNKNOWN_PET_ID>` with `Accept` JSON, XML, `*/*`, none, `text/plain`; `GET /pet/abc` and `findByStatus?status=lost` with XML | `404` plain text labelled `application/json` with JSON accept, `application/xml` otherwise; `400` answers with XML accept use an `<ApiError>` XML body |
| M-18 | `GET /pet`, `GET /pet/<SEED_PET_ID>/uploadImage` | `405` `{"code":405,...}` (XML `ApiError` with XML accept) |
| M-19 | `OPTIONS` on `/pet`, `/pet/<SEED_PET_ID>`, `findByStatus`, `findByTags`, `uploadImage`; `HEAD` on the reads | `OPTIONS` `200` with `Allow` (`POST,OPTIONS,PUT`; `HEAD,DELETE,POST,GET,OPTIONS`; `HEAD,GET,OPTIONS`; `POST,OPTIONS`); `HEAD` mirrors the `GET` status with no body; every response carries `Access-Control-Allow-Origin: *` |
| M-20 | `GET /pet/<SEED_PET_ID>` with an `api_key` placeholder value, with an empty value, and without the header | `200` in all three (PN-05) |
| M-21 | 20 sequential reads each of `/pet/<SEED_PET_ID>`, `findByStatus`, `findByTags` | median 3 to 4 ms, slowest single read 87 ms; no latency budget is declared anywhere |

Where a measurement and the spec differ, the measurement is what the service does; the
differences are listed below.

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | `findByStatus` prose promises comma-separated multiple values; a comma list is refused and repeated parameters are reduced to the first, which alone is validated | spec prose; M-09, M-10 | PN-10 (no tracker configured) |
| G2 | `findByTags` prose promises comma-separated tags; a comma list is matched as one literal tag and returns `[]` | spec prose; M-13 | PN-11 (no tracker configured) |
| G3 | `findByTags` with repeated tags lists a pet once per matching tag (duplicates in the result) | M-12 | PN-11 (no tracker configured) |
| G4 | `findByTags` with an empty `tags` answers `400` with a plain-text body that matches no envelope in `error-envelopes.json`, labelled JSON or XML by `Accept` | M-14 | PN-08 (no tracker configured) |
| G5 | The `not-found` body is plain text labelled `application/json` when the client accepts only JSON; PN-02 records the XML label seen with a wildcard `Accept` | M-17; PN-02 | PN-02 |
| G6 | Input errors name the implementation type (`java.lang.Long`) and echo the raw input, including injection strings | M-03, M-04, M-07 | PN-07 (no tracker configured) |
| G7 | With `Accept` XML, `400` and `405` answers use an `<ApiError>` XML envelope that the envelope catalogue does not list | M-17, M-18 | PN-08 (no tracker configured) |
| G8 | `400` "Invalid ID supplied" is declared but what an invalid id is is not; zero and negative ids answer `404` | spec; M-02 | PN-15 (no tracker configured) |
| G9 | `405` answers are undeclared on every pet operation | M-18 | PN-08 (no tracker configured) |
| G10 | Declared OAuth2 and `api_key` security is not enforced | spec; PN-05, M-20 | PN-05 |
| G11 | `PUT /pet` stores an out-of-set `status` and a pet without `name`, answering `200` | PN-06 | PN-06 |
| G12 | `POST /pet` answers `500` for a wrong-type or missing `name` | PN-01 | PN-01 |
| G13 | `POST /pet/{petId}` `status` declares no value set, and no `404` is declared for an unknown pet | spec | no tracker configured |
| G14 | `422` "Validation exception" is declared on `PUT /pet` and `POST /pet` but never described or observed; form-encoding of nested `category` and `tags` is undefined | spec; PN-01, PN-06 | no tracker configured |
| G15 | `DELETE /pet/{petId}` declares no `404`; the answer for an unknown or already-deleted pet is open | spec | no tracker configured |
| G16 | `uploadImage` body is not marked required while `400` "No file uploaded" is declared; the effect of an upload on the pet is unstated | spec | no tracker configured |

## Out of scope

- Store and user operations (other features of the pack).
- The public demo environment: read-only for this suite and not measured here.
- Authorization matrices and BOLA: the service enforces no access (PN-05, backlog FUT-07).
- Rate limits and payload-size limits: no limit is stated by the contract or the owner
  (contract analysis section 7).
- Measuring write behaviour: design mode is read-only; see the proposal under A1.

## Assumptions to confirm

- **A1.** Write behaviour (POST, PUT, DELETE, uploadImage) is unmeasured. Should an
  execution-mode run against pets it creates measure G13 to G16, A2 to A6 and the body probes
  before design, or should design proceed with behaviour-defining probes (L-56)?
- **A2.** Does `POST /pet` assign an `id` when the body omits it?
- **A3.** Does `POST /pet` with an existing `id` overwrite that pet, and does `PUT /pet` with an
  unknown `id` answer `404` or create the pet?
- **A4.** Are all `status` moves allowed (including `sold` back to `available`)?
- **A5.** Does `POST /pet/{petId}` leave fields it was not sent unchanged?
- **A6.** After `DELETE /pet/{petId}`, does a read answer `404`, and what does a second delete
  answer?
- **A7.** Is first-value-wins on repeated `status` (G1) and duplicate results on repeated `tags`
  (G3) to be treated as defects or tolerated as `by-design`?
- **A8.** Should the XML error envelope (G7) and the empty-tags body (G4) be added to the envelope
  catalogue, and should cases assert JSON only?
- **A9.** Feature code `PET` is taken from backlog PET-01 and awaits confirmation at the gate.
