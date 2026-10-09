// Test Data Builder for Pet: valid by default, every field overridable, values from the seeded
// faker so a run replays with QA_SEED. A spec states only what its case is about.

import type { Faker } from '@faker-js/faker';
import { PET_STATUSES, type Pet, type PetStatus } from '../types';

// Petstore preloads small ids; generated ids stay far above them.
export const GENERATED_ID_MIN = 9_000_000_000;
export const GENERATED_ID_MAX = 9_999_999_999;

export class PetBuilder {
  private readonly pet: Pet;

  constructor(private readonly faker: Faker) {
    this.pet = {
      id: faker.number.int({ min: GENERATED_ID_MIN, max: GENERATED_ID_MAX }),
      name: faker.animal.petName(),
      category: { id: faker.number.int({ min: 1, max: 1_000 }), name: faker.animal.type() },
      photoUrls: [faker.image.url()],
      tags: [{ id: faker.number.int({ min: 1, max: 1_000 }), name: faker.word.adjective() }],
      status: 'available',
    };
  }

  withId(id: number): this {
    this.pet.id = id;
    return this;
  }

  named(name: string): this {
    this.pet.name = name;
    return this;
  }

  withStatus(status: PetStatus): this {
    this.pet.status = status;
    return this;
  }

  /** Any status from the contract's value set, chosen by the seeded faker. */
  withAnyStatus(): this {
    this.pet.status = this.faker.helpers.arrayElement(PET_STATUSES);
    return this;
  }

  /** Only the fields the contract requires. */
  minimal(): this {
    for (const key of ['category', 'tags', 'status'] as const) delete this.pet[key];
    return this;
  }

  build(): Pet {
    return structuredClone(this.pet);
  }
}

export const aPet = (faker: Faker): PetBuilder => new PetBuilder(faker);
