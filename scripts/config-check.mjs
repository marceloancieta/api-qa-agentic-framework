#!/usr/bin/env node
/**
 * Validate qa-config against schemas/qa-config.schema.json, plus the cross-field rules a JSON Schema
 * cannot express. Fails fast with every problem listed, instead of letting a typo surface later as
 * a confusing runtime error.
 *
 *   node scripts/config-check.mjs            qa-config.json if present, else qa-config.example.json
 *   node scripts/config-check.mjs <file>...  the given files
 *   node scripts/config-check.mjs --all      the example plus qa-config.json when present (gates)
 */

import { existsSync, readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const SCHEMA_PATH = 'schemas/qa-config.schema.json';
const RESERVED_ACTORS = ['default', 'anonymous'];

const ajv = new Ajv2020({ allErrors: true, strict: true, useDefaults: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));

/** Rules that span fields. Returns a list of messages. */
export function semanticErrors(config) {
  const errors = [];
  const api = config.api ?? {};
  if (api.environments && !(api.default_environment in api.environments)) {
    errors.push(
      `api.default_environment "${api.default_environment}" is not one of: ${Object.keys(api.environments).join(', ')}`,
    );
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
  return errors;
}

function check(file) {
  let config;
  try {
    config = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return [`cannot read/parse: ${error.message}`];
  }
  const schemaErrors = validate(config)
    ? []
    : validate.errors.map(
        (e) =>
          `${e.instancePath || '(root)'} ${e.message}${e.params?.additionalProperty ? `: "${e.params.additionalProperty}"` : ''}`,
      );
  return [...schemaErrors, ...semanticErrors(config)];
}

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
