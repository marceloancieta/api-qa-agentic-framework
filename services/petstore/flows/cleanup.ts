// Cleanup that proves itself. Petstore answers 200 to a user delete whether or not the user existed
// (PN-22), so a delete's own status proves nothing: each helper deletes, then reads, and returns the
// read's status for the case to assert (404 when the record is gone). Records that were never
// created are fine: their read answers 404 too.

import type { PetstoreClients } from '../fixtures';

export async function removePet(clients: Pick<PetstoreClients, 'pets'>, id: number) {
  await clients.pets.remove(id);
  return (await clients.pets.getById(id)).status();
}

export async function removeOrder(clients: Pick<PetstoreClients, 'store'>, id: number) {
  await clients.store.deleteOrder(id);
  return (await clients.store.getOrder(id)).status();
}

export async function removeUser(clients: Pick<PetstoreClients, 'users'>, username: string) {
  await clients.users.remove(username);
  return (await clients.users.getByName(username)).status();
}
