import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/cli.mjs';

// DOC-16: the files a visitor of the repository looks for. They exist, the security policy keeps
// reports private and covers what a report needs, the code of conduct is the Contributor Covenant
// 2.1 with its contact filled in, the README and the contributing guide link them, and the README's
// badges show facts read live rather than values typed into a badge URL.

const COMMUNITY_FILES = [
  'README.md',
  'LICENSE',
  'NOTICE',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  '.github/pull_request_template.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
];

const read = (name) => readFileSync(join(REPO_ROOT, name), 'utf8');

test('every community file is present', () => {
  const missing = COMMUNITY_FILES.filter((name) => !existsSync(join(REPO_ROOT, name)));
  assert.deepEqual(missing, [], 'restore the missing community files');
});

test('the security policy keeps reports private and covers versions, response, scope and safeguards', () => {
  const policy = read('SECURITY.md');
  assert.match(policy, /\*\*Report a vulnerability\*\*/);
  assert.match(policy, /never a public issue/);
  for (const section of [
    'Reporting a vulnerability',
    'What happens next',
    'Supported versions',
    'Scope',
    'Safeguards in place',
  ]) {
    assert.match(policy, new RegExp(`^## ${section}$`, 'm'), `SECURITY.md has "## ${section}"`);
  }
  assert.match(policy, /\]\(CHANGELOG\.md\)/, 'supported versions link to the changelog');
});

test('the code of conduct is the Contributor Covenant 2.1 with a contact', () => {
  const conduct = read('CODE_OF_CONDUCT.md');
  assert.match(conduct, /^# Contributor Covenant Code of Conduct$/m);
  assert.match(conduct, /version 2\.1/);
  assert.doesNotMatch(conduct, /\[INSERT CONTACT METHOD\]/, 'the placeholder is filled in');
  assert.match(conduct, /responsible for enforcement at \S+@\S+\./);
});

test('the README and the contributing guide link the security policy and the code of conduct', () => {
  for (const name of ['README.md', 'CONTRIBUTING.md']) {
    const text = read(name);
    assert.match(text, /\]\(SECURITY\.md\)/, `${name} links SECURITY.md`);
    assert.match(text, /\]\(CODE_OF_CONDUCT\.md\)/, `${name} links CODE_OF_CONDUCT.md`);
  }
});

test('the issue forms send security reports to the security policy', () => {
  const config = read('.github/ISSUE_TEMPLATE/config.yml');
  assert.match(config, /^blank_issues_enabled: false$/m);
  assert.match(config, /url: \S+\/security\/policy$/m);
});

test('the README badges read their facts live', () => {
  const badges = [...read('README.md').matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
  assert.ok(badges.length > 0, 'the README has badges');
  // A static shields.io badge carries its value in the URL, and that copy drifts (one home per fact).
  const typed = badges.filter((url) => /img\.shields\.io\/(?:static\/v1|badge\/)/.test(url));
  assert.deepEqual(typed, [], 'use a badge that reads its value from the source');
});
