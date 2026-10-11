#!/usr/bin/env node
/**
 * Validate qa-config against schemas/qa-config.schema.json, plus the cross-field rules a JSON Schema
 * cannot express. Fails fast with every problem listed, instead of letting a typo surface later as
 * a confusing runtime error.
 *
 *   node scripts/config-check.mjs            qa-config.json if present, else qa-config.example.json
 *   node scripts/config-check.mjs <file>...  the given files
 *   node scripts/config-check.mjs --all      the example plus qa-config.json when present (gates)
 *
 * Other tools (the quality gate) import `configErrors` to refuse an invalid configuration the same
 * way.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const SCHEMA_PATH = join(REPO_ROOT, 'schemas', 'qa-config.schema.json');
const RESERVED_ACTORS = ['default', 'anonymous'];

const ajv = new Ajv2020({ allErrors: true, strict: true, useDefaults: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));

/**
 * Quality gate thresholds must leave a REVIEW band in the right direction: a review threshold that
 * is looser than its fail threshold could never be reached.
 */
function qualityGateErrors(gate) {
  const errors = [];
  for (const name of ['pass_rate', 'mutation_score']) {
    const check = gate[name];
    if (check?.review_below_pct !== undefined && check.review_below_pct < check.fail_below_pct) {
      errors.push(
        `quality_gate.${name}.review_below_pct (${check.review_below_pct}) must be >= fail_below_pct (${check.fail_below_pct}): below fail is FAIL, between the two is REVIEW`,
      );
    }
  }
  const latency = gate.p95_latency;
  if (latency?.review_above_ms !== undefined && latency.review_above_ms > latency.fail_above_ms) {
    errors.push(
      `quality_gate.p95_latency.review_above_ms (${latency.review_above_ms}) must be <= fail_above_ms (${latency.fail_above_ms}): above fail is FAIL, between the two is REVIEW`,
    );
  }
  const dast = gate.dast;
  for (const [risk, review] of Object.entries(dast?.review_above ?? {})) {
    const fail = dast.fail_above?.[risk];
    if (fail !== undefined && review > fail) {
      errors.push(
        `quality_gate.dast.review_above.${risk} (${review}) must be <= fail_above.${risk} (${fail})`,
      );
    }
  }
  return errors;
}

/** Rules that span fields. Returns a list of messages. */
export function semanticErrors(config) {
  const errors = [];
  const api = config.api ?? {};
  if (api.environments && !(api.default_environment in api.environments)) {
    errors.push(
      `api.default_environment "${api.default_environment}" is not one of: ${Object.keys(api.environments).join(', ')}`,
    );
  }
  for (const [name, environment] of Object.entries(api.environments ?? {})) {
    if (environment?.recovery && !environment.allow_writes) {
      errors.push(
        `api.environments.${name}.recovery is set but allow_writes is false: destructive cases never run there`,
      );
    }
  }
  for (const name of Object.keys(api.actors ?? {})) {
    if (RESERVED_ACTORS.includes(name)) {
      errors.push(`api.actors.${name} is built in and cannot be redefined (use another name)`);
    }
  }
  const pattern = config.tracker?.key_pattern;
  if (typeof pattern === 'string') {
    try {
      new RegExp(pattern);
    } catch (error) {
      errors.push(`tracker.key_pattern is not a valid regex: ${error.message}`);
    }
  }
  const commit = config.policies?.commit ?? {};
  if (commit.require_tracker_key && !pattern) {
    errors.push('policies.commit.require_tracker_key is true but tracker.key_pattern is not set');
  }
  if (config.quality_gate) errors.push(...qualityGateErrors(config.quality_gate));
  return errors;
}

/** Schema errors followed by cross-field errors of a parsed configuration. */
export function configErrors(config) {
  const schemaErrors = validate(config)
    ? []
    : validate.errors.map(
        (e) =>
          `${e.instancePath || '(root)'} ${e.message}${e.params?.additionalProperty ? `: "${e.params.additionalProperty}"` : ''}`,
      );
  return [...schemaErrors, ...semanticErrors(config)];
}

function check(file) {
  let config;
  try {
    config = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return [`cannot read/parse: ${error.message}`];
  }
  return configErrors(config);
}

function main() {
  const args = process.argv.slice(2);
  const files =
    args[0] === '--all'
      ? ['qa-config.example.json', ...(existsSync('qa-config.json') ? ['qa-config.json'] : [])]
      : args.length > 0
        ? args
        : [existsSync('qa-config.json') ? 'qa-config.json' : 'qa-config.example.json'];

  let failed = false;
  for (const file of files) {
    const errors = check(file);
    if (errors.length === 0) {
      console.log(`config-check: ${file} OK`);
    } else {
      failed = true;
      console.error(`config-check: ${file} has ${errors.length} problem(s):`);
      for (const error of errors) console.error(`  - ${error}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
