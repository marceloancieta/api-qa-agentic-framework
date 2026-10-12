---
feature: ITEM
title: Items
endpoints:
  - POST /items
  - GET /items/{itemId}
requirements:
  - { id: REQ-ITEM-01, text: An item can be created with only its name }
  - { id: REQ-ITEM-02, text: A stored item can be read back by id }
  - { id: REQ-ITEM-03, text: Item names longer than the limit are refused }
beyond_floor: [TC-ITEM-13, TC-ITEM-14]
---
Fixture registry: one row per lifecycle situation the coverage report must recognize.

## Cases

| ID | Title | Requirement | Technique | Priority | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|
| TC-ITEM-01 | Draft with no test yet | REQ-ITEM-01 | equivalence-partition | high | draft | | |
| TC-ITEM-02 | Approved but already written | | boundary-value | medium | approved | | |
| TC-ITEM-03 | Automated in the named file | REQ-ITEM-01 | equivalence-partition | high | automated | specs/items.spec.ts | |
| TC-ITEM-04 | Automated in a file that does not exist | | error-guessing | low | automated | specs/missing.spec.ts | |
| TC-ITEM-05 | Automated twice in one file | | equivalence-partition | medium | automated | specs/items.spec.ts | |
| TC-ITEM-06 | Automated but written in another file | | use-case | medium | automated | specs/items.spec.ts | |
| TC-ITEM-07 | Automated but parked with fixme | | state-transition | low | automated | specs/items.spec.ts | |
| TC-ITEM-08 | Published and present in the run | REQ-ITEM-02 | use-case | high | published | specs/items.spec.ts | |
| TC-ITEM-09 | Published but missing from the run | REQ-ITEM-02 | decision-table | medium | published | specs/items.spec.ts | |
| TC-ITEM-10 | Blocked and skipped with its key | | error-guessing | medium | blocked | specs/items.spec.ts | BUG-10 |
| TC-ITEM-11 | Blocked with a malformed key | | error-guessing | low | blocked | | later |
| TC-ITEM-12 | Blocked but the test is not armed | | error-guessing | low | blocked | specs/items.spec.ts | BUG-12 |
| TC-ITEM-13 | Blocked but passing in the run | | pairwise | low | blocked | specs/items.spec.ts | BUG-13 |
| TC-ITEM-14 | Automated without a spec | | boundary-value | low | automated | | |
| TC-ITEM-15 | Automated with a tracked known gap | | boundary-value | medium | automated | specs/items.spec.ts | BUG-15 |
| TC-ITEM-16 | Published in a second spec | | use-case | medium | published | specs/other.spec.ts | |
