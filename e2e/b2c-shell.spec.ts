import { expect, test } from '@playwright/test';
import { loginWithYandex, openHeaderLink } from './helpers';

test.describe('B2C shell navigation', () => {
  test('opens dashboard and moves through Phase 1 routes', async ({ page }) => {
    await loginWithYandex(page);
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();

    await openHeaderLink(page, 'Билеты');
    await expect(page.getByRole('heading', { name: 'Билеты' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Билет 1 / })).toBeVisible();

    await openHeaderLink(page, 'Профиль');
    await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
    await expect(page.getByText('Не активна')).toBeVisible();

    await page.getByRole('link', { name: 'Premium' }).click();
    await expect(page.getByRole('heading', { name: 'Premium', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Подключить Premium' }).click();
    await expect(page.getByRole('heading', { name: 'Оформление' })).toBeVisible();

    await openHeaderLink(page, 'Экзамен ГИБДД');
    await expect(page.getByRole('heading', { name: 'Экзамен ГИБДД' })).toBeVisible();
    // Leaving an in-progress exam asks for confirmation first (progress would be lost).
    await page.getByRole('button', { name: 'Назад' }).click();
    await page.getByRole('button', { name: 'Прервать экзамен' }).click();
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();

    await openHeaderLink(page, 'Статистика');
    await expect(page.getByRole('heading', { name: 'Статистика' })).toBeVisible();
  });

  test('opens existing ticket player from catalog', async ({ page }) => {
    await loginWithYandex(page);
    await openHeaderLink(page, 'Билеты');
    await page.getByRole('link', { name: /^Билет 1 / }).click();
    await expect(page.getByRole('heading', { name: /Билет 1/ })).toBeVisible();
  });
});
