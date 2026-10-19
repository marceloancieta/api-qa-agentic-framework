// Field models for comparing Keycloak resources (see helpers/state-compare.ts). Every field of
// `UserRepresentation` is classified; a new field shows up as unclassified until it is added here.

import { normalize, type FieldModel } from '../../helpers/state-compare';

export const USER_FIELDS: FieldModel = {
  id: 'identity',
  username: 'business',
  email: 'business',
  firstName: 'business',
  lastName: 'business',
  enabled: 'business',
  emailVerified: 'business',
  attributes: 'business',
  requiredActions: { bucket: 'business', normalize: normalize.unordered },
  groups: { bucket: 'business', normalize: normalize.unordered },
  realmRoles: { bucket: 'business', normalize: normalize.unordered },
  clientRoles: 'business',
  federationLink: 'business',
  serviceAccountClientId: 'business',
  totp: 'business',
  createdTimestamp: 'provenance',
  origin: 'provenance',
  self: 'provenance',
  notBefore: 'volatile',
  access: 'volatile',
  disableableCredentialTypes: 'volatile',
  userProfileMetadata: 'volatile',
  credentials: 'volatile',
  federatedIdentities: 'volatile',
  clientConsents: 'volatile',
  verifiableCredentials: 'volatile',
  issuedVerifiableCredentials: 'volatile',
  applicationRoles: 'volatile',
  socialLinks: 'volatile',
};
