import type { APIResponse } from '@playwright/test';
import { BaseClient } from '../../../helpers/base-client';
import type { Pet, PetStatus } from '../types';

/** `/pet` resource. Methods return the raw response; the spec asserts. */
export class PetClient extends BaseClient {
  create(pet: Pet): Promise<APIResponse> {
    return this.post('pet', { data: pet });
  }

  update(pet: Pet): Promise<APIResponse> {
    return this.put('pet', { data: pet });
  }

  getById(id: number | string): Promise<APIResponse> {
    return this.get(this.route('pet/{petId}', { petId: id }));
  }

  /**
   * Any string is accepted so negative cases can send values outside the enum; `undefined` leaves
   * the parameter out.
   */
  findByStatus(status: PetStatus | (string & {}) | undefined): Promise<APIResponse> {
    return status === undefined
      ? this.get('pet/findByStatus')
      : this.get('pet/findByStatus', { params: { status } });
  }

  remove(id: number | string): Promise<APIResponse> {
    return this.delete(this.route('pet/{petId}', { petId: id }));
  }
}
