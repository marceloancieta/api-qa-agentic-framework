# Modes: design and execution never mix

Work on an API under test happens in one of two modes. A request that needs both ("design the cases
and run them") is split: finish the first mode, show its result at its gate, then start the second
(L-58).

| | Design | Execution |
|---|---|---|
| Phases | intake, design, automate, publish (`qa-intake`, `qa-design`, `qa-automate`, `qa-publish`) | run (`qa-run`) |
| May call the API | **read-only**: `GET` and other safe methods, to measure behaviour; running the specs being built, against data they create | the suite, as written |
| May write files | contract docs, registries, specs, clients, builders, pack docs | run reports only |
| Test management | publish case definitions | report results of a run |
| Never | send a write request outside a spec run; report a run's results | edit a spec, a registry, a contract doc or a case definition from what a run showed |

Why:

- **Design never writes to the system under test.** A write needs cleanup and changes shared state,
  and the design phase has nothing that restores it. When a write's behaviour has to be measured, an
  execution-mode run does it, against data that run created, and its findings go into the contract doc before
  design starts.
- **Execution never changes definitions.** A run that edits the spec it just ran turns a failure into
  a pass without anyone reviewing why. A failing run produces a report, and a report can lead to a
  design change, a defect or a known gap, each through its own phase.
- **Reporting a defect** (`qa-report-bug`) can follow either mode. It writes to the tracker, never to
  the system under test.

Every phase ends at a **review gate**: the skill shows what it produced and waits for approval
before the next phase starts. A gate is skipped only when the user says so for that step.
