# pdd-frontend

B2C frontend подготовки к экзамену ПДД (Vue 3 + Vite + Tailwind + Pinia): каталог билетов,
режимы Theory/Errors/Exam, работа над ошибками, лимит «жизней» с восстановлением, Premium
paywall и checkout, профиль пользователя.

Продуктовые требования: `docs/tz_v1_5_study_pdd.docx`.
Подробности реализации по фичам (историческая фиксация по мере разработки): `docs/B2C_IMPLEMENTATION.md`.

## Команды

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
```

Приложение на dev-сервере: `/`.

## Подключение к настоящему backend (RealApiClient)

По умолчанию фронтенд работает на `MockApiClient` (фикстуры, без сети) — так рассчитаны
текущие unit/e2e-тесты. Чтобы переключиться на реальный FastAPI backend:

```bash
cp .env.example .env.local
```

В `.env.local`:
```
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=http://localhost:8000
```

Дальше — обычный `npm run dev`. Backend должен быть уже поднят (`docker compose up` в
`pdd-backend`, миграции применены, контент засеян — см. README бэкенда) и иметь
`CORS_ALLOW_ORIGINS`, включающий адрес, на котором открыт фронтенд (по умолчанию Vite —
`http://localhost:5173`).

### Настоящий OAuth (Yandex/VK)

При `VITE_USE_MOCK_API=false` вход через Яндекс/VK — полноценный redirect-флоу, а не
mock-код: `sessionStore.loginWithProvider` уводит браузер на страницу авторизации провайдера
(`window.location.href`), провайдер возвращает пользователя на `/auth/callback/{provider}`
(см. `src/router/index.ts`, `src/screens/OAuthCallbackScreen.vue`), а
`sessionStore.completeOAuthCallback` проверяет CSRF `state`, забирает `code` из query и обменивает
его на сессию через `POST /api/v1/auth/oauth/{provider}` (`OAuthLoginRequest { code, redirect_uri }`
→ `TokenResponse`, `openapi.json`, подтверждено на живом backend). Client secret на фронтенд не
попадает — обмен кода на токен провайдер делает с backend напрямую.

Чтобы это заработало, нужно зарегистрировать OAuth-приложение у провайдера (это делается вне
этого репозитория, в консоли Yandex ID / VK) с redirect URI вида
`{адрес фронтенда}/auth/callback/yandex` (или `/vk`), и передать публичный `client_id` фронтенду:

```
VITE_YANDEX_OAUTH_CLIENT_ID=...
VITE_VK_OAUTH_CLIENT_ID=...
```

`client_id` не секрет (он виден в адресной строке после редиректа) — просто ID, который не входит
в этот репозиторий и не публикуется по умолчанию. Без него кнопка входа покажет понятную ошибку
вместо редиректа на несуществующее приложение.

**ASSUMPTION:** authorize-эндпоинты (`src/auth/oauthRedirect.ts`) — классические
`oauth.yandex.ru/authorize` и `oauth.vk.com/authorize` (authorization code, без PKCE) — это
единственный вариант, совместимый с формой `OAuthLoginRequest` на живом backend (там нет поля
`code_verifier`, которое требовал бы PKCE-flow VK ID/`id.vk.com`).

`VITE_VK_OAUTH_AUTHORIZE_URL` — рабочий escape hatch **только для другого классического
(code + redirect_uri, без PKCE) эндпоинта**: переопределяет URL, самого запроса не меняет.
**Он НЕ делает VK ID совместимым.** Переключение на VK ID (`id.vk.com`) требует PKCE
(`code_challenge` в authorize-запросе, `code_verifier` при обмене кода) — этот код
`code_challenge` не добавляет, а `OAuthLoginRequest` на backend не принимает `code_verifier`
вовсе. Если реально зарегистрированное VK-приложение окажется VK ID, а не классическим —
это backend-gap (нужно расширять контракт `OAuthLoginRequest`), а не то, что можно
компенсировать одной переменной окружения на фронтенде.

### Mock OAuth (dev/e2e)

По умолчанию (`VITE_USE_MOCK_API=true`, `MockApiClient`) вход остаётся прежним: фиксированный код
вида `mock-{provider}-code...`, без сети и без редиректа — на этом рассчитаны все текущие
unit/e2e-тесты. Это тот же режим, что backend поддерживает через `OAUTH_ALLOW_MOCK=true`
(см. `.env.example` бэкенда) для собственного dev/staging — frontend его не трогает и не проверяет.

