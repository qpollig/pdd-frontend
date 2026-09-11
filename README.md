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

### Email+пароль (регистрация/вход/сброс пароля)

`MockApiClient` эмулирует второй способ входа — email+пароль — без сети, теми же фикстурами, что
и OAuth. Тестовые учётные данные для e2e/локальной разработки (константы `MOCK_PASSWORD_TEST_EMAIL`
/ `MOCK_PASSWORD_TEST_PASSWORD` в `src/api/MockApiClient.ts`):

```
email:    student@example.com
password: student-pass-2026
```

- **Вход** (`/auth`, форма email+пароль) принимает только эту пару — любая другая комбинация
  (включая незарегистрированный email) отвечает одним и тем же `INVALID_CREDENTIALS`, без различия
  «неверный пароль» / «нет такого пользователя» (тот же принцип, что у настоящего backend).
- **Регистрация** (`/register`) создаёт нового mock-пользователя с указанным email — кроме самого
  `student@example.com`, который считается уже занятым (`EMAIL_ALREADY_REGISTERED`).
- **Забыли пароль** (`/forgot-password`) всегда «успешна» — как и настоящий backend, mock не
  раскрывает, существует ли email.
- **Сброс пароля** (`/reset-password?token=...`) принимает только фиксированный токен
  `mock-valid-reset-token` (константа `MOCK_VALID_RESET_TOKEN`); любой другой токен отвечает
  `INVALID_OR_EXPIRED_TOKEN`.

Как и у OAuth-фикстур, `MockApiClient` моделирует одного «текущего» пользователя, а не полноценную
базу — `registerWithPassword`/`loginWithPassword` не ведут реестр всех когда-либо созданных
аккаунтов, только различают «занятый»/«тестовый» email от прочих.

