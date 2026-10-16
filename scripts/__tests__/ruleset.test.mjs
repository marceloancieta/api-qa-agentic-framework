// The branch ruleset an adopter imports (FUT-05, docs/guides/adopt-the-template.md). A required
// check that no job reports blocks every pull request, so each one must be a name that a job reports
// (a matrix job reports one per combination, scripts/lib/workflow.mjs) in a workflow that runs on
// every pull request, without a path filter, and the merge rules must stay the ones CONTRIBUTING
// describes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from '../lib/cli.mjs';
import { workflowCheckNames } from '../lib/workflow.mjs';

const RULESET = JSON.parse(readFileSync(join(REPO_ROOT, '.github/rulesets/main.json'), 'utf8'));
const WORKFLOWS = join(REPO_ROOT, '.github/workflows');
const rule = (type) => RULESET.rules.find((r) => r.type === type);

/** Whether a parsed workflow runs on every pull request: the event, without a path filter. */
function runsOnEveryPullRequest(workflow) {
  const on = workflow.on;
  if (on === 'pull_request') return true;
  if (Array.isArray(on)) return on.includes('pull_request');
  if (!on || typeof on !== 'object' || !Object.hasOwn(on, 'pull_request')) return false;
  const filter = on.pull_request ?? {};
  return !Object.hasOwn(filter, 'paths') && !Object.hasOwn(filter, 'paths-ignore');
}

test('every required check is a name a job reports in a workflow that runs on every pull request', () => {
  const reported = readdirSync(WORKFLOWS)
    .filter((file) => /\.ya?ml$/.test(file))
    .map((file) => parse(readFileSync(join(WORKFLOWS, file), 'utf8')))
    .filter(runsOnEveryPullRequest)
    .flatMap(workflowCheckNames);
  const required = rule('required_status_checks').parameters.required_status_checks;
  assert.deepEqual(
    required.map((check) => check.context),
    [
      'title',
      'gates',
      'e2e (petstore)',
      'e2e (vampi)',
      'dast (vampi secure)',
      'dast (vampi vulnerable)',
      'dast (petstore)',
    ],
  );
  for (const { context } of required) {
    assert.ok(reported.includes(context), `${context} is reported on every pull request`);
  }
});

test('a workflow with a path filter, or without the event, does not run on every pull request', () => {
  assert.ok(runsOnEveryPullRequest({ on: 'pull_request' }));
  assert.ok(runsOnEveryPullRequest({ on: ['push', 'pull_request'] }));
  assert.ok(runsOnEveryPullRequest({ on: { pull_request: null, push: { branches: ['main'] } } }));
  assert.ok(runsOnEveryPullRequest({ on: { pull_request: { types: ['opened'] } } }));
  assert.ok(!runsOnEveryPullRequest({ on: { pull_request: { paths: ['scripts/**'] } } }));
  assert.ok(!runsOnEveryPullRequest({ on: { pull_request: { 'paths-ignore': ['docs/**'] } } }));
  assert.ok(!runsOnEveryPullRequest({ on: { push: null, schedule: [{ cron: '0 0 * * 1' }] } }));
  assert.ok(!runsOnEveryPullRequest({ on: 'push' }));
});

test('main takes squash-merged pull requests only, with a linear history', () => {
  assert.equal(RULESET.target, 'branch');
  assert.equal(RULESET.enforcement, 'active');
  assert.deepEqual(RULESET.conditions.ref_name.include, ['~DEFAULT_BRANCH']);
  assert.deepEqual(RULESET.bypass_actors, []);
  assert.deepEqual(rule('pull_request').parameters.allowed_merge_methods, ['squash']);
  for (const type of ['deletion', 'non_fast_forward', 'required_linear_history']) {
    assert.ok(rule(type), `${type} is a rule`);
  }
});
