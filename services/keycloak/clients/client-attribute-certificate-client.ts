import type { APIResponse } from '@playwright/test';
import { BaseClient, type RequestOptions } from '../../../helpers/base-client';

/** `Client Attribute Certificate` operations. Methods return the raw response; the spec asserts. */
export class ClientAttributeCertificateClient extends BaseClient {
  /** GET /admin/realms/{realm}/clients/{client-uuid}/certificates/{attr}: Get key info */
  getAdminRealmsRealmClientsClientUuidCertificatesAttr(
    realm: number | string,
    clientUuid: number | string,
    attr: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.get(
      this.route('admin/realms/{realm}/clients/{client-uuid}/certificates/{attr}', {
        realm,
        'client-uuid': clientUuid,
        attr,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/certificates/{attr}/download: Get a keystore file for the client, containing private key and public certificate */
  postAdminRealmsRealmClientsClientUuidCertificatesAttrDownload(
    realm: number | string,
    clientUuid: number | string,
    attr: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/certificates/{attr}/download', {
        realm,
        'client-uuid': clientUuid,
        attr,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/certificates/{attr}/generate: Generate a new certificate with new key pair */
  postAdminRealmsRealmClientsClientUuidCertificatesAttrGenerate(
    realm: number | string,
    clientUuid: number | string,
    attr: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/certificates/{attr}/generate', {
        realm,
        'client-uuid': clientUuid,
        attr,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/certificates/{attr}/generate-and-download: Generate a new keypair and certificate, and get the private key file Generates a keypair and certificate and serves the private key in a specified keystore format. Only generated public certificate is saved in Keycloak DB - the private key is not. */
  postAdminRealmsRealmClientsClientUuidCertificatesAttrGenerateAndDownload(
    realm: number | string,
    clientUuid: number | string,
    attr: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/certificates/{attr}/generate-and-download',
        { realm, 'client-uuid': clientUuid, attr },
      ),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/certificates/{attr}/upload: Upload certificate and eventually private key */
  postAdminRealmsRealmClientsClientUuidCertificatesAttrUpload(
    realm: number | string,
    clientUuid: number | string,
    attr: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/clients/{client-uuid}/certificates/{attr}/upload', {
        realm,
        'client-uuid': clientUuid,
        attr,
      }),
      options,
    );
  }

  /** POST /admin/realms/{realm}/clients/{client-uuid}/certificates/{attr}/upload-certificate: Upload only certificate, not private key */
  postAdminRealmsRealmClientsClientUuidCertificatesAttrUploadCertificate(
    realm: number | string,
    clientUuid: number | string,
    attr: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route(
        'admin/realms/{realm}/clients/{client-uuid}/certificates/{attr}/upload-certificate',
        { realm, 'client-uuid': clientUuid, attr },
      ),
      options,
    );
  }

  /** POST /admin/realms/{realm}/identity-provider/upload-certificate: Uploads a certificate, prepares the jwks or public key associated, and returns the certificate representation. */
  postAdminRealmsRealmIdentityProviderUploadCertificate(
    realm: number | string,
    options: RequestOptions = {},
  ): Promise<APIResponse> {
    return this.post(
      this.route('admin/realms/{realm}/identity-provider/upload-certificate', { realm }),
      options,
    );
  }
}
