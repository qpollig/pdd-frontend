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

describe('RealApiClient request timeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('rejects with NETWORK_ERROR instead of hanging forever when fetch never settles', async () => {
    vi.useFakeTimers();
    // Real fetch() rejects with an AbortError once its signal aborts — mimic that instead of
    // ever resolving, so the test proves the timeout is what ends the request, not the mock.
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted', 'AbortError')));
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new RealApiClient('http://backend.example');

    const pending = client.getCurrentUser();
    const assertion = expect(pending).rejects.toThrow(/NETWORK_ERROR/);
    await vi.runAllTimersAsync();
    await assertion;
  });
});

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
