import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { loginWithYandex, openHeaderLink } from './helpers';

const ticketPath = join(dirname(fileURLToPath(import.meta.url)), '../src/data/ticket-1.json');
const questions = JSON.parse(readFileSync(ticketPath, 'utf8')) as Array<{ question: string }>;
const firstQuestion = questions[0].question;

async function expectNoHorizontalOverflow(page: Page) {
  const overflowed = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflowed).toBe(false);
}

async function openTheoryPlayer(page: Page) {
  await loginWithYandex(page);
  await page.getByRole('button', { name: 'Начать обучение' }).click();
  await expect(page.getByRole('heading', { name: firstQuestion })).toBeVisible();
}

test.describe('TicketPlayer mobile header', () => {
  for (const width of [320, 390, 414] as const) {
    test(`theory player has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await openTheoryPlayer(page);
      await expectNoHorizontalOverflow(page);
    });
  }

  test('back button, mode name and lives all stay reachable at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openTheoryPlayer(page);

    await expect(page.getByRole('button', { name: 'Назад', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Билет 1/ })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Жизни' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Жизни' })).toContainText('10 / 10');
  });

  test('exam timer and lives are both visible in the header at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await loginWithYandex(page);
    await page.getByRole('button', { name: 'Открыть меню' }).click();
    await openHeaderLink(page, 'Экзамен ГИБДД');

    await expect(page.getByRole('heading', { name: 'Экзамен ГИБДД', level: 1 })).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Жизни' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('TicketPlayer 3D CTA', () => {
  test('opens the honest "not available yet" explanation, not a video', async ({ page }) => {
    await openTheoryPlayer(page);
    await page.getByRole('button', { name: '3D-Видеоразбор' }).click();

    const dialog = page.getByRole('dialog', { name: '3D-видеоразбор' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Видео пока не воспроизводится')).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);
  });

  test('renders after the question and answers on mobile, not above them', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTheoryPlayer(page);

    const questionBox = await page.getByRole('heading', { name: firstQuestion }).boundingBox();
    const ctaBox = await page.getByRole('button', { name: '3D-Видеоразбор' }).boundingBox();

    expect(questionBox).not.toBeNull();
    expect(ctaBox).not.toBeNull();
    expect(ctaBox!.y).toBeGreaterThan(questionBox!.y);
  });

  test('stays reachable next to the media block on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTheoryPlayer(page);

    await expect(page.getByRole('button', { name: '3D-Видеоразбор' })).toBeVisible();
  });
});
