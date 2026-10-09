import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTracker as createGitHub } from '../tracker/adapters/github.mjs';
import { createTracker as createJira } from '../tracker/adapters/jira.mjs';
import { createTracker as createLocal } from '../tracker/adapters/local.mjs';
import { describeTrackerContract } from '../tracker/contract.mjs';
import { runCommand } from '../tracker/cli.mjs';
import { loadTracker } from '../tracker/index.mjs';
import { credential, verifiedTracker } from '../tracker/tracker.mjs';
import { fakeGitHub, fakeJira } from '../__fixtures__/tracker/fakes.mjs';

const github = (fake = fakeGitHub()) =>
  createGitHub(fake.options, { env: fake.env, fetchImpl: fake.fetchImpl });
const jira = (fake = fakeJira()) =>
  createJira(fake.options, { env: fake.env, fetchImpl: fake.fetchImpl, baseUrl: fake.baseUrl });

describeTrackerContract(
  'local',
  () => createLocal({}, { root: mkdtempSync(join(tmpdir(), 'trk-local-')) }),
  {
    closes: 'done',
  },
);
describeTrackerContract('github (fake API)', () => github());
describeTrackerContract('jira (fake API)', () => jira(), { closes: 'Done' });

test('a renderer that drops placeholders is caught (L-47)', async () => {
  const dropsEverything = (text) => String(text).replace(/<[^>]*>|`[^`]*`/g, '');
  const tracker = verifiedTracker(github(fakeGitHub({ render: dropsEverything })));
  await assert.rejects(
    tracker.createIssue({ title: 't', body: 'see <petId>' }),
    /rendering of issue #1 dropped <petId>/,
  );
});

test('a body changed by the tracker fails the read-back (L-04)', async () => {
  const adapter = createLocal({}, { root: mkdtempSync(join(tmpdir(), 'trk-edit-')) });
  const altered = {
    ...adapter,
    getIssue: async (key) => ({ ...(await adapter.getIssue(key)), body: 'something else' }),
  };
  await assert.rejects(
    verifiedTracker(altered).createIssue({ title: 't', body: 'original' }),
    /Read-back of the body/,
  );
});

test('GitHub has no in-progress state; Jira lists what is reachable', async () => {
  const gh = verifiedTracker(github());
  const { key } = await gh.createIssue({ title: 't', body: '' });
  await assert.rejects(gh.transition(key, 'in-progress'), /open or closed/);

  const jr = verifiedTracker(jira());
  const created = await jr.createIssue({ title: 't', body: '' });
  assert.equal((await jr.transition(created.key, 'in-progress')).status, 'In Progress');
  await assert.rejects(
    jr.transition(created.key, 'Archived'),
    /no transition to "Archived".*available: To Do, Done/,
  );
});

test('credentials come from the environment, by name, and failures never echo them', async () => {
  assert.throws(
    () => credential({}, 'GITHUB_TOKEN', 'The github tracker'),
    /environment variable GITHUB_TOKEN/,
  );
  assert.throws(() => createGitHub({ repo: 'a/b' }, { env: {} }), /GITHUB_TOKEN/);
  const fake = fakeGitHub();
  const wrong = createGitHub(fake.options, {
    env: { GITHUB_TOKEN: 'not-the-token' },
    fetchImpl: fake.fetchImpl,
  });
  const failure = await wrong.createIssue({ title: 't', body: '' }).catch((error) => error);
  assert.match(failure.message, /HTTP 401/);
  assert.doesNotMatch(failure.message, /not-the-token/);
});

test('provider none means no tracker; unknown providers fail', async () => {
  assert.equal(await loadTracker({ provider: 'none' }), null);
  assert.equal(await loadTracker({}), null);
  await assert.rejects(loadTracker({ provider: 'redmine' }), /Unknown tracker provider "redmine"/);
});

test('the CLI creates, comments, moves and reads through the verified tracker', async () => {
  const root = mkdtempSync(join(tmpdir(), 'trk-cli-'));
  const tracker = verifiedTracker(createLocal({}, { root }));
  const log = { info: () => {}, warn: () => {}, error: () => {} };
  const bodyFile = join(root, 'body.md');
  writeFileSync(bodyFile, 'Fails for <petId>.');
  const { key: issue } = await runCommand(
    ['create', '--title', 'cli issue', '--body-file', bodyFile],
    { tracker, log },
  );
  await runCommand(['comment', issue, '--body-file', bodyFile], { tracker, log });
  await runCommand(['move', issue, 'done'], { tracker, log });
  const read = await runCommand(['get', issue], { tracker, log });
  assert.deepEqual([read.title, read.category], ['cli issue', 'done']);
  await assert.rejects(
    runCommand(['create', '--title', 't'], { tracker, log }),
    /--body-file is required/,
  );
  await assert.rejects(runCommand(['explode'], { tracker, log }), /Usage: tracker/);
});
