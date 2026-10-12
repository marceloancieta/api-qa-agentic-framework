// Fixture: a core helper that reaches into a service pack in every way an import can.
import { PetClient } from '../services/demo/clients/pet'; // expect-finding: core-imports-pack
import type { Pet } from '../services/demo/types'; // expect-finding: core-imports-pack
export { aPet } from '../services/demo/builders/pet'; // expect-finding: core-imports-pack

export async function stateModels(): Promise<unknown> {
  return import('../services/demo/state-models'); // expect-finding: core-imports-pack
}

export const clients: Array<PetClient | Pet> = [];
