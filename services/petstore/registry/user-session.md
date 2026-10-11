---
feature: USER
title: Users and sessions
endpoints:
  - GET /user/login
  - GET /user/logout
contract: docs/features/user.md
auth: [default]
test_data:
  <USERNAME>: a username the case creates, built from the run prefix plus a builder suffix, unique per case; never login or logout
  <UNKNOWN_USERNAME>: a well-formed username with a prefix no builder uses, never created
  <USER_ID>: an explicit id from the case's own id range, sent on every create
  <PASSWORD>: the synthetic password the builder generated for <USERNAME>; never written in docs or specs
  <OTHER_PASSWORD>: a second synthetic password, different from <PASSWORD>
  <SESSION>: the session string a login returns; never asserted as a literal
requirements:
  - { id: REQ-USER-08, text: "GET /user/login answers 200 with a session, X-Rate-Limit and X-Expires-After for valid credentials, and 400 for invalid ones (business rule 8; AC-06, AC-07)" }
  - { id: REQ-USER-09, text: "GET /user/logout answers 200 (business rule 9; AC-08)" }
beyond_floor: [TC-USER-67, TC-USER-68]
---

# `Users and sessions` test cases: logging in and out

Contract: [`docs/features/user.md`](../docs/features/user.md). This is the third of the three files
of feature `USER`; [`registry/user.md`](user.md) lists them all and holds the data rules every case
follows. A case that logs in creates its own user first with `POST /user` (a unique `<USERNAME>`,
an explicit `<USER_ID>`, `<PASSWORD>` from the builder) and deletes it afterwards, confirming with a
read that answers `404`.

The session that login returns cannot be presented to any operation: no header, cookie or
parameter is declared for it, and login sets no cookie (M-11, M-14). These cases therefore test the
login and logout answers themselves; no case can show that a session grants or loses anything. The
credentials travel in the query string, as the spec declares; the client must keep them out of
evidence (the core redaction masks `password` by key name). The advertised `X-Rate-Limit` is read
as a header, never probed, and no latency budget is declared, so no case measures time.

## Cases

| ID | Title | Requirement | Technique | Priority | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|
| TC-USER-63 | A login with a created user's credentials answers 200 with a session and a rate limit | REQ-USER-08 | equivalence-partition | high | approved | | |
| TC-USER-64 | The login answer has the declared body and expiry formats | REQ-USER-08 | equivalence-partition | medium | approved | | LOCAL-4 |
| TC-USER-65 | Login refuses every credential combination except the owner's | REQ-USER-08 | decision-table | high | automated | specs/user.spec.ts | LOCAL-4 |
| TC-USER-66 | Injection-like and overlong login values are refused without internals | REQ-USER-08 | error-guessing | medium | approved | | LOCAL-4 |
| TC-USER-67 | Two logins of the same user issue different sessions | REQ-USER-08 | equivalence-partition | low | approved | | |
| TC-USER-68 | A login leaves the user record unchanged | REQ-USER-08 | error-guessing | medium | approved | | |
| TC-USER-69 | Logout answers 200 | REQ-USER-09 | equivalence-partition | high | approved | | |
| TC-USER-70 | Logout answers 200 without a prior login and when repeated | REQ-USER-09 | state-transition | medium | approved | | |

## Case details

### TC-USER-63

- **Preconditions**: `<USERNAME>` created by the case with `<PASSWORD>`.
- **Request**: `GET /user/login?username=<USERNAME>&password=<PASSWORD>`.
- **Expected**: `200`; a non-empty `<SESSION>` in the body; `X-Rate-Limit` present and an int32;
  `X-Expires-After` present (its format is TC-USER-64).
- **Verification**: response only.
- **Tags**: `@smoke` `@security`

### TC-USER-64

- **Preconditions**: as TC-USER-63.
- **Request**: as TC-USER-63, with `Accept: application/json`.
- **Expected**: `200`; the body is a JSON string, as the declared `string` schema needs;
  `X-Expires-After` is a `date-time` later than the request (AC-06).
- **Verification**: response only.
- **Observed today**: the body is plain text labelled `application/json`, and the expiry is Java
  date text (M-11, M-12; G4, G5; PN-12, `LOCAL-4`).
- **Tags**: `@regression` `@contract-drift` `@known-gap`

### TC-USER-65

- **Preconditions**: `<USERNAME>` created by the case with `<PASSWORD>`; `<UNKNOWN_USERNAME>`
  reads `404`.
- **Request**: `GET /user/login`, one request per rule of the decision table
  [`rules/user-login.yaml`](../rules/user-login.yaml): the owner's username, an unknown one, an
  empty one or none, crossed with the owner's `<PASSWORD>`, `<OTHER_PASSWORD>`, an empty one or none.
- **Expected**: each rule's status: `200` with a `<SESSION>` for the owner's credentials (R1),
  `400` for every other combination (R2 to R7; AC-07).
- **Verification**: response only, one step per rule.
- **Observed today**: `200` with a new session for every combination (M-11, W-30..W-32; PN-12,
  `LOCAL-4`).
- **Tags**: `@regression` `@security` `@known-gap`

### TC-USER-66

- **Request**: `GET /user/login` with `username` set to a quote, a statement-like value
  (`' OR '1'='1`), a script fragment and a 4096-character value, each with `<OTHER_PASSWORD>`.
- **Expected**: `400` for each; never `5xx`; no body echoes the input or names a query, a stack
  frame or a class.
- **Verification**: response only.
- **Observed today**: `200` with a session for each (M-11; PN-12, `LOCAL-4`); no internal detail
  was seen.
- **Tags**: `@regression` `@security` `@known-gap`

### TC-USER-67

- **Preconditions**: as TC-USER-63.
- **Request**: two logins with the same credentials.
- **Expected**: `200` both, with different `<SESSION>` values (M-13). A repeated session would let
  one login stand for another.
- **Verification**: comparison of the two answers; neither value is asserted as a literal.
- **Tags**: `@regression` `@security`

### TC-USER-68

- **Preconditions**: `<USERNAME>` created by the case with every field set.
- **Request**: a login with `<PASSWORD>`, one with `<OTHER_PASSWORD>`, and one without a password.
- **Expected**: the statuses of TC-USER-65 are not asserted here; whatever they are, the user
  record is unchanged.
- **Verification**: state comparison of the read-back before and after (W-30..W-32).
- **Tags**: `@regression` `@data-integrity`

### TC-USER-69

- **Request**: `GET /user/logout` after a login of a created user.
- **Expected**: `200` (AC-08). No body is declared; the plain-text body the service returns (M-14)
  is recorded, not asserted.
- **Verification**: response only.
- **Tags**: `@sanity`

### TC-USER-70

- **Request**: `GET /user/logout` with no login before it in the case, then again.
- **Expected**: `200` both times (M-14): logout needs no session and repeating it changes nothing
  observable.
- **Verification**: response only.
- **Tags**: `@regression`
