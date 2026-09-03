import { expect, type Page } from '@playwright/test';

export async function loginWithYandex(page: Page) {
  await page.goto('./auth');
  await page.getByRole('button', { name: 'Войти через Яндекс' }).click();
  await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
}

/** In-app navigation only: full page.goto drops the in-memory Pinia session (ТЗ §2.2). */
export async function openHeaderLink(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name, exact: true }).click();
}

/** DEV-only helper from main.ts. Use after login; do not use page.goto for authed routes. */
export async function pushNamedRoute(page: Page, name: string) {
  await page.evaluate((routeName) => {
    const push = (window as Window & { __AV_TEST_PUSH__?: (n: string) => Promise<unknown> }).__AV_TEST_PUSH__;
    if (!push) {
      throw new Error('__AV_TEST_PUSH__ is missing');
    }
    return push(routeName);
  }, name);
}
