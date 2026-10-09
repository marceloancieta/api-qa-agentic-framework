import { test, expect } from '@playwright/test';
import { caseIdFromTitle, caseIdentity, codeSpanPlaceholders, issueUrl } from '../case-meta';

test.describe('case identity', () => {
  test('comes from the TC id at the start of the title', () => {
    expect(caseIdFromTitle('TC-PET-07 rejects an unknown status @negative')).toBe('TC-PET-07');
    expect(caseIdentity({ name: 'petstore', version: 'v3' }, 'TC-PET-07 rejects')).toBe(
      'petstore-v3-TC-PET-07',
    );
  });

  test('is null when the title carries no id, or carries it elsewhere', () => {
    expect(caseIdFromTitle('smoke: inventory')).toBeNull();
    expect(caseIdFromTitle('inventory TC-PET-01')).toBeNull();
    expect(caseIdFromTitle('TC-PET-1a')).toBeNull();
  });
});

test.describe('codeSpanPlaceholders', () => {
  test('wraps bare placeholders and leaves code spans alone', () => {
    expect(codeSpanPlaceholders('GET /pet/<petId> as `<owner>` then <ORDER_ID>.')).toBe(
      'GET /pet/`<petId>` as `<owner>` then `<ORDER_ID>`.',
    );
  });

  test('leaves text without placeholders unchanged', () => {
    expect(codeSpanPlaceholders('a -> b, 3 < 4')).toBe('a -> b, 3 < 4');
  });
});

test.describe('issueUrl', () => {
  const tracker = { keyPattern: 'PROJ-\\d+', issueUrl: 'https://tracker.example/browse/{key}' };

  test('builds the link for a valid key', () => {
    expect(issueUrl(tracker, 'PROJ-12')).toBe('https://tracker.example/browse/PROJ-12');
  });

  test('rejects a key that does not match the whole pattern', () => {
    expect(() => issueUrl(tracker, 'PROJ-12x')).toThrow(/not a key matching/);
    expect(() => issueUrl(tracker, 'XPROJ-12')).toThrow(/not a key matching/);
  });

  test('requires a configured tracker', () => {
    expect(() => issueUrl({ keyPattern: null, issueUrl: null }, 'PROJ-1')).toThrow(
      /tracker.key_pattern and tracker.issue_url/,
    );
  });
});
