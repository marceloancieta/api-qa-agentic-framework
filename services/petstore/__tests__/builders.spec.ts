import { test, expect } from '@playwright/test';
import { Faker, en } from '@faker-js/faker';
import { manualClock } from '../../../helpers/clock';
import { PetMother } from '../builders/mother';
import { anOrder } from '../builders/order-builder';
import {
  aPet,
  GENERATED_ID_MAX,
  imageBytes,
  malformedPetIds,
  UNKNOWN_PET_ID,
} from '../builders/pet-builder';
import { aUser, unknownUsername, USERNAME_PREFIX } from '../builders/user-builder';
import { PET_STATUSES } from '../types';

function seededFaker(seed: number): Faker {
  const faker = new Faker({ locale: [en] });
  faker.seed(seed);
  return faker;
}

test.describe('Petstore builders', () => {
  test('the same seed builds the same pet', () => {
    expect(aPet(seededFaker(5)).build()).toEqual(aPet(seededFaker(5)).build());
  });

  test('overrides apply and build returns an independent copy', () => {
    const builder = aPet(seededFaker(1)).withId(10).named('rex').withStatus('sold');
    const first = builder.build();
    first.photoUrls.push('changed');
    expect(builder.build()).toMatchObject({ id: 10, name: 'rex', status: 'sold' });
    expect(builder.build().photoUrls).not.toContain('changed');
  });

  test('toBodyWith changes, adds and removes fields at any depth and leaves the builder alone', () => {
    const builder = aPet(seededFaker(4));
    const pet = builder.build();
    const body = builder.toBodyWith({
      name: 7,
      status: null,
      photoUrls: undefined,
      'category.id': 'one',
      'tags.0.name': null,
      unknown: true,
    });
    expect(body).toEqual({
      ...pet,
      name: 7,
      status: null,
      photoUrls: undefined,
      category: { ...pet.category, id: 'one' },
      tags: [{ ...pet.tags?.[0], name: null }],
      unknown: true,
    });
    expect('photoUrls' in body).toBe(false);
    expect(builder.build()).toEqual(pet);
    expect(() => builder.toBodyWith({ 'name.x': 1 })).toThrow(/goes through/);
  });

  test('malformed pet ids are never a valid int64 and the unknown id is outside the range', () => {
    const ids = malformedPetIds(seededFaker(6));
    expect(ids.map(([label]) => label)).toEqual([
      'non-numeric',
      'int64 overflow',
      '300 digits',
      'encoded slash',
    ]);
    for (const [, id] of ids) {
      const valid = /^-?\d+$/.test(id) && BigInt(id) < 2n ** 63n;
      expect(valid, id.slice(0, 20)).toBe(false);
    }
    expect(UNKNOWN_PET_ID).toBe(GENERATED_ID_MAX + 1);
    // The encoded slash starts with the case's own id, or the unknown one: never a seed pet's.
    expect(ids.at(-1)?.[1]).toBe(`${UNKNOWN_PET_ID}/1`);
    expect(malformedPetIds(seededFaker(6), 9_123_456_789).at(-1)?.[1]).toBe('9123456789/1');
    expect(aPet(seededFaker(8)).withPhotoUrls(2).build().photoUrls).toHaveLength(2);
  });

  test('toJson writes int64 digits at top-level and nested paths', () => {
    const digits = '9223372036854775808';
    const json = aPet(seededFaker(9)).toJson({
      id: digits,
      'category.id': digits,
      'tags.0.id': digits,
    });
    expect(json.match(new RegExp(`:${digits}[,}]`, 'g'))).toHaveLength(3);
    expect(json).not.toContain('__raw_');
    expect(() => aPet(seededFaker(9)).toJson({ id: '1e3' })).toThrow(/not an integer/);
    expect(imageBytes(seededFaker(7))).toEqual(imageBytes(seededFaker(7)));
  });

  test('a minimal pet carries only the required fields and its id', () => {
    expect(Object.keys(PetMother.minimal(seededFaker(2))).sort()).toEqual([
      'id',
      'name',
      'photoUrls',
    ]);
  });

  test('withAnyStatus picks from the value set', () => {
    const faker = seededFaker(3);
    for (let i = 0; i < 20; i += 1) {
      expect(PET_STATUSES).toContain(aPet(faker).withAnyStatus().build().status);
    }
  });

  test('the order ship date comes from the clock', () => {
    const clock = manualClock(new Date('2026-03-01T12:00:00Z'));
    const order = anOrder(seededFaker(4), clock).forPet(7).build();
    expect(order).toMatchObject({ petId: 7, shipDate: '2026-03-01T12:00:00.000Z' });
  });

  test('toJson writes the named fields as raw digits, past what a JS number can hold', () => {
    const edge = (2n ** 63n).toString();
    const json = aPet(seededFaker(6)).toJson({ id: edge });
    expect(json).toContain(`"id":${edge}`);
    expect(JSON.parse(json.split(edge).join('0'))).toMatchObject({ id: 0 });
    expect(() => aPet(seededFaker(6)).toJson({ id: '1e3' })).toThrow(/not an integer/);
  });

  test('a user has a prefixed unique username, an explicit id and a non-zero status', () => {
    const faker = seededFaker(7);
    const user = aUser(faker).build();
    expect(user.username?.startsWith(USERNAME_PREFIX)).toBe(true);
    expect(user.id).toBeGreaterThan(0);
    expect(user.userStatus).toBeGreaterThan(0);
    expect(aUser(faker).build().username).not.toBe(user.username);
    expect(unknownUsername(faker).startsWith(USERNAME_PREFIX)).toBe(false);
  });

  test('otherPassword never repeats the built password', () => {
    const builder = aUser(seededFaker(8));
    expect(builder.otherPassword()).not.toBe(builder.build().password);
  });
});
