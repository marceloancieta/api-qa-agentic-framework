# Users and sessions contract

| | |
|---|---|
| Pack and version | `petstore` `v3` (Swagger Petstore 1.0.28, image `swaggerapi/petstore3:1.0.28`) |
| Feature code | `USER` (case ids `TC-USER-NN`), from backlog PET-01; approved at the intake review gate |
| Endpoints | `POST /user`<br>`POST /user/createWithList`<br>`GET /user/login`<br>`GET /user/logout`<br>`GET /user/{username}`<br>`PUT /user/{username}`<br>`DELETE /user/{username}` |
| Sources | [`openapi.json`](../../openapi.json) (tracked copy; the live document at `local` matched the tracked digest on 2026-10-10), [contract notes](../contract-notes.md) PN-01..PN-25, [error envelopes](../../error-envelopes.json), the `petstore-api` skill, read-only measurements M-01..M-19 and the execution-mode write run W-01..W-42b of 2026-10-10 below (it wrote only users it created and deleted them; the nameless record of PN-19 needed a restart of the service). No issue or intake request. No access to the implementation's code. |
| Intake date | 2026-10-10 |

How to read the citations: **spec** is the OpenAPI document; **M-NN** is a read-only measurement
in [Measurements](#measurements); **W-NN** is a write measurement in
[Write measurements](#write-measurements); **PN-NN** is an entry of the
[contract notes](../contract-notes.md); **A-NN** is an assumption listed in
[Assumptions to confirm](#assumptions-to-confirm). Sources 2
and 3 of the [completion order](../../../../docs/references/contract-analysis.md#completing-a-constraint)
(models and implementation) are not available for this API, so open constraints were completed
from the spec's prose, then by observation.

## Endpoint contract

All seven operations carry the `user` tag. **None declares a `security` requirement** and the
document has no global one (spec; `contract:floor` prints `sec = 0` for all seven), although three
descriptions say "This can only be done by the logged in user" (see G1). Every response set also
declares `default: Unexpected error` without a body.

The [`User`](../../openapi.json) schema has eight properties and **no `required` list**: `id`
(integer, int64), `username`, `firstName`, `lastName`, `email`, `password`, `phone` (strings with
no length, pattern or format) and `userStatus` (integer, int32, described only as "User Status",
no value set). XML name `user`. `npm run contract:value-sets` finds no closed value set in the user
operations (the pack's three sets are pet and order statuses).

### `POST /user` (createUser)

- Body: `User`, as `application/json`, `application/xml` or `application/x-www-form-urlencoded`.
  The body is not marked required (spec).
- `200`: `User` (json or xml). No `201`, no `400`, no `409` for a duplicate username (spec).
- Prose: "This can only be done by the logged in user." (spec)
- Measured (2026-10-10):
  - A full JSON body answers `200` and echoes the stored `User`; every field is stored as sent
    (W-01). A form-encoded body is also stored, except `password`, which comes back different from
    the value sent (W-02; G20).
  - `username` alone is enough. An omitted `id` is stored as `0`, also for a second such create,
    so ids are not unique; an omitted `userStatus` is `0`; omitted strings are absent (W-03, W-03b;
    PN-25).
  - Unknown properties are accepted and neither echoed nor readable afterwards (W-04; G23).
  - Wrong JSON types: an object or array in a string field, text in `id` or `userStatus`, and an
    `id` beyond int64 answer `400` `Input error: unable to convert input to
    io.swagger.petstore.model.User` and store nothing (W-05..W-07, W-10, W-11, W-11c; PN-07 for the
    class name). A number in `email` and a boolean in `password` are stored as text, and a
    fractional `userStatus` is stored as a different integer (W-08, W-09, W-11b; PN-21).
  - Malformed or truncated JSON answers `400` with the same message (W-12, W-12b); `text/plain`
    answers `415` (W-13; PN-08); an empty body answers `400` with the plain text
    `No User provided. Try again?` (W-40; G21).
  - A second create with an existing `username` answers `200` and replaces the first record (W-14,
    W-15; PN-20).
  - `{}` answers `200` and stores a record without a username (id `0`); from then on every read of
    an unknown username answers `500` until the service restarts (W-39; PN-19). Bodies with other
    fields but no username, or a `null` username, answered `500` (W-41, W-42b; PN-19), but only
    while that record existed (G22).

### `POST /user/createWithList` (createUsersWithListInput)

- Body: array of `User`, `application/json` only; not marked required (spec).
- `200`: a single `User`, not an array (spec; see G13).
- Measured: two users answer `200` with a JSON array of two elements, and both are stored as sent
  (W-17; PN-25). `[]` answers `400` `No User provided. Try again?` (W-18; G21). One element with
  a wrong type rejects the whole array with `400` and stores none of it (W-18b).

### `GET /user/login` (loginUser)

- Query `username` and `password`, both strings, both **optional** (spec).
- `200`: body `string` as json or xml, with headers `X-Rate-Limit` (integer, int32, "calls per hour
  allowed by the user") and `X-Expires-After` (string, `date-time`, "date in UTC when token
  expires") (spec).
- `400`: "Invalid username/password supplied", no body (spec).
- Measured: `200` for every input tried, including none (M-11); the body is plain text and the
  expiry header is not a `date-time` (M-11, M-12; G3, G4, G5). For a user created by the run, the
  right password, a wrong one and none give the same answer (W-30..W-32; PN-12).

### `GET /user/logout` (logoutUser)

- No parameters, no credential. `200` without a declared body (spec).
- Measured: `200` with a plain-text body whatever the prior state (M-14).

### `GET /user/{username}` (getUserByName)

- Path `username`, string, required, no constraints. Its description names an example user for
  testing (spec).
- `200`: `User` (json or xml). `400` "Invalid username supplied". `404` "User not found" (spec).
- Measured: `404` with a plain-text body for every unknown name, including malformed-looking ones;
  no input tried produced `400` (M-01, M-09; G12). The `200` body includes `password` (M-04; G2).
  While a nameless record exists, an unknown name answers `500` instead of `404` (W-39; PN-19).

### `PUT /user/{username}` (updateUser)

- Path `username`, string, required. Its description reads "name that need to be deleted", a prose
  copy of the delete operation (spec; G17).
- Body: `User`, json, xml or form; not marked required (spec).
- `200` without body, `400` "bad request", `404` "user not found" (spec).
- Measured (2026-10-10):
  - It answers `200` **with** the stored `User` as body, where the spec declares none (W-19).
  - It replaces the whole record: a body with only `username` and `lastName` leaves the other
    strings absent and sets `id` and `userStatus` to `0` (W-20; PN-25). Nothing is preserved on
    omit.
  - A body `id` different from the stored one re-keys the user (W-21); a body `username` different
    from the path renames it: the old name answers `404`, the new one `200` (W-22; PN-25).
  - Truncated JSON or a wrong type answers `400` and leaves the record unchanged (W-23, W-24,
    W-24b).
  - An unknown path username answers `404` `User not found` and creates nothing, whether the body
    names the same or another user (W-25, W-26).

### `DELETE /user/{username}` (deleteUser)

- Path `username`, string, required (spec).
- `200` "User deleted" without body, `400` "Invalid username supplied", `404` "User not found"
  (spec).
- Measured: `200` with an empty body and no content type, and a read then answers `404` (W-27).
  A second delete of the same user, and a delete of a name never created, also answer `200`; the
  declared `404` never appears (W-28, W-29, W-16b; PN-22). Deleting a user that was created twice
  under one name leaves nothing behind (W-16; PN-20).

### Computed analysis (2026-10-10)

The scripts own these numbers; they are reproduced here only to show what design starts from.

- `npm run contract:floor -- --service petstore`: floors of 2 for `POST /user`,
  `POST /user/createWithList`, `GET /user/login` and `GET /user/logout`, and 4 for each
  `/user/{username}` operation. Only `GET /user/login` gets an error term (its `400`); the
  `{username}` operations get a path term and two error terms each.
- `npm run contract:probes -- --service petstore`: scheduled probes `int64-overflow` on `id` and
  `int32-overflow` on `userStatus` for the three body operations; service-wide `malformed-json`,
  `truncated-json` and `wrong-content-type` for the three body operations, and `overlong`
  (1024 characters) and `encoded-slash` for the three `{username}` operations; exploratory
  wrong-type, null-value and unknown-property probes for the bodies. Login and logout get none.
  Nothing in the user operations is covered by a spec yet.
- `npm run contract:value-sets -- --service petstore` (run without `--write`): no user value set.

## Business rules

1. A user is addressed by `username` in the path for read, update and delete (spec). The lookup is
   an exact, case-sensitive match: a changed case or a trailing space is a different, unknown user
   (M-06).
2. `POST /user` creates one user from a `User` body and answers `200` with a `User` (spec). In
   practice `username` is the only field it needs, a client-sent `id` is stored as sent and an
   omitted one becomes `0` (W-01, W-03; PN-25). An existing `username` is overwritten rather than
   refused (W-15; PN-20). A body without `username` is never refused cleanly: `{}` is stored and
   breaks unknown-name reads (W-39; PN-19).
3. `POST /user/createWithList` creates the users of an array and answers `200` with one `User`
   (spec). Measured, it answers with the whole array, stores every element, and stores none when
   one element cannot be read (W-17, W-18b; PN-25). An empty array is refused with `400` (W-18).
4. `GET /user/{username}` returns the stored user, or `404` when there is none (spec, M-01, M-04).
5. `PUT /user/{username}` updates the user named in the path and answers `200` without a body;
   unknown user `404`, bad request `400` (spec). Measured, it answers with the stored `User`,
   replaces the whole record, and lets the body rename or re-key the user (W-19..W-22; PN-25).
   Unknown user `404` and unreadable body `400` hold, with the record unchanged (W-23..W-26).
6. `DELETE /user/{username}` removes the user and answers `200`; unknown user `404` (spec).
   Measured, removal holds, but an unknown user also answers `200` (W-27..W-29; PN-22).
7. Create, update and delete "can only be done by the logged in user" (spec prose), but no
   operation declares security and the session string from login has no declared way to be sent
   back (spec). No operation asks for a credential: reads ignore `api_key` (M-04, M-07, PN-05),
   and every write of the run was sent without one and applied (W-01..W-42b).
8. `GET /user/login` answers `200` with a session string and the two rate and expiry headers, or
   `400` for invalid credentials (spec). Measured, it issues a new, distinct session for any input,
   including no credentials; `X-Rate-Limit` is `5000` and the expiry is 60 minutes after the
   request (M-11, M-13; G3).
9. `GET /user/logout` answers `200` (spec) without requiring a session and without any observable
   state change (M-14).
10. `password` is a property of `User` and therefore part of every read (spec schema). Measured, it
    is returned with its stored value, to any caller (M-04, M-05; G2).
11. Response media type follows `Accept`: `application/json` or `application/xml`, also for the
    plain-text `404`, login and logout bodies (spec for success bodies; M-02, M-12, M-14 for the
    rest; G6).
12. Error bodies: a missing user is the `not-found` kind of [`error-envelopes.json`](../../error-envelopes.json)
    (PN-02, M-01, M-02); an unrouted path answers `405` with the `{code, message}` shape the
    catalogue knows as `input-error` but with status `405`, which the catalogue does not list (M-08;
    G8). No error body tried leaked a stack trace or query (M-09). Unreadable write bodies answer
    the `input-error` kind and name the model class (W-05; PN-07); an empty body or array answers
    `400` with plain text instead (W-18, W-40; G21); a wrong request content type answers `415`
    with the `{code, message}` shape (W-13; PN-08).
13. The stored identity of a user is its `username`: ids are not unique (two users can hold `0`)
    and can be changed by `PUT` (W-03b, W-21; PN-25). Lookups compare usernames exactly (rule 1).
14. Wrong JSON types are refused with `400` for objects, arrays and non-numeric text, and coerced
    for scalars into string or integer fields (W-05..W-11c; PN-21). The spec declares neither.
15. `userStatus` accepts any int32 (0, -1, 99, `<INT32_MAX>` measured) and changes nothing
    observable: login and reads behave the same (W-33..W-36).

## Acceptance criteria

Each criterion states the spec's expectation; where the service departs, the measured outcome
and its contract note follow, so a case can be designed as a known gap.

- **AC-01** Given a user created by the case with a unique `username` and an explicit `id`, when it
  is read by its `username`, then the answer is `200`, the body matches `User`, and every field
  sent is returned with the value sent (rules 2, 4). Holds for JSON bodies (W-01); a form body
  returns a different `password` (W-02; G20).
- **AC-02** Given a well-formed `username` that names no user, when it is read, then the answer is
  `404` with the `not-found` envelope for the `Accept` sent (rules 4, 12; M-01, M-02). Holds unless
  a nameless record exists (PN-19).
- **AC-03** Given a user created by the case, when it is updated through its path with a full body
  that changes one business field, then the answer is `200` and a read-back shows only that field
  changed (rule 5). Holds (W-19). The spec declares no response body; one is returned.
- **AC-04** Given a user created by the case, when it is deleted, then the answer is `200` and a
  read answers `404` (holds, W-27); a second delete answers `404` (spec). Measured: `200` (W-28;
  PN-22).
- **AC-05** Given an array of users built by the case, when it is sent to `createWithList`, then the
  answer is `200` and each user can be read back (rule 3). Holds (W-17); the answer is the array,
  not the declared single `User` (PN-25).
- **AC-06** Given valid credentials of a user created by the case, when it logs in, then the answer
  is `200` with a non-empty session string, `X-Rate-Limit` as an int32 and `X-Expires-After` as a
  `date-time` in the future (rule 8). The `date-time` part fails today (G4).
- **AC-07** Given credentials that match no user, or a wrong password for a user the case created,
  when they are sent to login, then the answer is `400` (spec). Measured: `200`, identical to a
  login with the right password (M-11, W-30..W-32; PN-12).
- **AC-08** Given any state, when logout is called, then the answer is `200` (rule 9; M-14).
- **AC-09** Given any user, when it is read anonymously, then the body never carries the stored
  password (security expectation, not stated by the spec; M-04 shows it does today; G2).
- **AC-10** Given a user the case created, when another create sends the same `username`, then the
  create is refused and the first record is unchanged (expectation; the spec declares no outcome).
  Measured: `200` and the record is replaced (W-15; PN-20).
- **AC-11** Given a body without `username`, when it is sent to `POST /user`, then it is refused
  with `400` and nothing is stored (expectation). Measured: `{}` is stored and unknown-name reads
  answer `500` until a restart (W-39; PN-19). Destructive: see
  [Edge and negative cases](#edge-and-negative-cases).
- **AC-12** Given a user created by the case, when `PUT` sends a body `username` or `id` different
  from the path, then the path identity is kept (expectation; the spec is silent). Measured: the
  user is renamed or re-keyed (W-21, W-22; PN-25).
- **AC-13** Given a user created by the case, when `PUT` omits fields, then they keep their values
  (expectation; the spec is silent). Measured: they are cleared, and `id` and `userStatus` become
  `0` (W-20; PN-25).

## Access and ownership

- **Credentials.** None declared for any user operation (spec), none enforced on reads (M-04, M-07)
  and, for the operations measured so far, on any Petstore operation (PN-05). The `api_key`
  header is accepted with any value. The login session cannot be presented anywhere: no header,
  cookie or parameter is declared for it, and login sets no cookie (M-11, M-14).
- **Actors.** Only `default` and `anonymous` exist for this pack, and for the user operations they
  behave the same (PN-05, M-07). No named actor in the pack's `actors` would change that.
- **Object-level authorization (BOLA).** The only object identifier is the path `username`; the
  `id` and `username` in a `PUT` body are identity fields as well. Can one caller read, update or
  delete another user by name?
  - Read: **yes**, measured. An anonymous caller reads any seed user, password included (M-04,
    G2).
  - Update and delete: **yes**, measured on users the run created. Every write was sent without a
    credential and applied, including a `PUT` that renamed or re-keyed a user. Nothing ties a
    write to the user it changes, so any caller can change any user it can name (W-19..W-22,
    W-27; PN-05, PN-25).
  - What PN-05 means here: the API has no notion of "the logged in user" that a request could be
    checked against, so an actor-based authorization matrix (user A acting on user B's record,
    expecting a refusal) cannot pass or fail meaningfully on Petstore. Such cases would only record
    that access is not separated. The matrix itself belongs to the second pack planned in backlog
    FUT-07. What can be designed here is the exposure itself (G2, G3) and declared-versus-honored
    on `id` and `username` in `PUT`, which are honored: the body renames or re-keys the user in
    the path (W-21, W-22; PN-25).
- **Function-level authorization.** No roles are declared. `userStatus` changed nothing observable
  across 0, -1, 99 and int32 max (W-33..W-36; A-05 answered). Unknown properties such as `role`
  and `isAdmin` are accepted and discarded (W-04; G23).

## Edge and negative cases

From the spec, the computed analysis and the measurements; design decides which become cases.

- **Path `username`.** Empty (`GET /user/` answers `405`, M-08); space only, quote, statement-like
  text, script fragment, non-ASCII, a literal `%`, an encoded slash, a matrix parameter, 1024
  characters (all `404`, M-09); around 8 KB (`414` HTML page from the web server, M-10); case and
  trailing-space variants (M-06). No input produced the declared `400` (G12). Reserved names:
  users named `login` and `logout` can be created, but `GET /user/login` and `GET /user/logout`
  still run the session operations; such a user is readable only through a percent-encoded path
  (`/user/%6Cogin`), and `DELETE /user/login` removes it (W-37, W-38; A-06 answered). These two
  usernames are **out of bounds for cases**. `createWithList` is routed to `{username}` for `GET`
  (M-09).
- **Bodies (measured, W-01..W-13, W-39..W-42b).** Unreadable JSON, objects or arrays in string
  fields, text in integer fields and an `id` beyond int64 are refused with `400`; scalars of the
  wrong type are coerced and stored (PN-21); unknown properties are discarded (G23); `text/plain`
  answers `415`; an empty body answers `400` in plain text (G21). Not measured: `null` per field
  other than `username`, `userStatus` beyond int32, XML bodies (G24).
- **Destructive: a body without `username` (PN-19).** `POST /user` with `{}` stores a nameless
  record, after which every unknown-name read answers `500` for every caller until the service is
  restarted. A case that reproduces it is `@destructive`: it never runs next to other cases against
  shared data, and the service must be restarted after it. Bodies with other fields but no
  `username` are in the same class until G22 is settled.
- **Arrays (measured, W-17..W-18b).** Empty array `400`; one unreadable element rejects the whole
  array. Not measured: an array of one, duplicate usernames inside one array, a non-array body.
- **Duplicates and identity (measured).** A second create with the same `username` overwrites
  (W-15; PN-20); an omitted `id` is `0` (W-03; PN-25); `PUT` renames and re-keys (W-21, W-22).
- **Login.** No parameters, one of the two, empty values, unknown user, wrong password for an
  existing user, injection-like and very long values (all `200`, M-11). A login with valid
  credentials of a created user cannot be distinguished from these (W-30..W-32; PN-12).
- **Shared behaviour.** `Accept` variants (json, xml, text/plain, none) change the content type of
  success and error answers (M-02, M-12); `HEAD` and `OPTIONS` are served on every user path
  although undeclared (M-15, M-16); every answer carries the web server's name and version
  (M-17); `OPTIONS` returns a WADL description of the resource (M-16).
- **Information exposure.** Stored password in reads (G2); server version header and WADL (G10).
  Error bodies seen so far are fixed texts without internals (M-09).

## Test data

| Placeholder | Stands for | How a case gets it |
|---|---|---|
| `<USERNAME>` | a user the case owns | created by the case from a builder, unique per run (seeded `rng`/`faker`); never `login` or `logout` |
| `<OTHER_USERNAME>` | a second user the case owns, for cross-user reads and writes | created by the case like `<USERNAME>` |
| `<UNKNOWN_USERNAME>` | a well-formed name that was never created | built per run with a prefix no builder uses |
| `<SEED_USERNAME>` | one of the ten seed users of the image (ids 1 to 10, M-04) | read-only use; any write needs a resource guard |
| `<USER_ID>` | the `id` of a created user | chosen by the builder in the case's own id range and sent explicitly; never asserted as a literal |
| `<PASSWORD>` | a synthetic password the builder generates | never a real credential, never written in docs |
| `<SESSION>` | the session string login returns | taken from the response; never asserted as a literal |

Facts for the design and automate phases:

- The pack has **no user client, builder, Object Mother entry, fixture, state model or seed
  guard** yet; the resources table of the `petstore-api` skill says "none yet". Automate has to add
  them before any user case runs. The existing seed guard covers pets only.
- The image ships ten seed users (M-04). They are shared data like the seed pets: a case that
  writes to one would corrupt it for every later run until the container restarts (compare PN-06).
  Cases should create their own users instead.
- **Every create sends a unique `username` and an explicit `id`** in the case's own range. A
  repeated username silently replaces another case's user (PN-20), and an omitted id is stored as
  `0`, shared with every other id-less user (PN-25).
- `PUT` replaces the whole record (PN-25), so update cases send the full body; a partial body is a
  case of its own (AC-13). A `PUT` that changes `username` moves the record: cleanup must delete
  the new name (W-22).
- `DELETE` answers `200` whether or not the user existed (PN-22), so cleanup confirms with a read
  that answers `404`, not with the delete's status.
- The PN-19 reproduction (`POST /user` with `{}`) is `@destructive` and needs a service restart
  afterwards; no other case may share its run (see
  [Edge and negative cases](#edge-and-negative-cases)).
- The usernames `login` and `logout` are out of bounds for cases (W-37, W-38).
- Evidence: the pack's `identity_fields` (`service.json`) pseudonymize `username`, `firstName`,
  `lastName`, `email` and `phone` in bodies and query values, and the core redaction masks
  `password` by key name (`helpers/redact.ts`). A `username` in the **path** is not pseudonymized,
  so cases should use builder-made names, never personal data.
- The current base client sends no `Accept`, which yields `application/xml` on a `404`; a user
  client that sends `Accept: application/json` gets `application/json` instead, which the
  `not-found` envelope (content type `application/xml`) would reject (M-01, M-02; G6).

## State transitions

User record:

| From | Operation | To | Source |
|---|---|---|---|
| absent | `POST /user` or `createWithList` | present | spec; W-01, W-17 |
| present | `PUT /user/{username}` | present, whole record replaced | spec; W-19, W-20 (PN-25) |
| present | `PUT /user/{username}` with another body `username` | absent under the old name, present under the new | W-22 (PN-25) |
| present | `DELETE /user/{username}` | absent | spec; W-27 |
| absent | `GET` or `PUT /user/{username}` | absent, `404` | spec; M-01, W-25, W-26 |
| absent | `DELETE /user/{username}` | absent, `200` (spec: `404`) | W-28, W-29 (PN-22) |
| present | `POST /user` with the same `username` | present, replaced by the new body (`200`) | W-15 (PN-20) |
| any | `POST /user` with `{}` | a nameless record no operation can reach; unknown-name reads `500` until restart | W-39 (PN-19) |

Repeats: a second `DELETE` answers `200` and the user stays absent (W-28; PN-22); a repeated
create with the same `username` leaves one record (W-15, W-16). A repeated `PUT` with the same body is
expected to leave the same state (spec reading; not measured).

Session: the spec implies logged-out, logged-in, logged-out. Measured, there is no observable
session state: every login succeeds and returns a new value (M-11, M-13), every logout succeeds
without one (M-14), and nothing accepts the session afterwards. Login and logout are therefore
idempotent in effect, and no transition between them can be refused.

## Measurements

All read-only, against `local` (`http://localhost:8080/api/v3`), on 2026-10-10, with `fetch` from
a throwaway Node script. Login used only the synthetic username `qa-probe-nobody` and a synthetic
`<PASSWORD>`. User values seen are not reproduced; only shapes, lengths and non-identifying fields.

| Id | Request | Result |
|---|---|---|
| M-01 | `GET /user/qa-probe-nobody`, `Accept: application/json` | `404`, `Content-Type: application/json`, body the 14-byte plain text `User not found`, which is not JSON |
| M-02 | the same with `Accept: application/xml`, `Accept: text/plain`, and no `Accept` | `404`, `Content-Type: application/xml`, same plain-text body |
| M-03 | `GET /pet/<UNUSED_ID>` and `GET /store/order/<UNUSED_ID>`, `Accept: application/json` (sibling check) | `404`, `application/json`, plain text `Pet not found` / `Order not found` |
| M-04 | `GET /user/<SEED_USERNAME>` for candidate seed names; also the spec's example username in the `User` schema | ten seed users answer `200`; ids 1 to 10; `userStatus` 1, 2, 3 repeating; all eight `User` fields present and non-empty, `password` included. The schema's example username answers `404` |
| M-05 | `GET /user/<SEED_USERNAME>`, `Accept: application/xml` | `200`, `application/xml`, root element `User` (schema declares XML name `user`), all eight fields |
| M-06 | `GET /user/<SEED_USERNAME>` upper-cased, and with a trailing `%20` | `404` both |
| M-07 | `GET /user/<SEED_USERNAME>` with header `api_key: qa-probe-junk` | `200`, same body as without the header |
| M-08 | `GET /user/` and `GET /user` | `405`, `application/json`, `{"code":405,"message":"HTTP 405 Method Not Allowed"}` |
| M-09 | `GET /user/{username}` with `%20`, `a` x 1024, `probe%2Fslash`, a quote, `' OR '1'='1`, `<script>x</script>`, non-ASCII letters, `%25`, `qa;probe=1`, `createWithList` (all URL-encoded) | `404` `User not found` for every one; no `400`, no `500`, no internal detail |
| M-10 | `GET /user/{username}` with `a` x 8192 | `414`, `text/html;charset=iso-8859-1`, the web server's "URI Too Long" page, no CORS headers |
| M-11 | `GET /user/login` with: no parameters; `username` only; `password` only; `qa-probe-nobody` + `<PASSWORD>`; both empty; `<SEED_USERNAME>` + a wrong `<PASSWORD>`; `' OR '1'='1` as username; a 4096-character username | `200` for all; body `Logged in user session: <SESSION>` (a 17 to 19 digit number); `X-Rate-Limit: 5000`; `X-Expires-After` in the form `Sat Oct 10 HH:mm:ss GMT 2026` (Java date text), 60 minutes after the request |
| M-12 | `GET /user/login` with `Accept` json, xml and text/plain | content type `application/json`, `application/xml`, `application/json`; the body is the same plain text in all three, so the json answer does not parse as JSON |
| M-13 | three consecutive `GET /user/login?username=qa-probe-nobody` | three different `<SESSION>` values |
| M-14 | `GET /user/logout` with `Accept` json and xml, and with an unrelated query parameter | `200`, plain text `User logged out` (15 bytes), content type following `Accept`, no `Set-Cookie` |
| M-15 | `HEAD /user/qa-probe-nobody`, `HEAD /user/<SEED_USERNAME>`, `HEAD /user/logout` | `404`, `200`, `200` with the headers of the matching `GET` and no body |
| M-16 | `OPTIONS` on `/user`, `/user/qa-probe-nobody`, `/user/login`, `/user/createWithList`; and a CORS preflight for `PUT` from an arbitrary origin | `200`, body `application/vnd.sun.wadl+xml`; `Allow` is `POST,OPTIONS`, `HEAD,DELETE,GET,OPTIONS,PUT`, `HEAD,GET,OPTIONS`, `POST,OPTIONS`. Every answer except M-10 carries `Access-Control-Allow-Origin: *`, methods `GET, POST, DELETE, PUT` and headers `Content-Type, api_key, Authorization` |
| M-17 | every request above | `Server: Jetty(9.4.58.v20250814)` |
| M-18 | 20 sequential `GET /user/<SEED_USERNAME>` | p50 3.0 ms, p95 3.8 ms, max 6.4 ms; the first request of the session took 128 ms (cold) |
| M-19 | `node scripts/swagger-digest.mjs --live --check --service petstore` | the served document matches `docs/discovery/petstore-digest.json` structurally |

Where a measurement and the spec differ, the measurement is what callers get: M-11 against the
declared `400` and `date-time`, M-12 against the declared `string` body, M-05 against the XML name,
M-01 and M-12 against the declared media types.

## Write measurements

An execution-mode run on 2026-10-10, approved by the owner (A-03), against `local` only, with
`fetch` from a throwaway Node script and `Accept: application/json`. It wrote only users it created:
usernames with a run prefix (`<USERNAME>`, `<OTHER_USERNAME>` below), ids in the run's own range,
synthetic field values; the seed users were read before and after and stayed byte-identical. Every
run username was deleted and read back as `404` before W-39. W-39 left the nameless record of
PN-19, which only a restart of the service cleared; the lead restarted it, after which unknown
names answered `404` again. No credential was sent. Values are not reproduced: "as sent" means the
read-back equals the request field by field.

| Id | Request | Observed |
|---|---|---|
| W-01 | `POST /user`, full JSON body | `200`, `User` echoed; read-back as sent |
| W-02 | `POST /user`, full body as `application/x-www-form-urlencoded` | `200`; read-back as sent except `password`, which differs from the value sent (G20) |
| W-03, W-03b | `POST /user` `{"username": "<USERNAME>"}`, twice with two names | `200`; `id` `0` and `userStatus` `0` for both, other fields absent |
| W-04 | `POST /user`, full body plus `role` and `isAdmin` | `200`; unknown properties neither echoed nor read back |
| W-05, W-06, W-07, W-10, W-11, W-11c | `POST /user` with `id` as text, `firstName` or `phone` as an object, `lastName` as an array, `userStatus` as text, `id` beyond int64 | `400` `input-error`, message `Input error: unable to convert input to io.swagger.petstore.model.User`; nothing stored |
| W-08, W-09, W-11b | `POST /user` with `email` a number, `password` a boolean, `userStatus` 1.5 | `200`; stored coerced: text, text, a different integer |
| W-12, W-12b | `POST /user` truncated JSON; JSON with a double comma | `400`, same message; nothing stored |
| W-13 | `POST /user` valid JSON sent as `text/plain` | `415` `{"code":415,"message":"HTTP 415 Unsupported Media Type"}`; nothing stored |
| W-14, W-15 | `POST /user` twice with one `<USERNAME>`, the second with another id and names | `200` both; read-back equals the second body |
| W-16, W-16b | `DELETE /user/<USERNAME>` after W-15, twice | `200` both, empty body; read `404` after the first |
| W-17 | `POST /user/createWithList` with two users | `200`, a JSON array of two; both read back as sent |
| W-18 | `POST /user/createWithList` `[]` | `400`, plain text `No User provided. Try again?` |
| W-18b | `POST /user/createWithList`, one valid user and one with `userStatus` as text | `400` `input-error` naming `User[]`; neither stored |
| W-19 | `PUT /user/<USERNAME>`, full body with path username and stored id, `firstName` changed | `200`, `User` echoed; read-back as sent |
| W-20 | `PUT /user/<USERNAME>` `{"username", "lastName"}` after all fields were set, `userStatus` 3 | `200`; read-back: other strings absent, `id` `0`, `userStatus` `0` |
| W-21 | `PUT /user/<USERNAME>`, full body with another id from the run range | `200`; read-back has the new id |
| W-22 | `PUT /user/<USERNAME>`, full body with `username` `<OTHER_USERNAME>` | `200`; `<USERNAME>` reads `404`, `<OTHER_USERNAME>` reads as sent |
| W-23, W-24, W-24b | `PUT /user/<USERNAME>` truncated JSON; `userStatus` as text; `firstName` as an object | `400` `input-error`; record unchanged |
| W-25 | `PUT /user/<UNKNOWN_USERNAME>`, body with the same name | `404` `User not found`; nothing created |
| W-26 | `PUT /user/<UNKNOWN_USERNAME>`, body naming another unknown user | `404`; neither name created |
| W-27, W-28 | `DELETE /user/<USERNAME>`, twice | `200` both, empty body, no content type; read `404` |
| W-29 | `DELETE /user/<UNKNOWN_USERNAME>` | `200` |
| W-30, W-31, W-32 | `GET /user/login` for a created user with its `<PASSWORD>`, a wrong `<PASSWORD>`, no password | `200` for all three, same body shape and headers as M-11; the user reads back unchanged |
| W-33 to W-36 | `POST /user` with `userStatus` 0, 99, -1, `<INT32_MAX>`, then login with each user's `<PASSWORD>` | `200`; stored as sent; login identical for all |
| W-37, W-38 | after `GET /user/%6Cogin` and `GET /user/%6Cogout` answered `404`: `POST /user` with username `login`, then `logout`; reads; `DELETE /user/login`, `DELETE /user/logout` | `200`; `GET /user/login` and `GET /user/logout` still run the session operations; the users read back only through the encoded paths; deletes `200`, encoded reads `404` afterwards |
| W-39 | `POST /user` `{}` | `200`, a `User` with `id` `0`, `userStatus` `0`, no username; afterwards `GET /user/<UNKNOWN_USERNAME>` answers `500`, seed users still `200` (PN-19) |
| W-40 | `POST /user` with an empty body and `Content-Type: application/json` | `400`, plain text `No User provided. Try again?` |
| W-41 | `POST /user` `{"id", "firstName"}`, no username (after W-39) | `500` `server-error` with a log reference |
| W-42 | `POST /user` with `username` as an object (after W-39) | `400` `input-error` |
| W-42b | `POST /user` with `username` `null` (after W-39) | `500` `server-error` with a log reference |

Where these differ from the spec, the measurement is what callers get: W-15 (no outcome declared
for duplicates), W-17 (array instead of one `User`), W-19 (body where none is declared), W-20 to
W-22 (replace, rename, re-key), W-28 and W-29 (`200` instead of `404`), W-39 (a stored body that
breaks reads).

## Gaps and discrepancies

Issues were searched in the local tracker (`docs/tracker/local/`) on 2026-10-10.

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | Create, update and delete say "only by the logged in user", but no operation declares security and the session has no declared transport. Measured: every write applies without a credential (W-01..W-42b). | spec prose versus `security`; W-NN | PN-05 (searched, none) |
| G2 | Reads return the stored `password` to any caller, anonymous included. Contract-conforming (the schema has the field) but an information exposure. | M-04, M-05, PN-05 | PN-13, `LOCAL-3` |
| G3 | Login answers `200` with a fresh session for any input, including no credentials and a wrong password; the declared `400` is never reached. Confirmed with a created user: right, wrong and no password answer alike. | M-11, M-13, W-30..W-32 | PN-12, `LOCAL-4` |
| G4 | `X-Expires-After` is Java date text, not the declared `date-time`. | M-11 | PN-12, `LOCAL-4` |
| G5 | Login's body is plain text; with `Accept: application/json` it is labelled JSON but is not a JSON string, as the declared `string` schema needs. | M-12 | PN-12, `LOCAL-4` |
| G6 | The plain-text `404` is labelled with the `Accept` media type (`application/json` when asked), not always `application/xml`; affects pet and order too. PN-02 now records both cases; the `not-found` envelope still names only `application/xml` (A-08). | M-01, M-02, M-03 | PN-02 (searched, none) |
| G7 | XML root element is `User`; the schema declares XML name `user`. | M-05 | PN-14 (searched, none) |
| G8 | Empty username and the bare collection path answer `405` with a `{code, message}` body; `405` is undeclared and absent from the envelope catalogue. | M-08 | PN-08 (searched, none) |
| G9 | A path of about 8 KB answers `414` as an HTML page without CORS headers; undeclared. The 1024-character matrix probe gets `404`, which is a miss, not a refusal. | M-09, M-10 | PN-08 (searched, none) |
| G10 | Every answer names the web server and its version; `OPTIONS` returns a WADL description; `HEAD` and `OPTIONS` are served though undeclared. | M-15, M-16, M-17 | PN-07 (searched, none) |
| G11 | No credential is enforced, so an authorization matrix cannot be demonstrated for users. | PN-05, M-07 | PN-05 |
| G12 | The declared `400` "Invalid username supplied" of `GET` and `DELETE /user/{username}` was not produced by any input; what triggers it is unknown. `DELETE` of an unknown name answers `200` (PN-22). | spec versus M-09, W-29 | searched, none |
| G13 | **Resolved:** `createWithList` answers with the whole array, not the declared single `User`, and stores every element; an unreadable element rejects the whole array. | spec; W-17, W-18b | PN-25 (searched, none) |
| G14 | **Resolved:** users named `login` and `logout` can be created; `GET` on those paths still runs the session operations, so they are readable only through a percent-encoded path. Out of bounds for cases. | W-37, W-38 | searched, none |
| G15 | **Resolved:** only `username` is needed; an omitted `id` and `userStatus` are stored as `0`; a body without `username` is never refused cleanly (`{}` stored, PN-19). | W-01..W-13, W-39..W-42b | PN-19, PN-25 (searched, none) |
| G16 | **Resolved:** `PUT` replaces the whole record and honors a body `username` or `id` that differs from the path: the user is renamed or re-keyed. | W-19..W-22 | PN-25 (searched, none) |
| G17 | The `PUT` path parameter is described as "name that need to be deleted". | spec prose | searched, none |
| G18 | **Resolved:** creating an existing `username` answers `200` and replaces the stored record. | W-14..W-16 | PN-20 (searched, none) |
| G19 | **Resolved** by the write run: status, body, stored state and error kinds of every write operation are in [Write measurements](#write-measurements). Open remainders are G20 to G24. | W-01..W-42b | PN-19 to PN-22, PN-25 (searched, none) |
| G20 | A form-encoded create stores a `password` different from the one sent; every other field is stored as sent. Unexplained, not reproduced. | W-02 | searched, none |
| G21 | An empty body (`POST /user`) or empty array (`createWithList`) answers `400` with the plain text `No User provided. Try again?`: an undeclared code in a format the envelope catalogue does not hold. | W-18, W-40 | searched, none |
| G22 | Bodies with fields but no `username`, or a `null` username, answered `500` only while the PN-19 record existed; whether they answer `500` on a clean service is unconfirmed. | W-41, W-42b | PN-19, `LOCAL-1` |
| G23 | Unknown properties (`role`, `isAdmin`) are accepted and silently discarded; the spec does not say whether extra properties are allowed. | W-04 | searched, none |
| G24 | Not measured: XML request bodies (declared for `POST /user` and `PUT`), a form-encoded `PUT`, `null` per field other than `username`, `userStatus` beyond int32, duplicates inside one `createWithList` array. | spec; W-NN | searched, none |

## Out of scope

- Pets and orders, which are other features of this pack; the sibling observation M-03 is
  recorded here only because it qualifies PN-02.
- Further write measurement beyond the 2026-10-10 run: what it left open is G20, G22 and G24, and
  each needs its own execution-mode run.
- The OAuth2 `petstore_auth` flow, which no user operation references.
- Enforcement of the advertised rate limit (`X-Rate-Limit: 5000`): the owner states no limit, and
  probing it means thousands of calls.
- The public demo environment, which is read-only for this suite.

## Assumptions to confirm

Open:

- **A-07** The seed users are restored only by restarting the container, as with the seed pets.
  The restart after PN-19 showed that a restart clears records a run added; whether it also
  restores a changed seed user was not measured.
- **A-08** PN-02 now records that the `not-found` content type follows `Accept`. Still open:
  should the `not-found` envelope in `error-envelopes.json` accept `application/json` as well?
  Until it does, a user client that asks for JSON fails the envelope check on every `404` (G6).

Answered:

- **A-01** Answered: the feature code `USER` and the title "Users and sessions" were approved at
  the intake review gate.
- **A-02** Decided by the owner: findings such as G2 and G3 are triaged as defects. Three of
  this feature's were filed in the local tracker by `qa-report-bug` on 2026-10-10: `LOCAL-1`
  (PN-19), `LOCAL-3` (PN-13) and `LOCAL-4` (PN-12). The other gaps were searched there with no
  match.
- **A-03** Answered: the owner approved the write run, and it ran on 2026-10-10
  ([Write measurements](#write-measurements)).
- **A-04** Answered: a second `DELETE` of the same user answers `200`, not `404`, and so does a
  delete of a name never created (W-28, W-29; PN-22).
- **A-05** Answered as far as it can be observed: `userStatus` 0, -1, 99 and int32 max are stored
  and change nothing in reads or login (W-33..W-36). Its meaning stays undeclared.
- **A-06** Answered: users named `login` and `logout` can be created; `GET` on those paths runs
  the session operations, so the users are readable only through a percent-encoded path, and
  `DELETE` removes them (W-37, W-38). Cases do not use these names.
