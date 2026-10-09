// Object Mother: the named variants specs ask for by meaning ("a sold pet"), built on the builders.
// Add a variant here when two specs need the same one; a one-off stays a builder call in its spec.

import type { Faker } from '@faker-js/faker';
import type { Pet } from '../types';
import { aPet } from './pet-builder';

export const PetMother = {
  available: (faker: Faker): Pet => aPet(faker).withStatus('available').build(),
  pending: (faker: Faker): Pet => aPet(faker).withStatus('pending').build(),
  sold: (faker: Faker): Pet => aPet(faker).withStatus('sold').build(),
  /** Required fields only: `name` and `photoUrls`, plus an id so the case can clean up. */
  minimal: (faker: Faker): Pet => aPet(faker).minimal().build(),
};
