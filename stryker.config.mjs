// Mutation testing (GATE-10): Stryker changes the shared libraries one small edit at a time and
// checks that some node:test suite notices. Surviving mutants point at behaviour no test pins down.
//
// Stryker has no runner for node:test, so the `command` runner runs the suites as a whole for every
// mutant (no per-test coverage): slow, which is why mutation is not part of `npm run gates`.
// The JSON report feeds the quality gate's mutation_score check (reports/mutation/mutation.json).
//
//   npx stryker run                                     every library, every suite
//   npx stryker run --mutate scripts/lib/pairwise.mjs   one file (MUTATION_TESTS narrows the suites)

const SUITES = 'scripts/__tests__/*.test.mjs .claude/hooks/__tests__/*.test.mjs';
const tests = process.env.MUTATION_TESTS || SUITES;

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'command',
  commandRunner: {
    // node:test expands the quoted globs itself, so the command behaves the same in every shell.
    command: `node --test ${tests
      .split(/\s+/)
      .filter(Boolean)
      .map((glob) => `"${glob}"`)
      .join(' ')}`,
  },
  mutate: ['scripts/lib/**/*.mjs', '.claude/hooks/lib/**/*.mjs'],
  reporters: ['clear-text', 'progress', 'json'],
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  tempDirName: 'reports/.stryker-tmp',
  cleanTempDir: 'always',
  // Run output and tool caches are not needed in the sandbox copy.
  ignorePatterns: [
    'reports',
    'allure-results',
    'allure-report',
    'playwright-report',
    'test-results',
    'blob-report',
    '.claude/worktrees',
  ],
  concurrency: 2,
  timeoutMS: 60000,
  thresholds: { high: 80, low: 60, break: null },
};
