---
feature: STOR
title: Store orders and inventory
endpoints:
  - GET /store/inventory
  - POST /store/order
  - GET /store/order/{orderId}
  - DELETE /store/order/{orderId}
contract: docs/features/store.md
auth: [default, anonymous]
test_data:
  <ORDER_ID>: an order id the case owns, drawn by anOrder (ten digits) and confirmed absent by a GET that answers 404 before the first POST
  <VALID_ORDER>: an Order built by anOrder for <ORDER_ID> and <PET_ID>, status from OrderStatus in generated/enums.ts
  <PET_ID>: a pet the case creates with aPet, or through the purchasePet flow, and deletes in cleanup
  <MISSING_PET_ID>: a pet id that names no pet, confirmed by GET /pet/{petId} answering 404
  <SEED_ORDER_ID>: one of the seed orders 1 to 3; only ever read, never posted or deleted
  <UNKNOWN_ORDER_ID>: a well-formed int64 that names no order, confirmed by a GET that answers 404
  <UNUSED_ORDER_ID>: an id the case reserved and never posted, confirmed absent by a GET
  <OUT_OF_SET_STATUS>: a text outside OrderStatus, derived from the generated set (a set value plus a suffix)
  <INT64_MAX>: 2^63 - 1, a constant of the spec
  <INT64_MAX_PLUS_1>: 2^63, a constant of the spec
  <INT32_MAX>: 2^31 - 1, a constant of the spec
  <INT32_MAX_PLUS_1>: 2^31, a constant of the spec
  <ARBITRARY_API_KEY>: a value shaped like a key that is no credential, built per run by faker
requirements:
  - id: REQ-STOR-01
    text: "An order is placed by sending an Order; a valid one answers 200 with the stored order (business rule 1)"
  - id: REQ-STOR-02
    text: "An order's status is one of placed, approved, delivered (business rule 2)"
  - id: REQ-STOR-03
    text: "A placed order reads back by its id with the values sent, shipDate as the same instant (business rule 3)"
  - id: REQ-STOR-04
    text: "Reading an id that names no order answers 404; an id that is not an int64 answers 400 input-error (business rule 4)"
  - id: REQ-STOR-05
    text: "Deleting an existing order answers 200 and removes it; an unknown id answers 404 (business rule 5)"
  - id: REQ-STOR-06
    text: "The read side documents ids up to 5 or above 10 as valid and others as errors (business rule 6)"
  - id: REQ-STOR-07
    text: "The delete side documents ids under 1000 as valid and higher ids as errors (business rule 7)"
  - id: REQ-STOR-08
    text: "The inventory answers a map from status to an int32 count (business rule 8)"
  - id: REQ-STOR-09
    text: "The caller chooses the order id; an existing order is not silently replaced (business rule 9, A9)"
  - id: REQ-STOR-10
    text: "The inventory declares the api_key header; the order operations declare no security (business rule 10)"
  - id: REQ-STOR-11
    text: "An order references a pet by petId; placing or deleting it does not change the pet (business rule 11)"
  - id: REQ-STOR-12
    text: "An order carries a quantity of int32; the contract declares no minimum (business rule 12)"
  - id: REQ-STOR-13
    text: "An order without status must not stop GET /store/inventory answering 200 (business rule 13)"
  - id: REQ-STOR-14
    text: "A body or field that is not a valid Order is refused with 400 input-error and nothing is stored (endpoint contract, acceptance criterion 10)"
beyond_floor: [TC-STOR-12, TC-STOR-13, TC-STOR-14, TC-STOR-15, TC-STOR-16, TC-STOR-26, TC-STOR-30]
---

# `Store orders and inventory` test cases

Contract: [`docs/features/store.md`](../docs/features/store.md). Departures:
[`docs/contract-notes.md`](../docs/contract-notes.md).

The floor and the gap of the four endpoints are computed by `npm run coverage:status` (L-08), never
written here. The cases in `beyond_floor` come from the write measurements and from risk rather than
from the OpenAPI document (L-55): the inventory semantics, the overwrite, the pet cross-checks, the
quantity limits and information exposure.

## How these cases treat the service

- **Defects are designed as defects.** A case asserts the behaviour the contract (or the security
  expectation) asks for, and its details record the observed departure with its contract note. The
  Defect column holds only a tracker key. A case explained by an untracked note says
  "Departure: PN-NN (untracked)"; the automate phase decides whether to file it or tolerate it.
- **Tolerated notes** (`by-design`): PN-03 (errors name the field only in `message`, so cases assert
  the error kind), PN-04 (`shipDate` compared as an instant, `ORDER_FIELDS` in `state-models.ts`),
  PN-05 (`api_key` not enforced), PN-14 (XML forms) and PN-16 (`+1` and `01` resolve to order 1).
  No case asserts against them, and no malformed-id case sends those spellings.
- **Own ids only.** Every write uses an `<ORDER_ID>` the case drew and confirmed absent first,
  because a `POST` to an existing id replaces that order (PN-20). Seed orders are only read. A
  probe whose literal value would land on another id is sent with the case's own id instead: the
  id-fraction probe `p-87e213838b` sends `1.5`, which the service truncates onto seed order 1
  (W-34), so TC-STOR-08 sends `<ORDER_ID>` plus a fraction.
- **Cleanup is confirmed by a read.** `DELETE` answers `200` whether or not anything was deleted
  (PN-22), so every cleanup ends with a `GET` that answers `404`. A refused write is still read back
  (L-35): if the service stored it after all, the case deletes it.
- **The inventory is a shared counter.** Inventory cases assert the delta around their own orders,
  never absolute counts (L-25). Any other caller placing or deleting orders moves it, so these cases
  run in a serial group with the other order-writing cases of this registry.
- **Inventory semantics.** The cases assert what the service does, order quantities summed by order
  status (PN-09), as the baseline (L-56), each tagged `@contract-drift` against the summary that
  speaks of pets. Whether that is the intended inventory is open (A2).
- **Destructive cases** (`@destructive`, L-59) run alone, never next to cases on shared data, and
  their details name the recovery. TC-STOR-27 reproduces PN-17. TC-STOR-10 and TC-STOR-13 carry the
  tag as a precaution for writes nobody has measured; the first isolated run shows whether they keep
  it.
- **Actors**: `default` everywhere, `anonymous` for the inventory's declared `api_key` (PN-05). An
  authorization matrix is out of scope (backlog FUT-07). No latency budget is declared, so no case
  asserts one.

### Integrity questions, answered once for the feature

- *Who else writes an order?* Only `POST /store/order`; no operation updates one. A `POST` to an
  existing id rewrites it (TC-STOR-16). Whether `DELETE /pet/{petId}` removes the pet's orders was
  never measured; TC-STOR-15 records it.
- *Who else writes the inventory?* Every order write: place, overwrite, delete, also with
  out-of-set statuses and negative quantities (TC-STOR-26, TC-STOR-16, TC-STOR-04, TC-STOR-12). A
  pet's status does not move it (TC-STOR-26).
- *Does an order write the pet?* Not measured to: TC-STOR-15 compares the pet before and after.
- *Preserve-on-omit*: no operation updates an order, so there is no omitted field to preserve. The
  omitted fields of a create (`complete`, `shipDate`) are recorded by TC-STOR-02 and TC-STOR-03.
- *State after an error*: every negative reads its id back and, for status and quantity values,
  checks the inventory gained no key from it.
- *Records that break a read for others*: an order without `status` (PN-17, TC-STOR-27). The null
  body and the int32 quantity might do the same and are unmeasured (TC-STOR-10, TC-STOR-13).

### Rules and fields without a case of their own

- Business rule 10, order half: the order operations declare no security, so there is nothing to
  refuse; every order case runs as `default` and would fail visibly if a credential were demanded.
- The missing-id path (`GET /store/order`, `405`, G10) and the `HEAD` and `OPTIONS` answers (G9)
  belong to the shared layer, not to this resource; TC-STOR-30 only checks what `OPTIONS` discloses.
- The XML representation of an order and of the inventory (G7, G8) is PN-14, tolerated.

## Cases

| ID | Title | Requirement | Technique | Priority | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|
| TC-STOR-01 | A valid order is placed and reads back with the values sent | REQ-STOR-01 | equivalence-partition | high | published | specs/store.spec.ts | |
| TC-STOR-02 | Every status and complete combination is stored and reads back as sent | REQ-STOR-02 | pairwise | medium | published | specs/store.spec.ts | |
| TC-STOR-03 | An order sent as XML or as a form is stored like a JSON one | REQ-STOR-01 | equivalence-partition | medium | approved | | |
| TC-STOR-04 | An order whose status is outside the set is refused and stores nothing | REQ-STOR-02 | equivalence-partition | medium | approved | | |
| TC-STOR-05 | A field of the wrong JSON type is refused with input-error and stores nothing | REQ-STOR-14 | equivalence-partition | high | approved | | |
| TC-STOR-06 | A body that cannot be read as an Order is refused and stores nothing | REQ-STOR-14 | error-guessing | medium | published | specs/store.spec.ts | |
| TC-STOR-07 | Ids at the int64 limit are accepted and one past the int64 or int32 limit is refused | REQ-STOR-14 | boundary-value | medium | approved | | |
| TC-STOR-08 | Values the service would coerce (fractions, a number as status or date, text as boolean) are refused | REQ-STOR-14 | equivalence-partition | low | approved | | |
| TC-STOR-09 | An impossible shipDate is refused rather than rolled over | REQ-STOR-14 | boundary-value | medium | approved | | |
| TC-STOR-10 | A null body or a null field value is refused and stores nothing | REQ-STOR-14 | error-guessing | low | approved | | |
| TC-STOR-11 | Unknown properties are ignored, never stored or echoed | REQ-STOR-01 | equivalence-partition | medium | approved | | |
| TC-STOR-12 | A quantity of zero or below is refused; one is accepted | REQ-STOR-12 | boundary-value | medium | approved | | |
| TC-STOR-13 | An order with the int32 maximum quantity leaves the inventory readable within int32 | REQ-STOR-12 | boundary-value | low | approved | | |
| TC-STOR-14 | An order for a pet that does not exist is refused | REQ-STOR-11 | equivalence-partition | medium | approved | | |
| TC-STOR-15 | Placing and deleting an order leaves its pet unchanged | REQ-STOR-11 | state-transition | medium | approved | | |
| TC-STOR-16 | Posting an id that already exists does not silently replace the order | REQ-STOR-09 | state-transition | high | approved | | |
| TC-STOR-17 | A seed order reads back with the Order shape | REQ-STOR-03 | equivalence-partition | high | approved | | |
| TC-STOR-18 | Reading an id that names no order answers 404 not-found | REQ-STOR-04 | equivalence-partition | high | approved | | |
| TC-STOR-19 | Reading an id that is not an int64 answers 400 input-error | REQ-STOR-04 | equivalence-partition | high | approved | | |
| TC-STOR-20 | Reading zero, a negative id or an id the prose calls invalid answers 400 | REQ-STOR-06 | boundary-value | low | approved | | |
| TC-STOR-21 | Deleting an owned order answers 200 and the order reads 404 afterwards | REQ-STOR-05 | state-transition | high | published | specs/store.spec.ts | |
| TC-STOR-22 | Deleting an order that does not exist, or a second time, answers 404 | REQ-STOR-05 | state-transition | medium | approved | | |
| TC-STOR-23 | Deleting an id that is not an int64 answers 400 and deletes nothing | REQ-STOR-05 | equivalence-partition | high | approved | | |
| TC-STOR-24 | Ids around 1000 and ten-digit ids are deleted alike | REQ-STOR-07 | boundary-value | low | approved | | |
| TC-STOR-25 | The inventory answers a map of int32 counts | REQ-STOR-08 | equivalence-partition | high | published | specs/store.spec.ts | |
| TC-STOR-26 | The inventory moves by an owned order's quantity under its status, and not with a pet's status | REQ-STOR-08 | state-transition | medium | approved | | |
| TC-STOR-27 | An order without status leaves the inventory answering 200 | REQ-STOR-13 | equivalence-partition | high | published | specs/store-destructive.spec.ts | LOCAL-2 |
| TC-STOR-28 | The inventory without an api_key header answers as the service declares | REQ-STOR-10 | equivalence-partition | high | published | specs/store.spec.ts | |
| TC-STOR-29 | The inventory with an empty or arbitrary api_key answers as the service declares | REQ-STOR-10 | equivalence-partition | high | approved | | |
| TC-STOR-30 | Error answers of the store operations disclose no implementation details | REQ-STOR-14 | error-guessing | medium | approved | | |

## Case details

### TC-STOR-01

- **Preconditions**: actor `default`; `<PET_ID>` and `<VALID_ORDER>` built by `anOrder`; `<ORDER_ID>`
  absent. Runs as the `purchasePet` flow (`flows/purchase.ts`).
- **Request**: `POST /store/order` with `<VALID_ORDER>` as JSON; then `GET /store/order/<ORDER_ID>`.
- **Expected**: `200` and a body matching `Order` on both; the `POST` answer and the read-back carry
  the business fields sent (`ORDER_FIELDS`, `shipDate` as an instant, PN-04 tolerated).
- **Verification**: follow-up read compared with `expectSameState`. Cleanup with `cancelPurchase`,
  confirmed by the order and the pet reading `404`.
- **Tags**: `@smoke` `@data-integrity`. Acceptance criterion 1.

### TC-STOR-02

- **Preconditions**: actor `default`; `<PET_ID>`; one fresh `<ORDER_ID>` per combination.
- **Request**: `POST /store/order` for the nine combinations of `status` (each `OrderStatus` value)
  and `complete` (`true`, `false`, omitted); each order is read back and deleted.
- **Expected**: `200` and `Order` each time; status and complete read back as sent. An omitted
  `complete` reads back as `false` (measured at W-21, the baseline, L-56).
- **Verification**: follow-up read per combination, one step each.
- **Probes**: `p-998560ef2e`, `p-16a5f8465e`, `p-a651760305`, `p-68ed126724`, `p-8cb7db05f7`,
  `p-eec4f45f31`, `p-9e83ee67ff`, `p-9363ba71df`, `p-47e36835bb`. The three combinations with no
  status are destructive and belong to TC-STOR-27.
- **Tags**: `@regression` `@data-integrity`.

### TC-STOR-03

- **Preconditions**: actor `default`; `<PET_ID>`; two fresh `<ORDER_ID>`s.
- **Request**: `POST /store/order` with `<VALID_ORDER>` as `application/xml` and as
  `application/x-www-form-urlencoded`; then read each back as JSON. A third form-encoded order
  without `shipDate`.
- **Expected**: `200` and `Order` (JSON) for each; the read-back equals what was sent.
- **Verification**: follow-up reads. A `Record` step keeps the `shipDate` the service gave the form
  order sent without one (the server's time today, G17); the contract states no default, so nothing
  is asserted about it until the owner says.
- **Tags**: `@regression` `@data-integrity`.

### TC-STOR-04

- **Preconditions**: actor `default`; `<ORDER_ID>`; the inventory read before.
- **Request**: `POST /store/order` with `<VALID_ORDER>` whose `status` is `<OUT_OF_SET_STATUS>`.
- **Expected**: a `4xx` refusal (`400` declared for invalid input); `GET /store/order/<ORDER_ID>`
  answers `404`; the inventory gains no `<OUT_OF_SET_STATUS>` key.
- **Verification**: follow-up read and inventory read. If the order was stored, cleanup deletes it.
- **Probes**: `p-d1c0bd98e0`. Acceptance criterion 6.
- **Departure**: PN-21 (untracked): stored with `200`, and the value becomes an inventory key (W-30).
- **Tags**: `@regression` `@contract-drift` `@data-integrity`.

### TC-STOR-05

- **Preconditions**: actor `default`; one fresh `<ORDER_ID>` per variant.
- **Request**: `POST /store/order` with `<VALID_ORDER>` where one field at a time has a JSON type
  it does not declare: text in `id`, `petId`, `quantity`, and text that is not a boolean in
  `complete`.
- **Expected**: `400` with the `input-error` envelope (kind only, PN-03); the order reads `404`.
- **Verification**: follow-up read per variant (L-35).
- **Probes**: `p-227be2d025`, `p-5a091ae196`, `p-ce3e380551`, `p-6024975028`. Acceptance
  criterion 10. As measured (W-23 to W-25, W-28); no `500` sibling of PN-01 (L-37).
- **Tags**: `@regression` `@data-integrity`.

### TC-STOR-06

- **Preconditions**: actor `default`; `<ORDER_ID>` for the bodies that carry one; order `0` reads
  `404` before the case.
- **Request**: `POST /store/order` with malformed JSON, with truncated JSON, with an empty body, with
  a JSON text that is not an object (`not-an-object`), and with `<VALID_ORDER>` labelled
  `text/plain`.
- **Expected**: `400` for each JSON variant, with the `input-error` envelope where the service
  parses the body; `415` for `text/plain`. Nothing stored: `<ORDER_ID>` and order `0` read `404`.
- **Verification**: follow-up reads per variant.
- **Probes**: `p-6e89af34c6`, `p-f54f62ef61`, `p-6656b5bf39`, `p-2d61516968`. The content-type probe
  sends `{}` as its raw body; the case sends `<VALID_ORDER>` instead, so that a service that started
  accepting `text/plain` would not create a status-less order `0` (PN-17).
- **Departure**: PN-08 (untracked): the empty body answers plain text labelled `application/json`
  (G19), and `415` is not a declared code. The envelope catalogue has no kind for either.
- **Tags**: `@regression` `@contract-drift` `@data-integrity`.

### TC-STOR-07

- **Preconditions**: actor `default`; `<PET_ID>`. `<INT64_MAX>` as an order id is a fixed id, not
  one the builder draws: it must read `404` before the case, or the case fails rather than
  overwrite it.
- **Request**: `POST /store/order` with `id` `<INT64_MAX>`, then with `id` `<INT64_MAX_PLUS_1>`;
  `petId` `<INT64_MAX>` and `<INT64_MAX_PLUS_1>` with a fresh `<ORDER_ID>`; `quantity`
  `<INT32_MAX_PLUS_1>`.
- **Expected**: the limits themselves answer `200` and read back; each value one past its limit
  answers `400` `input-error` and stores nothing.
- **Verification**: follow-up reads; cleanup deletes the accepted orders and confirms `404`.
- **Probes**: `p-407e424877`, `p-1948663b0a`, `p-1fe7db8d06`. The upper quantity limit itself is
  TC-STOR-13, because of its effect on the inventory.
- **Tags**: `@regression` `@data-integrity`.

### TC-STOR-08

- **Preconditions**: actor `default`; one fresh `<ORDER_ID>` per variant; the inventory read before.
- **Request**: `POST /store/order` with `<VALID_ORDER>` changed in one field at a time: `id` as
  `<ORDER_ID>` plus a fraction, `petId` and `quantity` with a fraction, `status` as the number
  `12345`, `shipDate` as the number `12345`, `complete` as the text `"true"`.
- **Expected**: `400` `input-error` for each (the fields are typed integer, string and boolean);
  nothing stored under `<ORDER_ID>`; the inventory gains no `"12345"` key.
- **Verification**: follow-up read per variant and an inventory read; cleanup deletes whatever was
  stored, by the truncated id where the fraction was in `id`.
- **Probes**: `p-87e213838b`, `p-99462e53b5`, `p-5436e2e3e1`, `p-eee5a5605b`, `p-76929f981e`, each
  sent with the case's own id (see the introduction for `p-87e213838b`).
- **Departure**: PN-21 (untracked): each is stored with `200`, truncated or coerced (W-26, W-27,
  W-29, W-34, W-35, W-42).
- **Tags**: `@regression` `@contract-drift` `@data-integrity`.

### TC-STOR-09

- **Preconditions**: actor `default`; `<ORDER_ID>`.
- **Request**: `POST /store/order` with `shipDate` `2024-13-40T25:61:00Z` (month, day, hour and
  minute out of range).
- **Expected**: `400` (`date-time` format); the order reads `404`.
- **Verification**: follow-up read; cleanup if stored.
- **Probes**: `p-142a979ee1`.
- **Departure**: PN-21 (untracked): stored with `200` as a rolled-over valid date (W-40).
- **Tags**: `@regression` `@contract-drift` `@data-integrity`.

### TC-STOR-10

- **Preconditions**: actor `default`; one fresh `<ORDER_ID>` per variant; order `0` reads `404` and
  the inventory answers `200` before the case.
- **Request**: `POST /store/order` with the JSON body `null`; then `<VALID_ORDER>` with `null` in
  one field at a time: `id`, `petId`, `quantity`, `shipDate`, `complete`. `status` is always sent.
- **Expected**: `400` for each (OpenAPI 3.0 fields are not nullable unless they say so); nothing
  stored under `<ORDER_ID>` or `0`; the inventory still answers `200`.
- **Verification**: follow-up reads and an inventory read after each variant.
- **Probes**: `p-7b9b5328a3`, `p-8fa70a4523`, `p-5c4925416c`, `p-600ab5dffe`, `p-8007238027`,
  `p-9235311542`. A `null` status is PN-17 and belongs to TC-STOR-27.
- **Unmeasured**: no write run sent these. A `null` body could be stored like `{}` (order `0`
  without status, PN-17) and a `null` id could land on order `0`. Hence `@destructive` as a
  precaution until the first isolated run shows what happens.
- **Recovery**: delete every `<ORDER_ID>` the case sent, and order `0` only if it read `404` before
  the case; confirm each reads `404` and the inventory answers `200` again.
- **Tags**: `@regression` `@destructive` `@data-integrity`.

### TC-STOR-11

- **Preconditions**: actor `default`; `<PET_ID>`; `<ORDER_ID>`.
- **Request**: `POST /store/order` with `<VALID_ORDER>` plus undeclared properties: the probe's
  `probeUnexpectedField` and names that look privileged (`userId`, `price`).
- **Expected**: `200` (`Order` is an open object); the answer and the read-back match `Order` and
  carry none of the extra properties; the declared fields are as sent.
- **Verification**: follow-up read with `expectSameState`. As measured (W-39).
- **Probes**: `p-ae9f3406fc`.
- **Tags**: `@regression` `@security` `@data-integrity`.

### TC-STOR-12

- **Preconditions**: actor `default`; `<PET_ID>`; three fresh `<ORDER_ID>`s; the inventory read
  before each.
- **Request**: `POST /store/order` with `quantity` `1`, `0` and `-1`.
- **Expected**: `1` answers `200` and reads back; `0` and `-1` are refused with `400` and store
  nothing, so the inventory key of their status does not move. The contract declares no minimum;
  the case takes one as the lower bound of an order, as PN-21 does. Open question for the owner.
- **Verification**: follow-up reads and inventory deltas; cleanup deletes every stored order.
- **Departure**: PN-21 (untracked): both stored, and `-1` lowers the inventory (W-31, W-32, W-48).
- **Tags**: `@regression` `@contract-drift` `@data-integrity`.

### TC-STOR-13

- **Preconditions**: actor `default`; `<PET_ID>`; `<ORDER_ID>`; the inventory answers `200` before.
- **Request**: `POST /store/order` with `quantity` `<INT32_MAX>` and status `placed`; then
  `GET /store/inventory`.
- **Expected**: either the order is refused with `400`, or it is stored and the inventory still
  answers `200` with every value an integer within int32 (no `500`, no negative wrap). The `placed`
  key already holds the seed quantities, so the sum cannot fit in int32.
- **Verification**: inventory read; the outcome is a behaviour-defining observation (L-56): the
  first reviewed result becomes the baseline.
- **Unmeasured**: no write run sent it. An overflowing sum could break the inventory for every caller
  while the order exists, hence `@destructive`.
- **Recovery**: `DELETE /store/order/<ORDER_ID>`, confirmed by a `404` read, then the inventory
  answering `200` again.
- **Tags**: `@regression` `@destructive` `@data-integrity`.

### TC-STOR-14

- **Preconditions**: actor `default`; `<MISSING_PET_ID>`; `<ORDER_ID>`.
- **Request**: `POST /store/order` with `petId` `<MISSING_PET_ID>`.
- **Expected**: a `4xx` refusal; the order reads `404`; `<MISSING_PET_ID>` still reads `404`.
- **Verification**: follow-up reads of the order and the pet; cleanup if stored.
- **Departure**: PN-21 (untracked): stored with `200` (W-06). The contract is silent on whether the
  pet must exist; the case follows PN-21, and A6 stays open for the owner.
- **Tags**: `@regression` `@contract-drift` `@data-integrity`.

### TC-STOR-15

- **Preconditions**: actor `default`; `<PET_ID>` created by the case with a non-default status
  (`pending`) and read back; `<ORDER_ID>`.
- **Request**: place an order for `<PET_ID>`, read the pet; delete the order, read the pet. Then
  place a second order for the pet, delete the pet, and read the order.
- **Expected**: the pet reads back unchanged after the place and after the delete
  (`expectSameState` with the pet field model). After the pet's deletion the order is recorded, not
  judged: whether it survives was never measured.
- **Verification**: state comparison of the pet; a `Record` step for the order after the pet's
  deletion (L-56). Cleanup deletes the second order and confirms `404`.
- **Tags**: `@regression` `@data-integrity`.

### TC-STOR-16

- **Preconditions**: actor `default`; `<PET_ID>`; `<ORDER_ID>` placed by the case as `placed` with
  quantity q1; the inventory read before the second write.
- **Request**: `POST /store/order` again with `<ORDER_ID>`, status `delivered` and quantity q2.
- **Expected**: a `4xx` refusal (no upsert is documented; A9); the order reads back with its first
  values; the inventory does not move.
- **Verification**: follow-up read with `expectSameState` against the first order and an inventory
  delta of zero. Cleanup deletes `<ORDER_ID>` and confirms `404`.
- **Departure**: PN-20 (untracked): replaced with `200`, and the inventory moves by -q1 and +q2
  (W-05). Any caller can replace any order this way, seed orders included.
- **Tags**: `@regression` `@security` `@contract-drift` `@data-integrity`.

### TC-STOR-17

- **Preconditions**: actor `default`; `<SEED_ORDER_ID>`; read-only, so it also runs where writes
  are not allowed.
- **Request**: `GET /store/order/<SEED_ORDER_ID>` as JSON.
- **Expected**: `200`, `Order`, `id` equal to the path id, `status` in `OrderStatus`. `shipDate`
  is not compared: it is the service start time (G15).
- **Verification**: response only.
- **Tags**: `@sanity`.

### TC-STOR-18

- **Preconditions**: actor `default`; `<UNKNOWN_ORDER_ID>`; `<INT64_MAX>` confirmed absent.
- **Request**: `GET /store/order/<UNKNOWN_ORDER_ID>` and `GET /store/order/<INT64_MAX>`.
- **Expected**: `404` with the `not-found` envelope for both (the largest well-formed id is still
  well-formed).
- **Verification**: response only. Acceptance criterion 3. The body is plain text whose content type
  follows `Accept` (PN-02, G5); the contract declares no body, so this is no departure, but the
  catalogue's `not-found` kind lists only `application/xml` and automate must ask with that type
  or extend the kind.
- **Tags**: `@regression`.

### TC-STOR-19

- **Preconditions**: actor `default`.
- **Request**: `GET /store/order/{orderId}` with: text, a fraction, an exponent (`1e3`), hex
  (`0x10`), whitespace, an encoded slash, an injection-shaped value (`' OR '1'='1`, encoded),
  `<INT64_MAX_PLUS_1>` and a 64-digit run.
- **Expected**: `400` with the `input-error` envelope for each; never `500`.
- **Verification**: response only, one step per value. As measured (M4).
- **Probes**: `p-e24dabf6e8`, `p-a74bd27ea4`, `p-38bbd9a233`, `p-7a4400c36d`. Acceptance
  criterion 4.
- **Tags**: `@regression`.

### TC-STOR-20

- **Preconditions**: actor `default`; ids 0, -1, 5, 6, 10 and 11 each confirmed not to name an
  order the case expects.
- **Request**: `GET /store/order/{orderId}` with `0`, `-1`, `6` and `10` (invalid by the prose and
  by the declared `400` "Invalid ID supplied"), and `5` and `11` (valid edges of the prose).
- **Expected**: `400` for `0`, `-1`, `6` and `10`; `404` `not-found` for `5` and `11`.
- **Verification**: response only.
- **Departure**: PN-15 (untracked): every one answers `404` (M3). Whether the prose is a rule or a
  leftover of the public demo is open (A3, A4).
- **Tags**: `@regression` `@contract-drift`.

### TC-STOR-21

- **Preconditions**: actor `default`; `<PET_ID>`; an order `<ORDER_ID>` the case placed and read
  back with `200`.
- **Request**: `DELETE /store/order/<ORDER_ID>`; then `GET /store/order/<ORDER_ID>`.
- **Expected**: `200` with no body; the read answers `404` with the `not-found` envelope.
- **Verification**: follow-up read (absent, placed, deleted, absent). Acceptance criterion 2.
- **Tags**: `@smoke` `@data-integrity`.

### TC-STOR-22

- **Preconditions**: actor `default`; `<UNUSED_ORDER_ID>`; an order `<ORDER_ID>` the case placed and
  deleted once, confirmed by a `404` read.
- **Request**: `DELETE /store/order/<UNUSED_ORDER_ID>`; `DELETE /store/order/<ORDER_ID>` a second
  time.
- **Expected**: `404` for both; both ids still read `404`.
- **Verification**: follow-up reads. Acceptance criterion 8.
- **Departure**: PN-22 (untracked): both answer `200` (W-09, W-11).
- **Tags**: `@regression` `@contract-drift` `@data-integrity`.

### TC-STOR-23

- **Preconditions**: actor `default`; seed orders 1 to 3 read before the case.
- **Request**: `DELETE /store/order/{orderId}` with text, a fraction, an encoded slash,
  `<INT64_MAX_PLUS_1>` and a 64-digit run. Values that resolve to a seed order (`+1`, `01`,
  `1;probe`, PN-16 and M8) are never sent.
- **Expected**: `400` with the `input-error` envelope for each; the seed orders read back unchanged.
- **Verification**: state comparison of the seed orders with `ORDER_FIELDS` (no resource guard for
  orders exists, A7). Not measured on `DELETE`; `GET` answers `400` for the same values in the
  shared layer (M4).
- **Probes**: `p-5e156cd7d5`, `p-edd2a2d0f6`, `p-a4b1a42792`, `p-354d596c36`. Acceptance
  criterion 5.
- **Tags**: `@regression` `@data-integrity`.

### TC-STOR-24

- **Preconditions**: actor `default`; `<PET_ID>`; ids `999`, `1000` and `1001` each read `404`
  before the case (fixed ids: if one exists, the case fails instead of overwriting it), and an
  `<ORDER_ID>` of ten digits.
- **Request**: place an order under each id, then `DELETE` each.
- **Expected**: `200` for each delete and a `404` read afterwards: the baseline of W-08 and W-10,
  which the owner accepted for the builder's ids (A5).
- **Verification**: follow-up reads.
- **Departure**: the delete prose calls ids above 1000 errors; the service ignores it (G4). No note
  of its own; PN-15 is the read-side sibling (untracked).
- **Tags**: `@regression` `@contract-drift` `@data-integrity`.

### TC-STOR-25

- **Preconditions**: actor `default`; read-only.
- **Request**: `GET /store/inventory` as JSON.
- **Expected**: `200` `application/json`, an object whose every value is an integer within int32.
  No key is required (G2) and no count is asserted (L-25).
- **Verification**: response only. It asserts only what the contract declares, so it is not
  `@contract-drift`.
- **Tags**: `@sanity`.

### TC-STOR-26

- **Preconditions**: actor `default`; `<PET_ID>` created by the case; one `<ORDER_ID>` per
  `OrderStatus` value, each with a distinct quantity; the inventory read before each step. Runs
  in the serial group (see the introduction).
- **Request**: for each status, place an order and read the inventory, then delete it and read the
  inventory. Then change `<PET_ID>` from `available` to `sold` with `PUT /pet` and read the inventory.
- **Expected**: placing raises the key of the order's status by its quantity, deleting lowers it by
  the same amount, other keys do not move; the pet's status change moves no key.
- **Verification**: inventory deltas around each own write. Cleanup deletes the orders and the pet,
  each confirmed by a `404` read.
- **Departure**: PN-09 (untracked): the summary speaks of pet inventories by status. The case
  asserts the measured semantics as the baseline (W-02 to W-08, L-56) until A2 is answered.
- **Tags**: `@regression` `@contract-drift` `@data-integrity`.

### TC-STOR-27

- **Preconditions**: actor `default`; one fresh `<ORDER_ID>` per variant; the inventory answers
  `200` before the case. Never `{}`, which creates order `0`.
- **Request**: `POST /store/order` with `{"id": <ORDER_ID>}`; then with `<VALID_ORDER>` and
  `"status": null`; then with `<VALID_ORDER>` without `status` and `complete` `true`, `false` and
  omitted. After each, `GET /store/inventory`.
- **Expected**: `200` for each `POST` (status is optional), and the inventory keeps answering `200`
  with the map of int32 counts.
- **Verification**: inventory read after each variant.
- **Probes**: `p-a1aafd58bf`, `p-46c7d683e4`, `p-14922c0e29`, `p-6e48590751`. Acceptance
  criterion 11.
- **Departure**: PN-17, tracked as `LOCAL-2`: the inventory answers `500` with the `server-error`
  envelope to every caller while such an order exists (W-21, W-41, W-46).
- **Recovery**: in cleanup, even after a failed assertion, `DELETE` each `<ORDER_ID>`, confirm each
  reads `404`, then confirm the inventory answers `200` again.
- **Tags**: `@regression` `@destructive` `@known-gap` `@data-integrity`.

### TC-STOR-28

- **Preconditions**: actor `anonymous` (no `api_key` header); read-only.
- **Request**: `GET /store/inventory`.
- **Expected**: `200` with the map of int32 counts. The contract declares `api_key`, so an API that
  enforced it would answer `401`; this image does not (PN-05, tolerated), and the case shows that,
  not a refusal.
- **Verification**: response only.
- **Tags**: `@regression` `@security`.

### TC-STOR-29

- **Preconditions**: actor `default` with the header overridden; read-only.
- **Request**: `GET /store/inventory` with `api_key` empty and with `<ARBITRARY_API_KEY>`.
- **Expected**: `200` with the map of int32 counts for both (PN-05, tolerated); the answer does not
  echo the key value.
- **Verification**: response only.
- **Tags**: `@regression` `@security`.

### TC-STOR-30

- **Preconditions**: actor `default`; `<ORDER_ID>` for the body variant.
- **Request**: `GET /store/order/{orderId}` with an injection-shaped value; `POST /store/order` with
  `id` as text; `OPTIONS /store/order/<SEED_ORDER_ID>`.
- **Expected**: refusals carry the error envelope without implementation names: no Java type or
  model class, no echo of the raw injection input; `OPTIONS` names no framework version; no answer
  carries a `Server` header with a version.
- **Verification**: response bodies and headers.
- **Departure**: PN-07 (untracked): `class java.lang.Long`, `io.swagger.petstore.model.Order`, the
  echoed input, a WADL naming Jersey and a versioned `Server` header (M4, M10, W-23).
- **Tags**: `@regression` `@security`.
