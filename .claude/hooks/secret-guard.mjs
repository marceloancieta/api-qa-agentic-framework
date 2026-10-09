#!/usr/bin/env node
// Keeps credentials out of prompts, tool calls and tool output. One script, three events:
//
//   UserPromptSubmit  refuse a prompt that contains a credential.
//   PreToolUse        refuse any tool call whose input contains a credential shape; refuse reading or
//                     touching files that usually hold secrets; refuse shell network calls that carry
//                     secrets; refuse sending secret-looking content to web tools or subagents.
//   PostToolUse       mask credential-looking text in the output Claude is about to read.
//
// Merely mentioning a keyword such as `password` in a local edit is allowed: only concrete credential
// shapes, or content leaving the machine, are refused. Unreadable input is refused too, so a payload
// this guard cannot parse never slips through it.

import { block, decide, readPayload, respond, allow } from './lib/io.mjs';
import { findCredentials, hasAnySecret, redactValue, SECRET_NAME_WORDS } from './lib/secrets.mjs';

// File names and path suffixes that conventionally contain secrets, grouped by where they come from.
// Entries with a `/` match the end of a path; the rest match the file name (glob `*` allowed).
const SENSITIVE_FILES = {
  'environment files': ['.env', '.env.*'],
  'key material': ['*.pem', '*.key', '*.p12', '*.pfx'],
  ssh: ['.ssh/id_rsa', '.ssh/id_ecdsa', '.ssh/id_ed25519', '.ssh/config'],
  'cloud CLIs': ['.aws/credentials', '.aws/config', '.azure/accessTokens.json', '.kube/config'],
  'developer tools': ['.config/gh/hosts.yml', '.docker/config.json'],
  'package registries': ['.npmrc', 'nuget.config', '.pypirc', 'pip.ini', 'pip.conf'],
  'build tools': ['settings.xml', 'gradle.properties'],
  'infrastructure as code': ['terraform.tfvars', '*.auto.tfvars'],
  'generic secret stores': ['credentials.json', 'secrets.yml', 'secrets.yaml'],
};
// Files that match a pattern above but are templates without real values.
const SAFE_TEMPLATES = new Set(['.env.example']);

const NETWORK_TOOLS = ['curl', 'wget', 'rsync', 'scp', 'sftp', 'telnet', 'netcat', 'ncat', 'nc'];
const POWERSHELL_NETWORK = ['Invoke-WebRequest', 'Invoke-RestMethod', 'iwr', 'irm'];
const LIBRARY_CALLS = String.raw`requests\.(?:get|post|put|patch)|urllib\.request|http\.client|socket\.|fetch\s*\(`;
const SENDS_OVER_NETWORK = new RegExp(
  String.raw`\b(?:${[...NETWORK_TOOLS, ...POWERSHELL_NETWORK].join('|')})\b|${LIBRARY_CALLS}`,
  'i',
);
const READS_SECRET_VARIABLE = new RegExp(
  String.raw`(?:\$\{?|\$env:)\w*(?:${SECRET_NAME_WORDS})\w*`,
  'i',
);
const DUMPS_ENVIRONMENT =
  /process\.env|os\.environ|getenv|Get-ChildItem\s+env:|\bprintenv\b|\benv\s*(?:\||;|$)/i;

const WEB_AND_AGENT_TOOLS = new Set(['WebFetch', 'WebSearch', 'Agent', 'Task']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

const globToRegExp = (glob) =>
  new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
const SENSITIVE_MATCHERS = Object.values(SENSITIVE_FILES)
  .flat()
  .map((entry) =>
    entry.includes('/')
      ? (path) => path === entry.toLowerCase() || path.endsWith(`/${entry.toLowerCase()}`)
      : (
          (re) => (_path, name) =>
            re.test(name)
        )(globToRegExp(entry)),
  );

function isSensitiveFile(raw) {
  const path = String(raw ?? '')
    .replace(/\\/g, '/')
    .replace(/^['"@]+|['"]+$/g, '')
    .toLowerCase();
  if (!path) return false;
  const name = path.slice(path.lastIndexOf('/') + 1);
  return !SAFE_TEMPLATES.has(name) && SENSITIVE_MATCHERS.some((matches) => matches(path, name));
}

/** The first word of a shell command that refers to a sensitive file, if any. */
function sensitiveFileInCommand(command) {
  return String(command ?? '')
    .split(/[\s'"|;&<>()=,]+/)
    .find((word) => word && isSensitiveFile(word));
}

/** Why a shell command would send secrets over the network, or null. */
const LEAK_SIGNALS = [
  { found: (cmd) => hasAnySecret(cmd), reason: 'it contains a literal secret' },
  {
    found: (cmd) => READS_SECRET_VARIABLE.test(cmd),
    reason: 'it expands a secret environment variable',
  },
  { found: (cmd) => DUMPS_ENVIRONMENT.test(cmd), reason: 'it reads the environment' },
];

function networkLeakReason(command) {
  if (!SENDS_OVER_NETWORK.test(command)) return null;
  return LEAK_SIGNALS.find(({ found }) => found(command))?.reason ?? null;
}

/** The parts of a tool input that can carry free text. Unknown tools are inspected as JSON. */
function freeText(toolName, input) {
  if (SHELL_TOOLS.has(toolName)) return [input.command];
  if (toolName === 'Write') return [input.content];
  if (toolName === 'Edit') return [input.old_string, input.new_string];
  if (toolName === 'MultiEdit')
    return (input.edits ?? []).flatMap((e) => [e.old_string, e.new_string]);
  return [JSON.stringify(input)];
}

function onPrompt(prompt) {
  if (hasAnySecret(prompt)) {
    block(
      'Prompt refused: it looks like it contains a credential. Put the value in an environment variable and refer to the variable instead.',
    );
  }
}

function onToolCall(toolName, input) {
  const shapes = [...new Set(freeText(toolName, input).flatMap((t) => findCredentials(t ?? '')))];
  if (shapes.length > 0) {
    decide(
      'deny',
      `${toolName} call refused: its input contains ${shapes.sort().join('; ')}. For test data, ` +
        'assemble the value at runtime instead of writing it out; otherwise let the user do this step.',
      `secret-guard refused a ${toolName} call that contained a credential.`,
    );
  }
  for (const path of [input.file_path, input.path, input.notebook_path]) {
    if (typeof path === 'string' && isSensitiveFile(path)) {
      block(`Refused: ${path} is a file that usually holds secrets.`);
    }
  }
  if (SHELL_TOOLS.has(toolName)) {
    const file = sensitiveFileInCommand(input.command);
    if (file) block(`Refused: the command refers to ${file}, a file that usually holds secrets.`);
    const leak = networkLeakReason(input.command ?? '');
    if (leak) block(`Refused: this ${toolName} command makes a network call and ${leak}.`);
  }
  if (WEB_AND_AGENT_TOOLS.has(toolName) && hasAnySecret(JSON.stringify(input))) {
    block(`Refused: the ${toolName} input looks like it contains a secret.`);
  }
}

function onToolOutput(output) {
  const masked = redactValue(output);
  if (JSON.stringify(masked) !== JSON.stringify(output)) {
    respond('PostToolUse', { updatedToolOutput: masked });
  }
}

const payload = readPayload();
if (!payload) block('Refused: secret-guard could not parse the hook input.');

const input = payload.tool_input ?? {};
switch (payload.hook_event_name) {
  case 'UserPromptSubmit':
    onPrompt(payload.prompt ?? '');
    break;
  case 'PreToolUse':
    onToolCall(payload.tool_name ?? '', input);
    break;
  case 'PostToolUse':
    onToolOutput(payload.tool_response ?? payload.tool_output);
    break;
}
allow();
