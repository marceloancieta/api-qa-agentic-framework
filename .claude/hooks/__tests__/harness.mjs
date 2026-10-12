// Test harness: spawn a hook with a synthetic payload and classify its verdict.

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @returns {Promise<{ verdict: 'allow'|'ask'|'deny'|'block'|'output', code: number, stdout: string,
 *   stderr: string, output: any }>}
 */
export function runHook(script, payload, { projectDir, env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(HOOKS_DIR, script)], {
      env: {
        ...process.env,
        QA_ENV: '',
        QA_PETSTORE_BASE_URL: '',
        ...(projectDir ? { CLAUDE_PROJECT_DIR: projectDir } : {}),
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      let output;
      try {
        output = stdout.trim() ? JSON.parse(stdout) : null;
      } catch {
        output = null;
      }
      const decision = output?.hookSpecificOutput?.permissionDecision;
      let verdict = 'output';
      if (code === 2) verdict = 'block';
      else if (decision === 'deny' || decision === 'ask') verdict = decision;
      else if (output && Object.keys(output).length === 0) verdict = 'allow';
      resolve({ verdict, code, stdout, stderr, output });
    });
    child.stdin.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  });
}

/** A throwaway project directory, optionally with a qa-config.json and extra files. */
export function tempProject({ config, files = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'hooks-test-'));
  if (config) writeFileSync(join(dir, 'qa-config.json'), JSON.stringify(config));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

// Credential-shaped fixtures, assembled at runtime so no literal secret is ever committed.
export const FAKE = {
  aws: 'AKIA' + 'ABCDEFGHIJKLMNOP',
  github: 'ghp_' + 'a1B2c3D4'.repeat(5),
  jwt: [
    'eyJ' + 'hbGciOiJIUzI1NiJ9xx',
    'eyJ' + 'zdWIiOiIxMjM0NTY3ODkwIn0',
    'abcDEF123456ghiJKL',
  ].join('.'),
  pem: '-----BEGIN ' + 'RSA PRIVATE KEY-----',
  tokenAssign: 'API_TOKEN=' + 'Zx9Qw8' + 'Er7Ty6Ui5',
  randomToken: 'q7W' + 'e9R2t' + 'Y4u1I8o3P6a5S0d',
};
