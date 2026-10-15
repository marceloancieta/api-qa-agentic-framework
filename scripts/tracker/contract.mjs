// The tracker contract: behaviour every tracker adapter must show behind verifiedTracker(), written
// once and run against each adapter (the local file store, and fakes of the GitHub and Jira APIs).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { trackerProblems, verifiedTracker } from './tracker.mjs';

const BODY =
  'Calling GET /pet/<petId> with an id that was never created answers 500.\n\nExpected 404.';

/** `make()` returns a fresh adapter over an empty tracker each time. */
export function describeTrackerContract(name, make, { closes = 'done', reopens = true } = {}) {
  describe(`tracker contract: ${name}`, () => {
    test('has a valid shape', () => {
      assert.deepEqual(trackerProblems(make()), []);
    });

    test('an issue is created, read back, and keeps its placeholders when rendered', async () => {
      const tracker = verifiedTracker(make());
      const { key, url } = await tracker.createIssue({
        title: 'Unknown pet id answers 500',
        body: BODY,
      });
      assert.ok(key && url);
      const issue = await tracker.getIssue(key);
      assert.equal(issue.category, 'open');
      assert.match(issue.body, /`<petId>`/, 'placeholders were sent inside code spans');
    });

    test('a comment is added and read back', async () => {
      const tracker = verifiedTracker(make());
      const { key } = await tracker.createIssue({ title: 'commented', body: 'x' });
      const { id } = await tracker.comment(key, 'Still fails for <orderId> as well.');
      assert.ok(id);
    });

    test('a title and labels are updated and read back, keeping the labels nobody named', async () => {
      const tracker = verifiedTracker(make());
      const { key } = await tracker.createIssue({
        title: 'Unknown pet id answers 500 (unconfirmed)',
        body: BODY,
        labels: ['class:error-handling', 'type:unconfirmed-finding'],
      });
      assert.deepEqual((await tracker.getIssue(key)).labels.sort(), [
        'class:error-handling',
        'type:unconfirmed-finding',
      ]);
      const promoted = await tracker.updateIssue(key, {
        title: 'Unknown pet id answers 500',
        addLabels: ['severity:S3'],
        removeLabels: ['type:unconfirmed-finding'],
      });
      assert.deepEqual(promoted, {
        key,
        title: 'Unknown pet id answers 500',
        labels: ['class:error-handling', 'severity:S3'],
      });
      const issue = await tracker.getIssue(key);
      assert.equal(issue.title, 'Unknown pet id answers 500');
      assert.deepEqual(issue.labels.sort(), ['class:error-handling', 'severity:S3']);
      assert.equal(issue.body, BODY.replace('<petId>', '`<petId>`'), 'the body is untouched');

      const retitled = await tracker.updateIssue(key, { title: 'Any unknown id answers 500' });
      assert.deepEqual(retitled.labels, ['class:error-handling', 'severity:S3']);
    });

    test('an issue moves to done and back', async () => {
      const tracker = verifiedTracker(make());
      const { key } = await tracker.createIssue({ title: 'moved', body: 'x' });
      assert.equal((await tracker.transition(key, closes)).category, 'done');
      if (reopens) assert.equal((await tracker.transition(key, 'open')).category, 'open');
    });

    test('a search finds issues by every word of their title, description or comments', async () => {
      const tracker = verifiedTracker(make());
      const pet = await tracker.createIssue({ title: 'Unknown pet id answers 500', body: BODY });
      const order = await tracker.createIssue({
        title: 'Order quantity is not validated',
        body: 'Negative quantities are stored.',
      });
      await tracker.comment(order.key, 'Also seen on the inventory endpoint.');
      const keys = async (text) => (await tracker.searchIssues(text)).map((issue) => issue.key);
      assert.deepEqual(await keys('UNKNOWN pet'), [pet.key], 'words of the title, any case');
      assert.deepEqual(await keys('expected'), [pet.key], 'a word of the description');
      assert.deepEqual(await keys('inventory'), [order.key], 'a word of a comment');
      assert.deepEqual(await keys('pet quantity'), [], 'every word must appear');
      assert.deepEqual(await keys('teapot'), []);
      const issue = await tracker.getIssue(pet.key);
      const shape = ['key', 'title', 'status', 'category', 'url'];
      assert.deepEqual(
        (await tracker.searchIssues('pet'))[0],
        Object.fromEntries(shape.map((field) => [field, issue[field]])),
        'the fields of getIssue without the body',
      );
    });

    test('a search can leave out done issues and stops at its limit', async () => {
      const tracker = verifiedTracker(make());
      const closed = await tracker.createIssue({ title: 'Login rejects a valid token', body: 'x' });
      const open = await tracker.createIssue({
        title: 'Login accepts an expired token',
        body: 'x',
      });
      await tracker.transition(closed.key, closes);
      const keys = async (text, options) =>
        (await tracker.searchIssues(text, options)).map((issue) => issue.key).sort();
      assert.deepEqual(await keys('login token'), [closed.key, open.key].sort());
      assert.deepEqual(await keys('login token', { open: true }), [open.key]);
      assert.equal((await tracker.searchIssues('login', { limit: 1 })).length, 1);
    });

    test('search text that looks like query syntax is searched as text', async () => {
      const tracker = verifiedTracker(make());
      const quoted = await tracker.createIssue({
        title: 'Status filter "sold" OR "pending" (any order) fails',
        body: 'x',
      });
      await tracker.createIssue({ title: 'Pending pets are listed twice', body: 'x' });
      const found = await tracker.searchIssues('"sold" OR (any order)');
      assert.deepEqual(
        found.map((issue) => issue.key),
        [quoted.key],
      );
    });

    test('an unknown key reads as absent, not as an error', async () => {
      const adapter = make();
      const created = await adapter.createIssue({ title: 'one', body: '' });
      const unknown = created.key.replace(/\d+$/, '9999');
      assert.equal(await verifiedTracker(adapter).getIssue(unknown), null);
    });
  });
}
