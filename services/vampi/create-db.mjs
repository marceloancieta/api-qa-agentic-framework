#!/usr/bin/env node
// Creates the database of both local VAmPI containers (`npm run vampi:up` runs it after they are
// healthy). A fresh container has no tables, so every storage read answers 500 until
// `GET /createdb` has run (VN-01); that call also seeds sample users and books (VN-05), which the
// cases never rely on: they register their own users and add their own books. Running it again
// recreates the database, so it belongs to provisioning, never to a case.
//
// The seed draws random book titles, and two of them can collide on the unique title: the call then
// answers 500 (VN-14). Each call drops and reseeds the tables with new titles, so a 5xx is tried
// again, a few times; anything else, or a 5xx every time, fails provisioning.

const PORTS = {
  secure: process.env.VAMPI_SECURE_PORT || '5001',
  vulnerable: process.env.VAMPI_VULNERABLE_PORT || '5002',
};
const ATTEMPTS = 4;

/** `GET /createdb` until it answers 2xx, retrying a 5xx; returns whether it succeeded. */
async function createDb(mode, port) {
  const url = `http://localhost:${port}/createdb`;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    let status;
    try {
      status = (await fetch(url)).status;
    } catch (error) {
      console.error(`vampi ${mode}: GET ${url} failed: ${error.message}`);
      return false;
    }
    const retry = status >= 500 && attempt < ATTEMPTS ? '; the seed collided, trying again' : '';
    console.log(`vampi ${mode}: GET ${url} -> ${status}${retry}`);
    if (status >= 200 && status < 300) return true;
    if (!retry) return false;
  }
  return false;
}

let failed = false;
for (const [mode, port] of Object.entries(PORTS)) {
  if (!(await createDb(mode, port))) failed = true;
}
process.exitCode = failed ? 1 : 0;
