import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTracker as createGitHub, githubSearchQuery } from '../tracker/adapters/github.mjs';
import { createTracker as createJira, jiraSearchJql } from '../tracker/adapters/jira.mjs';
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
  const dropsEverything = (text) => {
    let out = String(text);
    for (let previous = null; out !== previous;) {
      previous = out;
      out = out.replace(/<[^>]*>|`[^`]*`/g, '');
    }
    return out;
  };
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

test('an update refuses what it cannot do or check, before writing anything', async () => {
  const adapter = createLocal({}, { root: mkdtempSync(join(tmpdir(), 'trk-update-')) });
  let writes = 0;
  const tracker = verifiedTracker({
    ...adapter,
    updateIssue: async (...args) => {
      writes += 1;
      return adapter.updateIssue(...args);
    },
  });
  const { key } = await tracker.createIssue({ title: 't', body: '', labels: ['class:a'] });
  await assert.rejects(tracker.updateIssue(key, {}), /Nothing to update on LOCAL-1/);
  await assert.rejects(tracker.updateIssue(key, { title: '  ' }), /new title of LOCAL-1 is empty/);
  await assert.rejects(
    tracker.updateIssue(key, { addLabels: ['x'], removeLabels: ['x'] }),
    /x cannot be both added to and removed from LOCAL-1/,
  );
  await assert.rejects(
    tracker.updateIssue(key, { removeLabels: ['class:b'] }),
    /LOCAL-1 has no label class:b to remove \(labels: class:a\)/,
  );
  await assert.rejects(tracker.updateIssue('LOCAL-9', { title: 'x' }), /No issue LOCAL-9/);
  assert.equal(writes, 0);
  const again = await tracker.updateIssue(key, { addLabels: ['class:a', 'class:a'] });
  assert.deepEqual(again.labels, ['class:a'], 'adding a label it has already changes nothing');
});

test('an update the tracker did not apply fails the read-back (L-04)', async () => {
  const adapter = createLocal({}, { root: mkdtempSync(join(tmpdir(), 'trk-ignored-')) });
  const ignoresLabels = {
    ...adapter,
    updateIssue: (key, { title }) => adapter.updateIssue(key, { title }),
  };
  const tracker = verifiedTracker(ignoresLabels);
  const { key } = await tracker.createIssue({ title: 't', body: '', labels: ['a'] });
  await assert.rejects(
    tracker.updateIssue(key, { title: 'u', addLabels: ['b'] }),
    /Read-back of the labels of LOCAL-1 differs from what was sent: sent \[a, b\], read back \[a\]/,
  );
  const ignoresTitle = verifiedTracker({ ...adapter, updateIssue: async () => {} });
  await assert.rejects(ignoresTitle.updateIssue(key, { title: 'v' }), /Read-back of the title/);
});

test('a tracker without updateIssue or without labels in getIssue says it cannot update', async () => {
  const adapter = createLocal({}, { root: mkdtempSync(join(tmpdir(), 'trk-noupdate-')) });
  const { updateIssue, ...withoutUpdate } = adapter;
  assert.equal(typeof updateIssue, 'function');
  const old = verifiedTracker(withoutUpdate);
  const { key } = await old.createIssue({ title: 't', body: '' });
  await assert.rejects(old.updateIssue(key, { title: 'u' }), /local tracker cannot update issues/);
  const noLabels = verifiedTracker({
    ...adapter,
    getIssue: async (k) => {
      const issue = await adapter.getIssue(k);
      delete issue.labels;
      return issue;
    },
  });
  await assert.rejects(
    noLabels.updateIssue(key, { addLabels: ['a'] }),
    /does not read labels back, so it cannot change them/,
  );
  assert.equal((await noLabels.updateIssue(key, { title: 'u' })).title, 'u');
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
  await runCommand(
    ['update', issue, '--title', 'cli issue, renamed', '--add-label', 'a', '--add-label', 'b'],
    { tracker, log },
  );
  const updated = await runCommand(['update', issue, '--remove-label', 'a'], { tracker, log });
  assert.deepEqual(updated.labels, ['b']);
  const read = await runCommand(['get', issue], { tracker, log });
  assert.deepEqual([read.title, read.category], ['cli issue, renamed', 'done']);
  await assert.rejects(runCommand(['update'], { tracker, log }), /update needs the key/);
  await assert.rejects(runCommand(['update', issue], { tracker, log }), /Nothing to update/);
  await assert.rejects(
    runCommand(['create', '--title', 't'], { tracker, log }),
    /--body-file is required/,
  );
  await assert.rejects(runCommand(['explode'], { tracker, log }), /Usage: tracker/);
});

test('a search needs text and a limit from 1 to 100, and never returns more than the limit', async () => {
  const adapter = createLocal({}, { root: mkdtempSync(join(tmpdir(), 'trk-search-')) });
  const tracker = verifiedTracker({
    ...adapter,
    searchIssues: async (text) => (await adapter.searchIssues(text, { limit: 100 })).concat([{}]),
  });
  await assert.rejects(tracker.searchIssues('  '), /needs the text/);
  for (const limit of [0, 101, 2.5, '5'])
    await assert.rejects(tracker.searchIssues('x', { limit }), /whole number from 1 to 100/);
  await tracker.createIssue({ title: 'one', body: '' });
  assert.equal((await tracker.searchIssues('one', { limit: 1 })).length, 1);
});

test('the GitHub search is scoped to the repository and quotes every word', async () => {
  assert.equal(
    githubSearchQuery('acme/api', 'say "hi" repo:other/x OR', { open: true }),
    '"say" "hi" "repo:other/x" "OR" repo:acme/api is:issue is:open',
  );
  assert.throws(() => githubSearchQuery('acme/api', ' "" '), /Nothing to search for/);
  const fake = fakeGitHub();
  const tracker = verifiedTracker(github(fake));
  await tracker.createIssue({ title: 'scoped', body: '' });
  assert.equal((await tracker.searchIssues('scoped repo:other/x', { limit: 5 })).length, 0);
  assert.deepEqual(fake.queries, ['"scoped" "repo:other/x" repo:acme/api is:issue']);
});

test('the Jira search escapes the text, scopes the project and falls back to the classic API', async () => {
  assert.equal(
    jiraSearchJql('Q"A', 'a "b" c-d (e) f\\g', { open: true }),
    'project = "Q\\"A" AND text ~ "a b c d e f g" AND statusCategory != Done ORDER BY updated DESC',
  );
  assert.throws(() => jiraSearchJql('QA', '?? *'), /Nothing to search for/);
  for (const legacySearch of [false, true]) {
    const fake = fakeJira({ legacySearch });
    const tracker = verifiedTracker(jira(fake));
    const { key } = await tracker.createIssue({ title: 'Pet tags are dropped', body: '' });
    const found = await tracker.searchIssues('pet: tags?');
    assert.deepEqual(
      found.map((issue) => issue.key),
      [key],
    );
    assert.equal(fake.queries.length, 1);
  }
});

test('the CLI searches through the verified tracker and validates its options', async () => {
  const root = mkdtempSync(join(tmpdir(), 'trk-cli-search-'));
  const tracker = verifiedTracker(createLocal({}, { root }));
  const lines = [];
  const log = { info: (message, fields) => lines.push({ message, ...fields }) };
  const { key: closed } = await tracker.createIssue({ title: 'Pet name is not trimmed', body: '' });
  const { key: open } = await tracker.createIssue({ title: 'Pet tags are dropped', body: '' });
  await tracker.transition(closed, 'done');
  const found = await runCommand(['search', 'pet', '--limit', '5'], { tracker, log });
  assert.deepEqual(
    found.map((issue) => issue.key),
    [open, closed],
  );
  assert.deepEqual(lines.at(-1), { message: 'search', text: 'pet', open: false, found: 2 });
  assert.equal(lines[0].title, 'Pet tags are dropped');
  const onlyOpen = await runCommand(['search', 'pet', 'tags', '--open'], { tracker, log });
  assert.deepEqual(
    onlyOpen.map((issue) => issue.key),
    [open],
  );
  assert.deepEqual(await runCommand(['search', 'teapot'], { tracker, log }), []);
  await assert.rejects(runCommand(['search'], { tracker, log }), /search needs the text/);
  await assert.rejects(
    runCommand(['search', 'pet', '--limit', 'ten'], { tracker, log }),
    /--limit must be a whole number/,
  );
  await assert.rejects(
    runCommand(['search', 'pet', '--limit', '500'], { tracker, log }),
    /from 1 to 100/,
  );
});
