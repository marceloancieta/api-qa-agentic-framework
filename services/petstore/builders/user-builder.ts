// Test Data Builder for User. Every create sends a username unique to the case and an explicit id
// from the generated range (registry/user.md, data rules): a repeated username replaces another
// case's user (PN-20) and an omitted id is stored as 0, shared with every id-less user (PN-25).

import type { Faker } from '@faker-js/faker';
import type { User } from '../types';
import { GENERATED_ID_MAX, GENERATED_ID_MIN } from './pet-builder';

/** Every username a builder makes starts with this; `unknownUsername` never does. */
export const USERNAME_PREFIX = 'qa-';
const UNKNOWN_PREFIX = 'nobody-';

export class UserBuilder {
  private readonly user: User;

  constructor(private readonly faker: Faker) {
    this.user = {
      id: faker.number.int({ min: GENERATED_ID_MIN, max: GENERATED_ID_MAX }),
      username: `${USERNAME_PREFIX}${faker.string.alphanumeric({ length: 12, casing: 'lower' })}`,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email: faker.internet.email({ provider: 'example.test' }),
      password: faker.internet.password({ length: 16 }),
      phone: faker.string.numeric(10),
      // Non-zero, so a stored value can be told apart from the default 0.
      userStatus: faker.number.int({ min: 1, max: 1_000 }),
    };
  }

  withUserStatus(userStatus: number): this {
    this.user.userStatus = userStatus;
    return this;
  }

  /** Another password for the same user, different from the one it was built with. */
  otherPassword(): string {
    let other = this.faker.internet.password({ length: 16 });
    while (other === this.user.password) other = this.faker.internet.password({ length: 16 });
    return other;
  }

  build(): User {
    return structuredClone(this.user);
  }
}

export const aUser = (faker: Faker): UserBuilder => new UserBuilder(faker);

/** A well-formed username no builder makes, so no case ever creates it. */
export const unknownUsername = (faker: Faker): string =>
  `${UNKNOWN_PREFIX}${faker.string.alphanumeric({ length: 12, casing: 'lower' })}`;
