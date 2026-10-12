#!/usr/bin/env node
// Creates the database of both local VAmPI containers (`npm run vampi:up` runs it after they are
// healthy). A fresh container has no tables, so every storage read answers 500 until
// `GET /createdb` has run (VN-01); that call also seeds sample users and books (VN-05), which the
// cases never rely on: they register their own users and add their own books. Running it again
// recreates the database, so it belongs to provisioning, never to a case.

const PORTS = {
  secure: process.env.VAMPI_SECURE_PORT || '5001',
  vulnerable: process.env.VAMPI_VULNERABLE_PORT || '5002',
};

let failed = false;
for (const [mode, port] of Object.entries(PORTS)) {
  const url = `http://localhost:${port}/createdb`;
  try {
    const response = await fetch(url);
    console.log(`vampi ${mode}: GET ${url} -> ${response.status}`);
    if (!response.ok) failed = true;
  } catch (error) {
    console.error(`vampi ${mode}: GET ${url} failed: ${error.message}`);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
