// Field models for comparing Petstore resources (see helpers/state-compare.ts). Every field the API
// returns is classified; a new field shows up as unclassified until it is added here.

import { normalize, type FieldModel } from '../../helpers/state-compare';

export const PET_FIELDS: FieldModel = {
  id: 'identity',
  name: 'business',
  status: 'business',
  photoUrls: 'business',
  category: 'business',
  tags: { bucket: 'business', normalize: normalize.unordered },
};

export const ORDER_FIELDS: FieldModel = {
  id: 'identity',
  petId: 'business',
  quantity: 'business',
  status: 'business',
  complete: 'business',
  // Echoed as `+00:00` when sent as `Z` (contract note PN-04): same instant, different text.
  shipDate: { bucket: 'business', normalize: normalize.instant },
};
