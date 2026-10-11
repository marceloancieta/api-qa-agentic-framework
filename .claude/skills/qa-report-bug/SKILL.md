---
name: qa-report-bug
description: >-
  Files a defect in the API under test to the configured tracker after a gated triage: test error or
  real defect, confirmed or not, class and severity from the rubric, scope level by fix location, and
  a search for existing issues. Writes a short description from the template, files or updates the
  issue through npm run tracker, reads it back, and maps the affected cases to its key. Use when the
  user asks to report, file or log a bug, or when a run or probe disagrees with the contract and
  someone needs to decide whether that is a defect. Never files without the user's approval.
---

# qa-report-bug: triage and file

Works after either mode. It writes to the tracker, never to the system under test. The rules it
applies are in [bug reporting](../../../docs/references/bug-reporting.md) and the
[defect rubric](../../../docs/references/defect-rubric.md). Read them and do not restate them in
the issue.

## Triage: five questions, in order

1. **Test error or real defect?** Check the request against the contract, the data the case used,
   the expected result, and leftovers from earlier runs. A red test is not yet a defect.
2. **Confirmed?** Reproduced against the test environment, with the redacted exchange as evidence,
   means a defect. Seen only in code or inferred from the contract means an unconfirmed finding,
   which is promoted once reproduced. Unsure whether it is a defect at all means a question to the
   owner.
3. **Class and severity**, independently, from the rubric. Read three or four rated issues of the
   same class first.
4. **Siblings** (L-37): every operation that stores the same field or shares the code path. Test
   them; the result feeds the next question.
5. **Scope level and issue count**, by fix location. Search the tracker at that level and above
   with `npm run tracker -- search <words> --open`, once per distinctive term (the path, the
   field, the status seen), then read each candidate with `npm run tracker -- get <KEY>`. Repeat
   without `--open` to find a done issue the finding reopens. A finding inside an open issue's scope
   becomes a comment on that issue.

For questions 1 and 2, a `contract-investigator` agent can confirm or refute a finding with
read-only evidence (one finding per agent). Its report is evidence for the triage, not a verdict, and
a finding that needs a write to reproduce goes to an execution-mode run (`qa-run`).

Propose the outcome before writing anything: the level, the number of issues, titles, class and
severity. Wait for approval.

## Filing

1. Write the description to a file in the scratchpad, following the template in the bug-reporting
   reference. Keep it short and put the depth in a second file for the first comment.
2. File it:
   ```sh
   npm run tracker -- create --title "<title>" --body-file <file> \
     --label class:<class> --label severity:<S1-S4>
   ```
   Add a comment to an existing issue with `npm run tracker -- comment <KEY> --body-file <file>`.
   The wrapper reads every write back and checks that placeholders survived rendering (L-04, L-47).
3. Add the supporting detail as the first comment, the same way.
4. Map the cases. Every affected case cites the one key: in the registry Defect column, and in a
   `knownGap('<KEY>', why)` arm with `@known-gap` for cases that still run. Their status does not
   change; `blocked` stays reserved for cases with nothing to execute (L-57).
5. Report the key, its link, what was attached and which cases now cite it.

## If it stops halfway

An issue created without its comment or case mapping is finished, not duplicated. Comment on the
same key and map the cases. When a re-scope or a duplicate closes an issue, move the cases that
cited it to the remaining key in one commit.

## Do not

- File without the triage and the user's approval, or file a defect that has not been reproduced.
- Open a second issue for a cause that already has one.
- Paste tokens, real identifiers or unredacted bodies into the tracker.
