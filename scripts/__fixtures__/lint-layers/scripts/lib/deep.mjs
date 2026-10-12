// Fixture: a relative path two levels up still resolves into services/, and one that stays in
// scripts/ does not.
import { PET_STATUSES } from '../../services/demo/generated/enums.mjs'; // expect-finding: core-imports-pack
import { finding } from '../lib/lint.mjs';

export const parts = [PET_STATUSES, finding];
