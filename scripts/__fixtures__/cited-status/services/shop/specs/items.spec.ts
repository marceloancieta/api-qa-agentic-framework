test('TC-ITEM-01 still broken', async () => {
  test.fail(true, await knownGap('LOCAL-1', 'still broken'));
});
test('TC-ITEM-02 fixed upstream', async () => {
  test.fail(true, await knownGap('LOCAL-2', 'fixed upstream')); // expect-finding: stale-claim
});
