import { test, expect } from '@playwright/test';
import { Faker, en } from '@faker-js/faker';
import { manualClock } from '../../../helpers/clock';
import { PetMother } from '../builders/mother';
import { anOrder } from '../builders/order-builder';
import { aPet } from '../builders/pet-builder';
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
