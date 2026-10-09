// lint-suite (GATE-02): exact against its fixtures, and the repository scope stays clean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES, lintFixtures, lintRepository, lintText } from '../lint-suite.mjs';
import { compareWithMarkers, selfTest } from '../lib/lint.mjs';

const silent = { log: () => {} };
const rules = (text) => lintText(text, 'x.md').map((f) => f.rule);

test('the self-test is exact: every marked value found, no reserved value reported', () => {
  const findings = lintFixtures();
  assert.deepEqual(compareWithMarkers(FIXTURES, findings), { missed: [], unexpected: [] });
  assert.equal(selfTest('lint-suite', FIXTURES, findings, silent), 0);
});

test('the designs, specs and docs in the repository are clean', () => {
  assert.deepEqual(lintRepository(), []);
});

test('reserved values are accepted at their edges only', () => {
  assert.deepEqual(rules('a@example.com a@sub.example.net a@x.test a@x.invalid'), []);
  assert.deepEqual(rules('a@example.co'), ['email-address']);
  assert.deepEqual(rules('a@notexample.com'), ['email-address']);
  assert.deepEqual(rules('192.0.2.255 198.51.100.1 203.0.113.9 127.9.9.9'), []);
  assert.deepEqual(rules('192.0.3.1'), ['ip-address']);
  assert.deepEqual(rules('999.1.1.1'), [], 'not an address');
  assert.deepEqual(rules('+1 (202) 555-0100 202.555.0199'), []);
  assert.deepEqual(rules('+1 202 555 0200'), ['phone-number']);
});

test('the report masks the value it found', () => {
  const [only] = lintText('mail jane.doe@mailhub.co', 'x.md');
  assert.ok(!only.message.includes('jane.doe@mailhub.co'));
});
