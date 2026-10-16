import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Workflows` operations. Methods return the raw response; the spec asserts. */
export class WorkflowsClient extends BaseClient {
  /** GET /admin/realms/{realm}/workflows: List workflows */
  getAdminRealmsRealmWorkflows(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/workflows', { realm }), options);
  }

  /** POST /admin/realms/{realm}/workflows: Create workflow */
  postAdminRealmsRealmWorkflows(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/workflows', { realm }), options);
  }

  /** POST /admin/realms/{realm}/workflows/migrate: Migrate scheduled resources from one step to another */
  postAdminRealmsRealmWorkflowsMigrate(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(this.route('admin/realms/{realm}/workflows/migrate', { realm }), options);
  }

  /** GET /admin/realms/{realm}/workflows/scheduled/{resource-id}: List scheduled workflows for resource */
  getAdminRealmsRealmWorkflowsScheduledResourceId(
    realm: number | string,
    resourceId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/workflows/scheduled/{resource-id}', {
        realm,
        'resource-id': resourceId,
      }),
      options,
    );
  }

  /** GET /admin/realms/{realm}/workflows/{id}: Get workflow */
  getAdminRealmsRealmWorkflowsId(
    realm: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(this.route('admin/realms/{realm}/workflows/{id}', { realm, id }), options);
  }

  /** PUT /admin/realms/{realm}/workflows/{id}: Update workflow */
  putAdminRealmsRealmWorkflowsId(
    realm: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.put(this.route('admin/realms/{realm}/workflows/{id}', { realm, id }), options);
  }

  /** DELETE /admin/realms/{realm}/workflows/{id}: Delete workflow */
  deleteAdminRealmsRealmWorkflowsId(
    realm: number | string,
    id: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.delete(this.route('admin/realms/{realm}/workflows/{id}', { realm, id }), options);
  }

  /** POST /admin/realms/{realm}/workflows/{id}/activate/{type}/{resourceId}: Activate workflow for resource */
  postAdminRealmsRealmWorkflowsIdActivateTypeResourceId(
    realm: number | string,
    id: number | string,
    type: number | string,
    resourceId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/workflows/{id}/activate/{type}/{resourceId}', {
        realm,
        id,
        type,
        resourceId,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/workflows/{id}/deactivate/{type}/{resourceId}: Deactivate workflow for resource */
  postAdminRealmsRealmWorkflowsIdDeactivateTypeResourceId(
    realm: number | string,
    id: number | string,
    type: number | string,
    resourceId: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/workflows/{id}/deactivate/{type}/{resourceId}', {
        realm,
        id,
        type,
        resourceId,
      }),
      options,
    );
  }
}
