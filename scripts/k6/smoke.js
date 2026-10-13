// The k6 script of the performance lane (FUT-02). It runs inside the pinned `k6` compose service and
// knows nothing about any API: scripts/perf-lane.mjs builds a plan from the pack's OpenAPI model
// and hands it over as a file, so what is sent is reviewable data and this script stays the same
// for every pack.
//
//   PLAN     the plan: { base, load: { rate, duration, vus }, requests: [{ name, path, status }] }
//   SUMMARY  where k6's end-of-test summary (handleSummary data) is written, as JSON
//   QA_PERF_AUTH_HEADER, QA_PERF_AUTH_VALUE
//            the actor's credential (FUT-10), added as this header to every request when set. They
//            come from the container's environment (`docker compose run -e NAME`), never from the
//            plan or a command line, so the value reaches no file and no process list.
//
// Load. An open model: `constant-arrival-rate` starts `rate` iterations a second whatever the API's
// latency, so a slow answer cannot slow the load down and hide itself (coordinated omission). Each
// iteration sends one planned request, round-robin, so every operation gets the same share. When
// `vus` virtual users are not enough to keep the rate, k6 counts dropped iterations, which the lane
// reports.
//
// Measures. Every request carries its operation as the `name` tag ("GET /pet/{petId}"), and its
// check carries it too. A threshold that always holds is declared on each operation's submetrics
// only so that k6 exports them: the summary then has a p95 per operation as well as the overall
// one. Judging latency belongs to the quality gate (`quality_gate.p95_latency`), and judging the
// checks to the lane; no threshold here can fail the run.
//
// Response bodies are discarded: the lane measures time and status, and keeps no data an answer may
// carry.

import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';

const plan = JSON.parse(open(__ENV.PLAN));
const headers = __ENV.QA_PERF_AUTH_HEADER
  ? { [__ENV.QA_PERF_AUTH_HEADER]: __ENV.QA_PERF_AUTH_VALUE }
  : {};

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-arrival-rate',
      rate: plan.load.rate,
      timeUnit: '1s',
      duration: plan.load.duration,
      preAllocatedVUs: plan.load.vus,
      maxVUs: plan.load.vus,
    },
  },
  discardResponseBodies: true,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)', 'count'],
  thresholds: Object.fromEntries(
    plan.requests.flatMap((request) => [
      [`http_req_duration{name:${request.name}}`, ['max>=0']],
      [`checks{name:${request.name}}`, ['rate>=0']],
    ]),
  ),
};

export default function () {
  const request = plan.requests[exec.scenario.iterationInTest % plan.requests.length];
  const response = http.get(`${plan.base}${request.path}`, {
    headers,
    tags: { name: request.name },
  });
  check(
    response,
    { [`status ${request.status}`]: (r) => r.status === request.status },
    { name: request.name },
  );
}

export function handleSummary(data) {
  return { [__ENV.SUMMARY]: JSON.stringify(data, null, 2) };
}
