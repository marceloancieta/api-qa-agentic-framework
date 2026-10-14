#!/usr/bin/env node
/**
 * Differential lane (FUT-06): send the same read-only requests to two deployments of one pack's
 * API, a reference and a candidate, and report every way their answers and their contracts differ.
 *
 * Why. A version upgrade, a new build or a second region should behave like the one it replaces,
 * and the specs only check what someone wrote a case for. Comparing two deployments answer by
 * answer shows every change of behaviour, including those nobody expected; each one is then
 * reviewed: a regression, an intended change, or a difference to tolerate.
 *
 * The two sides are qa-config environments: `--reference <env>` and `--candidate <env>` (default:
 * the active one, `QA_ENV` or `api.default_environment`), each with an entry for the pack. The
 * `QA_<PACK>_BASE_URL` and `QA_<PACK>_SPEC_URL` overrides apply to the candidate only, so an
 * override can never make the reference compare with itself.
 *
 * Contract. Both sides' `spec_url` documents are read through the OpenAPI normalizer and compared
 * by their digests (scripts/swagger-digest.mjs): every structural change is a finding, with the
 * drift class that names it. Prose changes are printed and never count.
 *
 * Requests. The plan of the performance lane (scripts/perf-lane.mjs, built from the pack's tracked
 * contract and its perf.json): every GET operation the actor may send, with the pack's parameter
 * values. For each required query parameter the lane adds the same request without it, because
 * how an API refuses a request is behaviour too. Only GET requests are sent, so the lane may run
 * against any environment, shared ones included; both sides get the actor's credential (`--actor`,
 * as in the other lanes) with `Accept: application/json`.
 *
 * Comparison. For each request: the status, the media type and the body. A JSON body is compared
 * field by field with the bucket model of scripts/lib/state-compare.mjs, the one the specs use:
 * a field is `business` (must be equal) unless the pack's `services/<pack>/diff.json` puts it in
 * another bucket for that operation, such as `volatile` for a seed record's timestamp, which each
 * deployment sets when it starts. A JSON array is compared item by item; any other body as text
 * (`$body` names it in the model). The lane prints the field paths that differ, never a value.
 *
 * Accepted differences. A difference the pack has reviewed goes in diff.json `accepted`, keyed as
 * the lane prints it, with the contract note that explains it. An accepted difference that no
 * longer shows up is reported too: the change it describes is gone, so the entry is stale.
 *
 *   node scripts/diff-lane.mjs --service pack --reference env [--candidate env] [--actor name]
 *                              [--out name]
 *
 * The report lands in reports/diff/<out>.json (default out: the pack name): both sides, every
 * contract change, every request with what differed, and the verdict.
 *
 * Exit codes: 0 no difference beyond the accepted ones, and each accepted one seen; 1 a difference
 * not accepted, or an accepted one not seen; 2 the lane could not run (bad arguments or pack
 * files, an environment without the pack or its spec_url, a credential that cannot be obtained, a
 * side that does not answer).
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { actorAuthOf, DEFAULT_ACTOR, laneCredential } from './lib/auth-tokens.mjs';
import {
  packEnvironment,
  packVariable,
  readService,
  readTextIfExists,
  REPO_ROOT,
  servicePacks,
} from './lib/cli.mjs';
import { httpUrl } from './lib/container.mjs';
import { loadLocalEnv } from './lib/env.mjs';
import { loadModel } from './lib/openapi.mjs';
import { BUCKETS, compareStates, normalize } from './lib/state-compare.mjs';
import { derivePlan, readPackFile } from './perf-lane.mjs';
import { computeDigest, diffDigests } from './swagger-digest.mjs';

export const REPORTS_DIR = join('reports', 'diff');
export const PACK_FILE = 'diff.json';
const PACK_KEYS = ['$comment', 'models', 'accepted'];
const OUT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REQUEST_TIMEOUT_MS = 10_000;
/** The model path that stands for a body that is not a JSON object or array. */
export const WHOLE_BODY = '$body';

// ---------------------------------------------------------------------------------------------
// Arguments, environments and the pack's file

/** `{ service, reference, candidate, actor, out }` from the command line. */
export function parseLaneArgs(argv, root = REPO_ROOT) {
  const { values } = parseArgs({
    args: argv,
    options: {
      service: { type: 'string' },
      reference: { type: 'string' },
      candidate: { type: 'string' },
      actor: { type: 'string' },
      out: { type: 'string' },
    },
  });
  if (!values.service) {
    throw new Error(
      `name the pack with --service <name> (packs: ${servicePacks(root).join(', ') || 'none'})`,
    );
  }
  if (!values.reference) {
    throw new Error(
      'name the reference environment with --reference <env> (an environment of qa-config)',
    );
  }
  const out = values.out ?? values.service;
  if (!OUT_NAME.test(out)) {
    throw new Error(
      `--out must be a plain file name (letters, digits, ".", "_", "-"), got "${out}"`,
    );
  }
  return {
    service: values.service,
    reference: values.reference,
    candidate: values.candidate ?? null,
    actor: values.actor ?? DEFAULT_ACTOR,
    out,
  };
}

/**
 * Both sides: `{ reference, candidate }`, each `packEnvironment` of its environment. The candidate
 * is `--candidate`, else the active environment, and keeps the QA_<PACK>_* overrides; the reference
 * never sees them. Throws when the two name the same environment or a side has no spec_url.
 */
export function sides({ service, reference, candidate }, root = REPO_ROOT, env = process.env) {
  const withoutOverrides = { ...env };
  for (const setting of ['BASE_URL', 'SPEC_URL'])
    delete withoutOverrides[packVariable(service, setting)];
  const referenceSide = packEnvironment(service, root, { ...withoutOverrides, QA_ENV: reference });
  const candidateSide = packEnvironment(
    service,
    root,
    candidate ? { ...env, QA_ENV: candidate } : env,
  );
  if (referenceSide.name === candidateSide.name) {
    throw new Error(
      `the reference and the candidate are both environment "${referenceSide.name}"; ` +
        'name another one with --reference or --candidate',
    );
  }
  for (const side of [referenceSide, candidateSide]) {
    httpUrl(side.baseUrl, `the base URL of environment "${side.name}"`);
    if (!side.specUrl) {
      throw new Error(
        `${side.source}: pack "${service}" in environment "${side.name}" has no spec_url; ` +
          'the lane compares both contracts',
      );
    }
  }
  return { reference: referenceSide, candidate: candidateSide };
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * services/<pack>/diff.json, checked: `{ models, accepted }`, both objects (empty without a file).
 * `models` maps an operation (`GET /store/order/{orderId}`) to a field model: a field path to a
 * bucket, or to `{ bucket, normalize }` with a normalizer's name. `accepted` maps a difference, as
 * the lane prints it, to its reason. Throws with the file and every problem.
 */
export function readDiffFile(pack, root = REPO_ROOT) {
  const file = join('services', pack, PACK_FILE);
  const text = readTextIfExists(join(root, file));
  if (text === null) return { models: {}, accepted: {} };
  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error.message}`, { cause: error });
  }
  if (!isObject(config)) throw new Error(`${file} must hold an object`);
  const problems = Object.keys(config)
    .filter((key) => !PACK_KEYS.includes(key))
    .map((key) => `unknown key "${key}" (known: ${PACK_KEYS.join(', ')})`);
  for (const key of ['models', 'accepted']) {
    if (key in config && !isObject(config[key])) problems.push(`"${key}" must be an object`);
  }
  const models = isObject(config.models) ? config.models : {};
  for (const [operation, model] of Object.entries(models)) {
    if (!isObject(model)) {
      problems.push(`models["${operation}"] must map field paths to buckets`);
      continue;
    }
    for (const [path, entry] of Object.entries(model)) {
      const bucket = typeof entry === 'string' ? entry : isObject(entry) ? entry.bucket : undefined;
      if (!BUCKETS.includes(bucket)) {
        problems.push(
          `models["${operation}"]["${path}"]: bucket must be one of ${BUCKETS.join(', ')}`,
        );
      }
      if (isObject(entry) && entry.normalize !== undefined && !(entry.normalize in normalize)) {
        problems.push(
          `models["${operation}"]["${path}"]: normalize must be one of ${Object.keys(normalize).join(', ')}`,
        );
      }
    }
  }
  const accepted = isObject(config.accepted) ? config.accepted : {};
  for (const [difference, reason] of Object.entries(accepted)) {
    if (typeof reason !== 'string' || reason.trim() === '') {
      problems.push(`accepted["${difference}"] must give its reason as text`);
    }
  }
  if (problems.length > 0) throw new Error(`${file}: ${problems.join('; ')}`);
  return { models, accepted };
}

// ---------------------------------------------------------------------------------------------
// The plan

/**
 * The requests of both sides: `{ requests, skipped }`. Each request of the performance lane's plan
 * (`{ name, path, operation }`), followed by one without each required query parameter
 * (`GET /pet/findByStatus without status`). `skipped` is the plan's, with reasons.
 */
export function planRequests(model, perfPack, sender) {
  const plan = derivePlan(model, perfPack, sender);
  const operations = new Map(model.operations.map((operation) => [operation.key, operation]));
  const requests = [];
  for (const request of plan.requests) {
    requests.push({ name: request.name, path: request.path, operation: request.name });
    const required = operations
      .get(request.name)
      .parameters.filter((parameter) => parameter.required && parameter.in === 'query');
    for (const parameter of required) {
      const [path, search = ''] = request.path.split('?');
      const query = new URLSearchParams(search);
      query.delete(parameter.name);
      const rest = query.toString();
      requests.push({
        name: `${request.name} without ${parameter.name}`,
        path: rest ? `${path}?${rest}` : path,
        operation: request.name,
      });
    }
  }
  return { requests, skipped: plan.skipped };
}

// ---------------------------------------------------------------------------------------------
// Comparing

/** The media type of a Content-Type header, lower-cased and without parameters, or null. */
export function mediaType(header) {
  const type = header?.split(';')[0].trim().toLowerCase();
  return type || null;
}

/** An answer as the lane keeps it: `{ status, type, body }`, a JSON body parsed when it is JSON. */
export async function readAnswer(response) {
  const type = mediaType(response.headers.get('content-type'));
  const text = await response.text();
  let body = text;
  if (type && /[/+]json$/.test(type)) {
    try {
      body = JSON.parse(text);
    } catch {
      // stays text: the body does not match its media type, and the text comparison shows it
    }
  }
  return { status: response.status, type, body };
}

const isComparable = (value) => value !== null && typeof value === 'object';

/**
 * Field paths whose values differ between the reference's body and the candidate's, under the
 * operation's model with every unclassified field compared as `business`. Arrays are compared item
 * by item (`[0].name`) and by length (`[length]`); any other body whole (`$body`, unless the model
 * makes it volatile).
 */
export function bodyDifferences(reference, candidate, model = {}) {
  if (Array.isArray(reference) && Array.isArray(candidate)) {
    if (reference.length !== candidate.length) return ['[length]'];
    return reference.flatMap((item, index) =>
      bodyDifferences(item, candidate[index], model).map((path) =>
        path === WHOLE_BODY ? `[${index}]` : `[${index}].${path}`,
      ),
    );
  }
  if (isObject(reference) && isObject(candidate)) {
    const { identity, business, provenance } = compareStates(reference, candidate, model, {
      fallback: 'business',
    });
    return [...identity, ...business, ...provenance];
  }
  if (model[WHOLE_BODY] === 'volatile') return [];
  const text = (body) => (isComparable(body) ? JSON.stringify(body) : String(body));
  return text(reference) === text(candidate) ? [] : [WHOLE_BODY];
}

/**
 * What differs between two answers to one request: `{ status, type, body }`, `status` and `type`
 * as `[reference, candidate]` when they differ (else null), `body` the differing paths.
 */
export function answerDifferences(reference, candidate, model = {}) {
  return {
    status: reference.status === candidate.status ? null : [reference.status, candidate.status],
    type: reference.type === candidate.type ? null : [reference.type, candidate.type],
    body: bodyDifferences(reference.body, candidate.body, model),
  };
}

const differs = (difference) =>
  Boolean(difference.status || difference.type || difference.body.length > 0);

/** One printable line for a request whose answers differ. */
export function differenceLine(name, difference) {
  const parts = [];
  if (difference.status) parts.push(`status ${difference.status[0]} -> ${difference.status[1]}`);
  if (difference.type) parts.push(`type ${difference.type[0]} -> ${difference.type[1]}`);
  if (difference.body.length > 0) parts.push(`body fields ${difference.body.join(', ')}`);
  return `${name}: ${parts.join('; ')}`;
}

/** The key of a contract change in `accepted` and in the output: `contract <class> <where>`. */
export const contractKey = (entry) => `contract ${entry.class} ${entry.where}`;

/** A contract change as one line: its key, then what changed. */
export function contractLine(entry) {
  if (entry.change === 'changed') return `${contractKey(entry)}: ${entry.before} -> ${entry.after}`;
  return `${contractKey(entry)}: ${entry.change}`;
}

/**
 * The verdict over every difference found (`keys`) against the pack's `accepted`: `{ open,
 * accepted, stale }`, `open` the keys not accepted, `stale` the accepted keys not found.
 */
export function verdict(keys, accepted) {
  const found = new Set(keys);
  return {
    open: keys.filter((key) => !(key in accepted)),
    accepted: keys.filter((key) => key in accepted),
    stale: Object.keys(accepted).filter((key) => !found.has(key)),
  };
}

// ---------------------------------------------------------------------------------------------
// The lane

/**
 * Run the comparison and return the lane's exit code; `log` prints. In tests `fetchImpl` replaces
 * `fetch` for the requests, `loadSpec` loads a side's contract (default: the normalizer on its
 * spec_url) and `post` replaces the credential requests, so tests call no network.
 */
export async function diffLane(
  options,
  {
    root = REPO_ROOT,
    env = process.env,
    fetchImpl = fetch,
    loadSpec = loadModel,
    post,
    now = Date.now,
    log = console.log,
  } = {},
) {
  const service = readService(options.service, root);
  const both = sides(options, root, env);
  const models = readDiffFile(options.service, root);
  const perfPack = readPackFile(options.service, root);
  const tracked = await loadModel(join(service.dir, service.spec));
  const named = { reference: both.reference, candidate: both.candidate };

  const dir = join(root, REPORTS_DIR);
  const reportFile = join(dir, `${options.out}.json`);
  const shown = (file) => relative(root, file).replace(/\\/g, '/');
  mkdirSync(dir, { recursive: true });
  rmSync(reportFile, { force: true });

  const credentials = {};
  for (const [role, side] of Object.entries(named)) {
    const auth = actorAuthOf(side, options.actor) ?? { type: 'none' };
    try {
      credentials[role] = await laneCredential(auth, {
        baseUrl: side.baseUrl,
        env,
        now,
        ...(post ? { post } : {}),
      });
    } catch (error) {
      const why = error.message.replace(/\.$/, '');
      log(
        `diff-lane: ${role} "${side.name}", actor "${options.actor}": ${why}; the lane did not run`,
      );
      return 2;
    }
  }

  const contracts = {};
  for (const [role, side] of Object.entries(named)) {
    try {
      contracts[role] = await loadSpec(side.specUrl);
    } catch (error) {
      log(
        `diff-lane: the ${role} contract ${side.specUrl} (environment "${side.name}") could not ` +
          `be read: ${error.cause?.code ?? error.message}; the lane did not run`,
      );
      return 2;
    }
  }
  for (const [role, side] of Object.entries(named)) {
    const version = contracts[role].info?.version;
    log(
      `diff-lane: ${role} environment "${side.name}": ${side.baseUrl}` +
        (version ? ` (contract version ${version})` : '') +
        (credentials[role]
          ? `, actor "${options.actor}" sends its ${credentials[role].type} credential`
          : `, actor "${options.actor}" sends no credential`),
    );
  }

  const contract = diffDigests(
    computeDigest(contracts.reference),
    computeDigest(contracts.candidate),
  );
  for (const entry of contract.descriptions) {
    log(`diff-lane: contract text of ${entry.where} ${entry.change} (prose only, not a finding)`);
  }

  const plan = planRequests(tracked, perfPack, {
    actor: options.actor,
    authenticated: Boolean(credentials.candidate),
  });
  for (const { name, reason } of plan.skipped) log(`diff-lane: left out ${name}: ${reason}`);
  if (plan.requests.length === 0) {
    log('diff-lane: no GET operation left to compare; the lane did not run');
    return 2;
  }

  const ask = async (role, path) => {
    const credential = credentials[role];
    const headers = { accept: 'application/json' };
    if (credential) headers[credential.header] = credential.value;
    const response = await fetchImpl(`${named[role].baseUrl}${path}`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return readAnswer(response);
  };
  const results = [];
  for (const request of plan.requests) {
    const answers = {};
    for (const role of ['reference', 'candidate']) {
      try {
        answers[role] = await ask(role, request.path);
      } catch (error) {
        log(
          `diff-lane: the ${role} (environment "${named[role].name}") did not answer ` +
            `${request.name} at ${named[role].baseUrl}${request.path} ` +
            `(${error.cause?.code ?? error.message}); check that the service is up. The lane did not finish`,
        );
        return 2;
      }
    }
    const difference = answerDifferences(
      answers.reference,
      answers.candidate,
      models.models[request.operation],
    );
    results.push({
      name: request.name,
      path: request.path,
      same: !differs(difference),
      ...(differs(difference) ? { difference } : {}),
    });
  }

  const keys = [
    ...contract.structural.map(contractKey),
    ...results.filter((result) => !result.same).map((result) => result.name),
  ];
  const judged = verdict(keys, models.accepted);
  const show = (key, line) =>
    log(
      key in models.accepted
        ? `diff-lane: accepted  ${line} (${models.accepted[key]})`
        : `diff-lane: differs   ${line}`,
    );
  for (const entry of contract.structural) show(contractKey(entry), contractLine(entry));
  for (const result of results.filter((r) => !r.same)) {
    show(result.name, differenceLine(result.name, result.difference));
  }
  for (const key of judged.stale) {
    log(
      `diff-lane: stale     ${key}: accepted in services/${options.service}/${PACK_FILE} but not ` +
        'found; the change it describes is gone, so remove the entry or look into why',
    );
  }
  const same = results.filter((result) => result.same).length;
  log(
    `diff-lane: ${results.length} request(s), ${same} answered the same; ` +
      `${contract.structural.length} contract change(s); ` +
      `${judged.open.length} difference(s) not accepted, ${judged.accepted.length} accepted, ${judged.stale.length} stale`,
  );

  writeFileSync(
    reportFile,
    `${JSON.stringify(
      {
        pack: options.service,
        actor: options.actor,
        reference: {
          environment: both.reference.name,
          baseUrl: both.reference.baseUrl,
          version: contracts.reference.info?.version ?? null,
        },
        candidate: {
          environment: both.candidate.name,
          baseUrl: both.candidate.baseUrl,
          version: contracts.candidate.info?.version ?? null,
        },
        contract: contract.structural.map((entry) => ({ key: contractKey(entry), ...entry })),
        requests: results,
        verdict: judged,
      },
      null,
      2,
    )}\n`,
  );
  log(`diff-lane: report in ${shown(reportFile)}`);
  const failed = judged.open.length > 0 || judged.stale.length > 0;
  log(
    `diff-lane: ${failed ? 'failed' : 'passed'} (${
      failed
        ? 'a difference nobody accepted, or an accepted one that is gone'
        : 'every difference is accepted'
    })`,
  );
  return failed ? 1 : 0;
}

const entryScript = process.argv[1];
if (entryScript && pathToFileURL(entryScript).href === import.meta.url) {
  Promise.resolve()
    .then(() => {
      const options = parseLaneArgs(process.argv.slice(2));
      loadLocalEnv(); // the actor's credentials, when the real environment does not set them
      return diffLane(options);
    })
    .then(
      (code) => process.exit(code),
      (error) => {
        console.error(`diff-lane: ${error.message}`);
        process.exit(2);
      },
    );
}
