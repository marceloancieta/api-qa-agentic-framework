# Pets contract

| | |
|---|---|
| Pack and version | `petstore` `v3` (image `swaggerapi/petstore3:1.0.28`) |
| Feature code | `PET` (case ids `TC-PET-NN`), from backlog PET-01; approved with this contract at the intake review gate |
| Endpoints | `PUT /pet`<br>`POST /pet`<br>`GET /pet/findByStatus`<br>`GET /pet/findByTags`<br>`GET /pet/{petId}`<br>`POST /pet/{petId}`<br>`DELETE /pet/{petId}`<br>`POST /pet/{petId}/uploadImage` |
| Sources | [`openapi.json`](../../openapi.json) (tracked copy; the live `spec_url` of `local` matched the tracked [digest](../../../../docs/discovery/petstore-digest.json) on 2026-10-10), [contract notes](../contract-notes.md) PN-01 to PN-25, [error envelopes](../../error-envelopes.json), [pack skill](../../../../.claude/skills/petstore-api/SKILL.md), read-only measurements on `local`, and an execution-mode write run on `local` (2026-10-10) that wrote only to pets it created and deleted them afterwards |
| Intake date | 2026-10-10 (read-only intake and write measurement) |

Source tags used below: **spec** (the OpenAPI document), **PN-NN** (a contract note), **M-NN** (a
read-only measurement), **W-NN** (a write measurement), **assumption** (listed at the end). There
is no access to the implementation's code, so completion sources 2 and 3 of
[contract analysis](../../../../docs/references/contract-analysis.md#completing-a-constraint) are
not available; open constraints go to the owner (source 4) or to observation (source 5).

Where the service departs from the spec, this doc states both: the spec's expectation, then what
the service does and the contract note that records it.

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
  not in `required` (spec).
- Responses: `200` `Pet` (JSON or XML), `400` "Invalid ID supplied", `404` "Pet not found", `422`
  "Validation exception", `default` (spec). No error body schema is declared.
- Measured:
  - an unknown `id` answers `404` `not-found` and creates nothing (W-04), as the spec says;
  - status changes are stored, every move allowed (W-05); the same body twice gives identical
    responses and state (W-15);
  - an out-of-set `status` or a missing `name` is stored with `200` (W-16, W-17; PN-06);
  - `{}` answers `500` `server-error` (W-31; PN-01); malformed JSON answers `400` `input-error`
    and leaves the pet unchanged (W-32);
  - `422` was never produced (PN-08).

### `POST /pet` (addPet)

- Body: `Pet`, required, same three media types (spec). The spec does not say who assigns the
  `id` or what happens when it names an existing pet.
- Responses: `200` `Pet`, `400` "Invalid input", `422` "Validation exception", `default` (spec).
  No `201` is declared for a create.
- Measured:
  - a body without `id` answers `500` `server-error` and stores nothing: the service never
    assigns an id, so every create must send one (W-01, W-22; PN-01);
  - a body naming an existing `id` replaces that pet with `200` (W-02, W-03; PN-20);
  - with an `id`, invalid input is stored with `200` instead of refused (PN-21): a numeric `name`
    becomes text (W-18), a missing or `null` `name` is dropped (W-19, W-26), a missing
    `photoUrls` becomes `[]` (W-20), an out-of-set `status` is kept (W-28);
  - an unknown property is dropped silently (W-25);
  - malformed JSON, an `id` above the int64 maximum, `photoUrls` as a string, a `null` body and an
    array body answer `400` `input-error` and store nothing (W-23, W-27, W-29, W-30); an empty or
    `null` body's message dumps the internal OpenAPI model (W-21, W-30; PN-07);
  - a JSON body sent as `text/plain` answers an undeclared `415` (W-24; PN-08);
  - an XML body and a flat form body are stored as sent (W-33, W-37); a form body with `tags`
    stores them as bare strings, drops `category` and keeps only the last `photoUrls`, and while
    that pet exists `findByTags` answers `500` to every caller (W-34 to W-36; PN-18);
  - `422` was never produced (PN-08).

### `GET /pet/findByStatus` (findPetsByStatus)

- Query `status`: required, `explode: true`, a single string from the value set, `default:
  available` (spec). The prose says several values can be sent "with comma separated strings"
  (spec), which the schema (one string) and the service (M-09, M-10) both contradict (G1).
- Responses: `200` array of `Pet`, `400` "Invalid status value", `default` (spec).
- Measured: each value in the set answers `200` with only pets of that status (M-06); a value
  outside the set, an empty value, a wrong case or no parameter answer `400` `input-error`
  (M-07, M-08). The decision table `services/petstore/rules/find-by-status.yaml` already records
  these classes. A pet stored with an out-of-set status (PN-21) is listed under no value.

### `GET /pet/findByTags` (findPetsByTags)

- Query `tags`: required, `explode: true`, array of strings (spec). The prose says tags can be
  sent comma separated and suggests `tag1`, `tag2`, `tag3` for testing (spec).
- Responses: `200` array of `Pet`, `400` "Invalid tag value", `default` (spec).
- Measured: repeated `tags` parameters return the union of matches, with duplicates (M-12,
  G3); a comma-separated value is read as one literal tag (M-13, G2); an empty value answers `400`
  with a body outside the envelope catalogue (M-14, G4); no parameter answers `400`
  `input-error` (M-15). Any query answers `500` while a pet with string tags exists (W-35; PN-18).

### `GET /pet/{petId}` (getPetById)

- Path `petId`: required, `integer`, `int64` (spec). No range is declared.
- Responses: `200` `Pet` (JSON or XML), `400` "Invalid ID supplied", `404` "Pet not found",
  `default` (spec). The `404` declares no body (PN-02).
- Measured: an id that is not an int64 answers `400` `input-error`; zero, negative and unknown
  int64 ids answer `404` `not-found` (M-01 to M-04).

### `POST /pet/{petId}` (updatePetWithForm)

- Path `petId` as above. Query `name` and `status`, both optional plain strings (spec). Unlike
  `Pet.status`, this `status` declares no value set (G13).
- Responses: `200` `Pet`, `400` "Invalid input", `default` (spec). No `404` is declared.
- Measured (PN-23):
  - without `name` (status only, or no parameters) it answers `400` with the plain text
    `No Name provided. Try again?` and changes nothing (W-06, W-07, W-09);
  - with `name` only it answers `200` and stores the pet **without** its `status`; category,
    photo URLs and tags are kept (W-08);
  - with `name` and `status` both are stored and the other fields kept (W-11); an out-of-set
    status (`lost`, `LOST`) is stored (W-12; PN-21);
  - a form body is ignored: only query parameters are read (W-10);
  - an unknown pet answers an undeclared `404` and nothing is created (W-13); a non-numeric id
    answers `400` `input-error` (W-14).

### `DELETE /pet/{petId}` (deletePet)

- Path `petId` as above. Header `api_key`, optional, string (spec).
- Responses: `200` "Pet deleted" with no body schema, `400` "Invalid pet value", `default` (spec).
- Measured: deleting answers `200` with the plain text `Pet deleted` and a later read answers
  `404` (W-43). A second delete and a delete of an id that never existed also answer `200`
  `Pet deleted` (W-44, W-45; PN-22), so the status of a delete never shows whether anything was
  removed. A non-numeric id answers `400` `input-error` (W-46).

### `POST /pet/{petId}/uploadImage` (uploadFile)

- Path `petId` as above. Query `additionalMetadata`, optional string. Body
  `application/octet-stream`, binary, **not** marked required (spec), while `400` "No file
  uploaded" is declared.
- Responses: `200` `ApiResponse` (JSON only), `400`, `404` "Pet not found", `default` (spec).
- Measured: no body answers `400` with the plain text `No file uploaded` (W-39); an unknown pet
  answers `404` (W-42); a text content type answers an undeclared `415` (W-41; PN-08). A binary
  body answers `200` with a **`Pet`**, not the declared `ApiResponse`, and appends a server
  temporary-file path (`/tmp/inflector<digits>.tmp`) to the pet's `photoUrls`;
  `additionalMetadata` is visible nowhere (W-40; PN-24).

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
  path probes. At intake two probes were already covered by `services/petstore/specs/errors.spec.ts`
  (`p-658044b361`, `p-71b75f7773`); TC-PET-55 has covered the second since PET-02. Read-only probes measured in this intake: `p-9e9221c97f`
  (M-08), `p-d5d4a0da19` (M-15), `p-899ef8dbff` (M-03), `p-9785590d88` and `p-0515e92c4d` (M-04).
  The write run measured the body probes listed under W-18 to W-32.
- `npm run contract:digest:check` and `contract:digest:live`: the tracked and the live contract
  match the tracked digest structurally.

## Business rules

1. A pet has a `name` and a list of `photoUrls`; both are required (spec `Pet.required`).
   **Service:** not enforced. `PUT /pet` stores a pet without `name` (PN-06); `POST /pet` stores a
   missing or `null` `name` and turns a missing `photoUrls` into `[]` (W-19, W-20, W-26; PN-21).
2. A pet's `status` is one of the `Pet.status` value set (spec). **Service:** enforced only on the
   `findByStatus` query (M-07); `PUT /pet` (PN-06), `POST /pet` (W-28) and `POST /pet/{petId}`
   (W-12) store any text (PN-21).
3. Finding by status returns exactly the pets whose `status` equals the requested value (spec
   summary; M-06).
4. Finding by status accepts one value per request in practice: a comma-separated list is
   refused and only the first of repeated parameters is used and validated (M-09, M-10). The spec
   prose promises multiple values (G1).
5. Finding by tags returns the pets that carry at least one of the requested tags (spec summary;
   M-11, M-12). **Service:** a stored pet whose tags are bare strings makes every search answer
   `500` (PN-18).
6. Matching of `status` and `tags` is exact: case sensitive, no trimming (M-07, M-13).
7. Reading a pet by id returns that pet, or `404` when no pet has that id (spec; M-01, M-02).
8. `PUT /pet` updates the pet named by the body `id` and answers `404` when it does not exist
   (spec); it never creates (W-04).
9. `POST /pet` adds a pet and returns it (spec). **Service:** the body must carry an `id`, or the
   answer is `500` (W-01; PN-01); an `id` that exists is replaced without error (W-03; PN-20).
10. `POST /pet/{petId}` changes `name` and/or `status` of an existing pet from query parameters,
    both optional (spec); fields not sent are expected to keep their value. **Service:** `name`
    is required in practice, and a request without `status` removes the stored status (W-06 to
    W-11; PN-23).
11. `DELETE /pet/{petId}` removes the pet; a later read answers `404` (spec summary; W-43).
    **Service:** a delete of an absent pet answers `200` as well (W-44, W-45; PN-22).
12. `POST /pet/{petId}/uploadImage` attaches an image to an existing pet and answers an
    `ApiResponse`; `404` for an unknown pet, `400` when no file is sent (spec; W-39, W-42).
    **Service:** answers a `Pet` and records a server file path in `photoUrls` (W-40; PN-24).
13. Every operation requires OAuth2 `petstore_auth` (and `GET /pet/{petId}` alternatively
    `api_key`) according to the spec; the service requires neither (PN-05, M-20).
14. Every `status` move is allowed, including `sold` back to `available`, through `PUT /pet` and
    `POST /pet/{petId}`; the spec states no restriction (W-05, W-11).

## Acceptance criteria

- **Given** a pet created by the case with status `<STATUS>`, **when** it is searched with
  `findByStatus?status=<STATUS>`, **then** the answer is `200`, every item has status `<STATUS>`
  and the created pet is among them (rule 3; L-25).
- **Given** any value outside the `findByStatus` value set (including empty and wrong case),
  **when** it is sent as `status`, **then** the answer is `400` with the `input-error` envelope
  (rule 2; M-07).
- **Given** a pet created by the case with tag `<TAG>`, **when** `findByTags?tags=<TAG>` is
  called, **then** the answer is `200` and the pet appears exactly once (rule 5; G3 for repeats).
- **Given** a pet that exists, **when** it is read by id, **then** the answer is `200` and the body
  matches the `Pet` schema (rule 7).
- **Given** an id that names no pet, **when** it is read, **then** the answer is `404` with the
  `not-found` envelope (rule 7; PN-02).
- **Given** a path id that is not an int64, **when** a `{petId}` operation is called, **then** the
  answer is `400` with the `input-error` envelope and nothing changes (spec; M-03, M-04, W-14,
  W-46; `uploadImage` not measured).
- **Given** a pet body missing `name` or `photoUrls`, or with an out-of-set `status`, **when** it
  is sent to `POST /pet` or `PUT /pet`, **then** the spec expects `400` or `422` and no stored
  change (rules 1, 2). **Service:** `200` and the input is stored (PN-06, PN-21).
- **Given** a create body without `id`, **when** it is sent to `POST /pet`, **then** the spec
  expects a created pet. **Service:** `500` and nothing stored (W-01; PN-01).
- **Given** a pet created by the case, **when** `POST /pet` is sent again with its `id` and other
  values, **then** the spec declares no conflict answer; the owner treats silent replacement as a
  defect. **Service:** `200` and the pet is replaced (W-03; PN-20).
- **Given** an id in the case's range that names no pet, **when** `PUT /pet` is sent with it,
  **then** the answer is `404` and no pet is created (rule 8; W-04).
- **Given** a pet created by the case with a non-default name, **when** `POST /pet/{petId}` sends
  only `status`, **then** the spec expects the new status and the other fields unchanged.
  **Service:** `400` `No Name provided. Try again?` and nothing changes (W-07; PN-23).
- **Given** a pet created by the case, **when** `POST /pet/{petId}` sends only `name`, **then**
  the spec expects the status kept. **Service:** the status is removed (W-08; PN-23).
- **Given** a pet created by the case, **when** it is deleted and then read, **then** the delete
  answers `200` and the read answers `404` (rule 11; W-43). A repeat delete answers `200` too
  (W-44; PN-22).
- **Given** a pet created by the case, **when** a binary image is uploaded, **then** the spec
  expects `200` with an `ApiResponse`. **Service:** `200` with a `Pet` whose `photoUrls` gained a
  server file path (W-40; PN-24).

## Access and ownership

- Credentials: none needed by the service (PN-05). The contract declares OAuth2 scopes and an
  `api_key` header; the service ignores the header's presence and value (M-20).
- Roles: none observable. `read:pets` versus `write:pets` cannot be demonstrated (PN-05, backlog
  FUT-07).
- Object identifiers in paths and bodies: `petId` (path, four operations) and `id` (body of
  `PUT /pet` and `POST /pet`). The `Pet` model has no owner field, so object-level authorization
  (BOLA) has nothing to check against a caller on this API; any caller can read or change any pet
  (spec has no owner; PN-05). Since a create with an existing `id` replaces the pet (PN-20), any
  caller can also overwrite any pet through `POST /pet`.
- Actors the cases need: `default` and `anonymous`. With the current service both are expected to
  behave alike (PN-05); a difference would be a finding.

## Edge and negative cases

- **Path `petId`** (all four `{petId}` operations; service-wide, L-34): non-numeric, fraction,
  one above the int64 maximum, an overlong digit run, an encoded slash and an injection string
  answer `400` `input-error` on `GET` (M-03, M-04); a non-numeric id does the same on
  `POST /pet/{petId}` and `DELETE` (W-14, W-46). Zero, negative and int64-maximum ids answer `404`
  on `GET` (M-02). Leading `+`, a leading zero and a trailing slash resolve to the same pet (M-05).
  The other path probes on the write operations are not measured.
- **`findByStatus`**: out-of-set, empty, wrong case, padded with a space, comma list, missing
  (M-07 to M-09); repeated parameters where the first is valid and a later one is not (M-10);
  an unknown extra query parameter is ignored (M-19).
- **`findByTags`**: comma list, repeated tags, the same tag twice, an empty value alone or next to
  a valid one, wrong case, a tag no pet has, a long value, an injection string (M-11 to M-15).
  A query that matches nothing returns an empty array (M-13).
- **Bodies of `PUT /pet` and `POST /pet`** (W-16 to W-32): missing `id` (`500`, PN-01), missing or
  `null` `name`, numeric `name`, missing `photoUrls`, out-of-set `status` (all stored, PN-06,
  PN-21), unknown property (dropped), `photoUrls` of the wrong type, `id` overflow, malformed
  JSON, `null` and array bodies (`400`), empty body (`400` with a model dump, PN-07), `{}`
  (`500`), wrong content type (`415`, PN-08). Wrong types and overflow inside `category` and
  `tags[]` are not measured.
- **Form and XML bodies** of `POST /pet` (W-33, W-34, W-37): flat form and XML are stored as
  sent; a form body with `tags` is the PN-18 reproduction (below).
- **`POST /pet/{petId}`**: no `name`, only `name`, only `status`, out-of-set and upper-case
  status, form body instead of query, unknown pet (W-06 to W-14; PN-21, PN-23).
- **`DELETE`**: repeat and absent pet (W-44, W-45; PN-22).
- **`uploadImage`**: no body, binary body, wrong content type, unknown pet (W-39 to W-42; PN-24).
- **Destructive case.** Reproducing PN-18 (a form-encoded create with `tags`) leaves a pet that
  makes `findByTags` answer `500` to every caller until it is deleted (W-35). A case that
  reproduces it is `@destructive`: it never runs next to other cases against shared data, and its
  cleanup is `DELETE /pet/<PET_ID>` followed by a read that answers `404`, run even when the case
  fails.
- **Content negotiation**: `Accept` JSON, XML, wildcard and unsupported types (M-16, M-17);
  error bodies change shape with `Accept` (M-17, G5, G7).
- **Method not allowed**: `GET` on `/pet` and on `uploadImage` answers an undeclared `405` (M-18,
  G9).
- **Information exposure**: input errors name an implementation type and echo the raw input
  (M-03, G6); empty bodies dump the internal model (W-21; PN-07); uploads expose a server path
  (W-40; PN-24).
- **After an error on a write, check the state** (L-35): the write run read back every pet after
  each error answer; none of the `400`, `404`, `415` or `500` answers measured changed a stored
  pet (W-04, W-07, W-13, W-23, W-24, W-32, W-39, W-41). Cases keep the read-back.

## Test data

| Placeholder | Stands for | How a case gets it |
|---|---|---|
| `<PET_ID>` | a pet the case owns | created by `aPet` / `PetMother` (`services/petstore/builders/pet-builder.ts`); the id comes from the builder's generated range and is always sent in the create body, because `POST /pet` without `id` answers `500` (PN-01) |
| `<SEED_PET_ID>` | one of the shared seed pets 1 to 10 (pack skill) | read only, or changed inside `withResourceGuard(seedPet(pets, id), ...)` (`services/petstore/guards.ts`, L-39) |
| `<UNKNOWN_PET_ID>` | an int64 id no case creates | one above the builder's generated maximum, as `services/petstore/specs/errors.spec.ts` does |
| `<INT64_MAX>`, `<INT64_OVERFLOW>` | the largest int64 and one above it | computed in the spec, never typed |
| `<STATUS>` | a member of `Pet.status` | `generated/enums.ts` (L-36) |
| `<TAG>` | a tag name unique to the case | the builder; never the seed names `tag1`..`tag4`, which shared pets carry (M-11) |
| `<IMAGE_BYTES>` | a small binary payload | generated by the case |

- Searches return shared data too (M-06, M-11): cases assert on their own pets being present or
  absent, never on counts (L-25).
- A create with an existing id replaces it (PN-20), so a case never creates with a seed id or an
  id it did not generate.
- Cleanup of a created pet is `DELETE /pet/<PET_ID>`. Its `200` proves nothing (PN-22); the
  cleanup is confirmed by a read that answers `404`.
- Uploads append to `photoUrls` (PN-24), so `uploadImage` cases use their own pets, never a seed
  pet.
- The PN-18 reproduction is `@destructive` (see Edge and negative cases) and deletes its pet in
  cleanup.

## State transitions

- `status` moves between `available`, `pending` and `sold` through `PUT /pet` or
  `POST /pet/{petId}` (spec). Every move was accepted and stored, including `sold` to
  `available` (W-05, W-11). The form update only moves the status when `name` is sent too
  (PN-23).
- Create, read, delete, read `404` (W-02, W-43). There is no refused move: a deleted pet can be
  created again with the same id, because a create with any id is accepted (W-03; PN-20).
- Repeats: the same `PUT /pet` twice gives identical responses and state (W-15); a repeated
  `DELETE` answers `200` again (W-44; PN-22); a repeated `POST /pet` with the same id replaces the
  pet (W-03; PN-20). A repeated `POST /pet/{petId}` was not measured.

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

## Write measurements

An execution-mode run on 2026-10-10 against `local` (`allow_writes: true`). It wrote only to pets
it created, with ids from a range reserved for the run and names and tags prefixed for it, and
read every pet back after each write that answered with an error (L-35). At the end it deleted
every pet it created, read each id back (`404`), and compared seed pets 1 to 10 with a snapshot
taken before the run: unchanged. `<PET_ID>` is a pet the run created, `<UNUSED_ID>` an id of the
range that was never created. JSON bodies, `Accept: application/json` unless stated.

| # | Request | Observed |
|---|---|---|
| W-01 | `POST /pet`, full body without `id` (twice) | `500` `server-error`; nothing stored, seed unchanged |
| W-02, W-03 | `POST /pet` with `<PET_ID>`; again with the same id, a new `name` and `status: sold` | `200` both; read-back shows the second body: replaced, no conflict |
| W-04 | `PUT /pet` with `<UNUSED_ID>` | `404` `Pet not found`; read still `404` |
| W-05 | `PUT /pet` on `<PET_ID>`: available, pending, sold, available, sold, pending, available | `200` each; each read-back shows the new status |
| W-06, W-07 | `POST /pet/<PET_ID>?status=<STATUS>` (no `name`), after setting a non-default name | `400` plain text `No Name provided. Try again?`; every field unchanged |
| W-08 | `POST /pet/<PET_ID>?name=<NAME>` | `200`; name changed, category, photo URLs and tags kept, `status` removed |
| W-09, W-10 | `POST /pet/<PET_ID>` with no parameters; with a form body carrying `name` and `status` | `400` `No Name provided. Try again?` both; unchanged |
| W-11 | `POST /pet/<PET_ID>?name=<NAME>&status=` pending, sold, available | `200` each; status stored each time, other fields kept |
| W-12 | `POST /pet/<PET_ID>?name=<NAME>&status=lost` and `status=LOST` | `200`; stored as sent |
| W-13 | `POST /pet/<UNUSED_ID>?name=<NAME>&status=sold` | `404` `Pet not found`; nothing created |
| W-14 | `POST /pet/abc?status=sold` | `400` `input-error` |
| W-15 | the same `PUT /pet` body twice | `200` twice, identical responses; state equals the body |
| W-16, W-17 | `PUT /pet` with `status: lost`; without `name` | `200`; stored as sent (PN-06) |
| W-18 | `POST /pet` with `name: 5` | `200`; stored as `"5"` |
| W-19 | `POST /pet` without `name` | `200`; stored without `name` |
| W-20 | `POST /pet` without `photoUrls` | `200`; stored with `photoUrls: []` |
| W-21 | `POST /pet` with an empty JSON body | `400` `input-error` whose message dumps the internal OpenAPI request-body model |
| W-22 | `POST /pet` with `{}` | `500` `server-error` |
| W-23 | `POST /pet` with truncated JSON | `400` `input-error` naming the model class; nothing stored |
| W-24 | `POST /pet` with a JSON body labelled `text/plain` | `415` `{code, message}`; nothing stored |
| W-25 | `POST /pet` with an unknown property | `200`; stored without the property |
| W-26 | `POST /pet` with `name: null` | `200`; stored without `name` |
| W-27 | `POST /pet` with `id` one above the int64 maximum | `400` `input-error`; neither int64 extreme was created |
| W-28 | `POST /pet` with `status: lost` | `200`; stored as `lost` |
| W-29 | `POST /pet` with `photoUrls` as a string | `400` `input-error`; nothing stored |
| W-30 | `POST /pet` with body `null`; with an array body | `400` `input-error` both (`null`: the same model dump as W-21); nothing stored |
| W-31 | `PUT /pet` with `{}` | `500` `server-error` |
| W-32 | `PUT /pet` with truncated JSON naming `<PET_ID>` | `400` `input-error`; pet unchanged |
| W-33 | `POST /pet` form-encoded, flat (`id`, `name`, `photoUrls`, `status`) | `200`; stored as sent |
| W-34 | `POST /pet` form-encoded with repeated `photoUrls`, dotted and bracketed `category` and `tags[0]` keys, and `tags=<TAG>` | `200`; no `category`, only the last `photoUrls`, `tags` as an array of strings |
| W-35 | `GET /pet/findByTags?tags=<ANY_TAG>` (seed tags included) while the W-34 pet exists | `500` `server-error`; `200` again once that pet is deleted |
| W-36 | `GET /pet/<PET_ID>` of the W-34 pet with `Accept: application/xml` | `200`; empty `<category/>`, tags as text elements |
| W-37 | `POST /pet` with an XML body | `200`; stored as sent |
| W-38 | any write of W-16 to W-34 | `422` never produced |
| W-39 | `POST /pet/<PET_ID>/uploadImage`, octet-stream, no body | `400` plain text `No file uploaded`; unchanged |
| W-40 | the same with a small generated binary and `additionalMetadata` | `200` with a `Pet`; `photoUrls` gained `/tmp/inflector<digits>.tmp`; metadata not visible |
| W-41 | the same with `Content-Type: text/plain` | `415`; unchanged |
| W-42 | upload to `<UNUSED_ID>` | `404` `Pet not found`; nothing created |
| W-43 | `DELETE /pet/<PET_ID>`, then `GET` | `200` plain text `Pet deleted`; read `404` |
| W-44 | the same `DELETE` again | `200` `Pet deleted` |
| W-45 | `DELETE /pet/<UNUSED_ID>`, JSON and XML `Accept` | `200` `Pet deleted`, content type following `Accept` |
| W-46 | `DELETE /pet/abc` | `400` `input-error` |

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | `findByStatus` prose promises comma-separated multiple values; a comma list is refused and repeated parameters are reduced to the first, which alone is validated | spec prose; M-09, M-10 | PN-10, `LOCAL-12` |
| G2 | `findByTags` prose promises comma-separated tags; a comma list is matched as one literal tag and returns `[]` | spec prose; M-13 | PN-11, `LOCAL-13` |
| G3 | `findByTags` with repeated tags lists a pet once per matching tag (duplicates in the result) | M-12 | PN-11, `LOCAL-13` |
| G4 | `findByTags` with an empty `tags` answers `400` with a plain-text body that matches no envelope in `error-envelopes.json`, labelled JSON or XML by `Accept` | M-14 | PN-08 (searched, none) |
| G5 | The `not-found` body is plain text labelled `application/json` when the client accepts only JSON; PN-02 records the XML label seen with a wildcard `Accept` | M-17; PN-02 | PN-02 (searched, none) |
| G6 | Input errors name the implementation type (`java.lang.Long`) and echo the raw input, including injection strings | M-03, M-04, M-07 | PN-07, `LOCAL-14` |
| G7 | With `Accept` XML, `400` and `405` answers use an `<ApiError>` XML envelope that the envelope catalogue does not list | M-17, M-18 | PN-08 (searched, none) |
| G8 | `400` "Invalid ID supplied" is declared but what an invalid id is is not; zero and negative ids answer `404` | spec; M-02 | PN-15 (searched, none) |
| G9 | `405` answers are undeclared on every pet operation | M-18 | PN-08 (searched, none) |
| G10 | Declared OAuth2 and `api_key` security is not enforced | spec; PN-05, M-20 | PN-05 (searched, none) |
| G11 | `PUT /pet` stores an out-of-set `status` and a pet without `name`, answering `200`. Reconfirmed by the write run | PN-06; W-16, W-17 |  PN-06, `LOCAL-8` |
| G12 | `POST /pet` answers `500` for a wrong-type or missing `name`. **Revised by measurement:** the `500` comes from a missing `id` (W-01, W-22, W-31); with an `id`, a numeric or missing `name` is stored with `200` (W-18, W-19) | PN-01; W-01, W-18, W-19 |  PN-01, `LOCAL-9` |
| G13 | `POST /pet/{petId}` `status` declares no value set, and no `404` is declared for an unknown pet. **Measured:** any status text is stored (W-12) and an unknown pet answers an undeclared `404` (W-13) | spec; W-12, W-13 |  PN-21, `LOCAL-8`; PN-23, `LOCAL-10` |
| G14 | `422` "Validation exception" is declared on `PUT /pet` and `POST /pet` but never described; form encoding of nested `category` and `tags` is undefined. **Measured:** `422` never produced (W-38); invalid bodies are stored or answer `400`, `415` or `500`; nested form keys are dropped and `tags=` stores strings (W-34) | spec; W-16 to W-38 | PN-08, PN-18, PN-21 (searched, none) |
| G15 | `DELETE /pet/{petId}` declares no `404`; the answer for an unknown or already-deleted pet was open. **Measured:** `200` `Pet deleted` for both (W-44, W-45) | spec; W-43 to W-45 | PN-22 (searched, none) |
| G16 | `uploadImage` body is not marked required while `400` "No file uploaded" is declared; the effect of an upload was unstated. **Measured:** no body answers `400` (W-39); an upload answers a `Pet` and appends a server file path to `photoUrls` (W-40) | spec; W-39 to W-42 |  PN-24, `LOCAL-11` |
| G17 | `POST /pet` with an existing `id` replaces that pet with `200`; any caller can overwrite any pet | W-02, W-03 | PN-20 (searched, none) |
| G18 | A form-encoded create with `tags` stores the tags as strings, and `findByTags` then answers `500` to every caller until the pet is deleted; reproducing it is `@destructive` | W-34 to W-36 | PN-18 (searched, none) |
| G19 | `POST /pet` stores input the schema refuses: out-of-set `status`, missing or `null` `name`, missing `photoUrls` (as `[]`), a numeric `name` coerced to text; an unknown property is dropped silently | W-18 to W-20, W-25, W-26, W-28 |  PN-21, `LOCAL-8` |
| G20 | `POST /pet/{petId}` requires `name` in practice (`400` without it), removes `status` when only `name` is sent, and ignores a form body | W-06 to W-10 |  PN-23, `LOCAL-10` |
| G21 | An empty or `null` create body answers `400` with a dump of the internal OpenAPI model; truncated JSON names the model class | W-21, W-23, W-30 | PN-07 (searched, none) |
| G22 | An unsupported request content type answers an undeclared `415` on `POST /pet` and `uploadImage` | W-24, W-41 | PN-08 (searched, none) |

## Out of scope

- Store and user operations (other features of the pack).
- The public demo environment: read-only for this suite and not measured here.
- Authorization matrices and BOLA: the service enforces no access (PN-05, backlog FUT-07).
- Rate limits and payload-size limits: no limit is stated by the contract or the owner
  (contract analysis section 7).

## Assumptions to confirm

Answered:

- **A1. Answered.** The owner approved an execution-mode write run before design; it ran on
  2026-10-10 (Write measurements).
- **A2. Answered.** `POST /pet` does not assign an `id`: without one it answers `500` and stores
  nothing (W-01; PN-01).
- **A3. Answered.** `POST /pet` with an existing `id` replaces the pet (W-03; PN-20); `PUT /pet`
  with an unknown `id` answers `404` and creates nothing (W-04).
- **A4. Answered.** Every `status` move is allowed, `sold` to `available` included (W-05, W-11).
- **A5. Answered.** No: `POST /pet/{petId}` without `status` removes the status, and without
  `name` it refuses the request (W-07, W-08; PN-23). Category, photo URLs and tags are kept.
- **A6. Answered.** After a delete, a read answers `404`; a second delete answers `200` (W-43,
  W-44; PN-22).
- **A7. Answered.** Defects, not tolerated: first-value-wins on repeated `status` and the refused
  comma list (G1) were filed as `LOCAL-12`, duplicate results on repeated `tags` and the literal
  comma match (G2, G3) as `LOCAL-13`, when the pet-search cases were automated (2026-10-22; PN-10,
  PN-11).
- **A9. Answered.** Feature code `PET` was approved with this contract at the intake review gate.

Open:

- **A8.** Should the XML error envelope (G7), the empty-tags body (G4) and the `415` answer (G22)
  be added to the envelope catalogue, and should cases assert JSON only?
- **A10.** Where does `additionalMetadata` of `uploadImage` go? It is visible in no response
  or read-back (W-40), and the spec only names it.
