import { expect, test, type Page } from '@playwright/test';
import { loginWithYandex, openHeaderLink } from './helpers';

async function expectNoHorizontalOverflow(page: Page) {
  const overflowed = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflowed).toBe(false);
}

test.describe('Dashboard hierarchy', () => {
  test('leads with one primary learning action, other modes stay secondary', async ({ page }) => {
    await loginWithYandex(page);

    const primary = page.getByRole('button', { name: 'Начать обучение' });
    await expect(primary).toBeVisible();

    await expect(page.getByRole('button', { name: 'Ошибки' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Экзамен ГИБДД' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Билеты' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Получить Premium-доступ' })).toBeVisible();

    await primary.click();
    await expect(page.getByRole('heading', { name: /Билет 1/ })).toBeVisible();
  });

  for (const width of [320, 390, 414, 768, 1440] as const) {
    test(`dashboard has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await loginWithYandex(page);
      await expect(page.getByRole('button', { name: 'Начать обучение' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
});

test.describe('Dashboard error/favorites counters (D2)', () => {
  /** Default mock login seeds 3 error-history questions (MOCK_ERROR_QUESTION_IDS) and 0 favorites. */
  test('errors badge shows the server count and stays enabled; favorites starts disabled', async ({
    page,
  }) => {
    await loginWithYandex(page);

    const errorsButton = page.getByRole('button', { name: 'Ошибки' });
    await expect(errorsButton).toBeEnabled();
    await expect(errorsButton).toContainText('3');

    const favoritesButton = page.getByRole('button', { name: 'Избранное' });
    await expect(favoritesButton).toBeDisabled();
    await expect(favoritesButton).not.toContainText(/\d/);
  });

  test('errors_count === 0 disables the Ошибки card and blocks navigation', async ({ page }) => {
    await page.goto('./auth?errors=none');
    await page.getByRole('button', { name: 'Войти через Яндекс' }).click();
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();

    const errorsButton = page.getByRole('button', { name: 'Ошибки' });
    await expect(errorsButton).toBeDisabled();
    await expect(errorsButton).not.toContainText(/\d/);

    await errorsButton.click({ force: true });
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
  });

  test('favorites_count === 0 disables the Избранное card and blocks navigation', async ({ page }) => {
    await loginWithYandex(page);

    const favoritesButton = page.getByRole('button', { name: 'Избранное' });
    await expect(favoritesButton).toBeDisabled();

    await favoritesButton.click({ force: true });
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
  });

  test('Экзамен stays enabled regardless of errors_count and favorites_count', async ({ page }) => {
    await page.goto('./auth?errors=none');
    await page.getByRole('button', { name: 'Войти через Яндекс' }).click();
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();

    // Both counters are 0 here — Экзамен must not pick up D2's disabled condition.
    await expect(page.getByRole('button', { name: 'Ошибки' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Избранное' })).toBeDisabled();

    const examButton = page.getByRole('button', { name: 'Экзамен ГИБДД' });
    await expect(examButton).toBeEnabled();
    await examButton.click();
    await expect(page).toHaveURL(/exam/);
  });

  test('favoriting a question updates the Dashboard badge from server state, not a local counter', async ({
    page,
  }) => {
    await loginWithYandex(page);
    await expect(page.getByRole('button', { name: 'Избранное' })).toBeDisabled();

    await page.getByRole('button', { name: 'Билеты' }).click();
    await page.getByRole('link', { name: /^Билет 1 / }).click();
    await page.getByRole('button', { name: 'Добавить в избранное' }).click();
    await expect(page.getByRole('button', { name: 'В избранном' })).toBeVisible();

    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(page.getByRole('heading', { name: 'Билеты' })).toBeVisible();
    await openHeaderLink(page, 'Главная');
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();

    const favoritesButton = page.getByRole('button', { name: 'Избранное' });
    await expect(favoritesButton).toBeEnabled();
    await expect(favoritesButton).toContainText('1');
  });
});
