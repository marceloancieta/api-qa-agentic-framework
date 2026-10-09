import { test, expect } from '@playwright/test';
import { Faker, en } from '@faker-js/faker';
import { manualClock } from '../../../helpers/clock';
import { PetMother } from '../builders/mother';
import { anOrder } from '../builders/order-builder';
import { aPet } from '../builders/pet-builder';
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
});
