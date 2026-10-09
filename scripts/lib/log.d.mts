// Types for scripts/lib/log.mjs.

export const RUN_ID_VARIABLE: 'QA_RUN_ID';

export function runId(env?: NodeJS.ProcessEnv): string;

export interface Logger {
  runId: string;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export function createLogger(
  tool: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    out?: { log(line: string): void };
    now?: () => Date;
  },
): Logger;
