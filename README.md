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

### OAuth (Yandex/VK)

При `VITE_USE_MOCK_API=false` вход выполняется через Yandex/VK OAuth (классический
authorization code flow; VK ID пока не поддерживается).

Для работы необходимо зарегистрировать OAuth-приложение у провайдера и указать:

```env
VITE_YANDEX_OAUTH_CLIENT_ID=...
VITE_VK_OAUTH_CLIENT_ID=...
```

### Mock OAuth (dev/e2e)

При `VITE_USE_MOCK_API=true` (по умолчанию) вход не требует реальных OAuth-приложений —
используется фиксированный код, без сети и редиректа. На этом рассчитаны текущие unit/e2e-тесты.

