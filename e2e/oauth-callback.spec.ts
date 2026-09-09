import { expect, test } from '@playwright/test';

/**
 * With no VITE_USE_MOCK_API set, the dev server defaults to MockApiClient, so this suite drives
 * the actual /auth/callback/:provider route — guard behavior and the state bridge included — start
 * to finish, never touching a real OAuth provider. It's the identical contract the genuine
 * Yandex/VK redirect relies on; MockApiClient just stands in for the backend's code-for-token step.
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

    // Mirrors a user hitting back/refresh on the callback URL once the bridge entry is gone.
    await page.goto('./auth/callback/yandex?code=mock-yandex-code&state=once-only');

    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible();
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
