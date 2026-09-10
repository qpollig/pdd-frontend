import { describe, expect, it } from 'vitest';
import type { Identity } from './identity';
import { canUnlink, identityErrorMessage, identityLabel } from './identity';
import { mapIdentities, mapIdentity } from './identityMapper';

const yandex: Identity = { type: 'yandex', identifier: 'oauth-y-1', createdAt: '2026-01-01T00:00:00Z' };
const password: Identity = { type: 'password', identifier: 'u@example.com', createdAt: '2026-01-02T00:00:00Z' };

describe('identityMapper', () => {
  it('maps snake_case wire DTO to camelCase domain', () => {
    expect(
      mapIdentity({ type: 'password', identifier: 'a@b.com', created_at: '2026-01-01T00:00:00Z' }),
    ).toEqual({ type: 'password', identifier: 'a@b.com', createdAt: '2026-01-01T00:00:00Z' });
  });

  it('maps a list', () => {
    expect(
      mapIdentities([{ type: 'vk', identifier: 'x', created_at: '2026-01-01T00:00:00Z' }]),
    ).toEqual([{ type: 'vk', identifier: 'x', createdAt: '2026-01-01T00:00:00Z' }]);
  });
});

describe('identityLabel', () => {
  it('names each provider', () => {
    expect(identityLabel('yandex')).toBe('Яндекс');
    expect(identityLabel('vk')).toBe('VK');
    expect(identityLabel('password')).toBe('Email');
  });
});

describe('canUnlink', () => {
  it('false when it is the only identity', () => {
    expect(canUnlink([yandex], 'yandex')).toBe(false);
  });

  it('true when another identity would remain', () => {
    expect(canUnlink([yandex, password], 'yandex')).toBe(true);
    expect(canUnlink([yandex, password], 'password')).toBe(true);
  });

  it('false when the type is not present', () => {
    expect(canUnlink([yandex], 'password')).toBe(false);
  });
});

describe('identityErrorMessage', () => {
  it('returns a specific message for known link error codes', () => {
    expect(identityErrorMessage('EMAIL_ALREADY_REGISTERED')).toMatch(/другим аккаунтом/);
    expect(identityErrorMessage('IDENTITY_ALREADY_LINKED')).toMatch(/другому профилю/);
    expect(identityErrorMessage('CANNOT_UNLINK_LAST_IDENTITY')).toMatch(/единственный способ/);
  });

  it('returns null for unknown / empty codes', () => {
    expect(identityErrorMessage('SOMETHING_ELSE')).toBeNull();
    expect(identityErrorMessage(null)).toBeNull();
    expect(identityErrorMessage('')).toBeNull();
  });
});
