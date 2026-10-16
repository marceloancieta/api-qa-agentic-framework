#!/usr/bin/env node
// Identifier linter for designs and specs (GATE-02, L-41): nothing real or personal is committed.
// Real values arrive through configuration when a run starts; the repository holds placeholders or
// values reserved as fictional, so nothing ever needs an exception. The reserved values are built in below and there
// is deliberately no allow-list file or flag: an allow-list grows until it hides the very data the
// check exists for.
//
// Scope: services/*/specs/**, services/*/registry/**, services/*/docs/** and docs/**, every text
// file (a file containing a NUL byte is treated as binary and skipped).
//
// What is reported, and what is accepted without a finding:
//   jwt            eyJ....eyJ....<signature>         never: a token is always real or a placeholder
//   email-address  local@domain.tld                 domain reserved (see below)
//   host-name      host of a scheme://host URL, or   reserved domain, localhost; a host without a
//                  a bare www.* name                 dot (a container service name) is not a host
//   ip-address     dotted IPv4, every octet <= 255   RFC 5737 documentation ranges 192.0.2.0/24,
//                                                    198.51.100.0/24, 203.0.113.0/24; loopback
//                                                    127.0.0.0/8; 0.0.0.0
//   phone-number   +<8..15 digits> with separators,  North-American fictional range: exchange 555,
//                  or (NNN) NNN-NNNN / NNN-NNN-NNNN  line 0100-0199 (e.g. +1 202 555 0143)
//   uuid           8-4-4-4-12 hex                    nil and max UUID (all 0 / all f)
//   numeric-id     a run of 9 or more digits that    never
//                  is not part of a word or decimal,
//                  nor the hex of a probe id p-<10 hex>
// Reserved domains: example.com/.org/.net and their subdomains (RFC 2606), and names under the
// .example, .test, .invalid and .localhost top-level names (RFC 2606, RFC 6761).
//
// Placeholders never count: `<petId>`, `<EMAIL>`, `{key}` and `${value}` are blanked before the
// line is read, so `user@<domain>` or `https://{host}/v3` stay quiet wherever they appear,
// code spans included. Each span is reported by one kind only (detectors run in the order above and
// consume what they match), so a phone number is not reported again as a numeric id.
// Not detected, to keep the check quiet on normal prose and code: `name.tld:port` without a
// scheme (indistinguishable from `file.json:12`), version numbers and dates (too few digits per
// group), and short numbers. A finding shows only the first and last characters of its value, so
// the report does not republish what it found.
//
// Usage:
//   node scripts/lint-suite.mjs               the repository scope above
//   node scripts/lint-suite.mjs --self-test   exact-set check against the fixtures
// Exit 1 on findings (or an inexact self-test).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { REPO_ROOT } from './lib/cli.mjs';
import { finding, report, selfTest } from './lib/lint.mjs';

export const TOOL = 'lint-suite';
export const FIXTURES = join(import.meta.dirname, '__fixtures__', 'lint-suite');

const PLACEHOLDER = /\$\{[^}]*\}|<[a-z][\w.-]*>|\{[a-z_][\w.-]*\}/gi;

const RESERVED_DOMAIN = /(?:^|\.)(?:example\.(?:com|org|net)|example|test|invalid|localhost)$/i;
const reservedHost = (host) => host.toLowerCase() === 'localhost' || RESERVED_DOMAIN.test(host);

function reservedIpv4(octets) {
  const [a, b, c] = octets;
  if (a === 127) return true;
  if (octets.every((octet) => octet === 0)) return true;
  return (
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

// NANP: [1] NPA NXX XXXX; fictional when NXX is 555 and the line is 0100-0199.
function reservedPhone(text) {
  return /^1?\d{3}55501\d{2}$/.test(text.replace(/\D/g, ''));
}

const RESERVED_UUID = /^(?:0{8}-0{4}-0{4}-0{4}-0{12}|f{8}-f{4}-f{4}-f{4}-f{12})$/i;

/**
 * Detectors, in the order they consume a line. `value` picks the part to judge from a match;
 * `accept` says whether that value is reserved as fictional.
 */
const DETECTORS = [
  {
    rule: 'jwt',
    pattern: /\beyJ[\w-]{5,}\.eyJ[\w-]{5,}\.[\w-]*/g,
    accept: () => false,
  },
  {
    rule: 'email-address',
    pattern: /[\w.%+-]+@((?:[a-z\d-]+\.)+[a-z]{2,})\b/gi,
    accept: (match) => reservedHost(match[1]),
  },
  {
    rule: 'host-name',
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/(?:[^\s/@]*@)?([^\s/:?#'"`<>()[\]]+)/gi,
    accept: (match) => !match[1].includes('.') || reservedHost(match[1]) || isIpv4(match[1]),
    // An IPv4 host is judged by the ip-address detector, which still sees it.
    consume: (match) => !isIpv4(match[1]),
  },
  {
    rule: 'host-name',
    pattern: /(?<![\w.@/-])www\.(?:[a-z\d-]+\.)+[a-z]{2,}\b/gi,
    accept: (match) => reservedHost(match[0]),
  },
  {
    rule: 'ip-address',
    pattern: /(?<![\w.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\w]|\.\d)/g,
    valid: (match) => match.slice(1, 5).every((octet) => Number(octet) <= 255),
    accept: (match) => reservedIpv4(match.slice(1, 5).map(Number)),
  },
  {
    rule: 'phone-number',
    // Ends where no further digit group follows, so two numbers in a row are not read as one.
    pattern: /(?<![\w+])\+\d[\d ().-]{6,20}\d(?!\w|[ .-]\d)/g,
    valid: (match) => {
      const digits = match[0].replace(/\D/g, '').length;
      return digits >= 8 && digits <= 15;
    },
    accept: (match) => reservedPhone(match[0]),
  },
  {
    rule: 'phone-number',
    pattern: /(?<![\w-])(?:\(\d{3}\) ?|\d{3}[ .-])\d{3}[ .-]\d{4}(?![\w-])/g,
    accept: (match) => reservedPhone(match[0]),
  },
  {
    rule: 'uuid',
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    accept: (match) => RESERVED_UUID.test(match[0]),
  },
  {
    // A contract probe id (`p-<10 hex>`, from derive-probe-matrix) is a generated name, and its
    // hex digits are sometimes all decimal. It names no record, so it is consumed here.
    rule: 'numeric-id',
    pattern: /(?<![\w-])p-[0-9a-f]{10}(?![\w-])/g,
    accept: () => true,
  },
  {
    // The digest's hash of one operation (`"GET /path": "<16 hex>"`, from swagger-digest) is
    // generated too, and sometimes all decimal. Only that shape is consumed.
    rule: 'numeric-id',
    pattern: /"(?:GET|PUT|POST|DELETE|PATCH|HEAD|OPTIONS|TRACE) \/[^"]*": "[0-9a-f]{16}"/g,
    accept: () => true,
  },
  {
    rule: 'numeric-id',
    pattern: /(?<![\w.,])\d{9,}(?![\w]|[.,]\d)/g,
    accept: () => false,
  },
];

const isIpv4 = (host) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);

function mask(value) {
  return value.length <= 6 ? `${value[0]}***` : `${value.slice(0, 3)}***${value.slice(-2)}`;
}

/** Findings for one file's text. */
export function lintText(text, file) {
  const findings = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    let line = raw.replace(PLACEHOLDER, (placeholder) => ' '.repeat(placeholder.length));
    for (const detector of DETECTORS) {
      for (const match of line.matchAll(detector.pattern)) {
        if (detector.valid && !detector.valid(match)) continue;
        if (!detector.accept(match)) {
          findings.push(
            finding(detector.rule, file, index + 1, `${mask(match[0])} is not a reserved value`),
          );
        }
      }
      // Consume what this detector matched, so later detectors do not judge it again.
      line = line.replace(detector.pattern, (...args) => {
        const match = args.slice(0, -2);
        if (detector.valid && !detector.valid(match)) return match[0];
        if (detector.consume && !detector.consume(match)) return match[0];
        return ' '.repeat(match[0].length);
      });
    }
  });
  return findings;
}

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** The files in scope under `root`. */
export function scopeFiles(root = REPO_ROOT) {
  const services = join(root, 'services');
  const packs = existsSync(services)
    ? readdirSync(services, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    : [];
  const dirs = [
    join(root, 'docs'),
    ...packs.flatMap((pack) =>
      ['specs', 'registry', 'docs'].map((part) => join(services, pack.name, part)),
    ),
  ];
  return dirs.flatMap(filesUnder).sort();
}

function lintFiles(paths, base) {
  return paths.flatMap((path) => {
    const content = readFileSync(path);
    if (content.includes(0)) return [];
    return lintText(content.toString('utf8'), relative(base, path).replace(/\\/g, '/'));
  });
}

export const lintRepository = (root = REPO_ROOT) => lintFiles(scopeFiles(root), root);
export const lintFixtures = (dir = FIXTURES) => lintFiles(filesUnder(dir), dir);

function main() {
  const { values } = parseArgs({
    options: { 'self-test': { type: 'boolean', default: false } },
    allowPositionals: false,
  });
  process.exitCode = values['self-test']
    ? selfTest(TOOL, FIXTURES, lintFixtures())
    : report(TOOL, lintRepository());
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
