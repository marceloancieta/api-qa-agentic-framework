// Adapters by provider name (qa-config test_management.provider). Each module exports
// createAdapter(options, context). A provider documented but not implemented fails with a pointer.

import { adapterProblems } from '../adapter.mjs';

const MODULES = {
  'allure-report': () => import('./allure-report/index.mjs'),
  'allure-testops': () => import('./allure-testops/index.mjs'),
  local: () => import('./local/index.mjs'),
};

const DOCUMENTED_ONLY = {
  testrail: 'docs/test-management.md (TestRail section) describes how to write this adapter.',
};

export async function loadAdapter(provider, options = {}, context = {}) {
  if (DOCUMENTED_ONLY[provider]) {
    throw new Error(`The "${provider}" adapter is not implemented. ${DOCUMENTED_ONLY[provider]}`);
  }
  const load = MODULES[provider];
  if (!load) {
    throw new Error(
      `Unknown test-management provider "${provider}". Known: ${Object.keys(MODULES).join(', ')}.`,
    );
  }
  const adapter = (await load()).createAdapter(options, context);
  const problems = adapterProblems(adapter);
  if (problems.length > 0)
    throw new Error(`Adapter "${provider}" is incomplete: ${problems.join('; ')}.`);
  return adapter;
}

export const PROVIDERS = Object.keys(MODULES);
