import { afterEach, describe, expect, it, vi } from 'vitest';
import { RealApiClient } from './RealApiClient';
import type { AuthUser } from './types';

const AUTH_USER: AuthUser = {
  id: 'u1',
  oauth_provider: 'yandex',
  name: null,
  avatar_url: null,
  email: null,
  lives_current: 3,
  lives_max: 3,
  is_premium: false,
  errors_count: 0,
  favorites_count: 0,
  lives_regen_at: null,
  lives_reset_at: null,
};

function mockFetchOnce(body: unknown) {
  return vi.fn().mockResolvedValue({
    status: 200,
    ok: true,
    text: async () => JSON.stringify(body),
  });
}

describe('RealApiClient.exchangeOAuthCode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends only { code } when no redirectUri is given — backend falls back to its own configured default', async () => {
    const fetchMock = mockFetchOnce({ access_token: 'tok', token_type: 'bearer', user: AUTH_USER });
    vi.stubGlobal('fetch', fetchMock);
    const client = new RealApiClient('http://backend.example');

    await client.exchangeOAuthCode('yandex', 'provider-code');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://backend.example/api/v1/auth/oauth/yandex');
    expect(JSON.parse(init.body as string)).toEqual({ code: 'provider-code' });
  });

  it('sends { code, redirect_uri } when redirectUri is given — the real OAuth redirect flow', async () => {
    const fetchMock = mockFetchOnce({
      access_token: 'tok',
      token_type: 'bearer',
      user: { ...AUTH_USER, oauth_provider: 'vk' },
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new RealApiClient('http://backend.example');

    await client.exchangeOAuthCode('vk', 'provider-code', 'https://app.example/auth/callback/vk');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://backend.example/api/v1/auth/oauth/vk');
    expect(JSON.parse(init.body as string)).toEqual({
      code: 'provider-code',
      redirect_uri: 'https://app.example/auth/callback/vk',
    });
  });
});
