# pdd-frontend

B2C frontend подготовки к экзамену ПДД (Vue 3 + Vite + Tailwind + Pinia).

Продуктовые требования: `docs/tz_v1_5_study_pdd.docx`.
Состояние этапа 1 (shell): `docs/B2C_IMPLEMENTATION.md`.

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

**Известные ограничения текущей реализации `RealApiClient` (`src/api/RealApiClient.ts`):**

1. **Картинки вопросов не загрузятся.** `GET /api/v1/questions/{id}/image` на backend защищён
   Bearer-авторизацией, а обычный `<img src="...">` не может передать заголовок Authorization.
   Нужно либо снять авторизацию с этого эндпоинта на backend (картинка не эксклюзивна сама по
   себе — доступ к вопросу уже проверен на уровне сессии), либо переписать `MediaBlock.vue` на
   авторизованный `fetch()` + `URL.createObjectURL(blob)`.
2. **Checkout не активирует Premium синхронно.** Реальный `POST /billing/checkout/init` только
   инициирует платёж и возвращает `confirmation_url` для редиректа на эквайринг; активация
   происходит позже через вебхук. `RealApiClient.checkout()` реально уводит браузер на оплату,
   но не может вернуть `{status: 'success', ...}`, как ожидает текущий интерфейс `ApiClient` —
   `CheckoutScreen.vue`/checkout-стор нужно дорабатывать отдельной задачей под redirect-флоу
   (страница возврата + опрос `GET /subscriptions/me` после оплаты).
3. **Вход по-прежнему через фиксированные mock-коды** (`mock-{provider}-code...` в
   `sessionStore.loginWithProvider`) — это штатно работает с backend при
   `OAUTH_ALLOW_MOCK=true` (см. `.env.example` backend), но не является настоящим
   Yandex/VK OAuth-редиректом. Реальный OAuth-флоу — отдельная задача.

