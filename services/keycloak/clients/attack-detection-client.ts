import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Attack Detection` operations. Methods return the raw response; the spec asserts. */
export class AttackDetectionClient extends BaseClient {
  /** DELETE /admin/realms/{realm}/attack-detection/brute-force/users: Clear any user login failures for all users This can release temporary disabled users */
  deleteAdminRealmsRealmAttackDetectionBruteForceUsers(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/attack-detection/brute-force/users', { realm }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/attack-detection/brute-force/users/{userId}: Get status of a username in brute force detection */
  getAdminRealmsRealmAttackDetectionBruteForceUsersUserId(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/attack-detection/brute-force/users/{userId}', {
        realm,
        userId,
      }),
      options,
    );
  }

  /** DELETE /admin/realms/{realm}/attack-detection/brute-force/users/{userId}: Clear any user login failures for the user This can release temporary disabled user */
  deleteAdminRealmsRealmAttackDetectionBruteForceUsersUserId(
    realm: number | string,
    userId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(
      this.route('admin/realms/{realm}/attack-detection/brute-force/users/{userId}', {
        realm,
        userId,
      }),
      options,
    );
  }
}
