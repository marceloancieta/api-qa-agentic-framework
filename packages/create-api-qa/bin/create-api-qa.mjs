#!/usr/bin/env node
// `npm create api-qa <directory>`: see ../README.md.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../lib/create.mjs';

try {
  process.exitCode = main(process.argv.slice(2), {
    packageDir: join(dirname(fileURLToPath(import.meta.url)), '..'),
  });
} catch (error) {
  console.error(`create-api-qa: ${error.message}`);
  process.exitCode = 1;
}
