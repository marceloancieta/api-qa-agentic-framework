# Consecutive runs

Results directories for the coverage-status tests of GATE-14, read with `--results`. Each file is
one result; runs are separated by an idle gap longer than ten minutes.

- `spec-rerun/`: a full run of both specs, then, an hour later, a run of `specs/other.spec.ts`
  alone. Each spec is judged against its own last run, so nothing is missing.
- `one-spec/`: a single run of `specs/other.spec.ts`. The published cases of `specs/items.spec.ts`
  are in no run, so they are counted in a note instead of reported.
