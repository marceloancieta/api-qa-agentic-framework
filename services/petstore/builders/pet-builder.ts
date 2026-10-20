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

  /** `count` generated photo URLs, so a case can tell kept URLs from a replaced list. */
  withPhotoUrls(count: number): this {
    this.pet.photoUrls = Array.from({ length: count }, () => this.faker.image.url());
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
   * The pet as a plain JSON object with `changes` applied, for bodies the contract refuses or does
   * not declare: a field of the wrong type, `null`, a removed field (`undefined`), an unknown
   * property. A key is a field or a path into it: `category.id`, `tags.0.name`, `photoUrls.0`.
   */
  toBodyWith(changes: Record<string, unknown>): Record<string, unknown> {
    const body = structuredClone(this.pet) as unknown as Record<string, unknown>;
    for (const [path, value] of Object.entries(changes)) {
      const keys = path.split('.');
      const last = keys.pop() as string;
      let target = body as Record<string, unknown>;
      for (const key of keys) {
        const next = target[key];
        if (next === null || typeof next !== 'object')
          throw new Error(`toBodyWith: "${path}" goes through ${JSON.stringify(next)}`);
        target = next as Record<string, unknown>;
      }
      if (value === undefined) delete target[last];
      else target[last] = value;
    }
    return body;
  }

  /**
   * The pet as JSON text, with the named fields written as the given digits; a key is a field or a
   * path into it, as in `toBodyWith` (`category.id`, `tags.0.id`). A JSON number past 2^53 cannot
   * round-trip through a JavaScript number, so an int64 edge is sent this way.
   */
  toJson(rawNumbers: Record<string, string> = {}): string {
    const marks = new Map<string, string>();
    const changes: Record<string, string> = {};
    for (const [path, digits] of Object.entries(rawNumbers)) {
      if (!/^-?\d+$/.test(digits)) throw new Error(`toJson: "${digits}" is not an integer`);
      const mark = `__raw_${path}__`;
      changes[path] = mark;
      marks.set(`"${mark}"`, digits);
    }
    let json = JSON.stringify(this.toBodyWith(changes));
    for (const [mark, digits] of marks) json = json.split(mark).join(digits);
    return json;
  }
}

export const aPet = (faker: Faker): PetBuilder => new PetBuilder(faker);

/** An id no case creates: one above the builder's range (`<UNKNOWN_PET_ID>`). */
export const UNKNOWN_PET_ID = GENERATED_ID_MAX + 1;

/** One above the largest int64, as digits: no JavaScript number holds it (`<INT64_OVERFLOW>`). */
export const INT64_OVERFLOW = (2n ** 63n).toString();

/**
 * Path ids the contract's int64 `petId` refuses, each with a label for the step: non-numeric, one
 * above the int64 maximum, a run of 300 digits and an encoded slash. The encoded slash starts with
 * `ownId`, the case's own pet (or an id no pet has), never a seed pet's: a lenient parse that reads
 * the leading digits (PN-16) then reaches only the case's own data, where its state check sees it.
 */
export const malformedPetIds = (
  faker: Faker,
  ownId: number = UNKNOWN_PET_ID,
): [label: string, id: string][] => [
  ['non-numeric', faker.string.alpha({ length: 8, casing: 'lower' })],
  ['int64 overflow', INT64_OVERFLOW],
  ['300 digits', '9'.repeat(300)],
  ['encoded slash', `${ownId}/1`],
];

/** A small image body for uploads (`<IMAGE_BYTES>`): a PNG signature and seeded bytes. */
export const imageBytes = (faker: Faker): Buffer =>
  Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...Array.from({ length: 24 }, () => faker.number.int({ min: 0, max: 255 })),
  ]);

/** A tag name unique to the case: seed pets and other cases never carry it. */
export const uniqueTag = (faker: Faker): string =>
  `qa-tag-${faker.string.alphanumeric({ length: 12, casing: 'lower' })}`;
