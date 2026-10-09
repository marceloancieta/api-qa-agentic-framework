---
feature: STK
title: Stock
endpoints:
  - GET /items/{itemId}
  - DELETE /items/{itemId}
---

Fixture registry with a malformed row, an endpoint missing from openapi.json and fewer cases than its floor.

## Cases

| ID | Title | Requirement | Technique | Priority | Status | Spec | Defect |
|---|---|---|---|---|---|---|---|
| TC-STK-01 | Draft below the floor | | equivalence-partition | high | draft | | |
| TC-STK-02 | Row with a missing cell | | high | draft | | |
