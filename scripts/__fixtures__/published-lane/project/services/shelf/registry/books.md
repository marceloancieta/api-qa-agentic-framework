---
feature: BOOK
title: Books
endpoints:
  - GET /books/{bookId}
  - POST /books
---

Fixture registry for the published lane.

## Cases

| ID          | Title                       | Requirement | Technique             | Priority | Status    | Spec                 | Defect |
| ----------- | --------------------------- | ----------- | --------------------- | -------- | --------- | -------------------- | ------ |
| TC-BOOK-01  | A published case that passes | | equivalence-partition | high | published | specs/books.spec.ts | |
| TC-BOOK-02  | A published case that fails | | boundary-value | medium | published | specs/books.spec.ts | |
| TC-BOOK-03  | An automated case | | use-case | low | automated | specs/books.spec.ts | |
| TC-BOOK-04  | Published, but no test carries the id | | use-case | low | published | specs/books.spec.ts | |
| TC-BOOK-05  | Published and quarantined | | use-case | low | published | specs/books.spec.ts | |
| TC-BOOK-010 | Automated, id extends TC-BOOK-01 | | use-case | low | automated | specs/books.spec.ts | |
