import { expect, test } from '@playwright/test';
import { loginWithYandex, openHeaderLink } from './helpers';

/**
 * B4/B5/B10: MediaBlock must never look like a broken image, must tell the two empty/error states
 * apart, must never crop the question photo, and an image problem must stay local — the question
 * and its answers stay fully usable, with no global error/toast. Same contract for video: it only
 * renders when there is no image (image wins when a question has both), and a video load failure
 * gets its own copy without blocking the question.
 *
 * Fixture question 0 (src/data/ticket-1.json) uses the `./images/no_image.jpg` sentinel (no real
 * photo); question 1 has a real-looking but non-existent image path plus MockApiClient's mock
 * video (see MOCK_VIDEO_QUESTION_IDS), to also exercise image-over-video priority; question 5 has
 * no image but does have the mock video — both cases occur naturally in the mock bank, no
 * additional fabricated fixture needed.
 */
test.describe('Ticket media', () => {
  test('a question with no image shows the empty-state copy, not a broken image', async ({ page }) => {
    await loginWithYandex(page);
    await openHeaderLink(page, 'Билеты');
    await page.getByRole('link', { name: /^Билет 1 / }).click();

    await expect(page.getByRole('heading', { name: /В каком случае водитель совершит/ })).toBeVisible();
    await expect(page.getByText('Изображение к вопросу отсутствует')).toBeVisible();
    await expect(page.locator('img[fetchpriority="high"]')).toHaveCount(0);

    // The missing image must not block the question itself.
    await page
      .getByRole('button', { name: 'Остановившись на проезжей части из-за технической неисправности транспортного средства', exact: true })
      .click();
    await expect(page.getByRole('status', { name: 'Результат ответа' })).toHaveText('Верно');
  });

  test('a failed image load shows the load-error copy, keeps the question answerable, and raises no global error', async ({
    page,
  }) => {
    await page.route('**/tmp/images/A_B/**', (route) => route.abort('failed'));

    await loginWithYandex(page);
    await openHeaderLink(page, 'Билеты');
    await page.getByRole('link', { name: /^Билет 1 / }).click();
    await page.getByRole('button', { name: 'Вопрос 2,', exact: false }).click();

    await expect(page.getByRole('heading', { name: /Разрешен ли Вам поворот/ })).toBeVisible();
    await expect(page.getByText('Не удалось загрузить изображение')).toBeVisible();
    await expect(page.locator('img[fetchpriority="high"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Разрешен', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Результат ответа' })).toHaveText('Верно');
    // No app-level error banner from the image failure — only per-question feedback exists.
    await expect(page.getByText('Не удалось отправить ответ')).toHaveCount(0);
  });

  test('a successfully loaded image is shown whole (object-contain), never cropped', async ({ page }) => {
    await page.route('**/tmp/images/A_B/**', (route) => route.fulfill({ path: 'public/favicon.png' }));

    await loginWithYandex(page);
    await openHeaderLink(page, 'Билеты');
    await page.getByRole('link', { name: /^Билет 1 / }).click();
    await page.getByRole('button', { name: 'Вопрос 2,', exact: false }).click();

    const image = page.locator('img[fetchpriority="high"]');
    await expect(image).toBeVisible();
    await expect(page.getByText('Не удалось загрузить изображение')).toHaveCount(0);
    await expect(page.getByText('Изображение к вопросу отсутствует')).toHaveCount(0);

    const classAttr = (await image.getAttribute('class')) ?? '';
    expect(classAttr).toContain('object-contain');
    expect(classAttr).not.toContain('object-cover');
    expect(classAttr).not.toContain('aspect-video');
  });

  test('a question with no image but a video shows a native, non-autoplaying video player', async ({ page }) => {
    await loginWithYandex(page);
    await openHeaderLink(page, 'Билеты');
    await page.getByRole('link', { name: /^Билет 1 / }).click();
    await page.getByRole('button', { name: 'Вопрос 6,', exact: false }).click();

    await expect(page.getByRole('heading', { name: /Что означает мигание зелёного сигнала/ })).toBeVisible();
    await expect(page.getByText('Изображение к вопросу отсутствует')).toHaveCount(0);
    await expect(page.locator('img[fetchpriority="high"]')).toHaveCount(0);

    const video = page.locator('video');
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute('controls', '');
    await expect(video).not.toHaveAttribute('autoplay', '');
    await expect(video).toHaveJSProperty('paused', true);
  });

  test('a question with both an image and a video renders only the image (image priority)', async ({ page }) => {
    await page.route('**/tmp/images/A_B/**', (route) => route.fulfill({ path: 'public/favicon.png' }));

    await loginWithYandex(page);
    await openHeaderLink(page, 'Билеты');
    await page.getByRole('link', { name: /^Билет 1 / }).click();
    await page.getByRole('button', { name: 'Вопрос 2,', exact: false }).click();

    await expect(page.locator('img[fetchpriority="high"]')).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);
  });

  test('a failed video load shows the video load-error copy and keeps the question answerable', async ({ page }) => {
    await page.route('**Cars_Passing_by_at_Night.webm', (route) => route.abort('failed'));

    await loginWithYandex(page);
    await openHeaderLink(page, 'Билеты');
    await page.getByRole('link', { name: /^Билет 1 / }).click();
    await page.getByRole('button', { name: 'Вопрос 6,', exact: false }).click();

    await expect(page.getByText('Не удалось загрузить видео')).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);

    await page.getByRole('button', { name: 'Разрешает движение', exact: false }).click();
    await expect(page.getByRole('status', { name: 'Результат ответа' })).toHaveText('Верно');
  });
});
