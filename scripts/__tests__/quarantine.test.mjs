// GATE-23: `@quarantine` keeps a case out of every run but the flake lane's. The end-to-end tests use
// scripts/__fixtures__/quarantine, which applies the selection of the repository's own
// playwright.config.ts to offline specs; listing writes no results (CORE-12) and needs no API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPO_ROOT } from '../lib/cli.mjs';
import { runLane } from '../lib/playwright-lane.mjs';
import { DESTRUCTIVE_LANE_ENV, FLAKE_LANE_ENV, projectTagFilter } from '../lib/tags.mjs';
import { LANE_ENV, flakeLane } from '../flake-lane.mjs';
import { LANE_ENV as DESTRUCTIVE_ENV } from '../destructive-lane.mjs';

const CONFIG = 'scripts/__fixtures__/quarantine/playwright.config.ts';
// Whatever the caller's shell holds, the runs below start from neither lane's variable.
const NEITHER = { [DESTRUCTIVE_LANE_ENV]: '', [FLAKE_LANE_ENV]: '' };

const ORDINARY = 'TC-QUA-01';
const QUARANTINED = ['TC-QUA-02', 'TC-QUA-03', 'TC-QUA-04'];
const DESTRUCTIVE = 'TC-QUA-05';
const LOOK_ALIKE = 'TC-QUA-07';

const caseIds = (records) =>
  [...new Set(records.map((r) => /\bTC-[A-Z]+-\d+/.exec(r.title)?.[0]))].sort();

function listed(env) {
  const lane = runLane(REPO_ROOT, ['--config', CONFIG, '--list'], { ...NEITHER, ...env });
  assert.equal(lane.exitCode, 0, lane.stderr || lane.stdout);
  return caseIds(lane.records);
}

/** What a project with this filter selects, judged like Playwright: title path, then tags. */
function selects(filter, grepTitle) {
  if (filter.grepInvert?.test(grepTitle)) return false;
  return filter.grep ? filter.grep.test(grepTitle) : true;
}

test('the project filter leaves quarantined and destructive cases out unless a lane says otherwise', () => {
  const titles = {
    ordinary: 'TC-X-01 a case @regression',
    quarantined: 'group TC-X-02 a case @regression @quarantine',
    destructive: 'TC-X-03 a case @regression @destructive',
    both: 'TC-X-04 a case @regression @destructive @quarantine',
    lookAlike: 'TC-X-05 a case @regression @quarantined-elsewhere @destructive-ish',
  };
  const selection = (env) =>
    Object.entries(titles)
      .filter(([, title]) => selects(projectTagFilter(env), title))
      .map(([name]) => name);

  assert.deepEqual(selection({}), ['ordinary', 'lookAlike'], 'every run');
  assert.deepEqual(selection({ [FLAKE_LANE_ENV]: '1' }), ['ordinary', 'quarantined', 'lookAlike']);
  assert.deepEqual(selection({ [DESTRUCTIVE_LANE_ENV]: '1' }), ['destructive']);
  assert.deepEqual(selection({ [DESTRUCTIVE_LANE_ENV]: '1', [FLAKE_LANE_ENV]: '1' }), [
    'destructive',
    'both',
  ]);
  assert.deepEqual(selection({ [FLAKE_LANE_ENV]: 'true' }), ['ordinary', 'lookAlike'], 'only 1');
});

test('each lane sets its own variable: the flake lane keeps quarantined cases, the destructive lane does not', () => {
  assert.equal(LANE_ENV[FLAKE_LANE_ENV], '1');
  assert.equal(LANE_ENV.QA_RETRIES, '0');
  assert.equal(DESTRUCTIVE_ENV[DESTRUCTIVE_LANE_ENV], '1');
  assert.equal(DESTRUCTIVE_ENV[FLAKE_LANE_ENV], undefined);
});

test('a run of the repository configuration lists no quarantined case', () => {
  assert.deepEqual(listed({}), [ORDINARY, LOOK_ALIKE]);
});

test('the destructive lane lists its destructive cases, still without the quarantined one', () => {
  assert.deepEqual(listed({ [DESTRUCTIVE_LANE_ENV]: '1' }), [DESTRUCTIVE]);
});

test('the flake lane runs the quarantined cases, through the variable it sets itself', () => {
  const { code, report } = flakeLane(
    { project: 'api-fixture', repeats: 2, config: CONFIG },
    REPO_ROOT,
    {},
    // The caller's variables are cleared first, so only what the lane sets reaches Playwright.
    (root, args, env) => runLane(root, args, { ...NEITHER, ...env }),
  );
  assert.equal(code, 0);
  assert.deepEqual(caseIds(report.verdicts), [ORDINARY, ...QUARANTINED, LOOK_ALIKE].sort());
  assert.deepEqual(
    report.verdicts.filter((v) => v.quarantined).map((v) => [v.verdict, v.pass]),
    QUARANTINED.map(() => ['stable', 2]),
  );
});
