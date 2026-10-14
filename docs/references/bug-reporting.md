# Bug reporting

How a finding about the API under test becomes an issue in the configured tracker. This page owns
three things: the **scope level** an issue is filed at, the **title format**, and how a test case
is **mapped** to its issue. The `qa-report-bug` skill applies it, and the class and severity come
from the [defect rubric](defect-rubric.md).

## 1. Confirmed, unconfirmed or unknown

| What you have | What to file |
|---|---|
| Reproduced against the test environment, with the evidence attached | a **defect** |
| Read in the code or inferred from the contract, not yet reproduced | an **unconfirmed finding**, promoted to a defect once reproduced |
| Not sure whether it is a defect or an intended change | a question to the owner, or an investigation item |

A red test is not yet a defect. Before anything else, rule out a test error: the request against the
contract, the data the case used, the expected status, and whether earlier runs left stale state.

Both are filed with the same issue type; a label tells them apart, so no tracker administration is
needed. An unconfirmed finding carries the label `type:unconfirmed-finding` and ends its title with
`(unconfirmed)`. Its class label applies as for a defect, and the severity is proposed in the
description instead of a `severity:` label until it is reproduced.

The tracker wrapper (`npm run tracker`) gets, searches, creates, comments and moves issues; it does
not edit them. Promoting a finding to a defect, and the re-scoping in section 4, are done today with
a comment that records the change, then a manual edit of the labels or the title in the tracker.

## 2. Scope: one issue per fix location

One root cause found from five endpoints is still one fix, so it should be one issue: five issues
leave developers closing duplicates by hand. The opposite mistake is just as costly. When one issue
covers fixes in several places, it closes half done, and the rest has to be filed again (L-51).

So the level follows **the place the fix will be made**. Walk the levels from 1 to 4 and file once, at the
highest level the evidence proves:

| Level | Tag | The defect... |
|---|---|---|
| 1 | `[Endpoint]` | is confined to one method and path |
| 2 | `[OpGroup]` | sits in logic shared by several operations on one resource, such as validation that create and update both use |
| 3 | `[Component]` | sits in one module, controller or service and reaches several of its operations beyond one resource's group |
| 4 | `[Global]` | sits in a layer every request passes through (body parsing, authentication, error handling, a shared library), or appears in several API versions through the same code |

- **Group by common cause; looking alike is not enough.** The same kind of defect in three modules, each
  with its own code, is three issues at level 3, not one at level 4. The test for level 4 is: *would
  one change in one place remove every instance?*
- **When the cause is not known yet**, use the narrowest level you can show, and note where you
  suspect a common cause. Widen the issue once that is shown.
- **Every issue above level 1 lists the operations it covers**, one `METHOD /path` per row. The list
  is how a reviewer verifies the level: an operation group listing operations of two modules is
  scoped wrongly.

## 3. Title

```text
<API and version> <surface> [<Level>]: <the wrong behaviour, as a caller sees it>
```

- `<API and version>`: the API and the version or versions affected, for example `Petstore v3`.
- `<surface>`: the method and resource at levels 1 to 3, or the shared mechanism at levels 2 to 4.
- `[<Level>]`: exactly one tag from section 2, placed right before the colon.
- The summary describes the misbehaviour as a caller sees it: "an omitted status is reset to the
  default", not "the mapper skips null".

The defect class is a separate axis: it is carried by a label and stays out of the title. If a title cannot follow
the format without becoming misleading, write a clear one that still shows the version and the scope,
and explain the deviation in the description.

## 4. Before filing

1. **Search the tracker** for open issues at this level or any broader one
   (`npm run tracker -- search <words> --open`). A finding inside the scope of an open issue is
   evidence for that issue. Add it as a comment with the reproduction, not as a new issue.
2. **Check siblings** (L-37). Find every operation that stores the same field or shares the code
   path, and test them. The result decides the level.
3. **A wider scope found later re-scopes the existing issue.** Add a comment with the new operation
   list and the reason, then update the list and the level tag in the tracker by hand (section 1).
   One cause keeps one issue.
4. **A narrower scope found later is a split.** Keep the issue for one fix location and file the
   others, each with its own list. Agree a split with the owner first.
5. **Propose before filing.** Show the level, the number of issues and the titles, then file.

## 5. Description

Short and aimed at the fix: a developer should see the failure, the expected behaviour and the
likely place to change within a minute. Supporting detail goes in the first comment.

```text
Error
  One line describing the wrong behaviour.
  A table of the measured requests: request, starting state, status received, statuses declared.
  The real request and response, redacted.

Expected
  Which outcomes would be correct, and what rules the observed one out.

Suggested fix
  The change to make, named the way the service's code names it, if known.

Reproduce
  The minimal sequence of calls, plus the read that shows the resulting state.

Environment
  Environment, API version, date. The case that observed it and what it asserts.
  Class and severity with the criterion that applied (defect rubric).
  Whether the cause was read in the code or measured.
```

Placeholders such as `<petId>` go inside code spans, because Markdown renderers drop bare angle
brackets. The tracker wrapper wraps them and reads the rendered issue back (L-47). Evidence never
carries real personal data: attach the redacted exchange from the run.

## 6. Mapping cases to issues

A case kept red by a defect cites **one** issue: the one section 2 chose, even when the case
exercises a different endpoint than the one the issue was found on.

- **The case still runs.** It gets `@known-gap` and an expected failure armed with
  `knownGap('<KEY>', why)` right before the action (L-13, L-14). Its registry status stays where it
  is (`approved`, `automated` or `published`), and the registry's Defect column holds the key.
- **Nothing about the case can execute** (no operation to call, no way to create its data): status
  `blocked` with the key (L-57).
- **When an issue is re-scoped or closed as a duplicate**, move the cases that cited the old key in
  the same change: the registry row and the `knownGap()` arm together. Otherwise
  `npm run cited:status` reports a `knownGap()` arm waiting on a closed issue. It does not read the
  registry's Defect column, so a row left on the old key is not reported.
