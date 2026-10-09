// Traceable tool output (L-48). Every line carries a UTC timestamp and the run id it belongs to, so
// the output of a test run, the upload of its results and the issues filed from them can be lined up
// afterwards. The run id comes from QA_RUN_ID (set by the test run's global setup and inherited by
// whatever runs after it in the same job), or is created here and exported for child processes.
//
//   2026-10-09T15:04:05.123Z run=7f3a9c1e tm-publish info  uploaded 12 results launch=184
//
// QA_LOG_FORMAT=json prints one JSON object per line instead, for log collectors.

import { randomBytes } from 'node:crypto';

export const RUN_ID_VARIABLE = 'QA_RUN_ID';

/** The current run id, created (and exported to child processes) when there is none yet. */
export function runId(env = process.env) {
  if (!env[RUN_ID_VARIABLE]) env[RUN_ID_VARIABLE] = randomBytes(4).toString('hex');
  return env[RUN_ID_VARIABLE];
}

function render(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return /[\s"=]/.test(text) ? JSON.stringify(text) : text;
}

/**
 * A logger for one tool. `fields` are appended as key=value pairs; never pass secrets, they are
 * printed as given.
 */
export function createLogger(tool, options = {}) {
  const env = options.env ?? process.env;
  const out = options.out ?? console;
  const now = options.now ?? (() => new Date());
  const id = runId(env);
  const json = (env.QA_LOG_FORMAT ?? '').toLowerCase() === 'json';

  const write = (level, message, fields = {}) => {
    const time = now().toISOString();
    if (json) {
      out.log(JSON.stringify({ time, run: id, tool, level, message, ...fields }));
      return;
    }
    const extra = Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${render(value)}`)
      .join(' ');
    out.log(`${time} run=${id} ${tool} ${level.padEnd(5)} ${message}${extra ? ` ${extra}` : ''}`);
  };

  return {
    runId: id,
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  };
}
