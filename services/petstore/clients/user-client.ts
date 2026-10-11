import type { APIResponse } from '@playwright/test';
import { BaseClient } from '../../../helpers/base-client';
import type { User } from '../types';

/** `/user` resource. Bodies are loosely typed so negative cases can send what `User` forbids. */
export class UserClient extends BaseClient {
  create(user: User | Record<string, unknown>): Promise<APIResponse> {
    return this.post('user', { data: user });
  }

  createWithList(users: readonly (User | Record<string, unknown>)[]): Promise<APIResponse> {
    return this.post('user/createWithList', { data: users });
  }

  /**
   * `accept` picks the representation. Without it the runner's wildcard is sent, which is how the
   * `not-found` envelope is catalogued (PN-02: the 404's content type follows `Accept`).
   */
  getByName(username: string, accept?: string): Promise<APIResponse> {
    const route = this.route('user/{username}', { username });
    return accept === undefined
      ? this.get(route)
      : this.get(route, { headers: { Accept: accept } });
  }

  update(username: string, user: User | Record<string, unknown>): Promise<APIResponse> {
    return this.put(this.route('user/{username}', { username }), { data: user });
  }

  remove(username: string): Promise<APIResponse> {
    return this.delete(this.route('user/{username}', { username }));
  }

  /** A credential left `undefined` is not sent at all; an empty string is sent empty. */
  login(credentials: { username?: string; password?: string }): Promise<APIResponse> {
    const params: Record<string, string> = {};
    if (credentials.username !== undefined) params['username'] = credentials.username;
    if (credentials.password !== undefined) params['password'] = credentials.password;
    return this.get('user/login', { params });
  }

  logout(): Promise<APIResponse> {
    return this.get('user/logout');
  }
}
