# Backlog

Open work for this project. This file holds **active work only**: a row that is finished goes to
the **Done** section at the end with its closing commit, and keeps its id forever, so references in
commits and docs stay valid.

- Commits follow the ADR 0008 message convention (`type(scope): ID summary`); changes reach `main`
  through pull requests.
- **Status** is one of `todo` · `in-progress` · `blocked`. A row that will not be done is not
  open: it moves to **Done** like a finished one, its item starting with `**Won't do.**` and the
  reason, closed by the commit that recorded the decision.
- **Origin**: `L-NN` = a lesson in `docs/lessons-learned.md`; `exp` = field
  experience; `practice` = an established industry practice; `plan` = this project's roadmap;
  `ADR NNNN` = a recorded decision.
- **Prefixes**: `REPO` repository setup · `<PACK>` one prefix per service pack, as in `PET` ·
  add your own.
- **Sections**: open rows sit under the version that delivers them. `npm run release:check` reads
  that section: it must have no row left and say "Released as `v<x.y.z>`" (`CONTRIBUTING.md`,
  releases). Work for the next version goes under a new `## v<x.y.z>` section, above **Done**.

---

## v0.1.0

| Id | Item | Origin | Status |
|---|---|---|---|
| REPO-01 | Adopt the framework from its template, starting from framework commit `<commit>` (`docs/guides/adopt-the-template.md`). | plan | in-progress |

---

## Done

| Id | Item | Closed by |
|---|---|---|
