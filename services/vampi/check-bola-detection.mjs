#!/usr/bin/env node
// Checks that the book authorization matrix detects the flaw of VAmPI's vulnerable mode (CI-08):
// reads the Playwright JSON report of a run of specs/books-authorization.spec.ts against
// `local-vulnerable` and passes only when TC-BOOK-02 is the one case that failed (VN-09). A matrix
// that stops failing there has stopped detecting Broken Object Level Authorization; any other
// failure means the run proves nothing.
//
// Usage: node services/vampi/check-bola-detection.mjs <json-report>

import { readFileSync } from 'node:fs';

const EXPECTED = ['TC-BOOK-02'];

const file = process.argv[2];
if (!file) {
  console.error('Usage: node services/vampi/check-bola-detection.mjs <json-report>');
  process.exit(2);
}
const report = JSON.parse(readFileSync(file, 'utf8'));
const failed = [];
const passed = [];
const visit = (suite) => {
  for (const spec of suite.specs ?? []) {
    const id = /^(TC-[A-Z]+-\d+)\b/.exec(spec.title)?.[1];
    if (!id) continue;
    const ok = (spec.tests ?? []).every((test) => test.status === 'expected');
    (ok ? passed : failed).push(id);
  }
  for (const child of suite.suites ?? []) visit(child);
};
for (const suite of report.suites ?? []) visit(suite);

const same = failed.length === EXPECTED.length && EXPECTED.every((id) => failed.includes(id));
console.log(
  `vulnerable mode: failed [${failed.sort().join(', ')}], passed [${passed.sort().join(', ')}]`,
);
if (same) {
  console.log('BOLA detected: TC-BOOK-02 fails on the vulnerable mode, as designed (VN-09).');
} else {
  console.error(`Expected exactly [${EXPECTED.join(', ')}] to fail on the vulnerable mode.`);
  process.exitCode = 1;
}
