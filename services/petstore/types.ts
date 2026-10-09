// Hand-written until types and value sets are generated from the OpenAPI document (E2).

export const PET_STATUSES = ['available', 'pending', 'sold'] as const;
export type PetStatus = (typeof PET_STATUSES)[number];

export const ORDER_STATUSES = ['placed', 'approved', 'delivered'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Pet {
  id?: number;
  name: string;
  photoUrls: string[];
  category?: { id?: number; name?: string };
  tags?: { id?: number; name?: string }[];
  status?: PetStatus;
}

export interface Order {
  id?: number;
  petId?: number;
  quantity?: number;
  shipDate?: string;
  status?: OrderStatus;
  complete?: boolean;
}
