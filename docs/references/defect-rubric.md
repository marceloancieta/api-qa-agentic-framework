# Defect rubric

How a defect is classified and how its severity is set. This page owns the class list and the
severity criteria. [Bug reporting](bug-reporting.md) and the `qa-report-bug` skill use them, and they
travel to the tracker as labels.

## 1. Two independent judgements

The **class** names the kind of failure. The **severity** grades its consequences. Knowing one
tells you nothing about the other (L-52). An access-control defect can expose every tenant's data or
only an unimportant field. A broken operation can block a whole surface or one optional parameter.

Assign both, separately. The class feeds coverage and trend reports. The severity orders the queue.

## 2. Classes

Pick one primary class, and add secondary classes where they also apply.

| Class | Meaning |
|---|---|
| `logic` | A valid request leaves the wrong state or returns wrong data. |
| `silent-write` | The call succeeds, but what was stored differs from what was sent: a sent value is dropped, an omitted value is changed, or a value is coerced. |
| `broken` | A request the contract calls valid is refused or fails, so the operation cannot succeed. |
| `validation` | A check or bound is missing, or the status code is wrong, while the contract itself is right. |
| `access` | Authentication, authorization or tenant isolation. |
| `contract` | The published contract contradicts the service. |
| `exposure` | Internal details reach the caller: exception text, framework names, queries, internal identifiers. |

**Classify by effect, not by cause.** An endpoint that fails every request because of a faulty
validation rule is `broken`, even though the cause sits in validation.

Two boundaries are easy to get wrong:

- **`broken` versus `logic` and `silent-write`.** If the request errors, the class is `broken`. If it
  succeeds and does the wrong thing, it is `logic` or `silent-write`. An operation that did its work
  and then answered with a server error is `validation`: the response is wrong, not the operation.
- **`silent-write` versus `validation`.** If what was stored differs from what was sent, the class
  is `silent-write`. If the value was stored as sent but should have been refused, it is
  `validation`.

## 3. Severity

Take the **highest** severity whose description fits. Judge the defect's effect on callers and
data; ignore who maintains the clients and how much work the fix seems to need. Three aspects
decide it:

1. **Impact**: someone else's data is read or altered; data is lost or damaged; an operation is
   unusable; an answer is wrong.
2. **Breadth**: every operation of an area, a single operation, or a single field.
3. **Recovery**: retrying helps; the client can route around it; an operator must repair the data;
   the damage is permanent.

| Severity | Applies when at least one holds |
|---|---|
| `S1` | Another party's data exposed or changed. No write in an area of the API works. Data loss that cannot be undone or that reaches many records. |
| `S2` | One operation quietly damages or loses data, with a visible or service-affecting effect. A documented operation that cannot succeed. Data left unrepairable through the API. An unauthenticated information leak across the service. |
| `S3` | A valid request fails, and clients have a way around it. Wrong data in a read. Operations on one resource that disagree with each other. Damage that callers never see, such as storage format, orphan rows or ordering. |
| `S4` | A wrong status code or message while stored data is fine. Documentation that differs from the service without changing behaviour. One error that shows internal text. |

Three rules keep ratings consistent:

- **A disposition does not change the rating.** An issue closed as "won't fix" keeps the severity
  its effect earned.
- **"We control every client" is already in the scale.** It is the client-side-workaround criterion,
  which caps the defect at `S3`. It is not a reason to dismiss the defect.
- **Calibrate.** Before rating a new defect, read three or four rated ones of the same class, so
  the levels mean the same thing to testers and developers.

## 4. In the tracker

| What | Where |
|---|---|
| Class | label `class:<name>`, for example `class:silent-write` |
| Severity | label `severity:<S1..S4>`, or the tracker's own severity field when the project has one |
| Not yet reproduced | label `type:unconfirmed-finding`, severity proposed in the description ([bug reporting](bug-reporting.md#1-confirmed-unconfirmed-or-unknown)) |
| Reasoning | one clause in the description's Environment section: the criterion that applied and the reach |

Labels need no tracker administration and can be filtered in every supported tracker:
`npm run tracker -- create --title <t> --body-file <f> --label class:broken --label severity:S2`.
