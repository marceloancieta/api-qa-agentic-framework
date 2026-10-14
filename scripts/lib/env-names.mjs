// Names of environment variables in messages. A config field such as `password_env` holds the name
// of the variable that carries a secret, never the secret, and a message that cannot find the
// secret names that variable. A secret pasted into the field by mistake would be printed with it,
// so a message prints a name only when it has the shape the qa-config schema gives one (`envVar`).
// The `redact` in the name also tells CodeQL's js/clear-text-logging query that the result is not
// the secret (GATE-18). No imports and no I/O: helpers/ and the lanes both load it.

/** The `envVar` pattern of schemas/qa-config.schema.json; a test keeps the two equal. */
export const ENV_VAR_NAME = /^[A-Z][A-Z0-9_]*$/;

/** What a message shows instead of a value that is not a variable name. */
export const NOT_A_NAME = '[redacted: not an environment variable name]';

/** `name` when it has the shape of an environment variable name, otherwise `NOT_A_NAME`. */
export function redactUnlessVariableName(name) {
  return typeof name === 'string' && ENV_VAR_NAME.test(name) ? name : NOT_A_NAME;
}

/** The error message for a variable `why` needs and the environment does not set. */
export function missingVariableMessage(why, name) {
  return `${why} needs the environment variable ${redactUnlessVariableName(name)}, which is not set.`;
}
