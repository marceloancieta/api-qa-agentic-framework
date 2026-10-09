// Shared I/O for Claude Code hooks: read the event payload, emit one of the three verdicts.
//
// Every hook is spawned in exec form (`node <script>`), reads its JSON payload on stdin and ends with
// exactly one call to a function below. See ../README.md for the verdict semantics.

import { readFileSync } from 'node:fs';

/** Parse the hook payload from stdin. Returns null on empty or malformed input. */
export function readPayload() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Project root: Claude Code sets CLAUDE_PROJECT_DIR; the payload's cwd is the fallback. */
export function projectDir(payload) {
  return process.env.CLAUDE_PROJECT_DIR || payload?.cwd || process.cwd();
}

function emit(object) {
  process.stdout.write(JSON.stringify(object) + '\n');
  process.exit(0);
}

export function allow() {
  emit({});
}

/** PreToolUse permission decision: 'deny' blocks, 'ask' escalates to the user. */
export function decide(decision, reason, systemMessage) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  };
  if (systemMessage) output.systemMessage = systemMessage;
  emit(output);
}

/** Hard block (exit 2): the message on stderr is fed back to Claude. */
export function block(message) {
  process.stderr.write(message + '\n');
  process.exit(2);
}

/** Generic hookSpecificOutput for events that rewrite or add context (PostToolUse, SessionStart). */
export function respond(hookEventName, fields) {
  emit({ hookSpecificOutput: { hookEventName, ...fields } });
}
