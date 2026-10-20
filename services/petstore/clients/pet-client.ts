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

  /**
   * An update whose body is sent byte for byte with the given content type: malformed JSON, a body
   * the contract refuses (`PetBuilder.toBodyWith`), an int64 edge, or a type the operation does not
   * accept.
   */
  updateRaw(body: string, contentType = 'application/json'): Promise<APIResponse> {
    return this.put('pet', { data: body, headers: { 'Content-Type': contentType } });
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

  /**
   * A create whose body is sent byte for byte with the given content type: numbers JSON cannot hold
   * exactly (an int64 edge) or a body labelled with a type the operation does not accept.
   */
  createRaw(body: string, contentType = 'application/json'): Promise<APIResponse> {
    return this.post('pet', { data: body, headers: { 'Content-Type': contentType } });
  }

  /** One `tags` value, sent as given (an empty string included); `undefined` leaves it out. */
  findByTags(tag: string | undefined): Promise<APIResponse> {
    return tag === undefined
      ? this.get('pet/findByTags')
      : this.get('pet/findByTags', { params: { tags: tag } });
  }

  /**
   * `POST /pet/{petId}` with `name` and `status` as query parameters; a field left out is not sent.
   * A string id is sent as given, encoded, for malformed-id cases.
   */
  updateWithForm(
    id: number | string,
    fields: { name?: string; status?: string },
  ): Promise<APIResponse> {
    const params: Record<string, string> = {};
    if (fields.name !== undefined) params['name'] = fields.name;
    if (fields.status !== undefined) params['status'] = fields.status;
    return this.post(this.route('pet/{petId}', { petId: id }), { params });
  }

  /**
   * `POST /pet/{petId}/uploadImage` with `image` as the raw body under `contentType`
   * (`application/octet-stream` as declared); `undefined` sends no body. A string id is sent as
   * given, encoded, for malformed-id cases.
   */
  uploadImage(
    id: number | string,
    image: Buffer | undefined,
    contentType = 'application/octet-stream',
  ): Promise<APIResponse> {
    return this.post(this.route('pet/{petId}/uploadImage', { petId: id }), {
      data: image,
      headers: { 'Content-Type': contentType },
    });
  }

  remove(id: number | string): Promise<APIResponse> {
    return this.delete(this.route('pet/{petId}', { petId: id }));
  }
}
