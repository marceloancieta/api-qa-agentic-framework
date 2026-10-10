---
feature: USER
title: Users and sessions
endpoints:
  - POST /user
  - POST /user/createWithList
contract: docs/features/user.md
auth: [default]
test_data:
  <USERNAME>: a username the case creates, built from the run prefix plus a builder suffix, unique per case; never login or logout
  <OTHER_USERNAME>: a second username the case creates or reserves, built like <USERNAME>
  <UNKNOWN_USERNAME>: a well-formed username with a prefix no builder uses, never created
  <NUMERIC_USERNAME>: a run-unique number the builder makes, sent where a username string belongs
  <USER_ID>: an explicit id from the case's own id range, sent on every create
  <OTHER_USER_ID>: a second id from the case's own id range
  <PASSWORD>: a synthetic password the builder generates; never written in docs or specs
  <USER_STATUS>: a non-zero int32 the builder picks, so a stored value differs from the default 0
  <INT32_MAX>: the largest int32, from a shared constant
  <INT64_MAX>: the largest int64, from a shared constant
requirements:
  - { id: REQ-USER-02, text: "POST /user creates one user from a User body and answers 200 with the User (business rule 2; AC-01, AC-10, AC-11)" }
  - { id: REQ-USER-03, text: "POST /user/createWithList creates every user of an array and answers 200 (business rule 3; AC-05)" }
  - { id: REQ-USER-10, text: "password belongs to the User schema, but no answer may disclose its stored value (business rule 10; AC-09)" }
  - { id: REQ-USER-12, text: "Errors answer with a catalogued envelope and reveal no internals (business rule 12)" }
  - { id: REQ-USER-13, text: "A user is identified by its username; ids are not unique (business rule 13)" }
  - { id: REQ-USER-14, text: "A body field of the wrong JSON type or outside its integer range is refused (business rule 14)" }
  - { id: REQ-USER-15, text: "userStatus accepts any int32 (business rule 15)" }
beyond_floor: [TC-USER-07, TC-USER-08, TC-USER-15, TC-USER-21, TC-USER-22, TC-USER-27, TC-USER-28]
---

# `Users and sessions` test cases: creating users

Contract: [`docs/features/user.md`](../docs/features/user.md). Departures cited as PN-NN are in the
[contract notes](../docs/contract-notes.md); G-NN, M-NN and W-NN are the gaps and measurements of
the contract doc.

The feature `USER` is written in three files, numbered as one sequence:

| File | Operations | Cases |
|---|---|---|
| `registry/user.md` (this file) | `POST /user`, `POST /user/createWithList` | TC-USER-01 to TC-USER-31 |
| [`registry/user-record.md`](user-record.md) | `GET`, `PUT` and `DELETE /user/{username}` | TC-USER-32 to TC-USER-62 |
| [`registry/user-session.md`](user-session.md) | `GET /user/login`, `GET /user/logout` | TC-USER-63 to TC-USER-70 |

The requirement ids `REQ-USER-NN` take their number from the business rule of the contract doc
they point at, so the same id means the same rule in all three files.

## Data rules for every case of the feature

- **Own users only.** Every case creates the users it touches. The ten seed users are never written
  and are not needed by any case. The usernames `login` and `logout` are out of bounds (W-37, W-38).
- **Every create sends a unique `<USERNAME>` and an explicit `<USER_ID>`.** A repeated username
  replaces another case's user (PN-20) and an omitted id is stored as `0`, shared with every id-less
  user (PN-25).
- **No create without `username`**, except the `@destructive` cases TC-USER-03, TC-USER-04,
  TC-USER-05 and TC-USER-28. Such a body can store a nameless record that makes every unknown-name
  read answer `500` for every caller until the service restarts (PN-19, L-59).
- **Cleanup is confirmed by a read.** A case deletes every username it created, including the new
  name of a renamed user, and a read of each must then answer `404`. The delete's own status proves
  nothing, because it answers `200` whether or not the user existed (PN-22).
- **No password values anywhere**: `<PASSWORD>` placeholders, values from the builder.
- **`@destructive` cases** run alone on `local`, after every other case, each followed by its
  recovery: a restart of the service container (`npm run petstore:down`, then
  `npm run petstore:up`), after which a read of `<UNKNOWN_USERNAME>` must answer `404` again before
  anything else runs (tagging rule; backlog GATE-12).
- **Actors** are `default` and `anonymous` only. The service enforces no credential (PN-05,
  by-design), so object-level authorization (one user acting on another's record) cannot be shown
  on this API; that matrix belongs to backlog FUT-07. Cases here never assert against PN-05.

## Probes left uncovered

The cases name the probes they cover (`npm run contract:probes -- --service petstore --gaps`).
Every user probe that remains a gap is exploratory, and is left out on purpose:

- **Bodies that may store a user without a name**: a JSON `null` body on `POST /user`,
  `createWithList` (whole body and element) and `PUT`, and a `null` or mistyped `username` on `PUT`
  and in list elements. Each may store a nameless record (PN-19) or rename the user (PN-25), so
  under the data rules they run only as `@destructive` cases, after a measurement run shows what
  they do. TC-USER-05 and TC-USER-28 are the two such cases designed now.
- **The remaining `null-value` probes of `PUT` and of list elements**, and the per-field
  `wrong-type` and `integer-fraction` probes of list elements: the same `User` model and the same
  outcomes as on `POST /user` (TC-USER-11, TC-USER-12, TC-USER-15). TC-USER-31 and TC-USER-48
  sample them; the rest follow once TC-USER-15 has set its reviewed baseline (L-56).
- **The `unknown-property` probe of list elements**: TC-USER-08 and TC-USER-50 cover the same
  question on the single-user writes.

## Cases

| ID | Title | Requirement | Technique | Priority | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|
| TC-USER-01 | A user created from a full JSON body reads back as sent | REQ-USER-02 | equivalence-partition | high | approved | | |
| TC-USER-02 | A body with only a username and an id stores those two and invents nothing | REQ-USER-02 | boundary-value | high | approved | | |
| TC-USER-03 | An empty object body is refused and stores nothing | REQ-USER-02 | equivalence-partition | high | approved | | LOCAL-1 |
| TC-USER-04 | A body with other fields but no username is refused and stores nothing | REQ-USER-02 | equivalence-partition | high | approved | | LOCAL-1 |
| TC-USER-05 | A null username is refused and stores nothing | REQ-USER-02 | error-guessing | medium | approved | | LOCAL-1 |
| TC-USER-06 | A second create with an existing username is refused and the first record is kept | REQ-USER-02 | state-transition | high | approved | | |
| TC-USER-07 | A create that reuses another user's id leaves that user unchanged | REQ-USER-13 | error-guessing | medium | approved | | |
| TC-USER-08 | Unknown properties in a create are never stored or echoed | REQ-USER-02 | error-guessing | medium | approved | | |
| TC-USER-09 | Objects or arrays in string fields are refused and nothing is stored | REQ-USER-14 | equivalence-partition | medium | approved | | |
| TC-USER-10 | Text in integer fields is refused and nothing is stored | REQ-USER-14 | equivalence-partition | medium | approved | | |
| TC-USER-11 | Numbers or booleans in string fields are refused and nothing is stored | REQ-USER-14 | error-guessing | medium | approved | | |
| TC-USER-12 | Fractions in integer fields are refused and nothing is stored | REQ-USER-14 | error-guessing | medium | approved | | |
| TC-USER-13 | An id beyond int64 is refused and nothing is stored | REQ-USER-14 | boundary-value | medium | approved | | |
| TC-USER-14 | userStatus at the int32 maximum is stored and one beyond it is refused | REQ-USER-15 | boundary-value | medium | approved | | |
| TC-USER-15 | A null in an optional field never causes a server error or a stored text null | REQ-USER-14 | error-guessing | low | approved | | |
| TC-USER-16 | Unreadable JSON is refused and nothing is stored | REQ-USER-12 | error-guessing | medium | approved | | |
| TC-USER-17 | A create sent as text/plain is refused and nothing is stored | REQ-USER-12 | error-guessing | medium | approved | | |
| TC-USER-18 | An empty create body is refused and nothing is stored | REQ-USER-02 | equivalence-partition | medium | approved | | |
| TC-USER-19 | A form-encoded create stores its fields as sent | REQ-USER-02 | equivalence-partition | medium | approved | | |
| TC-USER-20 | An XML create stores its fields as sent | REQ-USER-02 | equivalence-partition | medium | approved | | |
| TC-USER-21 | The answer to a create never carries the password | REQ-USER-10 | error-guessing | medium | approved | | LOCAL-3 |
| TC-USER-22 | The error for an unreadable create names no implementation class | REQ-USER-12 | error-guessing | low | approved | | |
| TC-USER-23 | Two users sent in one list are both stored as sent | REQ-USER-03 | equivalence-partition | high | approved | | |
| TC-USER-24 | The list create answers with the declared single User | REQ-USER-03 | equivalence-partition | medium | approved | | |
| TC-USER-25 | An empty list is refused | REQ-USER-03 | boundary-value | medium | approved | | |
| TC-USER-26 | One unreadable element rejects the whole list and stores none of it | REQ-USER-03 | error-guessing | medium | approved | | |
| TC-USER-27 | A list naming one username twice is refused and stores nothing | REQ-USER-03 | error-guessing | medium | approved | | |
| TC-USER-28 | A list element without a username is refused and stores nothing | REQ-USER-03 | equivalence-partition | medium | approved | | |
| TC-USER-29 | Unreadable list bodies are refused and nothing is stored | REQ-USER-12 | error-guessing | medium | approved | | |
| TC-USER-30 | A list sent as text/plain is refused and nothing is stored | REQ-USER-12 | error-guessing | low | approved | | |
| TC-USER-31 | List elements follow the field rules of a single create | REQ-USER-14 | error-guessing | medium | approved | | |

## Case details

Every case below that creates a user ends with the cleanup of the data rules above, unless its
details name a different one.

### TC-USER-01

- **Preconditions**: actor `default`; the builder makes `<USERNAME>`, `<USER_ID>`, every string
  field, `<PASSWORD>` and `<USER_STATUS>`.
- **Request**: `POST /user`, `application/json`, all eight `User` fields.
- **Expected**: `200`; the body matches `User`; every echoed field equals the one sent, `password`
  apart (its exposure is TC-USER-21 and TC-USER-39).
- **Verification**: `GET /user/<USERNAME>` answers `200`, `User`, and equals the sent body field by
  field, `password` apart (W-01).
- **Tags**: `@smoke` `@data-integrity`

### TC-USER-02

- **Preconditions**: actor `default`.
- **Request**: `POST /user` with only `username` `<USERNAME>` and `id` `<USER_ID>`.
- **Expected**: `200`, `User`.
- **Verification**: the read-back has `username` and `id` as sent; `firstName`, `lastName`,
  `email`, `password` and `phone` are absent; `userStatus` is absent or `0` (the stored default,
  W-03). An `id` is always sent, so the shared `0` id of PN-25 never arises.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-03

- **Preconditions**: the `@destructive` lane on `local`, nothing else running; a read of
  `<UNKNOWN_USERNAME>` answers `404` first.
- **Request**: `POST /user` with `{}`.
- **Expected**: `400` with the `input-error` envelope (AC-11); nothing stored.
- **Verification**: `GET /user/<UNKNOWN_USERNAME>` still answers `404` with the `not-found`
  envelope. A stored nameless record shows as `500` there.
- **Observed today**: `200`, a `User` with `id` `0` and no username, then `500` on every
  unknown-name read for every caller (W-39; PN-19, `LOCAL-1`).
- **Recovery**: restart the service container, then confirm `<UNKNOWN_USERNAME>` answers `404`.
- **Tags**: `@regression` `@destructive` `@known-gap` `@data-integrity`

### TC-USER-04

- **Preconditions**: as TC-USER-03.
- **Request**: `POST /user` with `id` `<USER_ID>` and `firstName`, no `username`.
- **Expected**: `400` with the `input-error` envelope; nothing stored.
- **Verification**: `GET /user/<UNKNOWN_USERNAME>` answers `404`.
- **Observed today**: `500` `server-error`, measured only while the nameless record of W-39 existed
  (W-41); on a clean service the outcome is unmeasured and may be a second nameless record (G22;
  PN-19, `LOCAL-1`).
- **Recovery**: restart the service container, then confirm `<UNKNOWN_USERNAME>` answers `404`.
- **Tags**: `@regression` `@destructive` `@known-gap` `@data-integrity`

### TC-USER-05

- **Preconditions**: as TC-USER-03.
- **Request**: `POST /user` with `username` `null`, `id` `<USER_ID>` and `firstName`.
- **Expected**: `400` with the `input-error` envelope; nothing stored.
- **Verification**: `GET /user/<UNKNOWN_USERNAME>` answers `404`.
- **Observed today**: `500` `server-error` while a nameless record existed (W-42b); unmeasured on a
  clean service (G22; PN-19, `LOCAL-1`).
- **Recovery**: restart the service container, then confirm `<UNKNOWN_USERNAME>` answers `404`.
- **Probes**: `p-c79d4f94c6`.
- **Tags**: `@regression` `@destructive` `@known-gap` `@data-integrity`

### TC-USER-06

- **Preconditions**: `<USERNAME>` created by the case with `<USER_ID>` and a full body.
- **Request**: `POST /user` again with `<USERNAME>`, `<OTHER_USER_ID>` and different names.
- **Expected**: a `4xx` refusal (the spec declares no outcome for a duplicate; AC-10).
- **Verification**: the read-back of `<USERNAME>` equals the first body field by field, `password`
  apart.
- **Departure**: PN-20 (untracked): `200`, and the record becomes the second body (W-15).
- **Cleanup**: one delete of `<USERNAME>` removes it whatever the outcome (W-16); a read answers
  `404`.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-07

- **Preconditions**: `<USERNAME>` created by the case with `<USER_ID>` and a full body.
- **Request**: `POST /user` with `<OTHER_USERNAME>` and the same `<USER_ID>`.
- **Expected**: either a `4xx` refusal with nothing stored under `<OTHER_USERNAME>`, or `200` with
  both users stored. The spec does not say which; the measured service stores both (W-03b; PN-25,
  contract gap).
- **Verification**: in either outcome `<USERNAME>` reads back unchanged. A create must never
  replace a user it does not name.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-08

- **Preconditions**: actor `default`.
- **Request**: `POST /user`, full body for `<USERNAME>` plus `role`, `isAdmin` and the probe's
  unknown property.
- **Expected**: `200` with none of the extra properties in the answer, or a `4xx` refusal with
  nothing stored. Never stored: the spec does not say whether extra properties are allowed (G23,
  no contract note).
- **Verification**: when stored, the read-back carries the eight `User` fields only, with the sent
  values, and none of the extra ones.
- **Probes**: `p-d22fe18058`.
- **Tags**: `@regression` `@security` `@data-integrity`

### TC-USER-09

- **Preconditions**: one fresh `<USERNAME>` per request.
- **Request**: four creates, each with one field of the wrong kind: `firstName` as an object,
  `lastName` as an array, `phone` as an object, and `username` as an object (the other fields of
  that last body name no user).
- **Expected**: `400` with the `input-error` envelope for each (W-06, W-07, W-42).
- **Verification**: each `<USERNAME>` reads `404`; nothing was stored.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-10

- **Preconditions**: one fresh `<USERNAME>` per request.
- **Request**: two creates: `id` as text, `userStatus` as text.
- **Expected**: `400` with the `input-error` envelope for each (W-05, W-10).
- **Verification**: each `<USERNAME>` reads `404`.
- **Probes**: `p-d4bc1f5bd1`, `p-d837dd9d2b`.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-11

- **Preconditions**: one fresh `<USERNAME>` per request.
- **Request**: one create per field with a number in `firstName`, `lastName`, `email`, `password`
  and `phone`, a boolean in `password`, and `<NUMERIC_USERNAME>` as a JSON number in `username`.
- **Expected**: `400` with the `input-error` envelope for each; the schema types these fields as
  strings.
- **Verification**: each `<USERNAME>`, and the text form of `<NUMERIC_USERNAME>`, reads `404`.
- **Departure**: PN-21 (untracked): numbers and booleans are stored as text (W-08, W-09). Cleanup
  then deletes every name that was stored, the text form of `<NUMERIC_USERNAME>` included.
- **Probes**: `p-5fa39acf3b`, `p-0c7d40253c`, `p-51b1d89ca5`, `p-5d94cad571`, `p-bec00e1af8`,
  `p-a61fa8a02a`.
- **Tags**: `@regression` `@contract-drift` `@data-integrity`

### TC-USER-12

- **Preconditions**: one fresh `<USERNAME>` per request.
- **Request**: two creates: `id` as `<USER_ID>` plus one half, `userStatus` as `1.5`.
- **Expected**: `400` with the `input-error` envelope for each; both fields are integers.
- **Verification**: each `<USERNAME>` reads `404`.
- **Departure**: PN-21 (untracked): a fractional `userStatus` is stored as a different integer
  (W-11b); a fractional `id` is unmeasured.
- **Probes**: `p-cc02fe78d0`, `p-82d1f8e571`.
- **Tags**: `@regression` `@contract-drift` `@data-integrity`

### TC-USER-13

- **Request**: `POST /user` for `<USERNAME>` with `id` `<INT64_MAX>` plus one.
- **Expected**: `400` with the `input-error` envelope (W-11c).
- **Verification**: `<USERNAME>` reads `404`.
- **Probes**: `p-2e5b03a99c`.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-14

- **Request**: `POST /user` for `<USERNAME>` with `userStatus` `<INT32_MAX>`; then for
  `<OTHER_USERNAME>` with `<INT32_MAX>` plus one.
- **Expected**: `200` for the first, stored as sent (W-36); `400` with the `input-error` envelope
  for the second, which is unmeasured (G24).
- **Verification**: `<USERNAME>` reads back `<INT32_MAX>`; `<OTHER_USERNAME>` reads `404`.
- **Probes**: `p-649b68c7ce`.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-15

- **Preconditions**: one fresh `<USERNAME>` per request; `username` is always present.
- **Request**: one create per field with `null` in `id`, `firstName`, `lastName`, `email`,
  `password`, `phone` and `userStatus`.
- **Expected**: each answers `400` with nothing stored, or `200` with the field absent (or `0` for
  an integer). Never `5xx`, never a stored text `null`. Unmeasured (G24): the first reviewed run
  sets the baseline (L-56). A `null` id stored as `0` is harmless here, because the username is
  unique.
- **Verification**: read-back of each `<USERNAME>`.
- **Probes**: `p-083a4f5b1d`, `p-e6528eb635`, `p-a09089bbf3`, `p-aefb00396d`, `p-6894b84c7f`,
  `p-99ad146545`, `p-2ce5d60853`.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-16

- **Request**: three creates whose text names `<USERNAME>`: JSON with a double comma, JSON cut
  short, and a JSON string instead of an object.
- **Expected**: `400` with the `input-error` envelope for each (W-12, W-12b).
- **Verification**: `<USERNAME>` reads `404`.
- **Probes**: `p-f393f6eac0`, `p-ccc54a90e2`, `p-415c923c2b`.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-17

- **Request**: `POST /user`, a valid JSON body for `<USERNAME>` sent as `text/plain`.
- **Expected**: a refusal with `415` and a `{code, message}` body (W-13).
- **Verification**: `<USERNAME>` reads `404`.
- **Departure**: PN-08 (untracked): `415` is not declared, and its format is not in the envelope
  catalogue, so the body shape is checked against the schema rather than an envelope kind.
- **Probes**: `p-9c8d8f51a5`.
- **Tags**: `@regression` `@contract-drift` `@data-integrity`

### TC-USER-18

- **Request**: `POST /user` with an empty body and `Content-Type: application/json`.
- **Expected**: `400`; nothing stored. Measured as refused before anything is stored (W-40), so it
  is not a PN-19 trigger.
- **Verification**: `<UNKNOWN_USERNAME>` still reads `404`, which shows no nameless record exists.
- **Departure**: G21 (no contract note): the body is the plain text `No User provided. Try
  again?`, a format the envelope catalogue does not hold. The case asserts the status and the
  state, and records the body.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-19

- **Request**: `POST /user`, all eight fields for `<USERNAME>` as
  `application/x-www-form-urlencoded`.
- **Expected**: `200`, `User`.
- **Verification**: the read-back equals the sent fields, `password` apart.
- **Note**: G20 (a form create stores a different `password`, W-02) cannot be checked here
  without the exposure of TC-USER-39; once reads stop returning the password, only a working login
  (`LOCAL-4`) could show it.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-20

- **Request**: `POST /user`, all eight fields for `<USERNAME>` as `application/xml`, root element
  `user` as the schema declares.
- **Expected**: `200`, `User`.
- **Verification**: a JSON read-back equals the sent fields, `password` apart. Unmeasured (G24).
  The service's own XML root `User` is tolerated in answers (PN-14, by-design).
- **Tags**: `@regression` `@data-integrity`

### TC-USER-21

- **Request**: `POST /user`, full JSON body for `<USERNAME>`.
- **Expected**: `200`; the answer has no `password` property.
- **Verification**: response only.
- **Departure**: PN-13, tracked as `LOCAL-3` (re-scoped on 2026-10-10 to the reads and the
  write answers of `/user`): the create echoes the stored `User`, `password` included (W-01).
- **Tags**: `@regression` `@security` `@known-gap`

### TC-USER-22

- **Request**: `POST /user` for `<USERNAME>` with `id` as text.
- **Expected**: `400` with the `input-error` envelope, whose message names no implementation
  class or package.
- **Verification**: response only, then `<USERNAME>` reads `404`.
- **Departure**: PN-07 (untracked): the message names the model class (W-05).
- **Tags**: `@regression` `@security`

### TC-USER-23

- **Request**: `POST /user/createWithList` with two full users, `<USERNAME>` with `<USER_ID>` and
  `<OTHER_USERNAME>` with `<OTHER_USER_ID>`.
- **Expected**: `200`.
- **Verification**: both read back as sent, `password` apart (W-17). The answer's shape is
  TC-USER-24.
- **Tags**: `@smoke` `@data-integrity`

### TC-USER-24

- **Request**: as TC-USER-23.
- **Expected**: `200` with a body matching the declared single `User`.
- **Verification**: response only.
- **Departure**: PN-25 (untracked, contract gap): the answer is the array of stored users (W-17).
  The reviewer may prefer to correct the contract instead; until then the case states the spec.
- **Tags**: `@regression` `@contract-drift`

### TC-USER-25

- **Request**: `POST /user/createWithList` with `[]`.
- **Expected**: `400` (W-18).
- **Verification**: response only.
- **Departure**: G21 (no contract note): the plain-text body `No User provided. Try again?` is not
  in the envelope catalogue; the status is asserted, the body recorded.
- **Tags**: `@regression`

### TC-USER-26

- **Request**: `POST /user/createWithList` with a valid `<USERNAME>` and an `<OTHER_USERNAME>`
  whose `userStatus` is text.
- **Expected**: `400` with the `input-error` envelope (W-18b).
- **Verification**: neither `<USERNAME>` nor `<OTHER_USERNAME>` is stored; both read `404`.
- **Probes**: `p-b96f2f62a6`.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-27

- **Request**: `POST /user/createWithList` with two elements that share `<USERNAME>` but differ
  in id and names, and a third for `<OTHER_USERNAME>`.
- **Expected**: a `4xx` refusal with nothing stored, as for a duplicate create (AC-10).
- **Verification**: `<USERNAME>` and `<OTHER_USERNAME>` read `404`.
- **Departure**: unmeasured (G24). If the list is stored, the later element probably replaces the
  earlier one (PN-20, untracked); cleanup then deletes both names.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-28

- **Preconditions**: the `@destructive` lane, as TC-USER-03.
- **Request**: `POST /user/createWithList` with a valid `<USERNAME>` and an element with
  `<OTHER_USER_ID>` and `firstName` but no `username`.
- **Expected**: `400` with the `input-error` envelope; nothing stored.
- **Verification**: `<USERNAME>` reads `404`, and `<UNKNOWN_USERNAME>` reads `404`.
- **Departure**: an unmeasured sibling of PN-19 (L-37). `LOCAL-1` describes `POST /user` only, so
  the Defect column stays empty until triage.
- **Recovery**: restart the service container, then confirm `<UNKNOWN_USERNAME>` answers `404`.
- **Tags**: `@regression` `@destructive` `@data-integrity`

### TC-USER-29

- **Request**: four list creates whose text names `<USERNAME>`: JSON with a double comma, JSON
  cut short, a JSON string instead of an array, and an array of strings.
- **Expected**: `400` with the `input-error` envelope for each.
- **Verification**: `<USERNAME>` reads `404`.
- **Probes**: `p-ae82919802`, `p-e210294683`, `p-8f4b96c2da`, `p-32d6f93bd8`.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-30

- **Request**: `POST /user/createWithList`, a valid one-user list sent as `text/plain`.
- **Expected**: `415` with a `{code, message}` body, as TC-USER-17.
- **Verification**: `<USERNAME>` reads `404`.
- **Departure**: PN-08 (untracked).
- **Probes**: `p-4806fa10cf`.
- **Tags**: `@regression` `@contract-drift` `@data-integrity`

### TC-USER-31

- **Preconditions**: one fresh `<USERNAME>` and `<OTHER_USERNAME>` per request.
- **Request**: three lists, each with a valid `<USERNAME>` and an `<OTHER_USERNAME>` carrying one
  defect: `id` `<INT64_MAX>` plus one, `userStatus` `<INT32_MAX>` plus one, a number in
  `firstName`.
- **Expected**: `400` with the `input-error` envelope for each list.
- **Verification**: no name of any list is stored.
- **Departure**: the number in `firstName` is the list sibling of PN-21 (untracked) and is
  expected to be stored as text; the two overflows are unmeasured on this operation.
- **Probes**: `p-7a5542c632`, `p-628efeea15`, `p-74a476d879`.
- **Tags**: `@regression` `@contract-drift` `@data-integrity`
