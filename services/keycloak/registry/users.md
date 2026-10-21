---
feature: USERS
title: Users
endpoints:
  - GET /admin/realms/{realm}/users
  - POST /admin/realms/{realm}/users
  - GET /admin/realms/{realm}/users/count
  - GET /admin/realms/{realm}/users/{user-id}
  - PUT /admin/realms/{realm}/users/{user-id}
  - DELETE /admin/realms/{realm}/users/{user-id}
contract: docs/features/users.md
auth: [default, admin, viewer, no-role, anonymous]
test_data:
  <REALM>: the realm the pack imports, always qa
  <USERNAME>: a unique username from the user builder, seeded; a second one is <OTHER_USERNAME>
  <USER_ID>: the id of a user the case created, read back from the create
  <FIRST_NAME>: a first name from the builder, set at create time
  <PASSWORD>: a password credential the seeded faker generates for the run, never a real one; evidence masks it
  <UNKNOWN_ID>: the nil UUID, which no user has
  <UNKNOWN_REALM>: a realm name no realm has, from the seeded faker
requirements:
  - { id: REQ-USERS-01, text: A user is created, read, listed, counted, updated and deleted by a client that manages users }
  - { id: REQ-USERS-02, text: A username is unique in a realm }
  - { id: REQ-USERS-03, text: The list and the count apply the same filters, and the list pages with first and max }
  - { id: REQ-USERS-04, text: Reads need a role that views users and writes one that manages users; without a token the answer is 401 }
  - { id: REQ-USERS-05, text: An update changes only the fields it sends }
  - { id: REQ-USERS-06, text: An unknown user or realm answers not found, and a refused request changes nothing }
beyond_floor: [TC-USERS-31, TC-USERS-32, TC-USERS-33, TC-USERS-34]
---

# `Users` test cases

Contract: [`docs/features/users.md`](../docs/features/users.md).

The create, read, list, count, update and delete of a user in realm `qa`, as the three
service-account clients of the realm (`admin`, which manages users, `viewer`, which only reads them,
and `no-role`) and without a token. The read and write rows of the access matrix are
function-level authorization cases (OWASP API5:2023): every write is also sent as `viewer`, and
every refused request is followed by a read that shows nothing changed.

- **Own records only.** The realm has no listed user at start (M-03). Every case creates the users
  it needs through `admin` with a unique `<USERNAME>` and deletes them at the end; lists and counts
  are always filtered by `username` with `exact=true`, so another case's users never change a
  result. The three service-account users are shared records: TC-USERS-34 reads them, no case
  changes them.
- **Writes are unmeasured** at intake: A1 to A3 of the contract are confirmed or refuted by the
  first spec run, and a case that the run contradicts goes back to `draft` with a note here.
- **Errors** have three shapes (KN-07); every error case asserts its envelope from the pack's
  catalogue, which `qa-automate` writes.

## Cases

| ID | Title | Requirement | Technique | Priority | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|
| TC-USERS-01 | A user created by admin can be found by its exact username | REQ-USERS-01 | use-case | high | published | specs/users-crud.spec.ts | |
| TC-USERS-02 | The list pages with first and max over the users of one filter | REQ-USERS-03 | boundary-value | medium | published | specs/users-crud.spec.ts | |
| TC-USERS-03 | A client without a role cannot list users | REQ-USERS-04 | equivalence-partition | high | published | specs/users-access.spec.ts | |
| TC-USERS-04 | Listing the users of an unknown realm answers not found | REQ-USERS-06 | equivalence-partition | medium | published | specs/users-errors.spec.ts | |
| TC-USERS-05 | A malformed integer in max or first answers not found, not bad request | REQ-USERS-03 | boundary-value | medium | published | specs/users-errors.spec.ts | |
| TC-USERS-06 | Admin creates a user and reads it back by id | REQ-USERS-01 | use-case | high | published | specs/users-crud.spec.ts | |
| TC-USERS-07 | A viewer cannot create a user, and none is created | REQ-USERS-04 | equivalence-partition | high | published | specs/users-access.spec.ts | |
| TC-USERS-08 | A second user with the same username is refused and the first is unchanged | REQ-USERS-02 | state-transition | high | published | specs/users-crud.spec.ts | |
| TC-USERS-09 | A user without a username is refused and none is created | REQ-USERS-06 | equivalence-partition | medium | published | specs/users-errors.spec.ts | |
| TC-USERS-10 | A field of the wrong type is refused and no user is created | REQ-USERS-06 | error-guessing | medium | published | specs/users-errors.spec.ts | |
| TC-USERS-11 | Creating a user in an unknown realm answers not found | REQ-USERS-06 | equivalence-partition | low | published | specs/users-errors.spec.ts | |
| TC-USERS-12 | The count of an exact username filter follows create and delete | REQ-USERS-03 | state-transition | high | published | specs/users-crud.spec.ts | |
| TC-USERS-13 | A client without a role cannot count users | REQ-USERS-04 | equivalence-partition | high | published | specs/users-access.spec.ts | |
| TC-USERS-14 | Counting the users of an unknown realm answers not found | REQ-USERS-06 | equivalence-partition | low | published | specs/users-errors.spec.ts | |
| TC-USERS-15 | A viewer reads a user by id with the documented representation and without its credentials | REQ-USERS-01 | use-case | high | published | specs/users-crud.spec.ts | |
| TC-USERS-16 | An unknown user id answers not found | REQ-USERS-06 | equivalence-partition | medium | published | specs/users-errors.spec.ts | |
| TC-USERS-17 | A client without a role cannot read an existing user | REQ-USERS-04 | equivalence-partition | high | published | specs/users-access.spec.ts | |
| TC-USERS-18 | A malformed user id answers not found | REQ-USERS-06 | error-guessing | low | published | specs/users-errors.spec.ts | |
| TC-USERS-19 | Admin updates a user's first name and the read-back shows it | REQ-USERS-01 | use-case | high | published | specs/users-crud.spec.ts | |
| TC-USERS-20 | An update that omits a field keeps its value | REQ-USERS-05 | state-transition | high | published | specs/users-crud.spec.ts | |
| TC-USERS-21 | A viewer cannot update a user, and the user is unchanged | REQ-USERS-04 | equivalence-partition | high | published | specs/users-access.spec.ts | |
| TC-USERS-22 | Renaming a user to another user's username is refused and both are unchanged | REQ-USERS-02 | state-transition | high | published | specs/users-crud.spec.ts | |
| TC-USERS-23 | An update with a field of the wrong type is refused and the user is unchanged | REQ-USERS-06 | error-guessing | medium | published | specs/users-errors.spec.ts | |
| TC-USERS-24 | Updating an unknown user id answers not found | REQ-USERS-06 | equivalence-partition | medium | published | specs/users-errors.spec.ts | |
| TC-USERS-25 | Updating a user in an unknown realm answers not found | REQ-USERS-06 | equivalence-partition | low | published | specs/users-errors.spec.ts | |
| TC-USERS-26 | Admin deletes a user and a read answers not found | REQ-USERS-01 | use-case | high | published | specs/users-crud.spec.ts | |
| TC-USERS-27 | A viewer cannot delete a user, and the user still exists | REQ-USERS-04 | equivalence-partition | high | published | specs/users-access.spec.ts | |
| TC-USERS-28 | Deleting the same user twice answers not found the second time | REQ-USERS-06 | state-transition | medium | published | specs/users-crud.spec.ts | |
| TC-USERS-29 | A client without a role cannot delete a user | REQ-USERS-04 | equivalence-partition | high | published | specs/users-access.spec.ts | |
| TC-USERS-30 | Deleting an unknown user id answers not found | REQ-USERS-06 | equivalence-partition | low | published | specs/users-errors.spec.ts | |
| TC-USERS-31 | Every users operation refuses a request without a token | REQ-USERS-04 | equivalence-partition | high | published | specs/users-access.spec.ts | |
| TC-USERS-32 | A client of one realm cannot list the users of another | REQ-USERS-04 | equivalence-partition | high | published | specs/users-access.spec.ts | |
| TC-USERS-33 | An expired token is refused and the strategy renews it | REQ-USERS-04 | state-transition | medium | published | specs/users-access.spec.ts | |
| TC-USERS-34 | Service accounts are left out of the unfiltered list but found by username | REQ-USERS-03 | error-guessing | low | published | specs/users-errors.spec.ts | |

## Case details

### TC-USERS-01

- **Preconditions**: `admin` creates `<USERNAME>`.
- **Request**: `GET /admin/realms/qa/users?username=<USERNAME>&exact=true` as `admin`.
- **Expected**: `200`; an array of `UserRepresentation` (schema) with exactly one user whose
  `username` is `<USERNAME>` and whose `id` is the created one.
- **Verification**: response only.
- **Tags**: `@smoke`.

### TC-USERS-02

- **Preconditions**: `admin` creates two users whose usernames share a unique prefix `<USERNAME>`.
- **Request**: `GET /users?username=<USERNAME>&max=1`, then `&first=1&max=1`, then `&first=2&max=1`,
  as `admin`.
- **Expected**: `200` each; one user, the other user, then `[]`. The two pages together hold both
  created ids, each once (R2, R3).
- **Verification**: response only.
- **Tags**: `@regression`.

### TC-USERS-03

- **Request**: `GET /admin/realms/qa/users` as `no-role`.
- **Expected**: `403` with the `error` envelope (spec declares `403`; M-02).
- **Verification**: the same request as `viewer` answers `200`, so the refusal is about the role.
- **Tags**: `@regression @security`.

### TC-USERS-04

- **Request**: `GET /admin/realms/<UNKNOWN_REALM>/users` as `admin`.
- **Expected**: `404` with the `error` envelope naming the realm (M-11, KN-02).
- **Verification**: response only.
- **Tags**: `@regression @contract-drift`.

### TC-USERS-05

- **Request**: `GET /users?max=abc`, `?first=1.5` and `?max=<INT32_MAX+1>` as `admin`, one step each.
- **Expected**: `404` with the `error` envelope `HTTP 404 Not Found` (KN-03, M-06), where a `400`
  would be expected for a malformed parameter. A negative `max` or `first` answers `200` (M-06).
- **Verification**: response only.
- **Tags**: `@regression @contract-drift`.

### TC-USERS-06

- **Request**: `POST /admin/realms/qa/users` as `admin` with `<USERNAME>`, `email`, `firstName`,
  `lastName` and `enabled: true` from the builder.
- **Expected**: `201`. The new id comes from the `Location` header; if there is none, from an exact
  `username` search (A2, recorded by the case).
- **Verification**: `GET /users/<USER_ID>` answers `200` with every field sent.
- **Tags**: `@smoke @data-integrity`.

### TC-USERS-07

- **Request**: `POST /users` as `viewer` with `<USERNAME>`.
- **Expected**: `403` with the `error` envelope (spec; A1).
- **Verification**: an exact `username` search as `admin` answers `[]`, so nothing was created.
- **Tags**: `@regression @security`.

### TC-USERS-08

- **Preconditions**: `admin` creates `<USERNAME>` with `firstName` `<FIRST_NAME>`.
- **Request**: `POST /users` as `admin` with `<USERNAME>` and another `firstName`.
- **Expected**: `409` with the `errorMessage` envelope (spec, R1).
- **Verification**: the exact `username` search finds one user, the first one, with `<FIRST_NAME>`.
- **Tags**: `@regression @data-integrity`.

### TC-USERS-09

- **Request**: `POST /users` as `admin` with `firstName` and no `username`, then with `username: ""`.
- **Expected**: `400` with the `errorMessage` envelope each (spec; seen at setup, KN-07).
- **Verification**: a `firstName` search for the value sent answers `[]`.
- **Tags**: `@regression`.

### TC-USERS-10

- **Request**: `POST /users` as `admin` with `<USERNAME>` and `enabled: "yes"` (a string where the
  schema has a boolean).
- **Expected**: `400` with an error envelope (spec declares `400`; the answer is unmeasured, and a
  different status is recorded as a contract note).
- **Verification**: the exact `username` search answers `[]`.
- **Tags**: `@regression`.

### TC-USERS-11

- **Request**: `POST /admin/realms/<UNKNOWN_REALM>/users` as `admin` with `<USERNAME>`.
- **Expected**: `404` with the `error` envelope (M-11 for the read; unmeasured for the write).
- **Verification**: the exact `username` search in `qa` answers `[]`.
- **Tags**: `@regression @contract-drift`.

### TC-USERS-12

- **Preconditions**: `admin` creates a decoy user whose username contains `<USERNAME>`
  (`<USERNAME>-decoy`), removed when the case ends.
- **Request**: `GET /users/count?username=<USERNAME>&exact=true` as `viewer`: before the create,
  after `admin` creates `<USERNAME>`, and after `admin` deletes it.
- **Expected**: `200` each with `0`, `1`, `0`; at the middle step the list with the same filter
  holds exactly as many users as the count (R4), and that user is `<USERNAME>`, not the decoy.
- **Verification**: the list comparison above.
- **Tags**: `@regression @data-integrity`.

### TC-USERS-13

- **Request**: `GET /users/count` as `no-role`.
- **Expected**: `403` with the `error` envelope (spec; M-02).
- **Verification**: the same request as `viewer` answers `200`.
- **Tags**: `@regression @security`.

### TC-USERS-14

- **Request**: `GET /admin/realms/<UNKNOWN_REALM>/users/count` as `admin`.
- **Expected**: `404` with the `error` envelope (M-11).
- **Verification**: response only.
- **Tags**: `@regression @contract-drift`.

### TC-USERS-15

- **Preconditions**: `admin` creates `<USERNAME>` with `email`, `firstName`, `lastName` and a
  password credential `<PASSWORD>`, and `GET /users/<USER_ID>/credentials` as `admin` lists exactly one
  credential of type `password` (the precondition is checked, not assumed).
- **Request**: `GET /users/<USER_ID>` as `viewer`.
- **Expected**: `200`; a `UserRepresentation` (schema) with the fields sent, `enabled` true and a
  `createdTimestamp`; no `credentials` value (spec, description of the list), and `<PASSWORD>`
  nowhere in the body. A user that stores a credential is what makes the absence a finding: without
  one, an answer that exposed credentials would still pass (changed at the automate review, approved
  by the owner on 2026-10-16).
- **Verification**: response only.
- **Tags**: `@smoke @security`.

### TC-USERS-16

- **Request**: `GET /users/<UNKNOWN_ID>` as `admin`.
- **Expected**: `404` with the `error` envelope `User not found` (M-09, KN-02).
- **Verification**: response only.
- **Tags**: `@regression @contract-drift`.

### TC-USERS-17

- **Preconditions**: `admin` creates `<USERNAME>`.
- **Request**: `GET /users/<USER_ID>` as `no-role`.
- **Expected**: `403` with the `error` envelope (spec; M-10), and nowhere in the body `<USERNAME>`.
- **Verification**: the same request as `viewer` answers `200`, so the user exists.
- **Tags**: `@regression @security`.

### TC-USERS-18

- **Request**: `GET /users/not-a-uuid` and `GET /users/a%2Fb` as `admin`, one step each.
- **Expected**: `404` with the `error` envelope `User not found` each (M-09).
- **Verification**: response only.
- **Tags**: `@regression @contract-drift`.

### TC-USERS-19

- **Preconditions**: `admin` creates `<USERNAME>` with `firstName` `<FIRST_NAME>`.
- **Request**: `PUT /users/<USER_ID>` as `admin` with the full representation read back and another
  `firstName`.
- **Expected**: `204` (spec).
- **Verification**: the read-back shows the new `firstName`, and every other field equal to the
  representation before the update (`expectOnlyChanged`).
- **Tags**: `@smoke @data-integrity`.

### TC-USERS-20

- **Preconditions**: `admin` creates `<USERNAME>` with a `lastName` and an `email` that differ from
  any default.
- **Request**: `PUT /users/<USER_ID>` as `admin` with only a new `firstName`.
- **Expected**: `204`.
- **Verification**: the read-back keeps `lastName` and `email` and shows the new `firstName`
  (preserve-on-omit, L-20); if the omitted fields are cleared, the case fails and the finding is a
  contract note.
- **Tags**: `@regression @data-integrity`.

### TC-USERS-21

- **Preconditions**: `admin` creates `<USERNAME>` with `firstName` `<FIRST_NAME>`.
- **Request**: `PUT /users/<USER_ID>` as `viewer` with another `firstName`.
- **Expected**: `403` with the `error` envelope (spec; A1).
- **Verification**: the read-back as `admin` still shows `<FIRST_NAME>`.
- **Tags**: `@regression @security`.

### TC-USERS-22

- **Preconditions**: `admin` creates `<USERNAME>` and `<OTHER_USERNAME>`.
- **Request**: `PUT /users/<USER_ID>` of the first as `admin` with `username: <OTHER_USERNAME>`.
- **Expected**: `409` with the `errorMessage` envelope (spec, R1). `username` is also written by
  `POST` (TC-USERS-08); both paths of the uniqueness rule are covered.
- **Verification**: both users read back unchanged.
- **Tags**: `@regression @data-integrity`.

### TC-USERS-23

- **Preconditions**: `admin` creates `<USERNAME>` disabled (`enabled: false`), so an applied `"yes"`
  would show in the read-back.
- **Request**: `PUT /users/<USER_ID>` as `admin` with `enabled: "yes"`.
- **Expected**: `400` with an error envelope (spec; unmeasured, as TC-USERS-10).
- **Verification**: the read-back equals the representation before the request.
- **Tags**: `@regression @data-integrity`.

### TC-USERS-24

- **Request**: `PUT /users/<UNKNOWN_ID>` as `admin` with a valid representation.
- **Expected**: `404` with the `error` envelope (KN-02; unmeasured for the write).
- **Verification**: response only; no user was created under the username sent (exact search).
- **Tags**: `@regression @contract-drift`.

### TC-USERS-25

- **Request**: `PUT /admin/realms/<UNKNOWN_REALM>/users/<UNKNOWN_ID>` as `admin`.
- **Expected**: `404` with the `error` envelope.
- **Verification**: response only.
- **Tags**: `@regression @contract-drift`.

### TC-USERS-26

- **Preconditions**: `admin` creates `<USERNAME>`.
- **Request**: `DELETE /users/<USER_ID>` as `admin`.
- **Expected**: `204` (spec).
- **Verification**: `GET /users/<USER_ID>` answers `404`, and the exact `username` search `[]`.
- **Tags**: `@smoke @data-integrity`.

### TC-USERS-27

- **Preconditions**: `admin` creates `<USERNAME>`.
- **Request**: `DELETE /users/<USER_ID>` as `viewer`.
- **Expected**: `403` with the `error` envelope (spec; A1).
- **Verification**: `GET /users/<USER_ID>` as `admin` still answers `200`.
- **Tags**: `@regression @security`.

### TC-USERS-28

- **Preconditions**: `admin` creates `<USERNAME>` and deletes it (`204`).
- **Request**: `DELETE /users/<USER_ID>` again as `admin`.
- **Expected**: `404` with the `error` envelope (A3; the spec declares no `404` for `DELETE`).
- **Verification**: response only.
- **Tags**: `@regression @contract-drift`.

### TC-USERS-29

- **Preconditions**: `admin` creates `<USERNAME>`.
- **Request**: `DELETE /users/<USER_ID>` as `no-role`.
- **Expected**: `403` with the `error` envelope (spec; A1).
- **Verification**: `GET /users/<USER_ID>` as `admin` still answers `200`.
- **Tags**: `@regression @security`.

### TC-USERS-30

- **Request**: `DELETE /users/<UNKNOWN_ID>` as `admin`.
- **Expected**: `404` with the `error` envelope (KN-02; unmeasured).
- **Verification**: response only.
- **Tags**: `@regression @contract-drift`.

### TC-USERS-31

Beyond the floor: the contract declares no security scheme and no `401` (KN-01, KN-02).

- **Preconditions**: `admin` creates `<USERNAME>`.
- **Request**: each of the six operations as `anonymous`, one step each (the writes with a valid
  body for `<USERNAME>`).
- **Expected**: `401` with the `error` envelope `HTTP 401 Unauthorized` each (M-01; A1 for the
  writes).
- **Verification**: the read-back as `admin` shows `<USERNAME>` unchanged and no other user created.
- **Tags**: `@regression @security @contract-drift`.

### TC-USERS-32

Beyond the floor: the realm boundary comes from the realm's roles, not the contract (R8).

- **Request**: `GET /admin/realms/master/users` as `admin`.
- **Expected**: `403` with the `error` envelope (M-11).
- **Verification**: the same request on `qa` answers `200`.
- **Tags**: `@regression @security`.

### TC-USERS-33

Beyond the floor: the token lifetime is set by the realm (60 seconds, R7).

- **Request**: `GET /users?username=<USERNAME>&exact=true` as `admin` with a token obtained 65 seconds
  earlier, sent as a caller's explicit `Authorization` header; then the same request through the
  `admin` client.
- **Expected**: `401` with the `error` envelope for the stale token (M-12); `200` through the
  client, whose strategy renewed the token.
- **Verification**: response only. The case waits about a minute.
- **Tags**: `@regression @security`.

### TC-USERS-34

Beyond the floor: comes from a measurement (KN-05), not the contract.

- **Request**: `GET /users?max=1000` and `GET /users?username=service-account-qa-&exact=false` as
  `admin`.
- **Expected**: `200` each. The list holds no user whose `username` starts with `service-account-`,
  while the search returns the three service accounts of the realm (read only; shared records). The
  count is not compared: other cases' users can change it while this one runs.
- **Verification**: response only.
- **Tags**: `@regression @contract-drift`.
