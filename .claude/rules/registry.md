---
paths:
  - 'services/*/registry/**'
  - 'docs/templates/registry.md'
---

# Registries

A registry is the reviewed list of a feature's designed cases:
`services/<pack>/registry/<feature>.md`, from [the template](../../docs/templates/registry.md).
People review it as a document and the tools read it as data, so its shape is checked by
`npm run lint:docs` and `npm run coverage:status`. The format is defined in `scripts/lib/registry.mjs`.

## Feature codes are identities

A case id is `TC-<FEATURE>-NN`. Its identity in results and in the test-management tool is
`<service>-<version>-TC-<FEATURE>-NN` (L-22).

- **The code is permanent once a case is published.** Renaming it gives every case a new identity,
  and the tool keeps the old cases as orphans next to the new ones. Fix a wrong title freely; never
  change the id.
- **Choose the code for what stays stable.** Name the resource or the state the endpoints change,
  not a path segment, a method or a tag. Paths get refactored and tags get merged, but the resource
  usually survives both. A code built from a method name (`...READ`) turns false the day the
  registry adds a write.
- **One code per resource, whatever the size.** The floor does not decide how codes are split.
- **Behaviour every operation shares** (malformed bodies, path validation) can have its own code,
  because what it proves is breadth. It never takes over a case that one resource's registry should
  own.
- Codes are scoped by service version: the same code in `v2` and `v3` gives different identities.

## Files are containers

A registry file is only where cases are written and reviewed. It can be split, merged or renamed at
any time, because identity comes from the id, not from the file. Split a file once a reviewer can no
longer read it in one go, around 25 to 30 cases. Cases that prepare state for each other stay
together. Moving a case to another file changes neither its code nor its number.

## Header

| Key | Required | Holds |
|---|---|---|
| `feature` | yes | the code |
| `title` | yes | the feature name |
| `endpoints` | yes | `METHOD /path` per line, as the contract writes them; the floor is computed from these |
| `contract` | no | the feature contract doc, relative to the pack |
| `auth` | no | the actors the cases call as (`default`, `anonymous`, names from `api.actors`) |
| `test_data` | no | each `<PLACEHOLDER>` the cases use and what it stands for (L-41) |
| `requirements` | no | `{ id: REQ-<FEATURE>-NN, text }`; the Requirement column cites these |
| `beyond_floor` | no | ids of cases that come from the implementation, equivalence or risk rather than the contract (L-55) |

Any other key is a finding. The floor, the gap and the coverage are **not** header keys: they are
computed by `npm run coverage:status` and would go stale if written by hand (L-08).

## Status lifecycle

`draft` -> `approved` -> `automated` -> `published`, plus `blocked`.

| Status | Set by | Means |
|---|---|---|
| `draft` | design | written, not reviewed yet |
| `approved` | the design gate | reviewed; only approved cases are automated |
| `automated` | automate | a spec declares the case and it ran green, or red as an armed known gap |
| `published` | publish | the definition is in the test-management tool |
| `blocked` | any phase | the case **cannot execute**: there is nothing to call, or no data can exist. The Defect column holds the issue key that explains it |

- **A red case with a filed defect still runs.** It is a known gap, not a blocked case
  (`@known-gap` with `knownGap(key, why)`), it is published and reported, and the Defect column holds
  the key. Using `blocked` for a case that runs takes real coverage off the record (L-57).
- Statuses move forward. A case that has to go back (its contract changed, its spec was removed) goes
  back to `draft` or `approved`, with a line in the registry saying why.
- `coverage:status` reports a status that disagrees with the specs or with the latest run.

## Before reorganising registries

1. Has a case with this code been published? If so, cases may move between files, ids may not change.
2. Do the cases still group by resource?
3. Are cross-references between cases (`the state TC-PET-02 leaves`) still right?
4. Run `npm run coverage:status` and `npm run lint:docs`.
