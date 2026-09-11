import { expect, test } from '@playwright/test';

/**
 * ТЗ §1.3/1.4.2: продукт должен встраиваться в <iframe> на доменах партнёрских автошкол (Фаза 2).
 * До этого теста весь e2e-набор гонял приложение только как top-level страницу — вложенный сценарий
 * не проверялся ни разу. Оборачиваем его в iframe с непрозрачным (opaque) родительским origin'ом —
 * тот же барьер Same-Origin Policy, что и на настоящем партнёрском домене, только строже (opaque
 * origin не совпадает вообще ни с чем) — и проверяем сквозной путь: логин, навигация и, главное,
 * реальное воспроизведение видео со стороннего CDN через двойную вложенность origin'ов
 * (partner-page(opaque) -> наш iframe -> video CDN). `allow="fullscreen"` на <iframe> — то, что
 * партнёрский сайт обязан выставить сам, иначе кнопка полноэкранного режима в нативных controls
 * тихо не сработает (play/pause/seek при этом не пострадают).
 */
test.describe('Cross-origin iframe embedding', () => {
  test('login, navigation and video playback work when the app is nested in a foreign-origin iframe', async ({
    page,
    baseURL,
  }) => {
    await page.setContent(
      `<iframe id="app" src="${baseURL}auth" allow="fullscreen" allowfullscreen style="width:1280px;height:900px;border:0"></iframe>`,
    );
    const app = page.frameLocator('#app');

    await app.getByRole('button', { name: 'Войти через Яндекс' }).click();
    await expect(app.getByRole('heading', { name: 'Главная' })).toBeVisible();

    await app
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('link', { name: 'Билеты', exact: true })
      .click();
    await app.getByRole('link', { name: /^Билет 1 / }).click();
    await app.getByRole('button', { name: 'Вопрос 6,', exact: false }).click();

    const video = app.locator('video');
    await expect(video).toBeVisible();

    // Presence of the <video> tag alone doesn't prove the CDN request succeeds nested two origins
    // deep — actually drive playback and confirm currentTime advances.
    await video.evaluate((el: HTMLVideoElement) => el.play());
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime), { timeout: 15_000 })
      .toBeGreaterThan(0);
  });
});
