import { expect, test, type Page } from '@playwright/test';
import { loginWithYandex, openHeaderLink, pushNamedRoute } from './helpers';

async function loginTrialPremium(page: Page) {
  await page.goto('./auth?premium=trial');
  await page.getByRole('button', { name: 'Войти через Яндекс' }).click();
  await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
}

async function loginActivePremium(page: Page) {
  await page.goto('./auth?premium=1');
  await page.getByRole('button', { name: 'Войти через Яндекс' }).click();
  await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflowed = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflowed).toBe(false);
}

test.describe('Profile: cancel auto-renew', () => {
  test('Free user does not see a cancel-auto-renew control', async ({ page }) => {
    await loginWithYandex(page);
    await openHeaderLink(page, 'Профиль');
    await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
    await expect(page.getByText('Не активна')).toBeVisible();
    await expect(page.getByTestId('profile-cancel-auto-renew')).toHaveCount(0);
  });

  test('trial Premium user can open confirmation and disable auto-renew', async ({ page }) => {
    await loginTrialPremium(page);
    await openHeaderLink(page, 'Профиль');
    await expect(page.getByText('Пробный период')).toBeVisible();
    await expect(page.getByText('Включено')).toBeVisible();

    await page.getByTestId('profile-cancel-auto-renew').click();

    const dialog = page.getByRole('dialog', { name: 'Отключить автопродление?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Premium останется активным до', { exact: false })).toBeVisible();

    await dialog.getByTestId('cancel-subscription-confirm').click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Отменена')).toBeVisible();
    await expect(page.getByText('Выключено')).toBeVisible();
    await expect(page.getByText('Автопродление отключено.', { exact: false })).toBeVisible();
    // Premium must not disappear immediately after cancelling auto-renew.
    await expect(page.getByText('Premium', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('profile-cancel-auto-renew')).toHaveCount(0);
  });

  test('active Premium user sees the same management control', async ({ page }) => {
    await loginActivePremium(page);
    await openHeaderLink(page, 'Профиль');
    await expect(page.getByText('Активна')).toBeVisible();
    await expect(page.getByTestId('profile-cancel-auto-renew')).toBeVisible();
  });

  test('dismissing the confirmation keeps auto-renew on', async ({ page }) => {
    await loginTrialPremium(page);
    await openHeaderLink(page, 'Профиль');
    await page.getByTestId('profile-cancel-auto-renew').click();

    await page.getByTestId('cancel-subscription-dismiss').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Включено')).toBeVisible();
    await expect(page.getByTestId('profile-cancel-auto-renew')).toBeVisible();
  });

  test('Escape closes the confirmation without cancelling', async ({ page }) => {
    await loginTrialPremium(page);
    await openHeaderLink(page, 'Профиль');
    await page.getByTestId('profile-cancel-auto-renew').click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Включено')).toBeVisible();
  });

  test('failed cancel shows an error and can be retried', async ({ page }) => {
    await loginTrialPremium(page);
    await openHeaderLink(page, 'Профиль');

    await page.evaluate(() => {
      (window as Window & { __AV_TEST_CANCEL_FAIL__?: boolean }).__AV_TEST_CANCEL_FAIL__ = true;
    });

    await page.getByTestId('profile-cancel-auto-renew').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('cancel-subscription-confirm').click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Включено')).toBeVisible();

    await page.evaluate(() => {
      (window as Window & { __AV_TEST_CANCEL_FAIL__?: boolean }).__AV_TEST_CANCEL_FAIL__ = false;
    });
    await dialog.getByTestId('cancel-subscription-confirm').click();

    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Выключено')).toBeVisible();
  });

  test('double submit sends a single cancel request', async ({ page }) => {
    await loginTrialPremium(page);
    await openHeaderLink(page, 'Профиль');
    await page.getByTestId('profile-cancel-auto-renew').click();
    await expect(page.getByTestId('cancel-subscription-confirm')).toBeVisible();

    /**
     * Two separate page.locator().click() calls raced via Promise.all each run Playwright's own
     * actionability protocol (hover, wait for the leave-transition to settle, then dispatch) — on
     * a button whose success handler starts closing the modal after the first click, the second
     * call's wait can resolve its element handle right as Vue's post-transition unmount tears the
     * node out, surfacing as "element was detached from the DOM" under load. A real double-click
     * fires both native click events back-to-back in one synchronous browser turn, before Vue's
     * `disabled` patch or the modal-close reactivity ever runs — dispatch it that way instead, so
     * the test still proves the app-level guard (sessionStore.cancelAutoRenew's synchronous
     * `processing` check) rather than racing Playwright's own automation timing.
     */
    const calls = await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>(
        '[data-testid="cancel-subscription-confirm"]',
      );
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    });
    expect(calls).toBe(true);

    await expect(page.getByRole('dialog')).toHaveCount(0);
    const callCount = await page.evaluate(
      () => (window as Window & { __AV_TEST_CANCEL_CALLS__?: number }).__AV_TEST_CANCEL_CALLS__,
    );
    expect(callCount).toBe(1);
  });

  test('subscription state does not survive a full reload (in-memory session only)', async ({ page }) => {
    await loginTrialPremium(page);
    await openHeaderLink(page, 'Профиль');
    await page.getByTestId('profile-cancel-auto-renew').click();
    await page.getByTestId('cancel-subscription-confirm').click();
    await expect(page.getByText('Выключено')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Вход' })).toBeVisible();
  });

  for (const width of [320, 390, 414] as const) {
    test(`cancel confirmation has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await loginTrialPremium(page);
      await pushNamedRoute(page, 'profile');
      await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.getByTestId('profile-cancel-auto-renew').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      // The dialog fades/scales in over 0.2s; wait it out so layout assertions read the
      // settled state instead of racing the entrance transition's mid-animation frame.
      await page.waitForTimeout(300);
      await expectNoHorizontalOverflow(page);

      const confirmBox = await page.getByTestId('cancel-subscription-confirm').boundingBox();
      const dismissBox = await page.getByTestId('cancel-subscription-dismiss').boundingBox();
      expect(confirmBox?.height).toBeGreaterThanOrEqual(44);
      expect(dismissBox?.height).toBeGreaterThanOrEqual(44);
    });
  }

  test('cancel confirmation has no horizontal overflow at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginTrialPremium(page);
    await pushNamedRoute(page, 'profile');
    await page.getByTestId('profile-cancel-auto-renew').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
