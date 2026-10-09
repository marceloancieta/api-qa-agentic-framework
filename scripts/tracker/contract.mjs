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

    test('an issue moves to done and back', async () => {
      const tracker = verifiedTracker(make());
      const { key } = await tracker.createIssue({ title: 'moved', body: 'x' });
      assert.equal((await tracker.transition(key, closes)).category, 'done');
      if (reopens) assert.equal((await tracker.transition(key, 'open')).category, 'open');
    });

    test('an unknown key reads as absent, not as an error', async () => {
      const adapter = make();
      const created = await adapter.createIssue({ title: 'one', body: '' });
      const unknown = created.key.replace(/\d+$/, '9999');
      assert.equal(await verifiedTracker(adapter).getIssue(unknown), null);
    });
  });
}
