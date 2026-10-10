# Store orders and inventory contract

| | |
|---|---|
| Pack and version | `petstore` `v3` (`service.json`; contract `info.version` 1.0.28) |
| Feature code | `STOR` (case ids `TC-STOR-NN`), from backlog PET-01; confirmed at the review gate |
| Endpoints | `GET /store/inventory`<br>`POST /store/order`<br>`GET /store/order/{orderId}`<br>`DELETE /store/order/{orderId}` |
| Sources | `../../openapi.json` (tracked copy; matches the live `spec_url` of `local` structurally, `contract:digest:live` on 2026-10-10), `../contract-notes.md` (PN-01 to PN-16), `../../error-envelopes.json`, `../../generated/`, `docs/discovery/petstore-digest.json`, read-only measurements M1 to M14 below. No implementation code was available, so completion sources 2 and 3 of [contract analysis](../../../../docs/references/contract-analysis.md#completing-a-constraint) were skipped. No issue or intake request. |
| Intake date | 2026-10-10 |

Source tags used below: **[spec]** the OpenAPI document, **[prose]** an operation's description
text, **[PN-xx]** a contract note, **[Mxx]** a measurement in this doc, **[pack]** a file of the pack,
**[assumption]** to be confirmed (listed at the end).

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
  [prose]. The measured keys are order statuses, not pet statuses (G1).

### `POST /store/order` (`placeOrder`)

- Body: `Order` as `application/json`, `application/xml` or `application/x-www-form-urlencoded`
  [spec]. `requestBody.required` is not set and `Order` declares no `required` list, so every field
  is optional by the contract [spec] (G12).
- Fields [spec]: `id` int64, `petId` int64, `quantity` int32, `shipDate` string `date-time`,
  `status` enum `OrderStatus`, `complete` boolean. No length, range or minimum constraints.
- `200`: `application/json` `Order` [spec]. `400` "Invalid input" and `422` "Validation exception",
  no body declared [spec]; which inputs give which code is not stated (G12).
- Security: none declared [spec].
- Behaviour: **unmeasured** apart from PN-04 (a placed order reads back with `shipDate` in a
  `+00:00` offset where `Z` was sent).

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
  non-integers will generate API errors." [prose]. Behaviour **unmeasured** (G4).
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
  answered `400` [M4]; the `DELETE` and `POST` probes are unmeasured.

## Business rules

1. An order is placed by sending an `Order`; a valid one answers `200` with the stored order
   [spec].
2. An order's `status` is one of `placed`, `approved`, `delivered` [spec, `generated/enums.ts`].
3. A placed order can be read back by its id with the values sent; `shipDate` comes back as the same
   instant with a `+00:00` offset [PN-04].
4. Reading an order by an id that names no order answers `404`; an id that is not an int64 answers
   `400` with the `input-error` envelope [spec, M3, M4].
5. Deleting an order by id answers `200`; unknown id `404`; invalid id `400` [spec]. Unmeasured.
6. The read side accepts any int64 id, including `0`, negatives, and ids between 6 and 10; the
   documented "valid" range is not enforced [M3, contradicts prose] (G3, A3).
7. The delete side documents ids under 1000 as valid and higher ids as errors [prose]. Unmeasured
   (G4).
8. The inventory answers a map from status to an int32 count [spec]. On this image its keys are the
   order statuses, and each value equals the sum of `quantity` of the seed orders with that status
   [M1, M5, inference] (G1, A2).
9. The order id is chosen by the caller in the body (`id`), not generated by the service [spec,
   `builders/order-builder.ts`]. What happens when the id already exists is unmeasured (G13).
10. The inventory declares `api_key`; the order operations declare no security. The service does
    not enforce `api_key` anywhere it was measured [spec, M2, M9, PN-05].
11. An order references a pet by `petId` [spec]. Whether the pet must exist, and whether placing or
    deleting an order changes the pet or the inventory, is not stated and unmeasured (G14).

### Cross-feature dependencies

- **Pets (`PET`)**: `Order.petId` names a pet. The purchase flow (`flows/purchase.ts`) creates a pet
  with `POST /pet` before placing the order, and `cancelPurchase` deletes both. The seed orders
  1 to 3 all reference seed pet 1 [M5], which is shared data guarded by `seedPet` in `guards.ts`.
- **Inventory versus pet status**: the summary says inventory counts pets by status. Pets measured
  by `GET /pet/findByStatus` on 2026-10-10 were 7 `available`, 2 `pending`, 1 `sold` (seed pets);
  none of those keys or counts appear in the inventory [M1, M6]. A `PET` case that changes a pet's
  status cannot use the inventory as its read-back until G1 is settled.
- **Counters other writers move**: if the inventory does sum order quantities, every order any case
  places moves it. Cases assert on their own orders, never on absolute inventory counts (L-25).

## Acceptance criteria

1. Given a valid order built by `anOrder`, when it is placed, then the answer is `200`, the body
   matches `Order`, and a read of `<ORDER_ID>` returns the same business fields (`ORDER_FIELDS`,
   `shipDate` compared as an instant) [spec, PN-04].
2. Given an order the case placed, when it is deleted, then the answer is `200` and a read of
   `<ORDER_ID>` answers `404` with the `not-found` envelope [spec; unmeasured].
3. Given `<UNKNOWN_ORDER_ID>`, when it is read, then the answer is `404` with the `not-found`
   envelope [spec, M3, PN-02].
4. Given an `orderId` that is not an int64 (text, fraction, overflow, encoded slash), when it is
   read, then the answer is `400` with the `input-error` envelope [spec, M4].
5. Given the same invalid ids, when they are deleted, then the answer is `400` and nothing changed
   [spec; unmeasured].
6. Given an order body with `status` outside `OrderStatus`, when it is placed, then it is refused
   with a `4xx` and no order exists under its id [spec, probe `p-d1c0bd98e0`; unmeasured].
7. When the inventory is read, then the answer is `200` and every value is an integer within int32
   [spec, M1]. Which keys it must contain is open (A2).

## Access and ownership

- Credentials: none required by the service [PN-05, M2, M9]. The configured `api.auth` is `api_key`
  from the environment variable `API_KEY` (qa-config); Petstore needs no value.
- Actors the cases need: `default` and `anonymous`. `anonymous` on the inventory shows only that
  `api_key` is not enforced (PN-05); it cannot demonstrate a refusal.
- Ownership: `Order` has no owner field and no operation takes a caller identity [spec]. Every
  caller can read any order by id, and the seed ids are sequential (1, 2, 3) [M5]. Object-level
  authorization cannot be designed on this API (backlog FUT-07); recorded, not a gap.
- Identifiers to check against the caller: `orderId` (path) and `id`, `petId` (body). With no actor
  model, the meaningful checks are integrity ones: a placed order must not overwrite another's id
  (G13) and must not change a pet it does not own (G14).

## Edge and negative cases

- Path `orderId` (both operations): text, fraction, exponent (`1e3`), hex (`0x10`), whitespace,
  int64 maximum `<INT64_MAX>` (well-formed, `404`), `<INT64_MAX_PLUS_1>` (`400`), a 64-digit run,
  an encoded slash, an injection-shaped value (`' OR '1'='1`) [M3, M4]. Measured on `GET` only.
- Equivalent spellings: `+1`, `01` and `1;probe` (matrix parameter) all resolve to order 1 [M8].
- Zero and negative ids answer `404`, not `400`; the contract states no minimum [M3] (A6).
- Missing id: `GET /store/order` and `GET /store/order/` answer `405` with a `{code, message}` JSON
  body [M11] (G10).
- Unknown query parameters are ignored on every `GET` [M2, M7].
- Content negotiation: `Accept` `application/json`, `application/xml`, `*/*`, none, and unsupported
  types (`text/plain`, form-encoded) [M7, M12]; error bodies change form with `Accept` (G5, G6).
- Body of `POST /store/order` (all unmeasured): the 38 matrix probes above; an empty object; each
  field missing in turn; the XML and form-encoded bodies the contract declares; PN-01's sibling
  (a field with the wrong JSON type may answer `500` as it does for pets, L-37).
- Shared layer: `HEAD` answers like `GET` without a body; `OPTIONS` answers a Jersey WADL and an
  `Allow` list per path [M10] (G9).

## Test data

| Placeholder | Stands for | How a case gets it |
|---|---|---|
| `<ORDER_ID>` | an order the case placed | `anOrder(faker, clock)` builds it; the id comes from the `POST` answer |
| `<PET_ID>` | the pet an order references | `aPet` creates it (feature `PET`), or the purchase flow |
| `<SEED_ORDER_ID>` | one of the seed orders 1 to 3 | read-only; no resource guard for orders exists in `guards.ts` (A7) |
| `<UNKNOWN_ORDER_ID>` | a well-formed int64 that names no order | confirmed absent by a `GET` that answers `404` before use |
| `<INT64_MAX>` / `<INT64_MAX_PLUS_1>` | 2^63 - 1 and 2^63 | constants in the spec, not typed per case |

Notes: the builder draws ids from `GENERATED_ID_MIN` to `GENERATED_ID_MAX` in
`builders/pet-builder.ts` (ten digits), which is above the delete range the prose documents (G4).
Seed orders carry a `shipDate` equal to the service start time [M5], so their dates are volatile.

## State transitions

- No operation updates an order [spec]: `status` and `complete` are set only at creation. The
  `placed -> approved -> delivered` lifecycle is not exposed as moves; each status is a creation
  partition (pairwise probes with `complete`).
- Allowed: absent -> placed (`POST`) -> deleted (`DELETE`) -> absent (`GET` answers `404`) [spec].
- Repeats (unmeasured): a second `DELETE` of the same id should answer `404`; a second `POST` with
  the same `id` either overwrites or is refused (G13).
- Cascades (unmeasured): whether an order changes its pet's status, and whether deleting a pet
  leaves its orders behind (G14).

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

## Gaps and discrepancies

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | Inventory is described as pet inventories by status; its keys are the order statuses and its values match the seed orders' quantities per status. Pet statuses are absent. | spec summary vs M1, M5, M6 | PN-09 (no tracker configured) |
| G2 | The inventory's key set is not declared (`additionalProperties` only), so no case can assert which keys must exist. | spec | no tracker configured |
| G3 | `GET` prose says ids `<= 5` or `> 10` are valid and others "generate exceptions"; ids 6 to 10 answer `404` like any unknown id, and 4, 5 answer `404` too. | prose vs M3 | PN-15 (no tracker configured) |
| G4 | `DELETE` prose says ids above 1000 "generate API errors"; the builder's ids are ten digits, so cleanup by `DELETE` may fail and leave orders behind. Unmeasured. | prose, `builders/pet-builder.ts`, `flows/purchase.ts` | no tracker configured |
| G5 | The `404` body is plain text; its content type follows `Accept` (XML by default, JSON when JSON is asked, though the body is not JSON). The 404 declares no body. | M13, refines PN-02 | PN-02 |
| G6 | The `input-error` envelope is served as XML `<ApiError>` when XML is asked; `error-envelopes.json` lists `application/json` only. | M13 | PN-08 (no tracker configured) |
| G7 | XML representation of an order gives `shipDate` as epoch milliseconds, not a `date-time` string. | spec vs M7 | PN-14 (no tracker configured) |
| G8 | Inventory is served as XML (`<HashMap>`) on request; the contract declares JSON only. Unsupported `Accept` types answer `200` JSON rather than `406`. | spec vs M12 | PN-14 (no tracker configured) |
| G9 | Information exposure: input errors name the Java type (`class java.lang.Long`); `OPTIONS` returns a WADL with the Jersey version; `Server` names the Jetty version. Service-wide. | M4, M10 | PN-07 (no tracker configured) |
| G10 | `405` answers carry a `{code, message}` JSON envelope that `error-envelopes.json` does not catalogue. | M11 | PN-08 (no tracker configured) |
| G11 | `api_key` declared on the inventory is not enforced. | spec vs M2 | PN-05 |
| G12 | `POST /store/order` has no required body or fields; which inputs give `400` versus `422`, what an empty body does, and whether a wrong JSON type gives `500` as PN-01 does for pets are unknown. Unmeasured. | spec, PN-01 | no tracker configured |
| G13 | The caller chooses `id`; whether a `POST` with an existing id (a seed order) overwrites it is unmeasured. High risk to shared data. | spec, `builders/order-builder.ts` | no tracker configured |
| G14 | Whether `petId` must name an existing pet, and whether placing or deleting an order changes the pet or the inventory, is unmeasured. | spec, M1, M6 | no tracker configured |
| G15 | Seed orders' `shipDate` is the service start time, so it changes on every restart. | M5 | no tracker configured |

## Out of scope

- An authorization matrix: the service enforces no credential (PN-05); belongs to backlog FUT-07.
- Latency budgets: none declared by the contract or qa-config; M14 is an observation only (backlog
  FUT-02 owns performance).
- Pet and user operations (features `PET`, `USER`), except as preconditions and read-backs named
  above.
- The public demo environment: read-only for this suite (qa-config `allow_writes: false`).

## Assumptions to confirm

- **A1** Feature code `STOR` for all four operations, inventory included, since it is the `store`
  resource and the owner's plan (PET-01, pack skill) names it. Confirm at the gate.
- **A2** Which inventory is expected: counts of pets by pet status (the summary) or order quantities
  by order status (what the image does)? Until answered, cases assert the shape only.
- **A3** Is the `GET` id-range prose a leftover of the public demo to be ignored, or a rule the
  owner expects (`400` for 6 to 10)?
- **A4** Should zero and negative ids be refused with `400` rather than answer `404`?
- **A5** Should the order builder move its ids under 1000 to fit the delete prose, or does `DELETE`
  accept large ids? Needs the execution-mode run below.
- **A6** Must `petId` name an existing pet, and should an order change the pet's status?
- **A7** Are the seed orders 1 to 3 shared data that need a resource guard like `seedPet`? None
  exists for orders.
- **A8** Proposed execution-mode run (`qa-run`, `local`, data the run creates, before design): place
  an order with `anOrder`; read the inventory before and after; `POST` again with the same id;
  place one for a pet that does not exist; place `{}`; send one field with a wrong JSON type;
  `DELETE` a ten-digit id and a three-digit id the run created; `DELETE` the same id twice. Its
  results are written back here and settle G1, G4, G12 to G14.
