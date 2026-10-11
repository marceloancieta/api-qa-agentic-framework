---
feature: USER
title: Users and sessions
endpoints:
  - GET /user/{username}
  - PUT /user/{username}
  - DELETE /user/{username}
contract: docs/features/user.md
auth: [default, anonymous]
test_data:
  <USERNAME>: a username the case creates, built from the run prefix plus a builder suffix, unique per case; never login or logout
  <OTHER_USERNAME>: a second username the case creates or reserves, built like <USERNAME>
  <UNKNOWN_USERNAME>: a well-formed username with a prefix no builder uses, never created
  <OTHER_UNKNOWN_USERNAME>: a second never-created username, built like <UNKNOWN_USERNAME>
  <USER_ID>: an explicit id from the case's own id range, sent on every create
  <OTHER_USER_ID>: a second id from the case's own id range
  <PASSWORD>: a synthetic password the builder generates; never written in docs or specs
  <USER_STATUS>: a non-zero int32 the builder picks, so a stored value differs from the default 0
  <INT32_MAX>: the largest int32, from a shared constant
  <INT64_MAX>: the largest int64, from a shared constant
requirements:
  - { id: REQ-USER-01, text: "A user is addressed by an exact, case-sensitive username in the path (business rule 1)" }
  - { id: REQ-USER-04, text: "GET /user/{username} returns the stored user, or 404 when there is none (business rule 4; AC-02)" }
  - { id: REQ-USER-05, text: "PUT /user/{username} updates the user named in the path; unknown user 404, bad request 400 (business rule 5; AC-03, AC-12, AC-13)" }
  - { id: REQ-USER-06, text: "DELETE /user/{username} removes the user; unknown user 404 (business rule 6; AC-04)" }
  - { id: REQ-USER-07, text: "Writes are described as for the logged in user, but no operation declares security (business rule 7)" }
  - { id: REQ-USER-10, text: "password belongs to the User schema, but no answer may disclose its stored value (business rule 10; AC-09)" }
  - { id: REQ-USER-11, text: "The response media type follows Accept, json or xml (business rule 11)" }
  - { id: REQ-USER-12, text: "Errors answer with a catalogued envelope and reveal no internals (business rule 12)" }
  - { id: REQ-USER-13, text: "A user is identified by its username; ids are not unique (business rule 13)" }
  - { id: REQ-USER-14, text: "A body field of the wrong JSON type or outside its integer range is refused (business rule 14)" }
beyond_floor: [TC-USER-38, TC-USER-40, TC-USER-41, TC-USER-50, TC-USER-55, TC-USER-56, TC-USER-61, TC-USER-62]
---

# `Users and sessions` test cases: reading, updating and deleting a user

Contract: [`docs/features/user.md`](../docs/features/user.md). This is the second of the three
files of feature `USER`; [`registry/user.md`](user.md) lists them all and holds the data rules
every case follows: own users only, a unique `<USERNAME>` and an explicit `<USER_ID>` on every
create, no create without `username`, cleanup confirmed by a read that answers `404` (PN-22), no
password values, and `default` and `anonymous` as the only actors (PN-05).

Every case here creates its user first with `POST /user` and a full body, unless its details say
otherwise, and ends with that cleanup. A case whose update renames a user deletes the new name as
well (W-22).

**Object-level authorization** cannot be demonstrated on this API: there is no credential and no
notion of the logged-in user a request could be checked against (PN-05, G11). TC-USER-40 and
TC-USER-55 record that `anonymous` and `default` get the same answers; the actor matrix belongs to
backlog FUT-07. What can be shown here is declared versus honored on the identity fields of an
update (TC-USER-44, TC-USER-45) and the exposure of the password (TC-USER-39, TC-USER-56).

**The declared `400` "Invalid username supplied"** of the read and the delete was produced by no
input at intake (G12). TC-USER-37 and TC-USER-60 accept `400` or `404` for malformed names, so the
code stays reachable by design while what triggers it is unknown; `npm run contract:codes` will
keep reporting it as never seen until a run produces it.

## Cases

| ID | Title | Requirement | Technique | Priority | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|
| TC-USER-32 | A created user reads back with the declared User shape | REQ-USER-04 | equivalence-partition | high | automated | specs/user.spec.ts | |
| TC-USER-33 | A read that asks for XML answers XML with the stored fields | REQ-USER-11 | equivalence-partition | medium | approved | | |
| TC-USER-34 | An unknown username answers 404 with the not-found envelope | REQ-USER-04 | equivalence-partition | high | approved | | |
| TC-USER-35 | A username with another case or a trailing space is a different, unknown user | REQ-USER-01 | boundary-value | medium | approved | | |
| TC-USER-36 | Injection-like usernames answer 404 without internals | REQ-USER-12 | error-guessing | medium | approved | | |
| TC-USER-37 | Overlong and encoded-slash usernames are refused or missed, never a server error | REQ-USER-04 | error-guessing | low | approved | | |
| TC-USER-38 | A path of about 8 KB is refused with a client error | REQ-USER-12 | boundary-value | low | approved | | |
| TC-USER-39 | A read never returns the stored password | REQ-USER-10 | equivalence-partition | high | automated | specs/user.spec.ts | LOCAL-3 |
| TC-USER-40 | Anonymous and default reads of a user answer alike | REQ-USER-07 | equivalence-partition | low | approved | | |
| TC-USER-41 | User answers do not disclose the server software | REQ-USER-12 | error-guessing | low | approved | | |
| TC-USER-42 | A full-body update changes only the field it changes | REQ-USER-05 | equivalence-partition | high | approved | | |
| TC-USER-43 | Fields an update omits keep their values | REQ-USER-05 | state-transition | high | approved | | |
| TC-USER-44 | A body username that differs from the path does not rename the user | REQ-USER-05 | equivalence-partition | high | approved | | |
| TC-USER-45 | A body id that differs from the stored one does not re-key the user | REQ-USER-05 | equivalence-partition | high | approved | | |
| TC-USER-46 | An update of an unknown username answers 404 and creates nothing | REQ-USER-05 | equivalence-partition | high | approved | | |
| TC-USER-47 | An unreadable or mistyped update is refused and leaves the record unchanged | REQ-USER-05 | error-guessing | medium | approved | | |
| TC-USER-48 | Numbers, booleans and fractions in an update are refused and leave the record unchanged | REQ-USER-14 | error-guessing | medium | approved | | |
| TC-USER-49 | An update beyond the integer ranges is refused and leaves the record unchanged | REQ-USER-14 | boundary-value | medium | approved | | |
| TC-USER-50 | Unknown properties in an update are never stored | REQ-USER-05 | error-guessing | medium | approved | | |
| TC-USER-51 | An update sent as text/plain is refused and leaves the record unchanged | REQ-USER-12 | error-guessing | low | approved | | |
| TC-USER-52 | A form-encoded update stores its fields as sent | REQ-USER-05 | equivalence-partition | medium | approved | | |
| TC-USER-53 | Repeating an identical update leaves the same state | REQ-USER-05 | state-transition | low | approved | | |
| TC-USER-54 | Overlong and encoded-slash paths on update create nothing and never fail with a server error | REQ-USER-05 | error-guessing | low | approved | | |
| TC-USER-55 | An anonymous update applies exactly like a default one | REQ-USER-07 | equivalence-partition | low | automated | specs/user.spec.ts | |
| TC-USER-56 | The answer to an update never carries the password | REQ-USER-10 | error-guessing | medium | approved | | LOCAL-3 |
| TC-USER-57 | Deleting a user removes it | REQ-USER-06 | state-transition | high | automated | specs/user.spec.ts | |
| TC-USER-58 | A second delete of the same user answers 404 | REQ-USER-06 | state-transition | medium | approved | | |
| TC-USER-59 | Deleting a username that was never created answers 404 | REQ-USER-06 | equivalence-partition | high | approved | | |
| TC-USER-60 | Overlong and encoded-slash paths on delete remove nothing and never fail with a server error | REQ-USER-06 | error-guessing | low | approved | | |
| TC-USER-61 | Deleting one user leaves another user that shares its id | REQ-USER-13 | error-guessing | medium | approved | | |
| TC-USER-62 | One delete removes a username that was created twice | REQ-USER-13 | state-transition | low | approved | | |

## Case details

### TC-USER-32

- **Preconditions**: `<USERNAME>` created by the case, full body.
- **Request**: `GET /user/<USERNAME>`, `Accept: application/json`, actor `default`.
- **Expected**: `200`, `application/json`, body matches `User`; `username`, `id` and the business
  fields equal the ones stored by the create.
- **Verification**: response only (the read is the verification of the create).
- **Tags**: `@sanity`

### TC-USER-33

- **Preconditions**: `<USERNAME>` created by the case.
- **Request**: `GET /user/<USERNAME>`, `Accept: application/xml`.
- **Expected**: `200`, `application/xml`; the fields equal the ones stored (M-05). The root element
  `User` instead of the declared `user` is tolerated (PN-14, by-design) and not asserted.
- **Verification**: response only.
- **Tags**: `@regression`

### TC-USER-34

- **Preconditions**: no nameless record exists (the `@destructive` cases run apart).
- **Request**: `GET /user/<UNKNOWN_USERNAME>`, once without `Accept` and once with
  `Accept: application/json`.
- **Expected**: `404` with the `not-found` envelope for each (AC-02; M-01, M-02).
- **Verification**: response only.
- **Departure**: PN-02 (untracked): with `Accept: application/json` the plain-text body is
  labelled JSON, which the `not-found` envelope (content type `application/xml`) refuses. Whether
  the envelope should accept JSON is the owner's open question A-08.
- **Tags**: `@regression` `@contract-drift`

### TC-USER-35

- **Preconditions**: `<USERNAME>` created by the case, with at least one lower-case letter.
- **Request**: `GET` of `<USERNAME>` upper-cased; `GET` of `<USERNAME>` followed by an encoded
  space.
- **Expected**: `404` with the `not-found` envelope for both (M-06).
- **Verification**: response only; `<USERNAME>` itself still reads `200`.
- **Tags**: `@regression`

### TC-USER-36

- **Request**: `GET /user/{username}`, URL-encoded, with a quote, a statement-like value
  (`' OR '1'='1`), a script fragment, non-ASCII letters, a literal `%` and a matrix parameter
  (`;x=1`).
- **Expected**: `404` with the `not-found` envelope for each, or the declared `400`; never `5xx`;
  no body echoes the input or names a query, a stack frame or a class (M-09).
- **Verification**: response only.
- **Tags**: `@regression` `@security`

### TC-USER-37

- **Request**: `GET /user/{username}` with 1024 characters, and with an encoded slash inside the
  name.
- **Expected**: the declared `400` or `404` with the `not-found` envelope; never `5xx` (M-09).
- **Verification**: response only.
- **Departure**: G12 (no contract note): the declared `400` was produced by no input.
- **Probes**: `p-b36e2fc5fa`, `p-0547e03488`.
- **Tags**: `@regression`

### TC-USER-38

- **Request**: `GET /user/{username}` with a name of about 8 KB.
- **Expected**: a `4xx` refusal; never `5xx` (M-10 measured `414`).
- **Verification**: response only.
- **Departure**: PN-08 (untracked): the `414` is undeclared and answers as an HTML page from the
  web server, without CORS headers; the case asserts the status class and records the body.
- **Tags**: `@regression` `@contract-drift`

### TC-USER-39

- **Preconditions**: `<USERNAME>` created by the case with `<PASSWORD>`.
- **Request**: `GET /user/<USERNAME>` as `anonymous`, then as `default`.
- **Expected**: `200`, `User`, and no `password` property in either answer (AC-09; a security
  expectation the spec does not state).
- **Verification**: response only.
- **Observed today**: the stored password is returned to any caller (M-04; PN-13, `LOCAL-3`).
- **Tags**: `@regression` `@security` `@known-gap`

### TC-USER-40

- **Preconditions**: `<USERNAME>` created by the case.
- **Request**: `GET /user/<USERNAME>` as `default`, then as `anonymous`.
- **Expected**: both `200` with equal bodies. This records that access is not separated (PN-05,
  by-design; G11); it asserts nothing against it.
- **Verification**: comparison of the two answers.
- **Tags**: `@regression` `@security`

### TC-USER-41

- **Preconditions**: `<USERNAME>` created by the case.
- **Request**: `GET /user/<USERNAME>`; `OPTIONS /user/<USERNAME>`.
- **Expected**: no answer names the web server's product and version in a header; `OPTIONS`
  returns no description of the implementation (WADL).
- **Verification**: response only.
- **Departure**: PN-07 (untracked): every answer carries `Server` with the web server version and
  `OPTIONS` returns a WADL document (M-16, M-17).
- **Tags**: `@regression` `@security`

### TC-USER-42

- **Preconditions**: `<USERNAME>` created with every field set, `userStatus` `<USER_STATUS>`.
- **Request**: `PUT /user/<USERNAME>`, `application/json`, the full stored body with only
  `firstName` changed.
- **Expected**: `200` (AC-03). The spec declares no body; the service returns the `User` (W-19),
  which the case neither requires nor refuses.
- **Verification**: state comparison of the read-back with the stored state: only `firstName`
  changed (W-19).
- **Tags**: `@smoke` `@data-integrity`

### TC-USER-43

- **Preconditions**: `<USERNAME>` created with every field set to a non-default value,
  `userStatus` `<USER_STATUS>` (L-20).
- **Request**: `PUT /user/<USERNAME>` with only `username` `<USERNAME>` and a new `lastName`.
- **Expected**: `200`, then a read-back where `lastName` changed and every other field kept its
  value, `id` and `userStatus` included (AC-13).
- **Verification**: state comparison, every field but `lastName` unchanged.
- **Departure**: PN-25 (untracked): the update replaces the whole record; the omitted strings are
  absent and `id` and `userStatus` become `0` (W-20).
- **Tags**: `@regression` `@data-integrity`

### TC-USER-44

- **Preconditions**: `<USERNAME>` created by the case; `<OTHER_USERNAME>` reads `404`.
- **Request**: `PUT /user/<USERNAME>`, the full stored body with `username` `<OTHER_USERNAME>`.
- **Expected**: a `400` refusal, or `200` with the body name ignored (AC-12); the path identity is
  kept either way.
- **Verification**: `<USERNAME>` reads `200` with its stored record; `<OTHER_USERNAME>` reads
  `404`.
- **Departure**: PN-25 (untracked): the user is renamed; the old name reads `404` and the new one
  `200` (W-22).
- **Cleanup**: delete `<USERNAME>` and `<OTHER_USERNAME>`; both read `404`.
- **Tags**: `@regression` `@security` `@data-integrity`

### TC-USER-45

- **Preconditions**: `<USERNAME>` created with `<USER_ID>`.
- **Request**: `PUT /user/<USERNAME>`, the full stored body with `id` `<OTHER_USER_ID>`.
- **Expected**: a `400` refusal, or `200` with the body id ignored (AC-12); `id` stays `<USER_ID>`.
- **Verification**: the read-back keeps `<USER_ID>`.
- **Departure**: PN-25 (untracked): the user is re-keyed to the body id (W-21).
- **Tags**: `@regression` `@security` `@data-integrity`

### TC-USER-46

- **Preconditions**: `<UNKNOWN_USERNAME>` and `<OTHER_UNKNOWN_USERNAME>` read `404`; no user is
  created by this case.
- **Request**: `PUT /user/<UNKNOWN_USERNAME>` with a full body naming `<UNKNOWN_USERNAME>`; then
  with a full body naming `<OTHER_UNKNOWN_USERNAME>`.
- **Expected**: `404` with the `not-found` envelope for both (W-25, W-26).
- **Verification**: both names still read `404`; nothing was created.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-47

- **Preconditions**: `<USERNAME>` created with every field set.
- **Request**: `PUT /user/<USERNAME>` with JSON with a double comma, JSON cut short, a JSON string
  instead of an object, `id` as text, `userStatus` as text, and `firstName` as an object, one
  request each.
- **Expected**: `400` with the `input-error` envelope for each (W-23, W-24, W-24b).
- **Verification**: after each request the read-back equals the stored state (L-35).
- **Probes**: `p-2bab0689f6`, `p-1a39926f1e`, `p-fc6ebdee84`, `p-d641cfcab7`, `p-f773c326f6`.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-48

- **Preconditions**: `<USERNAME>` created with every field set.
- **Request**: `PUT /user/<USERNAME>`, the full stored body with one defect per request: a number
  in `firstName`, `lastName`, `email`, `password` and `phone`; `id` as the stored id plus one half;
  `userStatus` as `1.5`. The `username` is never mistyped: a coerced name would rename the user.
- **Expected**: `400` with the `input-error` envelope for each.
- **Verification**: after each request the read-back equals the stored state.
- **Departure**: unmeasured on this operation; the siblings of PN-21 (untracked) on create store
  such values coerced (W-08, W-09, W-11b).
- **Probes**: `p-be1d7357e4`, `p-23e97bbc92`, `p-384fb395b8`, `p-9d81452fbc`, `p-ff2fbb3217`,
  `p-e3263aaf7a`, `p-a06710708d`.
- **Tags**: `@regression` `@contract-drift` `@data-integrity`

### TC-USER-49

- **Preconditions**: `<USERNAME>` created with every field set.
- **Request**: `PUT /user/<USERNAME>`, the full stored body with `id` `<INT64_MAX>` plus one; then
  with `userStatus` `<INT32_MAX>` plus one.
- **Expected**: `400` with the `input-error` envelope for each.
- **Verification**: after each request the read-back equals the stored state. Unmeasured on this
  operation (G24).
- **Probes**: `p-05fe161644`, `p-9b9be93c83`.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-50

- **Preconditions**: `<USERNAME>` created by the case.
- **Request**: `PUT /user/<USERNAME>`, the full stored body plus `role`, `isAdmin` and the probe's
  unknown property.
- **Expected**: `200` with the extra properties ignored, or a `4xx` refusal; never stored (G23).
- **Verification**: the read-back carries the eight `User` fields only, unchanged.
- **Probes**: `p-9e3deb649e`.
- **Tags**: `@regression` `@security` `@data-integrity`

### TC-USER-51

- **Preconditions**: `<USERNAME>` created by the case.
- **Request**: `PUT /user/<USERNAME>`, a valid JSON body with `firstName` changed, sent as
  `text/plain`.
- **Expected**: `415` with a `{code, message}` body.
- **Verification**: the read-back equals the stored state.
- **Departure**: PN-08 (untracked): `415` is undeclared and not catalogued; unmeasured on this
  operation.
- **Probes**: `p-a6e92f61e3`.
- **Tags**: `@regression` `@contract-drift` `@data-integrity`

### TC-USER-52

- **Preconditions**: `<USERNAME>` created by the case.
- **Request**: `PUT /user/<USERNAME>`, the full body with `firstName` changed, as
  `application/x-www-form-urlencoded`.
- **Expected**: `200`.
- **Verification**: state comparison: only `firstName` changed, `password` apart (G20 makes a form
  password unreliable, and it is not readable once `LOCAL-3` ships). Unmeasured (G24).
- **Tags**: `@regression` `@data-integrity`

### TC-USER-53

- **Preconditions**: `<USERNAME>` created by the case.
- **Request**: the same full-body `PUT /user/<USERNAME>` twice, with `firstName` changed.
- **Expected**: `200` both times.
- **Verification**: the read-back after the second equals the read-back after the first.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-54

- **Request**: `PUT /user/{username}` with a 1024-character name, and with an encoded slash inside
  `<UNKNOWN_USERNAME>`, each with a full body naming that path.
- **Expected**: `404` with the `not-found` envelope, or `400`; never `5xx`.
- **Verification**: `<UNKNOWN_USERNAME>` still reads `404`; nothing was created. Unmeasured on this
  operation.
- **Probes**: the `overlong` probe of `PUT /user/{username}` on path `username` (its id is all
  digits after `p-`, which `npm run lint:suite` reads as a numeric identifier), and `p-cdc14eb1ab`.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-55

- **Preconditions**: `<USERNAME>` created by `default`.
- **Request**: `PUT /user/<USERNAME>` as `anonymous`, the full stored body with `firstName`
  changed.
- **Expected**: the same answer a `default` update gets: `200`, and the change is stored. This
  records that any caller can change any user it can name (PN-05, by-design; W-19..W-22); the
  refusal the spec's prose implies cannot be tested here (FUT-07).
- **Verification**: the read-back shows the change.
- **Tags**: `@regression` `@security` `@data-integrity`

### TC-USER-56

- **Preconditions**: `<USERNAME>` created with `<PASSWORD>`.
- **Request**: `PUT /user/<USERNAME>`, the full stored body with `firstName` changed.
- **Expected**: `200`; when the answer has a body, it has no `password` property.
- **Verification**: response only.
- **Departure**: PN-13, tracked as `LOCAL-3` (re-scoped on 2026-10-10 to the reads and the
  write answers of `/user`): the update echoes the stored `User`, `password` included (W-19).
- **Tags**: `@regression` `@security` `@known-gap`

### TC-USER-57

- **Preconditions**: `<USERNAME>` created by the case.
- **Request**: `DELETE /user/<USERNAME>`.
- **Expected**: `200` (AC-04; W-27).
- **Verification**: `GET /user/<USERNAME>` answers `404` with the `not-found` envelope.
- **Tags**: `@smoke` `@data-integrity`

### TC-USER-58

- **Preconditions**: `<USERNAME>` created and deleted by the case; a read answers `404`.
- **Request**: `DELETE /user/<USERNAME>` again.
- **Expected**: `404` (AC-04, spec).
- **Verification**: `<USERNAME>` still reads `404`.
- **Departure**: PN-22 (untracked): `200` (W-28).
- **Tags**: `@regression` `@contract-drift` `@data-integrity`

### TC-USER-59

- **Preconditions**: `<UNKNOWN_USERNAME>` reads `404`.
- **Request**: `DELETE /user/<UNKNOWN_USERNAME>`.
- **Expected**: `404` (spec).
- **Verification**: response only.
- **Departure**: PN-22 (untracked): `200` (W-29).
- **Tags**: `@regression` `@contract-drift`

### TC-USER-60

- **Preconditions**: `<USERNAME>` created by the case, as a witness.
- **Request**: `DELETE /user/{username}` with a 1024-character name, and with an encoded slash
  inside `<UNKNOWN_USERNAME>`.
- **Expected**: the declared `400` or `404`; never `5xx`. Unmeasured on this operation; a `200`
  falls under PN-22 (untracked).
- **Verification**: `<USERNAME>` still reads `200` unchanged.
- **Probes**: `p-2bb5e7a39d`, `p-2b4b100c09`.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-61

- **Preconditions**: `<USERNAME>` and `<OTHER_USERNAME>` created with the same `<USER_ID>`; both
  stored (W-03b). When the second create is refused (TC-USER-07's other outcome), the case has
  nothing to show and is skipped with that reason.
- **Request**: `DELETE /user/<USERNAME>`.
- **Expected**: `200`.
- **Verification**: `<USERNAME>` reads `404`; `<OTHER_USERNAME>` reads `200`, unchanged. A delete
  removes the user it names, never another one with the same id.
- **Tags**: `@regression` `@data-integrity`

### TC-USER-62

- **Preconditions**: `<USERNAME>` created twice by the case, with two bodies (PN-20 replaces the
  first; if PN-20 is fixed the second create is refused and one record remains).
- **Request**: one `DELETE /user/<USERNAME>`.
- **Expected**: `200`.
- **Verification**: `<USERNAME>` reads `404`; nothing of either body is left (W-16).
- **Tags**: `@regression` `@data-integrity`
