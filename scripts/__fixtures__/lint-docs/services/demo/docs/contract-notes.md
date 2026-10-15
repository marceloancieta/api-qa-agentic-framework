# Demo contract notes

Back to the [pack](../README.md).

| Id | Observation | Status |
|---|---|---|
| DN-01 | A first departure. | `untracked` |
| DN-02 | A second one, which DN-01 explains. | `by-design` |
| DN-03 | A third, citing a note this file does not define: DN-04. | `untracked` | <!-- expect-finding: note-citation -->
| DN-02 | An id defined twice. | `untracked` | <!-- expect-finding: note-citation -->
| DN-05 | The last one. | `untracked` |

DN-01 to DN-03 and DN-01..DN-03 were measured together; so were DN-02 and DN-03.
DN-03 to DN-05 were not, and that range holds an id nobody defined. <!-- expect-finding: note-citation -->
A range written backwards: DN-03 to DN-01. <!-- expect-finding: note-citation -->
