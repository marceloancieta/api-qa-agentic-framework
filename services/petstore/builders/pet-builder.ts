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

  /** One tag whose name no other case uses, so a search by it finds only this case's pet. */
  withUniqueTag(): this {
    this.pet.tags = [
      { id: this.faker.number.int({ min: 1, max: 1_000 }), name: uniqueTag(this.faker) },
    ];
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

  /**
   * The pet as JSON text, with the named fields written as the given digits. A JSON number past
   * 2^53 cannot round-trip through a JavaScript number, so an int64 edge is sent this way.
   */
  toJson(rawNumbers: Partial<Record<keyof Pet, string>> = {}): string {
    const pet: Record<string, unknown> = { ...this.build() };
    const marks = new Map<string, string>();
    for (const [field, digits] of Object.entries(rawNumbers)) {
      if (!/^-?\d+$/.test(digits)) throw new Error(`toJson: "${digits}" is not an integer`);
      const mark = `__raw_${field}__`;
      pet[field] = mark;
      marks.set(`"${mark}"`, digits);
    }
    let json = JSON.stringify(pet);
    for (const [mark, digits] of marks) json = json.split(mark).join(digits);
    return json;
  }
}

export const aPet = (faker: Faker): PetBuilder => new PetBuilder(faker);

/** A tag name unique to the case: seed pets and other cases never carry it. */
export const uniqueTag = (faker: Faker): string =>
  `qa-tag-${faker.string.alphanumeric({ length: 12, casing: 'lower' })}`;
