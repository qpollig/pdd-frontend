import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { loginWithYandex } from './helpers';

const ticketPath = join(dirname(fileURLToPath(import.meta.url)), '../src/data/ticket-1.json');
const questions = JSON.parse(readFileSync(ticketPath, 'utf8')) as Array<{
  id: string;
  question: string;
  answers: Array<{ answer_text: string; is_correct: boolean }>;
}>;

function sourceByText(text: string) {
  const item = questions.find((question) => question.question === text);
  if (!item) throw new Error(`Unknown question: ${text}`);
  return item;
}

function option(item: (typeof questions)[number], correct: boolean) {
  const found = item.answers.find((answer) => answer.is_correct === correct);
  if (!found) throw new Error(`Missing option for ${item.id}`);
  return found.answer_text;
}

test.describe('Exam ГИБДД mode', () => {
  test('login → dashboard → exam → 20 questions → hidden feedback → finish → dashboard', async ({
    page,
  }) => {
    await loginWithYandex(page);
    await page.getByRole('button', { name: 'Экзамен ГИБДД' }).click();

    await expect(page.getByRole('heading', { name: 'Экзамен ГИБДД' })).toBeVisible();
    await expect(page.getByText('Теория', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Навигация по вопросам билета' }).getByRole('button')).toHaveCount(
      20,
    );

    for (let index = 0; index < questions.length; index += 1) {
      const item = questions[index];
      await expect(page.getByRole('heading', { name: item.question })).toBeVisible();
      await page.getByRole('button', { name: option(item, true), exact: true }).click();
      await expect(page.getByRole('status', { name: 'Результат ответа' })).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Пояснение' })).toHaveCount(0);

      if (index < questions.length - 1) {
        await page.getByRole('button', { name: 'Следующий вопрос' }).click();
      } else {
        await page.getByRole('button', { name: 'Завершить экзамен' }).click();
      }
    }

    const result = page.getByRole('dialog', { name: 'Результат экзамена' });
    await expect(result).toBeVisible();
    await expect(result.getByText('Экзамен сдан')).toBeVisible();
    await expect(result.getByText('Поздравляю! 0 ошибок.')).toBeVisible();
    await expect(result.getByRole('button', { name: 'На главную' })).toBeVisible();
    await expect(result.getByRole('button', { name: 'Повторить экзамен' })).toBeVisible();
    await result.getByRole('button', { name: 'На главную' }).click();
    await expect(page.getByRole('heading', { name: 'Главная' })).toBeVisible();
  });

  test('wrong answer requires +5 extra questions then result', async ({ page }) => {
    await loginWithYandex(page);
    await page.getByRole('button', { name: 'Экзамен ГИБДД' }).click();
    await expect(page.getByRole('heading', { name: 'Экзамен ГИБДД' })).toBeVisible();

    const first = questions[0];
    await page.getByRole('button', { name: option(first, false), exact: true }).click();
    await expect(page.getByRole('status', { name: 'Результат ответа' })).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'Навигация по вопросам билета' }).getByRole('button'),
    ).toHaveCount(25);

    await page.getByRole('button', { name: 'Следующий вопрос' }).click();

    for (let index = 0; index < 24; index += 1) {
      const heading = await page.locator('main h2').innerText();
      await page.getByRole('button', { name: option(sourceByText(heading), true), exact: true }).click();
      await expect(page.getByRole('status', { name: 'Результат ответа' })).toHaveCount(0);
      if (index < 23) {
        await page.getByRole('button', { name: 'Следующий вопрос' }).click();
      } else {
        await page.getByRole('button', { name: 'Завершить экзамен' }).click();
      }
    }

    const result = page.getByRole('dialog', { name: 'Результат экзамена' });
    await expect(result).toBeVisible();
    await expect(result.getByText('Экзамен сдан')).toBeVisible();
    await expect(result.getByText('Поздравляю! 0 ошибок.')).toHaveCount(0);
  });

  test('a mistake on an extra question force-ends the exam immediately with its own message', async ({ page }) => {
    await loginWithYandex(page);
    await page.getByRole('button', { name: 'Экзамен ГИБДД' }).click();
    await expect(page.getByRole('heading', { name: 'Экзамен ГИБДД' })).toBeVisible();

    const first = questions[0];
    await page.getByRole('button', { name: option(first, false), exact: true }).click();
    await expect(
      page.getByRole('navigation', { name: 'Навигация по вопросам билета' }).getByRole('button'),
    ).toHaveCount(25);
    await page.getByRole('button', { name: 'Следующий вопрос' }).click();

    // Extras are appended after the 20 base questions, not inserted next — answer the remaining
    // 19 base questions correctly to reach index 20, the first extra/bonus question.
    for (let index = 1; index < 20; index += 1) {
      const heading = await page.locator('main h2').innerText();
      await page.getByRole('button', { name: option(sourceByText(heading), true), exact: true }).click();
      await page.getByRole('button', { name: 'Следующий вопрос' }).click();
    }

    // Now on the first extra/bonus question — B6.1: getting it wrong ends the exam right away,
    // it must not behave like a normal question with another chance to advance.
    const extraHeading = await page.locator('main h2').innerText();
    const extraSource = sourceByText(extraHeading);
    await page.getByRole('button', { name: option(extraSource, false), exact: true }).click();

    const result = page.getByRole('dialog', { name: 'Результат экзамена' });
    await expect(result).toBeVisible();
    await expect(result.getByText('Ошибка в дополнительном вопросе — экзамен не сдан')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Следующий вопрос' })).toHaveCount(0);
  });

  test('timeout ends the exam without waiting 20 minutes', async ({ page }) => {
    await page.addInitScript(() => {
      (window as Window & { __AV_TEST_EXAM_SECONDS__?: number }).__AV_TEST_EXAM_SECONDS__ = 2;
    });
    await loginWithYandex(page);
    await page.getByRole('button', { name: 'Экзамен ГИБДД' }).click();
    await expect(page.getByRole('timer')).toBeVisible();
    const result = page.getByRole('dialog', { name: 'Результат экзамена' });
    await expect(result).toBeVisible({ timeout: 8000 });
    await expect(result.getByText('Время экзамена истекло.')).toBeVisible();
    await expect(result.getByText('Экзамен не сдан')).toBeVisible();
    await expect(result.getByRole('button', { name: 'Повторить экзамен' })).toBeVisible();

    await page.evaluate(() => {
      delete (window as Window & { __AV_TEST_EXAM_SECONDS__?: number }).__AV_TEST_EXAM_SECONDS__;
    });
    await result.getByRole('button', { name: 'Повторить экзамен' }).click();
    await expect(page.getByRole('dialog', { name: 'Результат экзамена' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Экзамен ГИБДД' })).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(page.getByRole('timer')).not.toHaveText('00:00');
    await expect(
      page.getByRole('navigation', { name: 'Навигация по вопросам билета' }).getByRole('button'),
    ).toHaveCount(20);
    await expect(page.getByRole('heading', { name: questions[0].question })).toBeVisible();
    await page.getByRole('button', { name: option(questions[0], true), exact: true }).click();
    await expect(page.getByRole('status', { name: 'Результат ответа' })).toHaveCount(0);
  });

  test('direct exam route sets exam mode without Theory', async ({ page }) => {
    await loginWithYandex(page);
    await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Экзамен ГИБДД' }).click();
    await expect(page.getByRole('heading', { name: 'Экзамен ГИБДД' })).toBeVisible();
    await expect(page.getByText('Теория', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('timer')).toBeVisible();
  });
});
