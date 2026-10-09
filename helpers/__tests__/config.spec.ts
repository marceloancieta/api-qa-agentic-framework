import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { loadRuntime, missingEnvVars, requiredEnvVars } from '../config';

function configDir(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'qa-config-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(content));
  }
  return dir;
}

const sample = {
  api: {
    default_environment: 'local',
    environments: {
      local: { base_url: 'http://localhost:1/api/', allow_writes: true },
      shared: { base_url: 'https://shared.example/api' },
    },
    auth: { type: 'bearer', env: 'TOKEN' },
  },
};

test.describe('loadRuntime', () => {
  test('uses the default environment and trims trailing slashes', () => {
    const qa = loadRuntime({}, configDir({ 'qa-config.example.json': sample }));
    expect(qa).toMatchObject({
      source: 'qa-config.example.json',
      environment: 'local',
      baseUrl: 'http://localhost:1/api',
      allowWrites: true,
      testManagement: 'allure-report',
    });
  });

  test('QA_ENV selects another environment, where writes default to off', () => {
    const qa = loadRuntime({ QA_ENV: 'shared' }, configDir({ 'qa-config.example.json': sample }));
    expect(qa.baseUrl).toBe('https://shared.example/api');
    expect(qa.allowWrites).toBe(false);
  });

  test('API_BASE_URL overrides the base URL', () => {
    const dir = configDir({ 'qa-config.example.json': sample });
    expect(loadRuntime({ API_BASE_URL: 'http://other/' }, dir).baseUrl).toBe('http://other');
  });

  test('qa-config.json takes precedence over the example', () => {
    const local = { ...sample, api: { ...sample.api, default_environment: 'shared' } };
    const dir = configDir({ 'qa-config.example.json': sample, 'qa-config.json': local });
    expect(loadRuntime({}, dir)).toMatchObject({ source: 'qa-config.json', environment: 'shared' });
  });

  test('an unknown environment fails and lists the known ones', () => {
    const dir = configDir({ 'qa-config.example.json': sample });
    expect(() => loadRuntime({ QA_ENV: 'prod' }, dir)).toThrow(/"prod".*local, shared/);
  });
});

test.describe('environment variables', () => {
  test('required names come from the auth config', () => {
    expect(requiredEnvVars({ type: 'none' })).toEqual([]);
    expect(requiredEnvVars({ type: 'bearer', env: 'TOKEN' })).toEqual(['TOKEN']);
  });

  test('blank values count as missing', () => {
    expect(missingEnvVars(['A', 'B', 'C'], { A: 'x', B: ' ' })).toEqual(['B', 'C']);
  });
});
