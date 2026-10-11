// Enum value sets and their unions are generated from the OpenAPI document (generated/enums.ts,
// `node scripts/derive-value-sets.mjs --service petstore --write`); the names below stay as aliases
// so builders and specs keep one vocabulary. The interfaces are still hand-written.

import { ORDER_STATUS_VALUES, PET_STATUS_VALUES } from './generated/enums';
import type { OrderStatus, PetStatus } from './generated/enums';

export type { OrderStatus, PetStatus };
export const PET_STATUSES = PET_STATUS_VALUES;
export const ORDER_STATUSES = ORDER_STATUS_VALUES;

export interface Pet {
  id?: number;
  name: string;
  photoUrls: string[];
  category?: { id?: number; name?: string };
  tags?: { id?: number; name?: string }[];
  status?: PetStatus;
}

export interface User {
  id?: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  phone?: string;
  userStatus?: number;
}

export interface Order {
  id?: number;
  petId?: number;
  quantity?: number;
  shipDate?: string;
  status?: OrderStatus;
  complete?: boolean;
}
