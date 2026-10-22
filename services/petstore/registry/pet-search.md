---
feature: PET
title: Pets
endpoints:
  - GET /pet/findByStatus
  - GET /pet/findByTags
contract: docs/features/pet.md
auth: [default, anonymous]
test_data:
  <PET_ID>: a pet the case creates with aPet or PetMother; the id comes from the builder's generated range and is always sent in the body (PN-01)
  <STATUS>: a member of Pet.status, taken from generated/enums.ts
  <OTHER_STATUS>: another member of Pet.status
  <OUT_OF_SET_STATUS>: a status outside Pet.status, derived from a member (a suffix added), never typed from memory
  <TAG>: a tag name unique to the case, from the builder; never a seed tag name
  <OTHER_TAG>: a second tag name unique to the case
  <INJECTION_STRING>: a quote, statement separator and comment marker sequence built in the spec
requirements:
  - { id: REQ-PET-02, text: "A pet status is a member of the Pet.status value set (contract rule 2)" }
  - { id: REQ-PET-03, text: "Finding by status returns exactly the pets whose status equals the requested value (contract rule 3)" }
  - { id: REQ-PET-04, text: "Finding by status takes several values in one request, as the spec prose promises (contract rule 4)" }
  - { id: REQ-PET-05, text: "Finding by tags returns the pets that carry at least one requested tag (contract rule 5)" }
  - { id: REQ-PET-06, text: "Matching of status and tags is exact: case sensitive, no trimming (contract rule 6)" }
  - { id: REQ-PET-11, text: "DELETE /pet/{petId} removes the pet, and a later read answers not-found (contract rule 11)" }
  - { id: REQ-PET-13, text: "Every operation declares petstore_auth, and the read by id also api_key (contract rule 13)" }
  - { id: REQ-PET-14, text: "Every status move is allowed, sold back to available included (contract rule 14)" }
beyond_floor: [TC-PET-58, TC-PET-63]
---

# `Pets` test cases: search

Contract: [`docs/features/pet.md`](../docs/features/pet.md). This file continues the `PET`
numbering of [`pet.md`](pet.md), which holds the design notes that apply to every `PET` file.

## Integrity questions

- **Own records** (L-25). Searches return shared pets too (M-06, M-11), so every case asserts that
  its own pets are present or absent, and that every listed item satisfies the filter; never a
  count. Tags are unique to the case, never the seed names.
- **Who else writes the searched fields?** `status`: `POST /pet`, `PUT /pet`, `POST /pet/{petId}`;
  `tags`: `POST /pet`, `PUT /pet`. TC-PET-64 moves a status through `PUT /pet` and the form update;
  TC-PET-65 removes a pet. A pet stored with an out-of-set status (PN-21) is listed under no value;
  creating one is the departure itself, so no search case creates it.
- **Records that break reads for others.** A pet with string tags makes every `findByTags` answer
  `500` (PN-18). It is reproduced only by TC-PET-16, `@destructive`, which runs alone; a search
  case that meets the `500` reports it as that note, not as its own failure.
- **Cleanup.** Every case deletes its pets and confirms each delete with a `404` read (PN-22).
- **Decision tables.** TC-PET-55 is the table in `rules/find-by-status.yaml`; its earlier example
  test without a case id became TC-PET-55 in `specs/pet-search.spec.ts`.
  TC-PET-60 is the table in `rules/pet-find-by-tags.yaml`, generated into
  `generated/decision-tables.ts`.

## Cases

| ID | Title | Requirement | Technique | Priority | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|
| TC-PET-54 | Finding by each status lists the case's own pet and only pets of that status | REQ-PET-03 | equivalence-partition | high | published | specs/pet-search.spec.ts | |
| TC-PET-55 | Finding by status answers as its decision table says | REQ-PET-02 | decision-table | high | published | specs/pet-search.spec.ts | |
| TC-PET-56 | Status matching is exact: wrong case and padded values are refused | REQ-PET-06 | equivalence-partition | medium | published | specs/pet-search.spec.ts | |
| TC-PET-57 | Several statuses in one request list the pets of each and are all validated | REQ-PET-04 | equivalence-partition | medium | published | specs/pet-search.spec.ts | LOCAL-12 |
| TC-PET-58 | An injection string in status is refused without echoing it | | error-guessing | low | published | specs/pet-search.spec.ts | LOCAL-14 |
| TC-PET-59 | Finding by the case's tag lists its pet exactly once | REQ-PET-05 | equivalence-partition | high | published | specs/pet-search.spec.ts | |
| TC-PET-60 | Finding by tags answers as its decision table says | REQ-PET-05 | decision-table | high | published | specs/pet-search.spec.ts | |
| TC-PET-61 | Several tags in one request list each matching pet once | REQ-PET-05 | equivalence-partition | medium | published | specs/pet-search.spec.ts | LOCAL-13 |
| TC-PET-62 | Tag matching is exact: wrong case and padded tags do not find the case's pet | REQ-PET-06 | equivalence-partition | medium | published | specs/pet-search.spec.ts | |
| TC-PET-63 | Long and injection tag values answer an empty list, never a server error | | error-guessing | low | published | specs/pet-search.spec.ts | |
| TC-PET-64 | A status change moves the pet between search results | REQ-PET-14 | state-transition | medium | published | specs/pet-search.spec.ts | |
| TC-PET-65 | A deleted pet disappears from searches by status and by tag | REQ-PET-11 | state-transition | medium | published | specs/pet-search.spec.ts | |
| TC-PET-66 | An anonymous caller gets the same search answers as the default caller | REQ-PET-13 | equivalence-partition | medium | published | specs/pet-search.spec.ts | |

## Case details

### TC-PET-54

- **Preconditions**: `default`; one pet per member of `Pet.status`, each with its own `<PET_ID>`.
- **Request**: `GET /pet/findByStatus?status=<STATUS>` for each member.
- **Expected**: `200`, an array of `Pet`; every item has the requested status; the case's pet of
  that status is listed and its pets of the other statuses are not (M-06).
- **Verification**: response only, on the case's own pets.
- **Cleanup**: delete every pet, each confirmed by a `404` read.
- **Tags**: `@smoke @data-integrity`

### TC-PET-55

- **Preconditions**: `default`; read only.
- **Request**: `GET /pet/findByStatus` once per rule of `rules/find-by-status.yaml`: each member
  of the value set, a value outside it, an empty value, no parameter.
- **Expected**: the status each rule names: `200` for a member, `400` `input-error` for the others
  (M-07, M-08).
- **Verification**: response only; one step per rule.
- **Probes**: `p-9e9221c97f`, `p-71b75f7773`.
- **Tags**: `@regression`

### TC-PET-56

- **Preconditions**: `default`; read only; a member of `Pet.status` in upper case, and the same
  member with a leading space.
- **Request**: `GET /pet/findByStatus?status=` with each value.
- **Expected**: `400` `input-error` each (M-07).
- **Verification**: response only.
- **Tags**: `@regression`

### TC-PET-57

- **Preconditions**: `default`; a pet with `<STATUS>` and a pet with `<OTHER_STATUS>`.
- **Request**: `?status=<STATUS>,<OTHER_STATUS>`; `?status=<STATUS>&status=<OTHER_STATUS>`;
  `?status=<STATUS>&status=<OUT_OF_SET_STATUS>`.
- **Expected**: the first two answer `200` and list both of the case's pets, every item having one
  of the two statuses, as the spec prose promises; the third answers `400` `input-error`, because
  every value is validated.
- **Verification**: response only, on the case's own pets.
- **Departure**: PN-10 (`LOCAL-12`): the comma list answers `400`, and with repeated parameters only
  the first is used and validated (M-09, M-10). Open question A7 of the contract asked whether this
  is drift to tolerate; it was filed as a defect on 2026-10-22, so the case is armed as a known gap.
- **Cleanup**: delete both pets, each confirmed by a `404` read.
- **Tags**: `@regression @contract-drift`

### TC-PET-58

- **Preconditions**: `default`; read only (beyond the floor: a security expectation).
- **Request**: `GET /pet/findByStatus?status=<INJECTION_STRING>`.
- **Expected**: `400` `input-error`; never a `5xx`; the message does not echo the raw input or name
  an implementation type.
- **Verification**: response only.
- **Departure**: PN-07 (`LOCAL-14`): input errors echo the raw input (M-07, G6).
- **Tags**: `@regression @security`

### TC-PET-59

- **Preconditions**: `default`; a pet `<PET_ID>` created with `<TAG>`.
- **Request**: `GET /pet/findByTags?tags=<TAG>`.
- **Expected**: `200`, an array of `Pet`; the case's pet appears exactly once and every item carries
  `<TAG>`.
- **Verification**: response only, on the case's own pet.
- **Cleanup**: delete, confirmed by a `404` read.
- **Tags**: `@regression @data-integrity`

### TC-PET-60

- **Preconditions**: `default`; a pet `<PET_ID>` created with `<TAG>` (the `known` class); a tag
  unique to the case that no pet carries (`unknown`).
- **Request**: `GET /pet/findByTags` once per rule of `rules/pet-find-by-tags.yaml`: `<TAG>`, the
  unknown tag, an empty value, no parameter.
- **Expected**: the status each rule names: `200` for known and unknown (the unknown one an empty
  array), `400` for an empty value and for no parameter (M-13 to M-15). The empty-value body is
  plain text outside the catalogue (PN-08), so the table asserts the status only.
- **Verification**: response only; one step per rule.
- **Probes**: `p-d5d4a0da19`.
- **Cleanup**: delete, confirmed by a `404` read.
- **Tags**: `@regression`

### TC-PET-61

- **Preconditions**: `default`; three pets: one with `<TAG>`, one with `<OTHER_TAG>`, one with both.
- **Request**: `?tags=<TAG>&tags=<OTHER_TAG>`; `?tags=<TAG>,<OTHER_TAG>`; `?tags=<TAG>&tags=<TAG>`;
  `?tags=<TAG>&tags=` (empty second value).
- **Expected**: `200` each. The first two list all three pets, each once (the spec prose allows a
  comma list); the third lists the two `<TAG>` pets once each. The fourth lists the `<TAG>` pets:
  the contract does not define an empty value next to a valid one, so this is the measured baseline
  (M-14; L-56).
- **Verification**: response only, on the case's own pets.
- **Departure**: PN-11 (`LOCAL-13`): repeated tags list a pet once per matching tag, and a comma
  list is matched as one literal tag and returns `[]` (M-12, M-13).
- **Cleanup**: delete the three pets, each confirmed by a `404` read.
- **Tags**: `@regression @contract-drift`

### TC-PET-62

- **Preconditions**: `default`; a pet `<PET_ID>` created with `<TAG>`.
- **Request**: `findByTags` with `<TAG>` in upper case, and with a leading space.
- **Expected**: `200` each and the case's pet is not listed (M-13).
- **Verification**: response only.
- **Cleanup**: delete, confirmed by a `404` read.
- **Tags**: `@regression`

### TC-PET-63

- **Preconditions**: `default`; read only (beyond the floor: risk); a 2000-character tag unique to
  the case; `<INJECTION_STRING>`.
- **Request**: `GET /pet/findByTags?tags=` with each value.
- **Expected**: `200` `[]` each; never a `5xx` (M-13).
- **Verification**: response only.
- **Tags**: `@regression @security`

### TC-PET-64

- **Preconditions**: `default`; a pet `<PET_ID>` created with `<STATUS>`.
- **Request**: `PUT /pet` to `<OTHER_STATUS>`, then search both statuses; the form update back to
  `<STATUS>` (with `name`, see PN-23), then search both again.
- **Expected**: after each move the pet is listed under its new status only (rules 3 and 14; W-05,
  W-11).
- **Verification**: searches after each move, on the case's own pet.
- **Cleanup**: delete, confirmed by a `404` read.
- **Tags**: `@regression @data-integrity`

### TC-PET-65

- **Preconditions**: `default`; a pet `<PET_ID>` created with `<STATUS>` and `<TAG>`, listed by both
  searches before the delete.
- **Request**: `DELETE /pet/<PET_ID>`, then `findByStatus?status=<STATUS>` and
  `findByTags?tags=<TAG>`.
- **Expected**: `200` for both searches; the pet is listed in neither.
- **Verification**: a read answering `404` and both searches.
- **Tags**: `@regression @data-integrity`

### TC-PET-66

- **Preconditions**: `anonymous` and `default`; a pet `<PET_ID>` created with `<STATUS>` and
  `<TAG>`.
- **Request**: `findByStatus?status=<STATUS>` and `findByTags?tags=<TAG>` as each actor.
- **Expected**: the same status for both actors and the case's pet listed for both. Tolerated
  (PN-05): no `401`; a difference between the actors is a finding.
- **Verification**: response comparison on the case's own pet.
- **Cleanup**: delete, confirmed by a `404` read.
- **Tags**: `@regression @security`
