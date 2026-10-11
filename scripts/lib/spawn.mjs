// What a wrapper reports for a child process it ran with `spawnSync` (L-49: a gate only counts if
// failure blocks). A child that exits with a code passes that code on. A child that is killed by a
// signal, times out, overflows its output buffer or cannot be started has no code of its own
// (`status` is null), and a wrapper that reads only `status` would let some of those through. Each
// of them counts as a failure here.

/**
 * The exit code for a finished `spawnSync` result: the child's own code when it ran to the end,
 * otherwise 1. Never 0 unless the child itself exited 0 and nothing went wrong around it.
 */
export function exitCodeOf(result) {
  if (!result || result.error || result.signal || !Number.isInteger(result.status)) return 1;
  return result.status;
}

/**
 * Why a child did not run to the end, in words for a log line, or null when it exited with a code
 * (any code: a non-zero exit is the child's own verdict, not a failure to run).
 */
export function spawnFailure(result) {
  if (!result) return 'did not run';
  if (result.error) {
    const timedOut = result.error.code === 'ETIMEDOUT';
    const killed = result.signal ? ` (killed by ${result.signal})` : '';
    return timedOut ? `timed out${killed}` : `could not run: ${result.error.message}${killed}`;
  }
  if (result.signal) return `killed by ${result.signal}`;
  if (!Number.isInteger(result.status)) return 'ended without an exit code';
  return null;
}

/** `exit <code>` or the reason the child did not finish, for messages such as "x failed (...)". */
export function describeExit(result) {
  return spawnFailure(result) ?? `exit ${result.status}`;
}
