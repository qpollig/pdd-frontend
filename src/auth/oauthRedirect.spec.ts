import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAuthorizeUrl, buildOAuthCallbackUrl, generateOAuthState, isOAuthProviderConfigured } from './oauthRedirect';

describe('oauthRedirect', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('isOAuthProviderConfigured reflects whether a client_id env var is set', () => {
    vi.stubEnv('VITE_YANDEX_OAUTH_CLIENT_ID', '');
    vi.stubEnv('VITE_VK_OAUTH_CLIENT_ID', 'abc123');

    expect(isOAuthProviderConfigured('yandex')).toBe(false);
    expect(isOAuthProviderConfigured('vk')).toBe(true);
  });

  it('buildAuthorizeUrl throws OAUTH_PROVIDER_NOT_CONFIGURED without a client_id', () => {
    vi.stubEnv('VITE_YANDEX_OAUTH_CLIENT_ID', '');

    expect(() =>
      buildAuthorizeUrl('yandex', { redirectUri: 'https://app.example/auth/callback/yandex', state: 's1' }),
    ).toThrow('OAUTH_PROVIDER_NOT_CONFIGURED: yandex');
  });

  it('buildAuthorizeUrl builds the classic Yandex authorize URL with response_type/client_id/redirect_uri/state', () => {
    vi.stubEnv('VITE_YANDEX_OAUTH_CLIENT_ID', 'yandex-client-id');

    const url = buildAuthorizeUrl('yandex', {
      redirectUri: 'https://app.example/auth/callback/yandex',
      state: 'state-123',
    });
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe('https://oauth.yandex.ru/authorize');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('yandex-client-id');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://app.example/auth/callback/yandex');
    expect(parsed.searchParams.get('state')).toBe('state-123');
  });

  it('buildAuthorizeUrl adds the VK-specific v/display params', () => {
    vi.stubEnv('VITE_VK_OAUTH_CLIENT_ID', 'vk-client-id');

    const url = buildAuthorizeUrl('vk', { redirectUri: 'https://app.example/auth/callback/vk', state: 'state-456' });
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe('https://oauth.vk.com/authorize');
    expect(parsed.searchParams.get('v')).toBe('5.199');
    expect(parsed.searchParams.get('display')).toBe('page');
  });

  it('buildAuthorizeUrl honors an authorize-endpoint override', () => {
    vi.stubEnv('VITE_VK_OAUTH_CLIENT_ID', 'vk-client-id');
    vi.stubEnv('VITE_VK_OAUTH_AUTHORIZE_URL', 'https://id.vk.com/authorize');

    const url = buildAuthorizeUrl('vk', { redirectUri: 'https://app.example/auth/callback/vk', state: 's' });

    expect(url.startsWith('https://id.vk.com/authorize?')).toBe(true);
  });

  it('buildOAuthCallbackUrl resolves to this app own /auth/callback/{provider} route', () => {
    expect(buildOAuthCallbackUrl('yandex')).toBe(`${window.location.origin}/auth/callback/yandex`);
    expect(buildOAuthCallbackUrl('vk')).toBe(`${window.location.origin}/auth/callback/vk`);
  });

  it('generateOAuthState returns a non-empty, non-repeating value', () => {
    const a = generateOAuthState();
    const b = generateOAuthState();

    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
