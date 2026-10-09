// The adapter contract (ADR 0004): behaviour every test-management adapter must show, written once
// and run against each adapter. A new adapter is done when it passes this suite against its tool,
// or against a faithful fake of the tool's API.
//
//   import { describeAdapterContract } from '../tm/contract.mjs';
//   describeAdapterContract('local', () => createAdapter({ dir }, { root }));

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { adapterProblems } from './adapter.mjs';

/** Two cases and their results, in manifest shape. */
export function sampleCases() {
  return [
    {
      identity: 'shop-v1-TC-ITEM-01',
      caseId: 'TC-ITEM-01',
      title: 'an item can be created with the required fields',
      feature: 'ITEM',
      technique: 'equivalence-partition',
      priority: 'high',
      status: 'automated',
      tags: ['@smoke'],
      spec: { file: 'services/shop/specs/items.spec.ts', line: 7 },
    },
    {
      identity: 'shop-v1-TC-ITEM-02',
      caseId: 'TC-ITEM-02',
      title: 'a name over 50 characters is rejected',
      feature: 'ITEM',
      technique: 'boundary-value',
      priority: 'medium',
      status: 'approved',
      tags: [],
      spec: null,
    },
  ];
}

export function sampleResults() {
  return [
    { identity: 'shop-v1-TC-ITEM-01', status: 'passed', attempts: 1, durationMs: 120, issues: [] },
    {
      identity: 'shop-v1-TC-ITEM-02',
      status: 'failed',
      attempts: 1,
      durationMs: 80,
      issues: ['BUG-7'],
    },
  ];
}

/**
 * Register the contract tests for one adapter. `makeAdapter` returns a fresh adapter over an empty
 * store each time it is called.
 */
export function describeAdapterContract(name, makeAdapter) {
  describe(`adapter contract: ${name}`, () => {
    test('has a valid shape and declares its capabilities', () => {
      assert.deepEqual(adapterProblems(makeAdapter()), []);
    });

    test('publishing is scoped, read back and idempotent', async (t) => {
      const adapter = makeAdapter();
      if (!adapter.capabilities.definitions) return t.skip('the tool holds no definitions');
      const [first, second] = sampleCases();
      const once = await adapter.publishDefinitions([first]);
      assert.deepEqual(
        once.published.map((p) => p.identity),
        [first.identity],
      );
      assert.ok(once.published[0].tmId, 'a published case gets the tool id');

      const again = await adapter.publishDefinitions([first, second]);
      assert.deepEqual(again.unchanged, [first.identity], 'an unchanged case is not rewritten');
      assert.deepEqual(
        again.published.map((p) => p.identity),
        [second.identity],
      );

      const stored = await adapter.readDefinitions([first.identity, second.identity]);
      assert.equal(stored[first.identity].tmId, once.published[0].tmId, 'ids are stable');
      assert.equal(stored[second.identity].title, second.title);
    });

    test('an edited case keeps its tool id', async (t) => {
      const adapter = makeAdapter();
      if (!adapter.capabilities.definitions) return t.skip('the tool holds no definitions');
      const [first] = sampleCases();
      const { published } = await adapter.publishDefinitions([first]);
      const edited = await adapter.publishDefinitions([{ ...first, priority: 'low' }]);
      assert.equal(edited.published[0].tmId, published[0].tmId);
    });

    test('a run is started, receives results, and closes idempotently', async (t) => {
      const adapter = makeAdapter();
      if (!adapter.capabilities.runs) return t.skip('the tool records no runs');
      if (adapter.capabilities.definitions) await adapter.publishDefinitions(sampleCases());
      const run = await adapter.startRun({ name: 'contract run', runId: 'abc123' });
      assert.ok(run.id);
      const { reported, skipped } = await adapter.reportResults(run, sampleResults());
      assert.deepEqual([reported.length, skipped], [2, []]);
      const stored = await adapter.readRun(run);
      assert.equal(stored.results['shop-v1-TC-ITEM-02'].status, 'failed');
      assert.deepEqual(await adapter.closeRun(run), { closed: true, alreadyClosed: false });
      assert.deepEqual(await adapter.closeRun(run), { closed: true, alreadyClosed: true });
    });

    test('a result for a case the tool does not know is skipped with a reason, never dropped', async (t) => {
      const adapter = makeAdapter();
      if (!adapter.capabilities.runs || !adapter.capabilities.definitions) {
        return t.skip('only definitions-first tools can refuse unknown cases');
      }
      const run = await adapter.startRun({ name: 'unknown cases' });
      const { reported, skipped } = await adapter.reportResults(run, sampleResults().slice(0, 1));
      assert.deepEqual(reported, []);
      assert.equal(skipped[0].identity, 'shop-v1-TC-ITEM-01');
      assert.match(skipped[0].reason, /not published/);
      await adapter.closeRun(run);
    });

    test('a closed run accepts no more results', async (t) => {
      const adapter = makeAdapter();
      if (!adapter.capabilities.runs) return t.skip('the tool records no runs');
      const run = await adapter.startRun({ name: 'closed' });
      await adapter.closeRun(run);
      await assert.rejects(adapter.reportResults(run, sampleResults()), /closed/);
    });
  });
}
