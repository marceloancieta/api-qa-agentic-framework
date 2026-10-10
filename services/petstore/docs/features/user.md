# Users and sessions contract

| | |
|---|---|
| Pack and version | `petstore` `v3` (Swagger Petstore 1.0.28, image `swaggerapi/petstore3:1.0.28`) |
| Feature code | `USER` (case ids `TC-USER-NN`), from backlog PET-01; to be confirmed at the review gate |
| Endpoints | `POST /user`<br>`POST /user/createWithList`<br>`GET /user/login`<br>`GET /user/logout`<br>`GET /user/{username}`<br>`PUT /user/{username}`<br>`DELETE /user/{username}` |
| Sources | [`openapi.json`](../../openapi.json) (tracked copy; the live document at `local` matched the tracked digest on 2026-10-10), [contract notes](../contract-notes.md) PN-01..PN-16, [error envelopes](../../error-envelopes.json), the `petstore-api` skill, read-only measurements M-01..M-19 below. No issue or intake request. No access to the implementation's code. |
| Intake date | 2026-10-10 |

How to read the citations: **spec** is the OpenAPI document; **M-NN** is a measurement in
[Measurements](#measurements); **PN-NN** is an entry of the [contract notes](../contract-notes.md);
**A-NN** is an assumption listed in [Assumptions to confirm](#assumptions-to-confirm). Sources 2
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
- Behaviour: **unmeasured** (write).

### `POST /user/createWithList` (createUsersWithListInput)

- Body: array of `User`, `application/json` only; not marked required (spec).
- `200`: a single `User`, not an array (spec; see G13).
- Behaviour: **unmeasured** (write).

### `GET /user/login` (loginUser)

- Query `username` and `password`, both strings, both **optional** (spec).
- `200`: body `string` as json or xml, with headers `X-Rate-Limit` (integer, int32, "calls per hour
  allowed by the user") and `X-Expires-After` (string, `date-time`, "date in UTC when token
  expires") (spec).
- `400`: "Invalid username/password supplied", no body (spec).
- Measured: `200` for every input tried, including none (M-11); the body is plain text and the
  expiry header is not a `date-time` (M-11, M-12; G3, G4, G5).

### `GET /user/logout` (logoutUser)

- No parameters, no credential. `200` without a declared body (spec).
- Measured: `200` with a plain-text body whatever the prior state (M-14).

### `GET /user/{username}` (getUserByName)

- Path `username`, string, required, no constraints. Its description names an example user for
  testing (spec).
- `200`: `User` (json or xml). `400` "Invalid username supplied". `404` "User not found" (spec).
- Measured: `404` with a plain-text body for every unknown name, including malformed-looking ones;
  no input tried produced `400` (M-01, M-09; G12). The `200` body includes `password` (M-04; G2).

### `PUT /user/{username}` (updateUser)

- Path `username`, string, required. Its description reads "name that need to be deleted", a prose
  copy of the delete operation (spec; G17).
- Body: `User`, json, xml or form; not marked required (spec).
- `200` without body, `400` "bad request", `404` "user not found" (spec).
- Behaviour: **unmeasured** (write). Which `username` wins when path and body differ, and whether
  `id` can be changed, are open (G16).

### `DELETE /user/{username}` (deleteUser)

- Path `username`, string, required (spec).
- `200` "User deleted" without body, `400` "Invalid username supplied", `404` "User not found"
  (spec).
- Behaviour: **unmeasured** (write).

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
2. `POST /user` creates one user from a `User` body and answers `200` with a `User` (spec). What it
   requires, whether it honours a client-sent `id`, and what a duplicate `username` does are
   unknown (G15, G18; unmeasured).
3. `POST /user/createWithList` creates the users of an array and answers `200` with one `User`
   (spec). Which user it returns, and whether a failing element rolls back the others, are unknown
   (G13; unmeasured).
4. `GET /user/{username}` returns the stored user, or `404` when there is none (spec, M-01, M-04).
5. `PUT /user/{username}` replaces the user named in the path and answers `200` without a body;
   unknown user `404`, bad request `400` (spec; unmeasured).
6. `DELETE /user/{username}` removes the user and answers `200`; unknown user `404` (spec;
   unmeasured).
7. Create, update and delete "can only be done by the logged in user" (spec prose), but no
   operation declares security and the session string from login has no declared way to be sent
   back (spec). Reads need no credential and ignore `api_key` (M-04, M-07, PN-05).
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
    G8). No error body tried leaked a stack trace or query (M-09).

## Acceptance criteria

Criteria for writes are as the spec states them and stay unverified until a write is measured.

- **AC-01** Given a user created by the case, when it is read by its `username`, then the answer is
  `200`, the body matches `User`, and every field sent is returned with the value sent (rules 2, 4).
- **AC-02** Given a well-formed `username` that names no user, when it is read, then the answer is
  `404` with the `not-found` envelope for the `Accept` sent (rules 4, 12; M-01, M-02).
- **AC-03** Given a user created by the case, when it is updated through its path with a changed
  business field, then the answer is `200` and a read-back shows only that field changed (rule 5).
- **AC-04** Given a user created by the case, when it is deleted, then the answer is `200`, a read
  answers `404`, and a second delete answers `404` (rules 5, 6; A-04).
- **AC-05** Given an array of users built by the case, when it is sent to `createWithList`, then the
  answer is `200` and each user can be read back (rule 3).
- **AC-06** Given valid credentials of a user created by the case, when it logs in, then the answer
  is `200` with a non-empty session string, `X-Rate-Limit` as an int32 and `X-Expires-After` as a
  `date-time` in the future (rule 8). The `date-time` part fails today (G4).
- **AC-07** Given credentials that match no user, when they are sent to login, then the answer is
  `400` (spec). Measured today: `200` (M-11; G3).
- **AC-08** Given any state, when logout is called, then the answer is `200` (rule 9; M-14).
- **AC-09** Given any user, when it is read anonymously, then the body never carries the stored
  password (security expectation, not stated by the spec; M-04 shows it does today; G2).

## Access and ownership

- **Credentials.** None declared for any user operation (spec), none enforced on reads (M-04, M-07)
  and, for the operations measured so far, on any Petstore operation (PN-05). The `api_key`
  header is accepted with any value. The login session cannot be presented anywhere: no header,
  cookie or parameter is declared for it, and login sets no cookie (M-11, M-14).
- **Actors.** Only `default` and `anonymous` exist for this pack, and for the user operations they
  behave the same (PN-05, M-07). No named actor in `api.actors` would change that.
- **Object-level authorization (BOLA).** The only object identifier is the path `username`; the
  `id` and `username` in a `PUT` body are identity fields as well. Can one caller read, update or
  delete another user by name?
  - Read: **yes**, measured. An anonymous caller reads any seed user, password included (M-04,
    G2).
  - Update and delete: by the contract, **yes**, because nothing is declared that could refuse
    them; **unmeasured**. A write-mode run against users that run creates would settle it.
  - What PN-05 means here: the API has no notion of "the logged in user" that a request could be
    checked against, so an actor-based authorization matrix (user A acting on user B's record,
    expecting a refusal) cannot pass or fail meaningfully on Petstore. Such cases would only record
    that access is not separated. The matrix itself belongs to the second pack planned in backlog
    FUT-07. What can be designed here is the exposure itself (G2, G3) and declared-versus-honored
    on `id` and `username` in `PUT` (does a body rename or re-key the user in the path?).
- **Function-level authorization.** No roles are declared; `userStatus` is undocumented and may or
  may not carry privilege (A-05).

## Edge and negative cases

From the spec, the computed analysis and the measurements; design decides which become cases.

- **Path `username`.** Empty (`GET /user/` answers `405`, M-08); space only, quote, statement-like
  text, script fragment, non-ASCII, a literal `%`, an encoded slash, a matrix parameter, 1024
  characters (all `404`, M-09); around 8 KB (`414` HTML page from the web server, M-10); case and
  trailing-space variants (M-06). No input produced the declared `400` (G12). Reserved names:
  `login` and `logout` are fixed routes, so a user with one of those names cannot be read through
  `GET /user/{username}` (spec routing; A-06). `createWithList` is routed to `{username}` for
  `GET` (M-09).
- **Bodies (unmeasured).** Empty body, `{}`, body without `username`, wrong JSON type per field,
  `null` per field, unknown property, `id` beyond int64, `userStatus` beyond int32 or fractional,
  malformed and truncated JSON, wrong content type, an XML and a form body for `POST /user` and
  `PUT`, and an XML body for `createWithList` (json only declared). PN-01 records that a wrong
  JSON type in a pet body answers `500`; the same code path may handle users (sibling check, L-37).
- **Arrays (unmeasured).** Empty array, array of one, duplicate usernames inside one array, a
  username that already exists, a non-array body.
- **Login.** No parameters, one of the two, empty values, unknown user, wrong password for an
  existing user, injection-like and very long values (all `200`, M-11). A login with valid
  credentials of a created user cannot be distinguished from these today.
- **Shared behaviour.** `Accept` variants (json, xml, text/plain, none) change the content type of
  success and error answers (M-02, M-12); `HEAD` and `OPTIONS` are served on every user path
  although undeclared (M-15, M-16); every answer carries the web server's name and version
  (M-17); `OPTIONS` returns a WADL description of the resource (M-16).
- **Information exposure.** Stored password in reads (G2); server version header and WADL (G10).
  Error bodies seen so far are fixed texts without internals (M-09).

## Test data

| Placeholder | Stands for | How a case gets it |
|---|---|---|
| `<USERNAME>` | a user the case owns | created by the case from a builder, unique per run (seeded `rng`/`faker`) |
| `<OTHER_USERNAME>` | a second user the case owns, for cross-user reads and writes | created by the case like `<USERNAME>` |
| `<UNKNOWN_USERNAME>` | a well-formed name that was never created | built per run with a prefix no builder uses |
| `<SEED_USERNAME>` | one of the ten seed users of the image (ids 1 to 10, M-04) | read-only use; any write needs a resource guard |
| `<USER_ID>` | the `id` of a created user | taken from the response or read-back, never asserted as a literal |
| `<PASSWORD>` | a synthetic password the builder generates | never a real credential, never written in docs |
| `<SESSION>` | the session string login returns | taken from the response; never asserted as a literal |

Facts for the design and automate phases:

- The pack has **no user client, builder, Object Mother entry, fixture, state model or seed
  guard** yet; the resources table of the `petstore-api` skill says "none yet". Automate has to add
  them before any user case runs. The existing seed guard covers pets only.
- The image ships ten seed users (M-04). They are shared data like the seed pets: a case that
  writes to one would corrupt it for every later run until the container restarts (compare PN-06).
  Cases should create their own users instead.
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
| absent | `POST /user` or `createWithList` | present | spec; unmeasured |
| present | `PUT /user/{username}` | present, changed | spec; unmeasured |
| present | `DELETE /user/{username}` | absent | spec; unmeasured |
| absent | `GET`, `PUT` or `DELETE /user/{username}` | absent, `404` | spec; `GET` measured (M-01) |
| present | `POST /user` with the same `username` | unknown: refused, duplicated or overwritten | G18; unmeasured |

Repeats: a second `DELETE` is expected to answer `404` (A-04); a repeated `PUT` with the same body
is expected to leave the same state (spec reading; unmeasured).

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

## Gaps and discrepancies

The tracker provider is `none` in the active configuration, so no issue could be searched.

| # | Gap | Source | Issue |
|---|---|---|---|
| G1 | Create, update and delete say "only by the logged in user", but no operation declares security and the session has no declared transport. | spec prose versus `security` | no tracker configured |
| G2 | Reads return the stored `password` to any caller, anonymous included. Contract-conforming (the schema has the field) but an information exposure. | M-04, M-05, PN-05 | PN-13 (no tracker configured) |
| G3 | Login answers `200` with a fresh session for any input, including no credentials and a wrong password; the declared `400` is never reached. | M-11, M-13 | PN-12 (no tracker configured) |
| G4 | `X-Expires-After` is Java date text, not the declared `date-time`. | M-11 | PN-12 (no tracker configured) |
| G5 | Login's body is plain text; with `Accept: application/json` it is labelled JSON but is not a JSON string, as the declared `string` schema needs. | M-12 | PN-12 (no tracker configured) |
| G6 | The plain-text `404` is labelled with the `Accept` media type (`application/json` when asked), not always `application/xml`; affects pet and order too. PN-02 and the `not-found` envelope describe only the `application/xml` case. | M-01, M-02, M-03 | PN-02 |
| G7 | XML root element is `User`; the schema declares XML name `user`. | M-05 | PN-14 (no tracker configured) |
| G8 | Empty username and the bare collection path answer `405` with a `{code, message}` body; `405` is undeclared and absent from the envelope catalogue. | M-08 | PN-08 (no tracker configured) |
| G9 | A path of about 8 KB answers `414` as an HTML page without CORS headers; undeclared. The 1024-character matrix probe gets `404`, which is a miss, not a refusal. | M-09, M-10 | PN-08 (no tracker configured) |
| G10 | Every answer names the web server and its version; `OPTIONS` returns a WADL description; `HEAD` and `OPTIONS` are served though undeclared. | M-15, M-16, M-17 | PN-07 (no tracker configured) |
| G11 | No credential is enforced, so an authorization matrix cannot be demonstrated for users. | PN-05, M-07 | PN-05 |
| G12 | The declared `400` "Invalid username supplied" of `GET` and `DELETE /user/{username}` was not produced by any read-only input; what triggers it is unknown. | spec versus M-09 | no tracker configured |
| G13 | `createWithList` takes an array and declares a single `User` as its answer; which one is unknown. | spec | no tracker configured |
| G14 | Usernames `login` and `logout` collide with fixed routes on `GET`. | spec routing, A-06 | no tracker configured |
| G15 | Nothing in `User` is required and the bodies are optional; what the API demands to create a user is unknown. | spec; unmeasured | no tracker configured |
| G16 | `PUT` with a body `username` or `id` different from the path: rename, re-key, refusal or silent discard is unknown. | spec; unmeasured | no tracker configured |
| G17 | The `PUT` path parameter is described as "name that need to be deleted". | spec prose | no tracker configured |
| G18 | No outcome is declared for creating a `username` that exists (no `409`, no `400`). | spec; unmeasured | no tracker configured |
| G19 | Every write outcome (status, body, stored state, error kinds, PN-01-like `500`s) is unmeasured. | modes rule | no tracker configured |

## Out of scope

- Pets and orders, which are other features of this pack; the sibling observation M-03 is
  recorded here only because it qualifies PN-02.
- Measuring writes. That needs an execution-mode run against users the run creates (see the
  questions below).
- The OAuth2 `petstore_auth` flow, which no user operation references.
- Enforcement of the advertised rate limit (`X-Rate-Limit: 5000`): the owner states no limit, and
  probing it means thousands of calls.
- The public demo environment, which is read-only for this suite.

## Assumptions to confirm

- **A-01** The feature code `USER` and the title "Users and sessions" (backlog PET-01).
- **A-02** Should G3 (login accepts anything) and G2 (password returned) be treated as defects to
  file, or as properties of a demo API recorded `by-design` like PN-05? The answer decides whether
  their cases are known gaps or plain observations.
- **A-03** Is a write-mode measurement run wanted before design, to settle G15, G16, G18 and G19
  and the BOLA write half? It would create its own users, write the findings back here, and never
  touch the seed users.
- **A-04** A second `DELETE` of the same user answers `404` (spec reading, unmeasured).
- **A-05** `userStatus` carries no privilege; its values 1 to 3 in the seed data have no declared
  meaning.
- **A-06** A user named `login` or `logout` can be created but not read back by `GET` (inferred
  from routing; unmeasured).
- **A-07** The seed users are restored only by restarting the container, as with the seed pets.
- **A-08** Should G6 be folded into PN-02 and the `not-found` envelope (content type follows
  `Accept`), or kept as a separate note? Today a user client that asks for JSON would fail the
  envelope check on every `404`.
