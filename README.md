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

Способ входа отвязан от источника данных — ими управляют два независимых флага:

| | `VITE_USE_MOCK_API` | `VITE_MOCK_LOGIN` | Данные | Вход |
|---|---|---|---|---|
| Локальная разработка / e2e | `true` (по умолчанию) | не задан | фикстуры | mock-код |
| **Реальные данные, ещё нет OAuth-приложений** | `false` | **`true`** | backend | mock-код |
| Прод | `false` | не задан / `false` | backend | Yandex/VK OAuth-редирект |

`VITE_MOCK_LOGIN=true` держит `VITE_USE_MOCK_API=false` (реальные билеты/темы/сессии с backend)
и одновременно позволяет логиниться без зарегистрированных Yandex/VK-приложений — фиксированным
mock-кодом. **Работает только пока backend поднят с `OAUTH_ALLOW_MOCK=true`** (иначе backend
отвергнет mock-код). Если `VITE_MOCK_LOGIN` не задан — поведение как раньше: следует за
`VITE_USE_MOCK_API`.

Настоящий OAuth-редирект (`VITE_USE_MOCK_API=false`, `VITE_MOCK_LOGIN` не `true`) — классический
authorization code flow (VK ID пока не поддерживается); нужно зарегистрировать OAuth-приложение
у провайдера и указать публичные `client_id`:

```env
VITE_YANDEX_OAUTH_CLIENT_ID=...
VITE_VK_OAUTH_CLIENT_ID=...
```

Под Docker все три (`VITE_USE_MOCK_API`, `VITE_MOCK_LOGIN`, `VITE_*_OAUTH_CLIENT_ID`) передаются
в сборку через `build.args` в `docker-compose.yml`, которые интерполируются из `.env` рядом с
compose-файлом (Vite «запекает» их в бандл на этапе `npm run build`).

