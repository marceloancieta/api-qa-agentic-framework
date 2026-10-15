# Demo pack

Its [notes](docs/notes.md); contract in `service.json`; cases in `registry/pets.md`.
Where it departs from its contract: [contract notes](docs/contract-notes.md), DN-01 and DN-02;
decision tables in `rules/pets.yaml`.

A citation of a note that does not exist: DN-06. <!-- expect-finding: note-citation -->
A citation without its leading zero: DN-1. <!-- expect-finding: note-citation -->
The other pack's own note ON-01 resolves through its prefix.

Not note citations: ids of other families such as `TC-DEMO-01`, TC-DN-01, GATE-22, DOC-04, L-02,
LOCAL-5 and CVE-2024-0001; CON-08 and SN-01, whose prefixes end in N but no pack defines; PN-05,
the prefix of a pack this tree does not have; DN-01x and xDN-01, glued to a word.
<!-- A comment citing DN-09 is not read. -->

```md
A fenced example citing DN-09 is not read either.
```
