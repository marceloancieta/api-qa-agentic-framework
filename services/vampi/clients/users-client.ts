import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `users` operations. Methods return the raw response; the spec asserts. */
export class UsersClient extends BaseClient {
  /** GET /users/v1: Retrieves all users */
  apiViewsUsersGetAllUsers(options: RequestOptions = {}): Promise<APIResponse> {
    return this.get('users/v1', options);
  }

  /** GET /users/v1/_debug: Retrieves all details for all users */
  apiViewsUsersDebug(options: RequestOptions = {}): Promise<APIResponse> {
    return this.get('users/v1/_debug', options);
  }

  /** POST /users/v1/register: Register new user */
  apiViewsUsersRegisterUser(options: RequestOptions = {}): Promise<APIResponse> {
    return this.post('users/v1/register', options);
  }

  /** POST /users/v1/login: Login to VAmPI */
  apiViewsUsersLoginUser(options: RequestOptions = {}): Promise<APIResponse> {
    return this.post('users/v1/login', options);
  }

  /** GET /me: Retrieves currently logged in user */
  apiViewsUsersMe(options: RequestOptions = {}): Promise<APIResponse> {
    return this.get('me', options);
  }

  /** GET /users/v1/{username}: Retrieves user by username */
  apiViewsUsersGetByUsername(
    username: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('users/v1/{username}', { username }), options);
  }

  /** DELETE /users/v1/{username}: Deletes user by username (Only Admins) */
  apiViewsUsersDeleteUser(
    username: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(this.route('users/v1/{username}', { username }), options);
  }

  /** PUT /users/v1/{username}/email: Update users email */
  apiViewsUsersUpdateEmail(
    username: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(this.route('users/v1/{username}/email', { username }), options);
  }

  /** PUT /users/v1/{username}/password: Update users password */
  apiViewsUsersUpdatePassword(
    username: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(this.route('users/v1/{username}/password', { username }), options);
  }
}
