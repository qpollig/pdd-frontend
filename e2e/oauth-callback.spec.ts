import { expect, test } from '@playwright/test';

/**
 * The default dev server here runs MockApiClient (VITE_USE_MOCK_API unset ⇒ true), so these
 * exercise the real /auth/callback/:provider route, guard and state-bridge contract end to end
 * without ever reaching an external OAuth provider — the same contract the real Yandex/VK redirect
 * lands on, just with MockApiClient standing in for the backend's code exchange.
 */
test.describe('OAuth callback contract (no external provider)', () => {
  test('completes login when the returned state matches the one-shot bridge', async ({ page }) => {
    await page.goto('./auth');
    await page.evaluate(() => {
      window.sessionStorage.setItem('av_oauth_state_bridge', JSON.stringify({ provider: 'yandex', state: 'test-state-1' }));
    });

    await page.goto('./auth/callback/yandex?code=mock-yandex-code&state=test-state-1');

    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
    const bridge = await page.evaluate(() => window.sessionStorage.getItem('av_oauth_state_bridge'));
    expect(bridge).toBeNull();
  });

  test('returns to /auth with a visible error on a state mismatch, without looping', async ({ page }) => {
    await page.goto('./auth');
    await page.evaluate(() => {
      window.sessionStorage.setItem('av_oauth_state_bridge', JSON.stringify({ provider: 'yandex', state: 'expected-state' }));
    });

    await page.goto('./auth/callback/yandex?code=mock-yandex-code&state=wrong-state');

    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('returns to /auth with a visible error when the provider itself reports a failure', async ({ page }) => {
    await page.goto('./auth/callback/vk?error=access_denied');

    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('reloading an already-consumed callback URL fails gracefully instead of re-authenticating', async ({ page }) => {
    await page.goto('./auth');
    await page.evaluate(() => {
      window.sessionStorage.setItem('av_oauth_state_bridge', JSON.stringify({ provider: 'yandex', state: 'once-only' }));
    });
    await page.goto('./auth/callback/yandex?code=mock-yandex-code&state=once-only');
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();

    // Simulates a browser-history reload of the callback URL after the bridge was already consumed.
    await page.goto('./auth/callback/yandex?code=mock-yandex-code&state=once-only');

    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
