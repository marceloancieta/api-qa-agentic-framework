#!/usr/bin/env node
// PreToolUse (Bash/PowerShell): optional git workflow rules, configured in qa-config under
// `policies` and `tracker.key_pattern`. Nothing is enforced until a rule is configured.
//
//   git commit    max_tracker_keys      deny  - more issue keys than allowed in the message
//                 require_tracker_key   ask   - no issue key in the message
//                 conventional_commits  ask   - subject is not `type(scope)?: summary`
//                 protected_branches    ask   - committing straight onto a protected branch
//   gh pr create  required_labels       deny  - a required label is not passed
//
// When the message cannot be inspected (read from stdin, file not found, quoting not parseable) the
// hook does not pretend it checked anything: it asks or denies and says why. Malformed hook input
// is let through here; blocking unreadable input is secret-guard's responsibility.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { allow, decide, projectDir, readPayload } from './lib/io.mjs';
import { commitPolicy, loadConfig, pullRequestPolicy, trackerKeyRegex } from './lib/config.mjs';
import { splitWords, unwrapHeredoc } from './lib/shell.mjs';

const IS_COMMIT = /\bgit\s+(?:-\S+\s+(?:\S+\s+)?)*?commit\b/;
const IS_PR_CREATE = /\bgh\s+pr\s+create\b/;
const COMMIT_TYPES = 'feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert';
const CONVENTIONAL_SUBJECT = new RegExp(`^(?:${COMMIT_TYPES})(?:\\([\\w./-]+\\))?!?: \\S`);

const REASONS = {
  unparseable: () =>
    'The commit-message rules were not applied: the command has unbalanced quotes. Fix the ' +
    'quoting, or approve only after reviewing the message manually.',
  stdin: () =>
    'The commit-message rules were not applied: `-F -` reads the message from stdin, which a hook ' +
    'cannot see. Use `-m "..."` or `-F <file>` instead.',
  unreadable: (files) =>
    `The commit-message rules were not applied: message file not found (${files.join(', ')}). ` +
    'Use a path relative to the repository, or approve only after reviewing the message manually.',
  tooManyKeys: (keys, max) =>
    `Found ${keys.length} issue keys (${keys.join(', ')}); at most ${max} allowed. Trackers link a ` +
    'commit to every key in its message, so extra keys attach this work to unrelated tickets. Keep ' +
    'the key of the current task and link related tickets in the tracker.',
  noKey: () =>
    'No issue key found in the message while policies.commit.require_tracker_key is enabled. ' +
    'Approve only for an intentional exception, such as a fixup that will be squashed.',
  notConventional: (subject) =>
    `Subject "${subject.slice(0, 72)}" does not follow Conventional Commits ` +
    `(type(scope)?: summary, type in ${COMMIT_TYPES}). Approve only if the exception is intended.`,
  protectedBranch: (branch) =>
    `'${branch}' is a protected branch. Approve only if committing directly to it is intended; ` +
    'otherwise switch to a feature branch.',
  prUnparseable: (required) =>
    `The pull-request label rule was not applied: the command could not be parsed. Required: ${required.join(', ')}.`,
  missingLabels: (required, missing) =>
    `Required pull-request labels: ${required.join(', ')}. Missing: ${missing.join(', ')}. ` +
    `Add --label ${missing.join(',')}.`,
};

/**
 * Values of a command-line option in all git/gh spellings: `-x v`, `-xv`, `--long v`, `--long=v`.
 * Returns [{ value, index }] in order of appearance.
 */
function optionValues(words, short, long) {
  const found = [];
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if ((w === short || w === long) && i + 1 < words.length) found.push(words[++i]);
    else if (w.startsWith(`${long}=`)) found.push(w.slice(long.length + 1));
    else if (w.length > short.length && w.startsWith(short) && !w.startsWith('--')) {
      found.push(w.slice(short.length));
    }
  }
  return found;
}

/** Git Bash absolute paths (`/c/dir`) are not absolute to Node on Windows. */
function toNativePath(path) {
  const drive = /^\/([A-Za-z])(\/.*)?$/.exec(path);
  return drive && process.platform === 'win32' ? `${drive[1]}:${drive[2] ?? '/'}` : path;
}

function readFileOrNull(path, cwd) {
  const native = toNativePath(path);
  try {
    return readFileSync(isAbsolute(native) ? native : join(cwd, native), 'utf8');
  } catch {
    return null;
  }
}

/** The full commit message, or the reason it could not be assembled. */
function commitMessage(words, cwd) {
  const inline = optionValues(words, '-m', '--message').map(unwrapHeredoc);
  const files = optionValues(words, '-F', '--file');
  if (files.includes('-')) return { problem: REASONS.stdin() };
  const missing = [];
  const fromFiles = files.map((file) => readFileOrNull(file, cwd) ?? (missing.push(file), ''));
  if (missing.length > 0) return { problem: REASONS.unreadable(missing), verdict: 'ask' };
  return { message: [...inline, ...fromFiles].filter(Boolean).join('\n\n') };
}

function branchOf(cwd) {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', '-q', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
  } catch {
    return ''; // detached HEAD or not a repository: the branch rule does not apply
  }
}

function enforceCommitRules(command, config, cwd) {
  const policy = commitPolicy(config);
  const keyPattern = trackerKeyRegex(config);

  if (keyPattern || policy.conventional_commits) {
    const words = splitWords(command);
    if (words === null) decide('ask', REASONS.unparseable());
    const { message, problem, verdict } = commitMessage(words, cwd);
    if (problem) decide(verdict ?? 'deny', problem);

    if (message && keyPattern) {
      const keys = [...new Set(message.match(keyPattern) ?? [])].sort();
      if (keys.length > policy.max_tracker_keys) {
        decide('deny', REASONS.tooManyKeys(keys, policy.max_tracker_keys));
      }
      if (keys.length === 0 && policy.require_tracker_key) decide('ask', REASONS.noKey());
    }
    if (message && policy.conventional_commits) {
      const subject = message.trimStart().split('\n')[0];
      if (!CONVENTIONAL_SUBJECT.test(subject)) decide('ask', REASONS.notConventional(subject));
    }
  }

  if (policy.protected_branches.length > 0) {
    const branch = branchOf(cwd);
    if (policy.protected_branches.includes(branch)) decide('ask', REASONS.protectedBranch(branch));
  }
}

function enforcePullRequestRules(command, config) {
  const { required_labels: required } = pullRequestPolicy(config);
  if (required.length === 0) return;
  const words = splitWords(command);
  if (words === null) decide('ask', REASONS.prUnparseable(required));
  const given = new Set(
    optionValues(words, '-l', '--label').flatMap((v) => v.split(',').map((s) => s.trim())),
  );
  const missing = required.filter((label) => !given.has(label));
  if (missing.length > 0) decide('deny', REASONS.missingLabels(required, missing));
}

const payload = readPayload();
const command = payload?.tool_input?.command ?? '';
const isCommit = IS_COMMIT.test(command);
const isPullRequest = IS_PR_CREATE.test(command);
if (!isCommit && !isPullRequest) allow();

const { config } = loadConfig(projectDir(payload));
if (isCommit) enforceCommitRules(command, config, payload.cwd || projectDir(payload));
if (isPullRequest) enforcePullRequestRules(command, config);
allow();
