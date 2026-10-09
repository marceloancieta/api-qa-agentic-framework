# Claude Code hooks

The hook registrations live in [`.claude/settings.json`](../settings.json); the code lives in this
folder as Node ES modules, so the hooks behave identically on Windows, macOS, Linux and CI.

| Script | Events | What it does |
|---|---|---|
| `secret-guard.mjs` | `UserPromptSubmit`, `PreToolUse` (every tool), `PostToolUse` (every tool) | Refuses prompts and tool calls that contain credentials, refuses access to files that usually hold secrets, refuses network commands or web/subagent calls carrying secrets, and masks credentials in tool output. |
| `git-policy.mjs` | `PreToolUse` (`Bash`, `PowerShell`) | Optional commit and pull-request rules read from `qa-config` (`tracker`, `policies`). Inactive until configured. |
| `session-probe.mjs` | `SessionStart` | Adds a short status report to the session: setup state, API reachability, coverage totals. |

Shared modules in `lib/`:

- `io.mjs` reads the event payload and writes verdicts;
- `config.mjs` reads `qa-config` without third-party packages;
- `secrets.mjs` holds every credential pattern, so there is one place to extend;
- `shell.mjs` splits a command line into words.

## Registering a hook

Use the exec form, an executable plus an argument list, so no shell is started:

```json
{
  "type": "command",
  "command": "node",
  "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/<name>.mjs"],
  "timeout": 10,
  "statusMessage": "<what the user sees while it runs>"
}
```

Keep logic in the script, not in the `command` string. A shell-based hook needs a working shell on
every contributor machine, and on Windows that shell can be broken by endpoint-security software,
which turns every tool call into a timeout.

## Verdicts

| Outcome | How |
|---|---|
| Let it through | exit 0 with `{}` on stdout |
| Ask the user | exit 0 with `hookSpecificOutput.permissionDecision: "ask"` and a reason |
| Refuse | `permissionDecision: "deny"`, or exit 2 with the reason on stderr |

Ask when a legitimate exception is plausible; refuse only when there is none. `SessionStart` hooks
only add context: they cannot block, so every failure inside them is reported as unknown.

## When a rule cannot be evaluated

If a hook cannot inspect what it is meant to check (a command it cannot parse, a file it cannot read),
it reports that explicitly with ask or deny. It never answers as if the check had passed.
`secret-guard` also refuses payloads it cannot parse; `git-policy` lets them through, because
secret-guard already covers that case.

## Configuration

`git-policy` and `session-probe` read `qa-config.json` and fall back to `qa-config.example.json`. They
use only Node built-ins, so they work in a fresh clone before `npm ci`.

## Tests

`npm run test:hooks` runs `node:test` suites in `__tests__/`. Each suite starts the hook as a child
process with a synthetic payload and checks the verdict, using tables that include calls which must be
allowed: a rule that matches too much is otherwise indistinguishable from one that works.

Fixtures never contain a literal credential. Values are concatenated at runtime
(`'AKIA' + 'ABCDEFGHIJKLMNOP'`), which keeps the repository clean for gitleaks and for the hook itself.

## After editing

Changes to a hook script apply to the next event it handles. Claude Code normally detects edits to
`settings.json` while running; if a new registration does not take effect, start a new session.
