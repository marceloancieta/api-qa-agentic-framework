---
feature: <FEATURE>
title: <Feature title>
endpoints:
  - <METHOD /path>
contract: docs/features/<feature>.md
auth: [default, anonymous]
test_data:
  <PLACEHOLDER>: <what it stands for and how a case gets it>
requirements:
  - { id: REQ-<FEATURE>-01, text: <a business rule from the contract> }
beyond_floor: []
---

# `<Feature title>` test cases

Contract: [`docs/features/<feature>.md`](../docs/features/<feature>.md).

Copy this file to `services/<pack>/registry/<feature>.md`. The header is checked by
`npm run lint:docs` and `npm run coverage:status`. The [registry rule](../../.claude/rules/registry.md)
explains each key, the case-id code and the status lifecycle.

- **Floor and gap** are computed, never written here: `npm run coverage:status` reports them per
  registry from the endpoints above (L-08).
- **Axis note**: list in `beyond_floor` the cases that come from the implementation, equivalence
  reasoning or risk rather than from the contract. They count on their own axis (L-55).
- **Report path**: results appear under the pack's title and version, grouped by the operation each
  case declares.

## Cases

| ID | Title | Requirement | Technique | Priority | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|
| TC-<FEATURE>-01 | <what the case shows, in the caller's terms> | REQ-<FEATURE>-01 | equivalence-partition | high | draft | | |

## Case details

One section per case, written at design time:

### TC-`<FEATURE>`-01

- **Preconditions**: the data and actor, by placeholder.
- **Request**: method, path, body summary.
- **Expected**: status, schema or error envelope, and the business fields asserted.
- **Verification**: response only, a follow-up read, or a state comparison.
- **Cleanup**: for a write, what the case removes and the read that confirms it.
- **Tags**: one layer tag plus any category tags (the tagging rule).
