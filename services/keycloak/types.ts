// Request and response shapes of the Keycloak pack. `UserRepresentation` has no required property
// in the contract; these interfaces name the fields the cases send and read.

/** The fields a case sends to create or update a user. */
export interface NewUser {
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  /** Credentials stored with the user; evidence masks them (`credential` is a built-in secret key). */
  credentials?: { type: 'password'; value: string; temporary: boolean }[];
}

/** A user as the API answers it: what the cases read, plus anything else the server adds. */
export interface User extends NewUser {
  id: string;
  createdTimestamp?: number;
  [field: string]: unknown;
}
