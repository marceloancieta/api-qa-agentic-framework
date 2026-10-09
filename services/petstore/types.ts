// Hand-written until types are generated from the OpenAPI document (E2).

export type PetStatus = 'available' | 'pending' | 'sold';

export interface Pet {
  id?: number;
  name: string;
  photoUrls: string[];
  category?: { id?: number; name?: string };
  tags?: { id?: number; name?: string }[];
  status?: PetStatus;
}
