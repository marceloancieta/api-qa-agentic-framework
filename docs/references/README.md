# References and templates

The documents the phases apply. Each reference owns its subject: other files, the skills included,
link to it instead of restating it ([the documentation rule](../../.claude/rules/documentation.md)).

## References

| Reference | Read it when |
|---|---|
| [Contract analysis](contract-analysis.md) | you complete a contract at intake or choose test techniques at design: completing what the OpenAPI document leaves out, value sets, techniques, security and integrity cases. |
| [Bug reporting](bug-reporting.md) | a run or a probe disagrees with the contract and you decide whether and how to file it: confirmed or not, the scope level by fix location, the title format, mapping cases to issues. |
| [Defect rubric](defect-rubric.md) | you assign a defect its class and its severity, two separate judgements. |

## Templates

| Template | Read it when |
|---|---|
| [Intake request](../templates/intake.md) | you ask for an API feature to be tested: what to send so intake can start. |
| [Feature contract](../templates/feature-contract.md) | you write or review the contract doc intake produces for a feature, at `services/<pack>/docs/features/<feature>.md`. |
| [Registry](../templates/registry.md) | you start the registry of a feature's designed cases. The format is defined in `scripts/lib/registry.mjs` and explained in [the registry rule](../../.claude/rules/registry.md). |
| [Backlog](../templates/backlog.md) | you start the backlog of a repository created from the template ([adopt the template](../guides/adopt-the-template.md)). |
| [Service skill](../templates/service-skill.md) | you need to know what the per-API skill of a pack contains; `npm run scaffold:service` fills it in for a new pack. |
