// Test Data Builder for books (ADR 0007). Titles are unique across every user in VAmPI's storage and
// books cannot be deleted, so every title carries a random suffix from the seeded faker. Replaying a
// seed (QA_SEED) builds the same titles: against the same container the precondition then fails
// with "Book Already exists!"; recreate the containers (`npm run vampi:up`) before a replay.
import type { Faker } from '@faker-js/faker';

export interface Book {
  book_title: string;
  secret: string;
}

const uniqueSuffix = (faker: Faker) => faker.string.alphanumeric({ length: 12, casing: 'lower' });

/** A book with a unique title and a secret sentence. */
export function aBook(faker: Faker): Book {
  return {
    book_title: `${faker.word.noun()}-${uniqueSuffix(faker)}`,
    secret: faker.lorem.sentence(),
  };
}

/** A title no book has: the same shape as a real one, with a suffix no builder call repeats. */
export function unknownTitle(faker: Faker): string {
  return `missing-${faker.word.noun()}-${uniqueSuffix(faker)}`;
}

/** A bearer value that is not a JWT (no dots, so it cannot be decoded). */
export function malformedToken(faker: Faker): string {
  return faker.string.alphanumeric(32);
}
