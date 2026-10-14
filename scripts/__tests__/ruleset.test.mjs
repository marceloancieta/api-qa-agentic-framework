// The branch ruleset an adopter imports (FUT-05, docs/guides/adopt-the-template.md). A required
// check that no job reports blocks every pull request, so each one must name a job of `ci.yml` that
// runs on pull requests, and the merge rules must stay the ones CONTRIBUTING describes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { REPO_ROOT } from '../lib/cli.mjs';

const RULESET = JSON.parse(readFileSync(join(REPO_ROOT, '.github/rulesets/main.json'), 'utf8'));
const CI = parse(readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8'));
const rule = (type) => RULESET.rules.find((r) => r.type === type);

test('every required check is the name of a ci.yml job that runs on pull requests', () => {
  assert.ok(Object.hasOwn(CI.on, 'pull_request'), 'ci.yml runs on pull requests');
  const names = Object.values(CI.jobs).map((job) => job.name);
  const required = rule('required_status_checks').parameters.required_status_checks;
  assert.deepEqual(
    required.map((check) => check.context),
    ['title', 'gates', 'e2e (petstore)'],
  );
  for (const { context } of required) assert.ok(names.includes(context), `${context} is a job`);
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
