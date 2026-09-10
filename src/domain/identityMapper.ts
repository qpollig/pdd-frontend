import type { IdentityOut } from '../api/types';
import type { Identity } from './identity';

/** openapi.json IdentityOut → domain Identity (snake_case → camelCase). */
export function mapIdentity(dto: IdentityOut): Identity {
  return {
    type: dto.type,
    identifier: dto.identifier,
    createdAt: dto.created_at,
  };
}

export function mapIdentities(list: IdentityOut[]): Identity[] {
  return list.map(mapIdentity);
}
