// Types for scripts/lib/env-names.mjs.

export const ENV_VAR_NAME: RegExp;
export const NOT_A_NAME: string;
export function redactUnlessVariableName(name: unknown): string;
export function missingVariableMessage(why: string, name: unknown): string;
