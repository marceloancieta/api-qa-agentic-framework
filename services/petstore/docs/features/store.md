# Store orders and inventory contract

| | |
|---|---|
| Pack and version | `petstore` `v3` (`service.json`; contract `info.version` 1.0.28) |
| Feature code | `STOR` (case ids `TC-STOR-NN`), from backlog PET-01; confirmed at the review gate |
| Endpoints | `GET /store/inventory`<br>`POST /store/order`<br>`GET /store/order/{orderId}`<br>`DELETE /store/order/{orderId}` |
| Sources | `../../openapi.json` (tracked copy; matches the live `spec_url` of `local` structurally, `contract:digest:live` on 2026-10-10), `../contract-notes.md` (PN-01 to PN-25), `../../error-envelopes.json`, `../../generated/`, `docs/discovery/petstore-digest.json`, read-only measurements M1 to M14 below, and the owner-approved execution-mode write run of 2026-10-10 (W-01 to W-91 below), which wrote only to a pet and orders it created and deleted them afterwards. No implementation code was available, so completion sources 2 and 3 of [contract analysis](../../../../docs/references/contract-analysis.md#completing-a-constraint) were skipped. No issue or intake request. |
| Intake date | 2026-10-10 |

Source tags used below: **[spec]** the OpenAPI document, **[prose]** an operation's description
text, **[PN-xx]** a contract note, **[Mxx]** a read-only measurement, **[W-xx]** a write measurement,
**[pack]** a file of the pack, **[assumption]** to be confirmed (listed at the end).

## Endpoint contract

The digest (`docs/discovery/petstore-digest.json`) owns the full surface; this section names what
the cases need. The body schema is `#/components/schemas/Order`; its status value set is generated
as `OrderStatus` in `../../generated/enums.ts`.

### `GET /store/inventory` (`getInventory`)

- Parameters: none [spec].
- Security: `api_key` header [spec]. Not enforced: answers `200` without the header, with an empty
  value and with an arbitrary value [M2, PN-05].
- `200`: `application/json`, an object whose values are `integer` `int32`
  (`additionalProperties`); the key set is not declared [spec]. Measured keys are `placed`,
  `approved`, `delivered`, all integer [M1].
- `default`: "Unexpected error", no body declared [spec].
- Summary "Returns pet inventories by status", description "a map of status codes to quantities"
  [prose]. Measured: the keys are order statuses and each value is the sum of `quantity` of the
  orders in that status. Placing, overwriting and deleting an order move it by the order's
  quantity; a pet's status does not move it [W-02 to W-08, PN-09] (G1).
- Every stored order status becomes a key, out-of-set values included; a zero or negative quantity
  is summed as stored [W-48, PN-21].
- While any order without `status` exists, the inventory answers `500` with the `server-error`
  envelope to every caller [W-21, W-47, PN-17] (G16).

### `POST /store/order` (`placeOrder`)

- Body: `Order` as `application/json`, `application/xml` or `application/x-www-form-urlencoded`
  [spec]. `requestBody.required` is not set and `Order` declares no `required` list, so every field
  is optional by the contract [spec] (G12).
- Fields [spec]: `id` int64, `petId` int64, `quantity` int32, `shipDate` string `date-time`,
  `status` enum `OrderStatus`, `complete` boolean. No length, range or minimum constraints.
- `200`: `application/json` `Order` [spec]. `400` "Invalid input" and `422` "Validation exception",
  no body declared [spec]; which inputs give which code is not stated (G12).
- Security: none declared [spec].
- Measured behaviour (contract expectation in brackets where they differ):
  - A valid order answers `200` with the stored `Order`; the read-back equals it, `shipDate` with a
    `+00:00` offset where `Z` was sent [W-02, PN-04].
  - An existing `id` is silently replaced with `200` [W-05, PN-20] (expected: a refusal or a
    documented upsert).
  - Wrong JSON types in `id`, `petId`, `quantity` or `complete`, int32 or int64 overflow, malformed
    and truncated JSON answer `400` `input-error`; the message names the model class
    `io.swagger.petstore.model.Order` [W-23 to W-25, W-28, W-33, W-36, W-37, W-43, PN-07]. Nothing
    is stored. No wrong type answered `500`, so PN-01 has no sibling here.
  - An empty body answers `400` with the plain text `No Order provided. Try again?` labelled
    `application/json` [W-22]. `text/plain` answers an undeclared `415` [W-38, PN-08].
  - The declared `422` was produced by no body [W-21 to W-46, PN-08].
  - Stored with `200` although the contract refuses them: a status outside the set or a number as
    status (stored as text), `quantity` 0 or negative, an order for a pet that does not exist, a
    number as `shipDate` (read as epoch milliseconds), `"true"` as `complete`, fractions in `id`,
    `petId` and `quantity` (truncated), and an impossible `shipDate` that rolls over into another
    date [W-26, W-27, W-29 to W-32, W-34, W-35, W-40, W-42, W-06, PN-21].
  - A body with no `status` (`{}`, only `id`, `"status": null`) is stored without one; `{}` is stored
    as order `0` with `petId` 0 and `quantity` 0. Either breaks the inventory [W-21, W-41, W-46,
    PN-17].
  - Unknown properties are ignored [W-39]. XML and form-encoded bodies are accepted; a form-encoded
    order without `shipDate` gets the server's current time, while JSON and XML leave it absent
    [W-44, W-45] (G17).

### `GET /store/order/{orderId}` (`getOrderById`)

- `orderId`: path, required, `integer` `int64` [spec].
- `200`: `Order` as `application/json` or `application/xml` [spec]; both served [M7]. The XML form
  renders `shipDate` as epoch milliseconds (G7).
- `400` "Invalid ID supplied", `404` "Order not found", `default`, no bodies declared [spec].
  Measured: non-integer and int64-overflowing ids give `400` with the `input-error` envelope [M4];
  well-formed ids that name nothing give `404` with a plain-text body [M3, PN-02].
- Description: "For valid response try integer IDs with value <= 5 or > 10. Other values will
  generate exceptions." [prose]. Not honoured on this image [M3] (G3).
- Security: none declared [spec].

### `DELETE /store/order/{orderId}` (`deleteOrder`)

- `orderId`: path, required, `integer` `int64` [spec].
- `200` "order deleted" (no body), `400` "Invalid ID supplied", `404` "Order not found", `default`
  [spec].
- Description: "For valid response try integer IDs with value < 1000. Anything above 1000 or
  non-integers will generate API errors." [prose]. Not honoured: ten-digit ids and a three-digit id
  are deleted alike with `200` [W-08, W-10]; PN-15 is the sibling for the read side's prose (G4).
- Measured: a delete answers `200` with no body and no content type; the order then reads `404`
  and its quantity leaves the inventory [W-08]. A second delete of the same id and a delete of an
  id that never existed also answer `200`; the declared `404` never appears [W-09, W-11, PN-22].
  Invalid ids on `DELETE` were not sent; the shared layer answers `400` for them on `GET` [M4].
- Security: none declared [spec]. Methods allowed on the path: `HEAD, DELETE, GET, OPTIONS` [M10].

### Computed analysis (2026-10-10)

- Value sets (`node scripts/derive-value-sets.mjs --service petstore`, stdout mode; `--check`
  reports generated files current): `Order.status` = `placed | approved | delivered`. The pet value
  set `Pet.status` = `available | pending | sold` is separate.
- Floor (`npm run contract:floor -- --service petstore`): `GET /store/inventory` 3 (positive 1,
  security 2); `POST /store/order` 4 (positive 1, value set 1, errors 2); `GET /store/order/{orderId}`
  4 and `DELETE /store/order/{orderId}` 4 (positive 1, path 1, errors 2). Total for the feature: 15.
  `coverage:status` owns the number once a registry exists.
- Probes (`npm run contract:probes -- --service petstore`; tracked matrix current): inventory 0;
  `POST /store/order` 17 scheduled (int64/int32 overflow, `shipDate` format, status outside the set,
  9 pairwise status x complete), 18 exploratory (wrong type, null, fraction, unknown property per
  field and for the root), 3 service-wide (malformed JSON, truncated JSON, wrong content type);
  `GET` and `DELETE /store/order/{orderId}` 1 scheduled (int64 overflow) and 3 service-wide (wrong
  type, overlong, encoded slash) each. None is covered by a spec yet. The four `GET` path probes
  (`p-e24dabf6e8`, `p-a74bd27ea4`, `p-38bbd9a233`, `p-7a4400c36d`) were sent read-only and all
  answered `400` [M4]. The write run sent many of the `POST` probes (see Write measurements). The
  status-outside-the-set (`p-d1c0bd98e0`) and `shipDate` format (`p-142a979ee1`) probes expect a
  refusal the service does not give [W-30, W-40, PN-21]. The `DELETE` path probes were not sent.

## Business rules

1. An order is placed by sending an `Order`; a valid one answers `200` with the stored order
   [spec, W-02].
2. An order's `status` is one of `placed`, `approved`, `delivered` [spec, `generated/enums.ts`].
   The service does not enforce it: any text, a number (stored as text) or no status is stored
   [W-27, W-30, W-41, PN-21].
3. A placed order can be read back by its id with the values sent; `shipDate` comes back as the same
   instant with a `+00:00` offset [PN-04, reconfirmed W-02].
4. Reading an order by an id that names no order answers `404`; an id that is not an int64 answers
   `400` with the `input-error` envelope [spec, M3, M4].
5. Deleting an existing order answers `200` and removes it [spec, W-08]. The spec expects `404` for
   an unknown id; the service answers `200`, also for a second delete [W-09, W-11, PN-22].
6. The read side accepts any int64 id, including `0`, negatives, and ids between 6 and 10; the
   documented "valid" range is not enforced [M3, contradicts prose, PN-15] (G3, A3).
7. The delete side documents ids under 1000 as valid and higher ids as errors [prose]. The service
   deletes ten-digit ids as it does small ones [W-08, W-10] (G4).
8. The inventory answers a map from status to an int32 count [spec]. On this image its keys are the
   order statuses, and each value is the sum of `quantity` of the orders in that status, whatever
   their pet [W-02 to W-08, PN-09] (G1). Which inventory the owner intends is open (A2).
9. The order id is chosen by the caller in the body (`id`), not generated by the service [spec,
   `builders/order-builder.ts`]. Posting an id that exists replaces that order with `200`
   [W-05, PN-20] (G13).
10. The inventory declares `api_key`; the order operations declare no security. The service does
    not enforce `api_key` anywhere it was measured [spec, M2, M9, PN-05].
11. An order references a pet by `petId` [spec]. The pet need not exist, and placing or deleting an
    order never changes the pet [W-06, W-02, W-12, PN-21] (G14).
12. The contract declares no minimum `quantity`; the service stores `0` and negatives, and a
    negative quantity lowers the inventory [spec, W-31, W-32, W-48, PN-21].
13. An order without `status` makes `GET /store/inventory` answer `500` to every caller until that
    order is deleted [W-21, W-47, W-48, PN-17] (G16).

### Cross-feature dependencies

- **Pets (`PET`)**: `Order.petId` names a pet. The purchase flow (`flows/purchase.ts`) creates a pet
  with `POST /pet` before placing the order, and `cancelPurchase` deletes both. The seed orders
  1 to 3 all reference seed pet 1 [M5], which is shared data guarded by `seedPet` in `guards.ts`.
- **Inventory versus pet status**: the summary says inventory counts pets by status. Pets measured
  by `GET /pet/findByStatus` on 2026-10-10 were 7 `available`, 2 `pending`, 1 `sold` (seed pets);
  none of those keys or counts appear in the inventory [M1, M6]. Changing a pet's status leaves the
  inventory unchanged [W-04], so a `PET` case cannot use the inventory as its read-back.
- **Orders do not touch pets**: an order for a missing pet is stored, and placing or deleting orders
  never changes the pet's status [W-06, W-12].
- **Counters other writers move**: every order any case places moves the inventory [W-02].
  Inventory cases read it before and after their own order and assert the delta, never absolute
  counts (L-25).
- **Breakage shared across features**: an order without `status` breaks the inventory for every
  caller, including other features' cases running at the same time [PN-17].

## Acceptance criteria

1. Given a valid order built by `anOrder`, when it is placed, then the answer is `200`, the body
   matches `Order`, and a read of `<ORDER_ID>` returns the same business fields (`ORDER_FIELDS`,
   `shipDate` compared as an instant) [spec, PN-04].
2. Given an order the case placed, when it is deleted, then the answer is `200` and a read of
   `<ORDER_ID>` answers `404` with the `not-found` envelope [spec, W-08].
3. Given `<UNKNOWN_ORDER_ID>`, when it is read, then the answer is `404` with the `not-found`
   envelope [spec, M3, PN-02].
4. Given an `orderId` that is not an int64 (text, fraction, overflow, encoded slash), when it is
   read, then the answer is `400` with the `input-error` envelope [spec, M4].
5. Given the same invalid ids, when they are deleted, then the answer is `400` and nothing changed
   [spec; not sent, M4 shows the shared layer on `GET`].
6. Given an order body with `status` outside `OrderStatus`, when it is placed, then it is refused
   with a `4xx` and no order exists under its id [spec, probe `p-d1c0bd98e0`]. The service stores
   it with `200` [W-30, PN-21]: a known gap.
7. Given an order the case owns with `quantity` q, when it is placed, then the inventory key of its
   status rises by q; when it is deleted, the key falls by q [W-02, W-03, W-08, PN-09]. Every value
   is an integer within int32 [spec, M1].
8. Given `<UNUSED_ORDER_ID>`, when it is deleted, then the answer is `404` [spec]. The service
   answers `200`, also on a repeated delete [W-09, W-11, PN-22]: a known gap.
9. Given an order the case placed, when a second order is posted with the same `id`, then the
   first is not silently replaced [assumption, A9]. The service replaces it with `200` [W-05, PN-20].
10. Given a body with a wrong JSON type in `id`, `petId`, `quantity` or `complete`, or malformed
    JSON, when it is placed, then the answer is `400` `input-error` and nothing is stored [spec,
    W-23 to W-25, W-28, W-36, W-37].
11. Given an order without `status`, when the inventory is read, then the answer is `200` [spec].
    The service answers `500` until the order is deleted [W-21, PN-17]: a known gap, reproduced
    only by an `@destructive` case.

## Access and ownership

- Credentials: none required by the service [PN-05, M2, M9]. The pack's configured `auth` is
  `api_key` from the environment variable `API_KEY` (qa-config); Petstore needs no value.
- Actors the cases need: `default` and `anonymous`. `anonymous` on the inventory shows only that
  `api_key` is not enforced (PN-05); it cannot demonstrate a refusal.
- Ownership: `Order` has no owner field and no operation takes a caller identity [spec]. Every
  caller can read any order by id, and the seed ids are sequential (1, 2, 3) [M5]. Object-level
  authorization cannot be designed on this API (backlog FUT-07); recorded, not a gap.
- Identifiers to check against the caller: `orderId` (path) and `id`, `petId` (body). With no actor
  model, the meaningful checks are integrity ones. Any caller can replace any order, seed orders
  included, by posting its id [W-05, PN-20] (G13). An order never changed a pet [W-12] (G14).

## Edge and negative cases

- Path `orderId` (both operations): text, fraction, exponent (`1e3`), hex (`0x10`), whitespace,
  int64 maximum `<INT64_MAX>` (well-formed, `404`), `<INT64_MAX_PLUS_1>` (`400`), a 64-digit run,
  an encoded slash, an injection-shaped value (`' OR '1'='1`) [M3, M4]. Measured on `GET` only;
  on `DELETE` only well-formed ids were sent [W-08 to W-11].
- Equivalent spellings: `+1`, `01` and `1;probe` (matrix parameter) all resolve to order 1 [M8].
- Zero and negative ids answer `404`, not `400`; the contract states no minimum [M3, PN-15] (A4).
- Missing id: `GET /store/order` and `GET /store/order/` answer `405` with a `{code, message}` JSON
  body [M11] (G10).
- Unknown query parameters are ignored on every `GET` [M2, M7].
- Content negotiation: `Accept` `application/json`, `application/xml`, `*/*`, none, and unsupported
  types (`text/plain`, form-encoded) [M7, M12]; error bodies change form with `Accept` (G5, G6).
- Body of `POST /store/order`: the 38 matrix probes above; an empty body and an empty object; each
  field missing in turn; the XML and form-encoded bodies the contract declares. Measured outcomes
  are in [Write measurements](#write-measurements): refusals for wrong types and broken JSON,
  silent storage for out-of-set, zero, negative, coerced and rolled-over values [PN-21]. PN-01 has
  no sibling here: no wrong type answered `500` (L-37).
- After every refused write, read the targeted id back: the run found nothing stored after any
  `400` or `415` [W-22 to W-43] (L-35).
- **`@destructive`**: an order without `status` (`{}`, only `id`, `"status": null`) breaks the
  inventory for every caller [PN-17]. A case that reproduces it posts `{"id": <ORDER_ID>}` with an
  id it owns (never `{}`, which lands on order `0`), reads the inventory, and deletes the order in
  its cleanup even when an assertion failed; it then confirms the inventory answers `200` again.
  It never runs next to other cases against shared data (`.claude/rules/tagging.md`).
- Overwrite risk: a case posts only ids it owns and confirms each is absent first (`GET` answers
  `404`); a stray id replaces someone else's order without warning [PN-20].
- Repeated and unknown deletes answer `200` [PN-22], so a delete's status does not prove the order
  existed; cleanup that must know reads the order first.
- Shared layer: `HEAD` answers like `GET` without a body; `OPTIONS` answers a Jersey WADL and an
  `Allow` list per path [M10] (G9).

## Test data

| Placeholder | Stands for | How a case gets it |
|---|---|---|
| `<ORDER_ID>` | an order the case placed | `anOrder(faker, clock)` builds it; the id comes from the `POST` answer |
| `<PET_ID>` | the pet an order references | `aPet` creates it (feature `PET`), or the purchase flow |
| `<SEED_ORDER_ID>` | one of the seed orders 1 to 3 | read-only; no resource guard for orders exists in `guards.ts` (A7) |
| `<UNKNOWN_ORDER_ID>` | a well-formed int64 that names no order | confirmed absent by a `GET` that answers `404` before use |
| `<UNUSED_ORDER_ID>` | an id the case reserved and never posted, for delete cases | builder id, confirmed absent by a `GET` |
| `<MISSING_PET_ID>` | a pet id that names no pet, for an order's `petId` | builder id, confirmed absent by `GET /pet/{petId}` |
| `<INT64_MAX>` / `<INT64_MAX_PLUS_1>` | 2^63 - 1 and 2^63 | constants in the spec, not typed per case |

Notes:

- The builder draws ids from `GENERATED_ID_MIN` to `GENERATED_ID_MAX` in `builders/pet-builder.ts`
  (ten digits). The delete prose calls such ids errors, but the service deletes them [W-08], so the
  range stays (A5 answered).
- Orders are created and deleted by the case that uses them; `POST` to an id the case does not own
  replaces that order [PN-20], and posting a seed order's id (1 to 3) would corrupt shared data.
- Inventory cases assert the delta around their own orders, never absolute counts [W-02, PN-09].
- The `@destructive` reproduction of PN-17 uses an `<ORDER_ID>` it owns and deletes it in cleanup.
- Seed orders carry a `shipDate` equal to the service start time [M5], so their dates are volatile.

## State transitions

- No operation updates an order [spec]: `status` and `complete` are set only at creation. The
  `placed -> approved -> delivered` lifecycle is not exposed as moves; each status is a creation
  partition (pairwise probes with `complete`).
- Allowed: absent -> placed (`POST`) -> deleted (`DELETE`) -> absent (`GET` answers `404`) [spec,
  W-02, W-08].
- Repeats: a second `DELETE` of the same id answers `200`, where the spec expects `404` [W-09,
  PN-22]. A second `POST` with the same `id` replaces the order, status and quantity included, and
  moves the inventory accordingly [W-05, PN-20]. Through a repeated `POST` the status can move in
  any direction, `placed` to `delivered` and back.
- Cascades: placing or deleting an order never changes its pet [W-02, W-12]. Whether deleting a pet
  leaves its orders behind was not measured (the run deleted its orders first).

## Measurements

All on 2026-10-10 against `local` (`http://localhost:8080/api/v3`, image 1.0.28, `Server` header
Jetty 9.4), with `GET`, `HEAD` and `OPTIONS` only, through a throwaway script. Bodies quoted as
returned; counts are what the shared data held that day, not facts that hold forever.

| # | Request | Result |
|---|---|---|
| M1 | `GET /store/inventory`, `Accept: application/json` | `200` `application/json`, `{"approved":50,"placed":100,"delivered":50}`, all values integers |
| M2 | `GET /store/inventory` with no `api_key`, `api_key` empty, `api_key: <ANY_VALUE>`, and `?status=sold&probeUnknown=1` | `200`, same body each time |
| M3 | `GET /store/order/{id}` for 0, -1, 4 to 12, 999, 1000, 1001, a ten-digit id, `<INT64_MAX>` | `404`, body `Order not found` (plain text) |
| M4 | `GET /store/order/{id}` for `not-a-number`, `1.5`, `1e3`, `%20`, `0x10`, `probe%2Fslash`, `' OR '1'='1` (encoded), `<INT64_MAX_PLUS_1>`, a 64-digit run | `400` `application/json`, `input-error` envelope (`code` 400); the message reads "Input error: couldn't convert" the raw value "to type" `class java.lang.Long` |
| M5 | `GET /store/order/1`, `/2`, `/3` | `200`; `petId` 1, `quantity` 100 / 50 / 50, `status` placed / approved / delivered, `complete` true, `shipDate` the service start time with `+00:00` |
| M6 | `GET /pet/findByStatus?status=available`, `pending`, `sold` | `200`; 7, 2 and 1 pets |
| M7 | `GET /store/order/1` with `Accept: application/xml`; `?probeUnknown=1` | XML `<Order>` with `<shipDate><EPOCH_MILLIS></shipDate>`; unknown parameter ignored |
| M8 | `GET /store/order/+1`, `/01`, `/1;probe` | `200`, order 1 |
| M9 | `GET /store/order/1` with no `api_key`, empty, `<ANY_VALUE>` | `200` |
| M10 | `HEAD` and `OPTIONS` on `/store/inventory`, `/store/order`, `/store/order/1` | `HEAD` `200` with headers, no body. `OPTIONS` `200` `application/vnd.sun.wadl+xml` naming Jersey 2.46; `Allow`: `HEAD,GET,OPTIONS` / `POST,OPTIONS` / `HEAD,DELETE,GET,OPTIONS`. Every answer carries `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Methods: GET, POST, DELETE, PUT` |
| M11 | `GET /store/order` and `GET /store/order/` | `405` `application/json`, `{"code":405,"message":"HTTP 405 Method Not Allowed"}` |
| M12 | `GET /store/inventory` and `/store/order/1` with `Accept: text/plain`, form-encoded, `*/*`, none; inventory with `Accept: application/xml` | `200` JSON for every unsupported or wildcard type (no `406`); inventory as XML `<HashMap>...</HashMap>` |
| M13 | `GET /store/order/4` with no `Accept`, `*/*`, `text/plain`, `application/xml`, `application/json`; `GET /store/order/not-a-number` with `application/xml`, `*/*`, none | `404` body `Order not found` as `application/xml`, except `application/json` when that is asked (body still plain text). `400` as `<ApiError><code>400</code><message>...</message></ApiError>` `application/xml` when XML is asked, JSON otherwise |
| M14 | 30 sequential `GET`s each of `/store/inventory`, `/store/order/1`, `/store/order/4` | median 4-5 ms, p95 at most 11 ms, max 12 ms; local, single client, no budget declared |

Where measurement and spec differ, the measurement is what callers get: G1, G3, G5 to G8, G10, G11.

## Write measurements

An execution-mode run approved by the owner (A8), on `local`, 2026-10-10. It wrote only to a pet
`<RUN_PET_ID>` and orders `<ORDER_ID>` it created (ten-digit ids, plus one three-digit id for the
delete range), checked each was absent first, and deleted all of them at the end. Seed orders 1 to
3, seed pets 1 to 10 and the inventory read the same before and after; every run id answered `404`
afterwards. Order `0`, created by W-21, was deleted in W-48 to restore the starting state. The
inventory answered `500` to every caller between W-21 and W-48, about one minute (PN-17).
`<VALID_ORDER>` is `{id: <ORDER_ID>, petId: <RUN_PET_ID>, quantity: 1, shipDate:
"2026-10-10T10:00:00.000Z", status: "placed", complete: false}`. Requests sent
`Accept: application/json`; inventory deltas are around the run's own action.

| # | Request | Observed |
|---|---|---|
| W-02 | `POST /store/order` `placed`, quantity 3, then `GET` it and the inventory | `200` `Order`; read-back equal, `shipDate` `+00:00` (PN-04); inventory `placed` +3; pet unchanged |
| W-03 | `POST` `approved`, quantity 2 | `200`; inventory `approved` +2 |
| W-04 | `PUT /pet` `<RUN_PET_ID>` to `sold`, then back | inventory unchanged |
| W-05 | `POST` the W-02 id again as `delivered`, quantity 7 | `200`; read-back shows the new values; inventory `placed` -3, `delivered` +7 (PN-20) |
| W-06 | `POST` with `petId: <MISSING_PET_ID>` | `200`, stored; the pet still `404` (PN-21) |
| W-07 | `POST` with a three-digit id | `200`, stored |
| W-08 | `DELETE` the ten-digit order | `200`, no body, no content type; read `404`; inventory `delivered` -7 |
| W-09 | `DELETE` the same id again | `200` (PN-22) |
| W-10 | `DELETE` the three-digit order | `200`; read `404` |
| W-11 | `DELETE <UNUSED_ORDER_ID>` | `200` (PN-22) |
| W-12 | `GET /pet/<RUN_PET_ID>` after its orders | status unchanged |
| W-21 | `POST` `{}` | `200` `{"id":0,"petId":0,"quantity":0,"complete":false}`; inventory then `500` server-error (PN-17) |
| W-22 | `POST` an empty body | `400`, plain text `No Order provided. Try again?` labelled JSON; nothing stored |
| W-23 to W-25, W-28 | `<VALID_ORDER>` with `id`, `petId`, `quantity` or `complete` as non-matching text | `400` input-error naming `io.swagger.petstore.model.Order` (PN-07); read `404` |
| W-26 | `shipDate: 12345` | `200`, stored as `1970-01-01T00:00:12.345+00:00` (PN-21) |
| W-27 | `status: 12345` | `200`, stored as `"12345"`; becomes an inventory key (PN-21) |
| W-29 | `complete: "true"` | `200`, stored as `true` (PN-21) |
| W-30 | `status: "unlisted-value"` | `200`, stored; becomes an inventory key (PN-21) |
| W-31, W-32 | `quantity: 0`, `quantity: -1` | `200`, stored; -1 lowers `placed` (PN-21) |
| W-33 | `quantity: <INT32_MAX_PLUS_1>` (2^31) | `400` input-error; read `404` |
| W-34, W-35, W-42 | fractions in `id`, `quantity`, `petId` | `200`, each truncated (PN-21) |
| W-36, W-37 | malformed and truncated JSON | `400` input-error; read `404` |
| W-38 | `<VALID_ORDER>` as `text/plain` | `415` `{code, message}` (PN-08); read `404` |
| W-39 | `<VALID_ORDER>` plus an unknown property | `200`; the property is dropped |
| W-40 | `shipDate: "2024-13-40T25:61:00Z"` | `200`, stored as `2025-02-10T02:01:00.000+00:00` (PN-21) |
| W-41, W-46 | `status: null`; only `id` | `200`, stored without status (`petId` 0, `quantity` 0 for only `id`); inventory stays `500` (PN-17) |
| W-43 | `id: <INT64_MAX_PLUS_1>` | `400` input-error; nothing stored |
| W-44 | form-encoded `id, petId, quantity, status, complete` | `200`; `shipDate` set to the server's current time (G17) |
| W-45 | XML `<order>` body | `200`, stored, no `shipDate` |
| W-47 | `DELETE` the in-range orders without status, then the inventory | `200`; inventory still `500` while order `0` exists |
| W-48 | `DELETE /store/order/0`, then the inventory | `200`; inventory `200`, with keys `"12345"` and `"unlisted-value"` and the 0 and -1 quantities summed |
| W-90, W-91 | `DELETE` every remaining run order and the pet; `GET` each id | `200`; every id `404`; seed data and inventory equal to the start |

No body produced the declared `422`, and no wrong-typed field produced `500`.

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | Inventory is described as pet inventories by status; its keys are the order statuses and its values match the seed orders' quantities per status. Pet statuses are absent. **Confirmed:** each value is the sum of `quantity` of the orders in that status; orders move it, pet statuses do not [W-02 to W-08]. Intent stays open (A2). | spec summary vs M1, M5, M6, W-02 to W-08 | PN-09 (searched, none) |
| G2 | The inventory's key set is not declared (`additionalProperties` only), so no case can assert which keys must exist. | spec | searched, none |
| G3 | `GET` prose says ids `<= 5` or `> 10` are valid and others "generate exceptions"; ids 6 to 10 answer `404` like any unknown id, and 4, 5 answer `404` too. | prose vs M3 | PN-15 (searched, none) |
| G4 | `DELETE` prose says ids above 1000 "generate API errors"; the builder's ids are ten digits, so cleanup by `DELETE` may fail and leave orders behind. **Resolved:** the prose is not honoured; ten-digit and three-digit ids are deleted alike with `200` [W-08, W-10]. Cleanup by `DELETE` works. | prose, `builders/pet-builder.ts`, `flows/purchase.ts`, W-08, W-10 | PN-15 is the sibling for prose ranges (searched, none) |
| G5 | The `404` body is plain text; its content type follows `Accept` (XML by default, JSON when JSON is asked, though the body is not JSON). The 404 declares no body. | M13, refines PN-02 | PN-02 |
| G6 | The `input-error` envelope is served as XML `<ApiError>` when XML is asked; `error-envelopes.json` lists `application/json` only. | M13 | PN-08 (searched, none) |
| G7 | XML representation of an order gives `shipDate` as epoch milliseconds, not a `date-time` string. | spec vs M7 | PN-14 (searched, none) |
| G8 | Inventory is served as XML (`<HashMap>`) on request; the contract declares JSON only. Unsupported `Accept` types answer `200` JSON rather than `406`. | spec vs M12 | PN-14 (searched, none) |
| G9 | Information exposure: input errors name the Java type (`class java.lang.Long`); `OPTIONS` returns a WADL with the Jersey version; `Server` names the Jetty version. Service-wide. | M4, M10 | PN-07 (searched, none) |
| G10 | `405` answers carry a `{code, message}` JSON envelope that `error-envelopes.json` does not catalogue. | M11 | PN-08 (searched, none) |
| G11 | `api_key` declared on the inventory is not enforced. | spec vs M2 | PN-05 |
| G12 | `POST /store/order` has no required body or fields; which inputs give `400` versus `422`, what an empty body does, and whether a wrong JSON type gives `500` as PN-01 does for pets are unknown. **Measured:** wrong types, overflow and broken JSON give `400` input-error; an empty body gives `400` plain text; `text/plain` gives `415`; `422` never appears; no `500`. Values the contract refuses are stored (PN-21). | spec, PN-01, W-21 to W-46 | PN-08, PN-21 (searched, none) |
| G13 | The caller chooses `id`; whether a `POST` with an existing id (a seed order) overwrites it is unmeasured. High risk to shared data. **Measured:** it is replaced silently with `200` [W-05]. Whether that is intended is open (A9). | spec, `builders/order-builder.ts`, W-05 | PN-20 (searched, none) |
| G14 | Whether `petId` must name an existing pet, and whether placing or deleting an order changes the pet or the inventory, is unmeasured. **Measured:** an order for a missing pet is stored; orders never change the pet; they move the inventory by their quantity [W-02, W-06, W-08, W-12]. | spec, M1, M6, W-02 to W-12 | PN-21, PN-09 (searched, none) |
| G15 | Seed orders' `shipDate` is the service start time, so it changes on every restart. | M5 | searched, none |
| G16 | An order without `status` (`{}`, only `id`, `"status": null`) is stored, and from then on `GET /store/inventory` answers `500` to every caller until it is deleted. `{}` lands on order `0`. | W-21, W-41, W-46 to W-48 | PN-17, `LOCAL-2` |
| G17 | A form-encoded order without `shipDate` is stored with the server's current time; JSON and XML bodies leave `shipDate` absent. The contract states no default. | W-44, W-45, W-34 | searched, none |
| G18 | `DELETE` answers `200` for an order that does not exist and for a second delete; the declared `404` never appears. | spec vs W-09, W-11 | PN-22 (searched, none) |
| G19 | An empty `POST` body answers `400` with plain text labelled `application/json`, a format `error-envelopes.json` does not catalogue. | W-22 | sibling of PN-08's plain-text `400` (searched, none) |

## Out of scope

- An authorization matrix: the service enforces no credential (PN-05); belongs to backlog FUT-07.
- Latency budgets: none declared by the contract or qa-config; M14 is an observation only (backlog
  FUT-02 owns performance).
- Pet and user operations (features `PET`, `USER`), except as preconditions and read-backs named
  above.
- The public demo environment: read-only for this suite (qa-config `allow_writes: false`).

## Assumptions to confirm

### Open

- **A2** Which inventory does the owner intend: counts of pets by pet status (the summary) or order
  quantities by order status (what the service does, W-02 to W-08, PN-09)? The behaviour is settled;
  the intent decides whether inventory cases are plain cases or known gaps. Until answered, cases
  assert the shape and the delta around their own orders.
- **A3** Is the `GET` id-range prose a leftover of the public demo to be ignored, or a rule the
  owner expects (`400` for 6 to 10)? The `DELETE` prose turned out not to be enforced either (W-08).
- **A4** Should zero and negative ids be refused with `400` rather than answer `404`?
- **A6** The service does not require `petId` to name a pet and never changes the pet (W-06, W-12).
  Is that intended, or should an order for a missing pet be refused and a placed order mark the pet?
- **A7** Are the seed orders 1 to 3 shared data that need a resource guard like `seedPet`? None
  exists for orders, and any `POST` with their id replaces them (PN-20).
- **A9** Should a `POST` with an existing id be refused (acceptance criterion 9), or is replacing it
  the intended upsert? Measured: it replaces (W-05, PN-20).

### Answered

- **A1** Feature code `STOR` for all four operations: approved by the owner at the intake gate.
- **A5** The order builder keeps its ten-digit ids: `DELETE` accepts them like small ids (W-08,
  W-10). The delete prose is not honoured (G4).
- **A8** The execution-mode run was approved and done on 2026-10-10; its results are in
  [Write measurements](#write-measurements) and settled the behaviour behind G1, G4, G12 to G14.
