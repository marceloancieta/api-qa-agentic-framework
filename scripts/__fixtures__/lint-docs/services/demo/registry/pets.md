---
feature: DEMO
title: Demo pets
endpoints:
  - GET /demo
---

## Cases

| ID | Title | Requirement | Technique | Priority | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|
| TC-DEMO-01 | A valid case | | pairwise | high | draft | | |
| TC-DEMO-02 | Status outside the enum | | pairwise | high | finished | | <!-- expect-finding: registry-shape --> |
| TC-DEMO-03 | Short row | pairwise | high | <!-- expect-finding: registry-shape --> |

## Case details

### TC-DEMO-01 <!-- expect-finding: destructive-recovery -->

- **Request**: `GET /demo` after a write that breaks it for every caller.
- **Tags**: `@regression`
  `@destructive`

### TC-DEMO-02

- **Request**: `GET /demo` after the same write.
- **Recovery**: restart the service, then confirm `GET /demo` answers `200`.
- **Tags**: `@regression` `@destructive`

### TC-DEMO-03

- **Request**: `GET /demo`; the word destructive in prose does not make a case destructive.
- **Tags**: `@regression`
