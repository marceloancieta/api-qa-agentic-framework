// Global teardown: release the run lock taken by global setup.

import { releaseRunLock } from '../helpers/run-lock';

export default function globalTeardown(): void {
  releaseRunLock();
}
