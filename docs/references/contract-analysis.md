# Contract analysis

How to read an API contract when deciding what to test. The intake and design skills apply it, and
the tools in [contract-tooling.md](../contract-tooling.md) compute the parts that can be computed.
Where this page and a tool disagree about a number, the tool is right (L-08).

## 1. The spec is where analysis starts, not where it ends

An OpenAPI document describes what the API **declares**. It is often silent about what the API
**demands** (required fields left undeclared) and about what it **does** (fields accepted and then
ignored, values coerced, side effects). Designing from the schema alone under-covers in a way nobody
notices, because the missing cases leave no trace (L-38).

### Completing a constraint

For every constraint the schema leaves open, consult these sources in order. The first one with an
answer settles it; write down which one that was:

1. **The spec's own prose**: operation summaries and descriptions often state a default, a mutual
   exclusion or a limit that no keyword expresses.
2. **Declared models in the implementation**: validation annotations, DTO types, enums.
3. **The implementation**: what reaches storage, what is hard-coded, what is dropped. When it
   disagrees with the models, the implementation is what callers get.
4. **Documentation, tickets and the owner**: business rules and acceptance criteria.
5. **Observation**: when no source defines the behaviour, design a behaviour-defining probe. It
   records what the API does without asserting a guess, and the first reviewed result becomes the
   baseline (L-56).

Sources 2 and 3 need access to the code. When there is none, say so in the contract doc and go
straight to 4 and 5. An open question is written down, never guessed (L-38).

Observation in the design phase is **read-only** (`.claude/rules/modes.md`). How a write behaves is
measured by an execution-mode run against data that run created; its findings go into the
contract doc, and design starts after that.

### Completions point at drift

When the implementation enforces something the spec never mentions, the spec is wrong, even if the
behaviour itself is fine. The case that covers it carries `@contract-drift` and states both sides
in its expected result.

| Shape | What to design |
|---|---|
| The spec says optional; the API refuses the request without it | a negative asserting the real requirement |
| The spec accepts a field; the API never stores it | a declared-versus-honored case (section 7) |
| The spec declares no value set; the API restricts the values | an invalid-value negative for the field |

## 2. Fields and parameters

- **Required fields**: one positive case per valid combination of required fields, and one negative
  per missing required field. Remove one field per case, so a rejection can be attributed to it.
- **Path parameters** are always required: one case with a malformed value and one with a
  well-formed value that names nothing.
- **Mutual exclusion** ("exactly one of a, b, c"): one positive per option, one negative with none,
  one with two.
- **Overloaded operations** (create-or-update, several accepted body shapes): one positive per
  accepted shape and a negative for an unsupported combination. A decision table is often the
  clearest way to write these down (section 6).

## 3. Value sets and formats

A closed set of values may be declared as `enum`, as `const`, or as a `pattern` that is nothing but
anchored alternatives such as `^(asc|desc)$` (L-54). All three are **value sets**: test one value
per behaviour they select and one value outside the set. A `pattern` with character classes,
escapes or quantifiers describes a **format**: test it with boundary values.

`npm run contract:value-sets` lists every value set of a pack and generates `generated/enums.ts`.
Specs and builders take literal values from there, never from memory: a value picked by hand may
be outside the set, and the API refusing it would be mistaken for a defect (L-36).

## 4. Responses and error codes

- The schema of the asserted status is the expected result. Assert the business fields the case is
  about. Never assert the literal value of a generated identifier or timestamp: take the identifier
  from the response that created the resource, and compare state with the field buckets (L-53).
- Collections: a page honours its filters and limits; a valid query that matches nothing returns an
  empty collection, not an error.
- Check declared codes **in both directions** (L-33). Every declared code should be reachable by
  some case, and no case should get an undeclared code. `npm run contract:codes` reads the evidence
  of the last run and lists both kinds.
- Error bodies follow the pack's envelope catalogue (`error-envelopes.json`, L-50). Assert the
  envelope every time a case expects an error, and assert which field is reported rather than the
  wording of the message.

## 5. The floor

`npm run contract:floor` computes the minimum number of cases each operation needs, with every term
printed. The formula lives in `scripts/derive-floor.mjs` and nowhere else. A registry never states the
number by hand: `npm run coverage:status` reports each registry's floor and gap (L-08).

The floor measures one axis: what the contract declares. Cases that come from reading the
implementation, from equivalence reasoning or from risk count on a separate axis. The registry lists
them in its `beyond_floor` header, so the coverage ratio keeps its meaning (L-55).

## 6. Techniques

Every designed case names one technique, from the registry's fixed list:

| Technique | Use it for |
|---|---|
| `equivalence-partition` | classes of input that should behave alike: one representative each, valid and invalid |
| `boundary-value` | the edges of a range, a length or a format: min, max, one step outside each |
| `decision-table` | a result that depends on a combination of conditions; the table lives in the pack as YAML |
| `state-transition` | resources with a lifecycle: allowed moves, refused moves, idempotent repeats |
| `pairwise` | many independent optional inputs; `npm run contract:probes` bounds the combinations |
| `error-guessing` | inputs experience says break things: wrong content type, truncated JSON, huge values |
| `use-case` | an end-to-end business sequence, usually written as a flow |

Behaviour that a shared layer applies to every operation (malformed or truncated JSON, wrong content
type, invalid path parameters) needs a probe on every operation, not a sample (L-34). The probe
matrix includes these service-wide probes.

## 7. Security and resilience

Apply each item to every operation that needs credentials. All of it is authorized testing of a
non-production environment, within the scope you were asked to test.

- **Authentication**: no credential, a malformed one, a wrong scheme, an expired or revoked one. Each
  should be refused, and each must also show that **nothing changed**: a request that is rejected
  but still applied is the most serious outcome of the three.
- **Object-level authorization (BOLA)**: with actor A's credential, read and write actor B's
  resources (a second actor from the pack's `actors`, such as `actor('user-b')`; worked example:
  VAmPI's TC-BOOK-02). Expect a refusal, never B's data. Assert separately that a write did
  not land.
- **Function-level authorization**: a lower-privilege actor calling an operation reserved for
  another role.
- **Injection**: quotes, statement separators, comment markers and script fragments in string fields,
  query values and path segments. Expect a clean refusal or a stored literal, never a server error
  and never an internal message in the body.
- **Unknown fields (schema drift)**: extra properties are refused or ignored as the contract says, and
  a response never gains undeclared fields.
- **Declared versus honored (mass assignment)**: for each optional field of a write,
  1. read the current state;
  2. write the field with a new value, different from what is stored;
  3. read the state again.

  Stored means honored. Unchanged after a 2xx is a silently discarded field (`@contract-drift`,
  `@security`). Unchanged after a 4xx is a documented refusal. Include at least one field that
  decides ownership or privilege, and assert the resource did not move to another owner. If the
  model does not declare that field, sending it is an unknown-field case instead.
- **Information exposure**: errors must not reveal stack traces, framework names, queries or internal
  identifiers.
- **Resource consumption**: limits on page size, payload size and rate. Test these only where the
  contract or the owner states a limit.

## 8. Integrity

- **After an error on a write, check the state** (L-35). A server error can come after the change
  was committed.
- **Own your records** (L-25). Assert on the records the case created, never on counters or listings
  other writers can move.
- **Preserve-on-omit needs a non-default value** (L-20). To prove an omitted field keeps its value,
  first set it to something other than the default.
- **Idempotency and cascades.** Repeat a create, delete or state change and check the documented
  result. After a delete, check the dependent resources.
- **Siblings** (L-37). When one field is mishandled, find every operation that stores the same field
  or one handled by the same code, and check them before filing or closing.

## 9. Priority

| Priority | Cases |
|---|---|
| `high` | happy paths, missing-required negatives, authentication and authorization, declared-versus-honored on ownership fields |
| `medium` | boundaries, partitions, optional combinations, idempotency, cascades, remaining declared-versus-honored |
| `low` | performance budgets, exploratory injection and drift edges |

## 10. Verification and evidence

Each case states how it confirms its result. The options are the response alone, a follow-up read,
or a state comparison with the pack's field models. If none applies, the case leaves the step out
rather than writing a placeholder. Every request and response is attached to the result, redacted,
by the clients (L-42). A status code alone is never the evidence.
