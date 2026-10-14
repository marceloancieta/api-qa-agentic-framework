# Intake request

What to send when you ask for an API feature to be tested. The `qa-intake` skill turns this into a
[feature contract](feature-contract.md), and every section here answers a question a test case needs.
The OpenAPI document gives the structure, so a request can be short: fill the required sections and
the intake asks about the rest. Copy the sections below into an issue or a message.

---

## Endpoints _(required)_

Each method and path exactly as the contract writes them, plus the API version, for example
`POST /pet` in Petstore `v3`. Name the resource the endpoints read or write. Do not invent a case code
for the tests: intake agrees one with you.

## Purpose _(required)_

One or two sentences, as behaviour someone can observe:
`As <a caller>, I call <endpoint> so that <outcome>.`

## Business rules _(required)_

A numbered list of testable rules, one per line. Tests trace back to these numbers.

1. A pet created without a status is stored as `available`.
2. Reading a pet id that does not exist answers `404`.

## Acceptance criteria _(required)_

Given, when, then for each scenario:

- **Given** an existing pet, **when** its owner updates the name, **then** the API answers `200`
  and a later read shows the new name.

## Contract pointers

Point to the request and response schemas and the documented error answers instead of copying them.
Add whatever the schema does not say: defaults, rules that span fields, value sets the API enforces.

## Access

Is a credential required? Which roles may call each operation? Which path identifiers must be
checked against the caller's ownership?

## Test data _(required for writes)_

What data the cases need in the test environment, and which records must be left in a given state.
Use placeholders such as `<PET_ID>` and describe the record; never paste production data,
credentials or personal data.

## Errors

What must be refused, and how the refusal looks: status and error format for missing fields, wrong
types, values outside a set, malformed JSON, and bad or missing credentials.

## State transitions

If the resource has a lifecycle, list the allowed moves, what triggers each, and which can be undone.

## Out of scope

What this request does not cover.

## Links

The contract URL, related issues, designs, documentation.

---

### Tips

- Write rules as behaviour ("answers `404`"), not as implementation ("throws NotFound").
- A request with only the endpoints still works. The intake records its assumptions, and you review
  them at the design gate.
- Mention any change of method, identifier or field location between versions: such changes break
  callers and deserve their own cases.
