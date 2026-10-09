// Case metadata for the results (Allure format, read by every test-management adapter).
//
// Identity. Reporters derive a case id from the file path and describe blocks by default, so moving
// or renaming a spec creates a new case and orphans the old one. A case whose title starts with its
// designed id (`TC-PET-01 ...`) gets `<service>-<version>-<TC id>` instead, which survives
// refactors and stays unique when two API versions share case numbers.
//
// Tags. Playwright tags (`{ tag: '@smoke' }` or `@smoke` in the title) are copied to the results by
// allure-playwright itself, so the title stays the single place a tag is written.

import { test, type TestInfo } from '@playwright/test';
import * as allure from 'allure-js-commons';
import { loadRuntime, type QaRuntime } from './config';
import type { ServicePack } from './service';

const CASE_ID = /^(TC-[A-Z][A-Z0-9]*-\d+)\b/;

export type Severity = 'blocker' | 'critical' | 'normal' | 'minor' | 'trivial';

/** The designed case id at the start of a title, or null. */
export function caseIdFromTitle(title: string): string | null {
  return CASE_ID.exec(title)?.[1] ?? null;
}

/** `<service>-<version>-<TC id>`, or null when the title carries no case id. */
export function caseIdentity(service: Pick<ServicePack, 'name' | 'version'>, title: string) {
  const id = caseIdFromTitle(title);
  return id ? `${service.name}-${service.version}-${id}` : null;
}

/** Labels every case of a pack gets; called by the pack's automatic fixture. */
export async function applyCaseMeta(service: ServicePack, testInfo: TestInfo): Promise<void> {
  const run = process.env.QA_RUN_ID;
  if (run) await allure.label('run', run);
  await allure.parentSuite(service.title);
  await allure.suite(service.version);
  const identity = caseIdentity(service, testInfo.title);
  if (identity) {
    await allure.testCaseId(identity);
    await allure.historyId(identity);
  }
}

export interface Operation {
  method: string;
  path: string;
  /** Business area, e.g. the OpenAPI tag. */
  area?: string;
  severity?: Severity;
}

/** The endpoint a case exercises: groups results by area and operation. */
export async function operation(op: Operation): Promise<void> {
  if (op.area) await allure.feature(op.area);
  await allure.story(`${op.method.toUpperCase()} ${op.path}`);
  await allure.severity(op.severity ?? 'normal');
}

/**
 * Wrap `<placeholder>` tokens of prose in code spans. Markdown renderers read a bare `<petId>` as
 * an HTML tag and drop it; inside backticks it survives. Existing code spans are left alone.
 */
export function codeSpanPlaceholders(markdown: string): string {
  return markdown
    .split(/(`[^`]*`)/)
    .map((part) => (part.startsWith('`') ? part : part.replace(/<([A-Za-z][\w.-]*)>/g, '`<$1>`')))
    .join('');
}

/** The case description (Markdown), with placeholders made safe to render. */
export async function caseDescription(markdown: string): Promise<void> {
  await allure.description(codeSpanPlaceholders(markdown));
}

/**
 * Record which open issue explains a case marked as failing, and hand back the reason text:
 *
 *     const reason = await knownGap('PROJ-123', 'returns 500 instead of 400 for a wrong type');
 *     test.fail(true, reason);
 *
 * The arm stays in the spec so linters can see it; this helper only makes the link impossible to
 * forget. A key that does not match `tracker.key_pattern` fails here, because a link to a mistyped
 * key reads as tracked when it is not.
 */
export async function knownGap(key: string, why: string): Promise<string> {
  const { tracker, source } = loadRuntime();
  await allure.issue(issueUrl(tracker, key, source), key);
  test.info().annotations.push({ type: 'issue', description: key });
  return `${key}: ${why}`;
}

/** The link to issue `key`, after checking the key against the tracker configuration. */
export function issueUrl(tracker: QaRuntime['tracker'], key: string, source = 'qa-config'): string {
  if (!tracker.keyPattern || !tracker.issueUrl) {
    throw new Error(
      `knownGap('${key}') needs tracker.key_pattern and tracker.issue_url in ${source}. ` +
        'A gap without a filed issue is a note, not a known gap.',
    );
  }
  if (!new RegExp(`^(?:${tracker.keyPattern})$`).test(key)) {
    throw new Error(`knownGap('${key}'): not a key matching tracker.key_pattern in ${source}.`);
  }
  return tracker.issueUrl.replace('{key}', encodeURIComponent(key));
}
