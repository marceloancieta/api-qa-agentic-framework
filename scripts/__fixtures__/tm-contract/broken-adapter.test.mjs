// Run only by tm-adapter.test.mjs: the contract must fail for an adapter that republishes every case
// with a new id instead of recognising it.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAdapter } from '../../tm/adapters/local/index.mjs';
import { describeAdapterContract } from '../../tm/contract.mjs';

describeAdapterContract('broken', () => {
  const adapter = createAdapter(
    { dir: 'store' },
    { root: mkdtempSync(join(tmpdir(), 'tm-broken-')) },
  );
  let next = 1000;
  return {
    ...adapter,
    async publishDefinitions(cases) {
      return {
        published: cases.map((c) => ({ identity: c.identity, tmId: `X-${next++}` })),
        unchanged: [],
      };
    },
  };
});
