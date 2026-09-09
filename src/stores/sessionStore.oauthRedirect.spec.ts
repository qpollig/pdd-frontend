import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * These tests exercise the real (RealApiClient) branch of loginWithProvider/completeOAuthCallback,
 * which only activates when VITE_USE_MOCK_API=false — the opposite of vite.config.ts's forced test
 * default. `vi.resetModules()` + a fresh dynamic import (of pinia too, so every module involved
 * shares the same reset registry) is what lets each test re-evaluate api/client.ts's module-level
 * `useMockLogin` against a freshly stubbed env, matching what actually happens at app boot.
 */
describe('sessionStore real OAuth redirect flow (RealApiClient)', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_MOCK_API', 'false');
    vi.stubEnv('VITE_YANDEX_OAUTH_CLIENT_ID', 'test-yandex-client-id');
    vi.stubEnv('VITE_VK_OAUTH_CLIENT_ID', 'test-vk-client-id');
    sessionStorage.clear();
    // @ts-expect-error -- deliberately replacing the read-only `location` for this test only.
    delete window.location;
    window.location = { ...originalLocation, href: 'http://localhost:5173/auth' } as Location;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    sessionStorage.clear();
    window.location = originalLocation;
  });

  async function freshSession() {
    const pinia = await import('pinia');
    pinia.setActivePinia(pinia.createPinia());
    const clientModule = await import('../api/client');
    const { useSessionStore } = await import('./sessionStore');
    return { session: useSessionStore(), clientModule };
  }

  it('redirects to the provider authorize URL with a generated state, stored in the one-shot bridge', async () => {
    const { session } = await freshSession();

    session.loginWithProvider('yandex');

    expect(window.location.href.startsWith('https://oauth.yandex.ru/authorize?')).toBe(true);
    expect(window.location.href).toContain('client_id=test-yandex-client-id');
    expect(window.location.href).toContain(encodeURIComponent('/auth/callback/yandex'));

    const bridgeRaw = sessionStorage.getItem('av_oauth_state_bridge');
    expect(bridgeRaw).toBeTruthy();
    const bridge = JSON.parse(bridgeRaw as string) as { provider: string; state: string };
    expect(bridge.provider).toBe('yandex');
    expect(window.location.href).toContain(`state=${bridge.state}`);
  });

  it('sets a clear error instead of redirecting when the provider has no client_id configured', async () => {
    vi.stubEnv('VITE_VK_OAUTH_CLIENT_ID', '');
    const { session } = await freshSession();

    session.loginWithProvider('vk');

    expect(session.error).toBeTruthy();
    expect(window.location.href).toBe('http://localhost:5173/auth');
    expect(sessionStorage.getItem('av_oauth_state_bridge')).toBeNull();
  });

  it('completeOAuthCallback exchanges the code and applies the session when state matches', async () => {
    const { session, clientModule } = await freshSession();
    session.loginWithProvider('yandex');
    const bridge = JSON.parse(sessionStorage.getItem('av_oauth_state_bridge') as string) as { state: string };

    const exchangeSpy = vi.spyOn(clientModule.apiClient, 'exchangeOAuthCode').mockResolvedValueOnce({
      access_token: 'real-access-token',
      token_type: 'bearer',
      user: {
        id: 'u1',
        oauth_provider: 'yandex',
        name: 'Реальный пользователь',
        avatar_url: null,
        email: null,
        lives_current: 3,
        lives_max: 3,
        is_premium: false,
        errors_count: 0,
        favorites_count: 0,
        lives_regen_at: null,
        lives_reset_at: null,
      },
    });

    const ok = await session.completeOAuthCallback('yandex', {
      code: 'real-provider-code',
      state: bridge.state,
      providerError: null,
    });

    expect(ok).toBe(true);
    expect(session.isAuthenticated).toBe(true);
    expect(session.accessToken).toBe('real-access-token');
    expect(exchangeSpy).toHaveBeenCalledWith('yandex', 'real-provider-code', expect.stringContaining('/auth/callback/yandex'));
    expect(sessionStorage.getItem('av_oauth_state_bridge')).toBeNull();
  });

  it('fails closed on a state mismatch, without calling the backend', async () => {
    const { session, clientModule } = await freshSession();
    session.loginWithProvider('yandex');
    const exchangeSpy = vi.spyOn(clientModule.apiClient, 'exchangeOAuthCode');

    const ok = await session.completeOAuthCallback('yandex', {
      code: 'real-provider-code',
      state: 'wrong-state',
      providerError: null,
    });

    expect(ok).toBe(false);
    expect(session.isAuthenticated).toBe(false);
    expect(session.error).toBeTruthy();
    expect(exchangeSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('av_oauth_state_bridge')).toBeNull();
  });

  it('fails closed when the provider itself reports an error, without a bridge or code', async () => {
    const { session } = await freshSession();

    const ok = await session.completeOAuthCallback('yandex', {
      code: null,
      state: null,
      providerError: 'access_denied',
    });

    expect(ok).toBe(false);
    expect(session.isAuthenticated).toBe(false);
    expect(session.error).toBeTruthy();
  });

  it('fails closed and reports an error when the backend rejects the code exchange', async () => {
    const { session, clientModule } = await freshSession();
    session.loginWithProvider('yandex');
    const bridge = JSON.parse(sessionStorage.getItem('av_oauth_state_bridge') as string) as { state: string };
    vi.spyOn(clientModule.apiClient, 'exchangeOAuthCode').mockRejectedValueOnce(new Error('OAUTH_EXCHANGE_FAILED'));

    const ok = await session.completeOAuthCallback('yandex', {
      code: 'already-used-code',
      state: bridge.state,
      providerError: null,
    });

    expect(ok).toBe(false);
    expect(session.isAuthenticated).toBe(false);
    expect(session.error).toBeTruthy();
  });
});
