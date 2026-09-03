# B2C implementation — shell, mock auth, Freemium Lives, Theory, Errors, Exam ГИБДД, Paywall, Checkout

Документ фиксирует фактическое состояние репозитория. Продуктовый источник —
`docs/tz_v1_5_study_pdd.docx` (ТЗ v1.5, 27.08.2026). Этот файл не заменяет ТЗ.

Файлы `docs/ARCHITECTURE.md` и `docs/TECHNICAL_RISKS.md` в репозитории **отсутствуют**.

## API boundary

```
UI (TicketPlayer, Dashboard, PaywallScreen, CheckoutScreen)
  → Pinia (sessionStore — auth + lives + subscription + premiumOffer + checkoutStatus; ticketStore — mode + прогресс билета)
    → apiClient: ApiClient
      → MockApiClient
```

Компоненты не импортируют `MockApiClient`. HTTP не вызывается.

## Theory mode

Определяется `useTicketStore().mode = 'theory'` (ТЗ §3.2: один TicketPlayer, различие режимов через конфигурацию store).

Вход:

```
Dashboard → «Теория» → /tickets?mode=theory (TopicListScreen)
         → выбор билета/темы
         → /tickets/:ticketId?mode=theory
         → TicketSessionScreen → тот же TicketPlayer
```

Ярлык «Начать билет 1» открывает тот же плеер сразу с `query.mode=theory`.

Плеер не дублируется. `/tickets/:ticketId` без `mode=errors` — theory. Exam живёт на `/exam-gibdd`, не на ticket query.

`POST /session/start` по-прежнему не вызывается как HTTP. Mode живёт в Pinia + query.

## Errors mode

Определяется `useTicketStore().mode = 'errors'` (тот же `TicketMode`, тот же TicketPlayer).

ТЗ §3.2: вопросов динамически, без ограничения времени; «при верном ответе — обновление в БД и удаление из списка».

ТЗ §4.3: `session/start` с `mode=errors`, `ticket_id` может быть `null`. Отдельного GET истории ошибок в ТЗ нет.

### Вход

```
Dashboard → «Ошибки» → /tickets/errors?mode=errors
         → TicketSessionScreen
         → пустой список: EmptyState
         → иначе тот же TicketPlayer
```

Тема/билет не выбираются.

### Данные

`ApiClient.getErrorQuestions()` (имя ASSUMPTION до OpenAPI; отражает §4.3 session/start mode=errors, HTTP не вызывается).

Mock (`errorQuestionsFixture.ts`): вопросы 2, 7 и 13 из `ticket-1.json` по id, не первые N вопросов билета. UI fixture не импортирует.

Синтетический id прогресса: `errors-session` (`ERRORS_SESSION_TICKET_ID`). Это не uuid билета.

### Flow

Тот же, что Theory: вопрос → ответ → submitAnswer → feedback → пояснение → Next → Finish → SessionResultModal → «На главную».

`ticketStore.startTicket(..., 'errors')` каждый раз сбрасывает прогресс этой сессии.

### Empty state

Если список пуст: «Ошибок для проработки пока нет» + CTA «К теории» и «На главную». Фиктивные вопросы не подставляются.

Query `/auth?errors=none` (ASSUMPTION, только mock/e2e) → код `mock-{provider}-code-no-errors` → пустая история.

### Удаление из списка ошибок

Верный `submitAnswer` с `session_id` вида `mock-errors-session:*` убирает вопрос из последующего `getErrorQuestions`. Текущая сессия плеера не сжимается.

OPEN QUESTION: исчезает ли ошибка навсегда на backend, или вернётся после новой ошибки / login. Обычный mock-login снова кладёт fixture 2/7/13.

### Lives и Errors

Глобальная Lives-логика **не менялась**. Для Errors **не** добавлялось отдельное правило.

OPEN QUESTION тот же: §4.3 (errors не списывает) vs §4.7 (все режимы). Mock по-прежнему списывает Free при неверном ответе в Errors.

### Flow

```
вопрос
  → выбор варианта
  → submitAnswer (ApiClient)
  → AnswerResult
  → ticketStore.applyAnswerResult
  → immediate feedback (Верно/Неверно + подсветка кнопок)
  → пояснение
  → «Следующий вопрос» (без автоперехода)
  → … последний вопрос
  → «Завершить билет»
  → SessionResultModal (общий результат, не отдельный Theory-result)
  → «На главную»
```

Таймера нет (`ticketStore.hasTimer === false`). Exam-таймер и +5 вопросов не добавлялись.

### Answer / feedback

Источник истины — `SubmitAnswerResult` из MockApiClient:

- `is_correct` → статус вопроса;
- `correct_option_id` → индекс правильного варианта для подсветки;
- `explanation` → текст пояснения в UI.

Локальный `answers[].is_correct` из JSON не используется как отдельный grader. Он остаётся в mock-данных вопроса (ТЗ §4.2 разрешает `is_correct` вне экзамена) и служит fallback подсветки, если API не вернул индекс.

### Explanation / hint

ТЗ §4.2: `hint_text`. ТЗ §4.3: `explanation` в ответе `submitAnswer`. Исходный JSON билета содержит `answer_tip`.

ASSUMPTION: `answer_tip` мапится в `SubmitAnswerResult.explanation`. Отдельное поле `hint_text` в mock JSON не добавлялось — структура OpenAPI не подтверждена.

В Theory пояснение показывается после ответа, пока пользователь не нажмёт «Следующий вопрос».

### Lives и Theory

Глобальная Lives-логика **не менялась**.

OPEN QUESTION (без самостоятельного решения):

- §4.3: жизни списываются только в `gibdd_exam` / `school_exam`; в theory не расходуются;
- §4.7: «жизни расходуются во всех режимах».

Текущий mock по-прежнему списывает жизни Free при неверном ответе в любом текущем Ticket Flow, включая Theory и Errors. Специального исключения нет.

### Progress

Отдельных метрик Theory нет. Dashboard по-прежнему читает `getDashboard()` (`tickets_completed`, `questions_answered`, `bank_question_total`). Mock прогресс билетов не пересчитывается от ответов — как и раньше.

## Submit answer

Поток:

```
выбор варианта
  → TicketPlayer.selectAnswer
  → sessionStore.submitAnswer
  → ApiClient.submitAnswer   // имя метода ASSUMPTION до OpenAPI
  → MockApiClient
  → SubmitAnswerResult (ТЗ §4.3: is_correct, correct_option_id, lives_remaining, explanation)
  → sessionStore обновляет lives из result.lives_remaining
  → ticketStore.applyAnswerResult
  → UI: верно/неверно + пояснение + текущие жизни
```

Поля запроса как в ТЗ §4.3: `session_id`, `question_id`, `selected_option_id`.

ASSUMPTION:

- `session_id` = `mock-ticket-session:{ticketId}` до этапа `POST .../session/start`;
- `selected_option_id` = индекс варианта строкой (в `ticket-1.json` нет UUID опций).

HTTP-путь `POST /api/v1/tickets/answer` на клиенте не вызывается.

## MockApiClient

Жизни живут в состоянии экземпляра mock (как backend).

- верный ответ: `is_correct = true`, `lives_remaining` без изменения;
- неверный ответ (Free): `is_correct = false`, `lives_current` уменьшается в mock,
  в результате приходит новое `lives_remaining`;
- Premium (`is_premium` / fixture): `lives_remaining = null`, списания нет, ответы не блокируются;
- Free и `lives_current = 0`: `LIVES_EXHAUSTED`, ответ не принимается.

`getDashboard` отдаёт тот же `lives_current`, что остался после ответов.

Новый login (`exchangeOAuthCode`) сбрасывает жизни mock на fixture.

## Correct / wrong / zero / Premium

| Состояние | Поведение |
|---|---|
| Correct | жизни не меняются |
| Wrong (Free) | жизни из API result |
| Zero lives (Free) | новые ответы заблокированы; блок в плеере + CTA на существующий `/paywall` без оплаты |
| Premium | индикатор `∞`; жизни не ограничивают прохождение |

RestoreLivesModal, реклама, таймер 24ч **не** реализованы. CTA на `/paywall` открывает экран Paywall (офер Premium). Реальной оплаты нет.

## Paywall

Маршрут: `/paywall` (уже был в Vue Router). Anonymous → существующий auth guard.

### Вход

Существующие точки, без второй навигации:

```
Dashboard → «Получить Premium-доступ» (скрыта у Premium)
AppHeader → «Premium»
Profile → «Premium»
TicketPlayer (0 жизней Free) → «К экрану Premium»
PaywallModal (замок / 3D-видеоразбор) → «Разблокировать доступ» → /paywall
```

```
Dashboard → /paywall → Paywall → «Подключить Premium» → /checkout
```

### Premium benefits (только ТЗ)

С продающего экрана ТЗ §4.8.2 / текущий stub §3.5:

- полное соответствие регламенту ГИБДД 2026;
- 3D-видеоразборы каверзных ситуаций на дорогах;
- бесконечные жизни (ТЗ §3.7: Premium с бесконечными жизнями).

Не добавлялись streak, реклама, промокоды, referral, марафон, новые режимы.

3D-видео по-прежнему не проигрывается: медиа открывает PaywallModal, оттуда переход на `/paywall`.

### Offer / pricing

ТЗ §3.5 PricingCard: **3 дня за 1 ₽ → 299 ₽/мес**, бейдж «ХИТ», автопродление.
ТЗ §4.5 `plan`: `trial_1rub_299`.

Совпадает с бизнес-брифом этапа. Расхождения по цене нет.

### Состояния

| Состояние | UI |
|---|---|
| Loading | AppSpinner, пока нет offer |
| Error | ErrorState + «Повторить» |
| Free | офер, цена, CTA «Подключить Premium» → `/checkout` |
| Premium (`is_premium`) | «Premium уже активен» / «Пробный период активен» при `status=trial`; CTA «На главную»; **нет** покупки |

Сделать себя Premium через UI нельзя. Test-only: `/auth?premium=1` (active) и `/auth?premium=trial` (trial) → mock OAuth code.

### Mock API

`ApiClient.getPremiumOffer()` — имя **ASSUMPTION — pending OpenAPI**. В ТЗ нет GET offer; поля витрины взяты из §3.5 / §4.5. HTTP не вызывается.

`getSubscription()` / `getDashboard().subscription` для Premium mock отдают `trial` или `active` и `is_premium: true`. Для Free по-прежнему `expired` / `is_premium: false`.

UI → `sessionStore.loadPaywall()` → ApiClient. Компоненты fixture не импортируют.

### Checkout boundary

CTA Paywall: `router.push({ name: 'checkout' })`.

Маршрут: `/checkout` (Vue Router, auth guard как у остальных экранов). Anonymous → `/auth`. Back: «Назад к тарифу» → `/paywall`. Success CTA → `/dashboard`.

### Состояния Checkout

| Состояние | UI |
|---|---|
| Loading | AppSpinner, пока нет offer |
| Load error | ErrorState + «Повторить» |
| Idle | план, цена trial, автопродление, payment-provider placeholder, CTA |
| Processing | CTA disabled, «Оплата…», повторный submit игнорируется |
| Success | «Premium подключён», CTA «На главную» |
| Payment error | ошибка + Retry тем же CTA |
| Already Premium | «Premium уже активен» / trial-заголовок; **нет** формы оплаты |

Double-submit: `sessionStore.submitCheckout` не вызывает API, если `checkoutStatus` уже `processing` или `success`. Mock дополнительно возвращает тот же in-flight Promise.

### Mock API

`ApiClient.checkout(request)` — имя **ASSUMPTION — pending OpenAPI**. Expected contract из ТЗ §4.5: `POST /api/v1/billing/checkout` с `{ plan, payment_method_token, promo_code }`. HTTP не вызывается.

Request mock:

- `plan`: `trial_1rub_299`
- `payment_method_token`: `mock-provider-placeholder` (не PAN/CVV)
- `promo_code`: всегда `null` на этом этапе

Response mock: `status=success`, `is_premium: true`, `subscription_status: trial`, даты как у существующей trial-витрины (`2026-09-04`), `applied_promo: null`.

Детерминированный fail: `MockApiClient({ checkoutFails: true })` или test-only `window.__AV_TEST_CHECKOUT_FAIL__` (e2e Retry). Это не исход эквайринга.

Карточные поля в `CheckoutForm.vue` — визуальный placeholder виджета провайдера. Значения **не** попадают в Pinia и **не** уходят в `checkout()`.

После success mock выставляет Premium в том же экземпляре MockApiClient; `getDashboard` / `getSubscription` / Profile / Paywall читают это состояние без ручной смены fixture.

### Pricing / trial / автопродление

Те же значения, что Paywall и ТЗ §3.5 / §4.5: **3 дня за 1 ₽ → 299 ₽/мес**, план `trial_1rub_299`. Других тарифов, скидок и промокодов нет.

Перед CTA явно: после trial автоматически списывается 299 ₽/мес, пока подписка не отменена. Юридический абзац под CTA совпадает по смыслу с Paywall. Ссылки «Условия использования» / «Политика конфиденциальности» без URL (страниц нет) — OPEN QUESTION тот же, что у Paywall.

### Production integration boundary

Frontend сейчас использует только `MockApiClient`. Это **не** реальная оплата.

Production flow подключается после:

- OpenAPI;
- спецификации платёжного провайдера;
- checkout contract;
- payment tokenization contract.

Не реализовывать на frontend: эквайринг, PCI DSS, токенизацию карты, webhook, worker, рекуррентное списание, retry эквайера.

### Lives

Глобальная механика жизней **не менялась**. Checkout только выставляет Premium; `LivesCounter` уже показывает ∞ при `is_premium`.

Глобальная механика жизней **не менялась** (5 vs 10, режимы списания). Paywall показывает `lives_current` / `lives_max` из store, без нового лимита. RestoreLivesModal, реклама, 24h restore **не** добавлялись. При 0 жизней по-прежнему переход на `/paywall` как Premium CTA, не как полный restore-flow.

## Regeneration

Не реализована и не имитируется frontend-планировщиком.

ТЗ §4.7: `lives_regen_at` и +1 через 24 часа с момента падения ниже max — ответственность backend.
Frontend готов показать значение, которое придёт в `getDashboard` / user.

Mock: `lives_regen_at = null`, жизни не тикают сами.

## Dashboard

`LivesCounter` читает `session.dashboard.user.lives_*`. После неверного ответа и возврата на главную
`loadDashboard` забирает актуальные жизни из mock.

Кнопка «Теория» ведёт в каталог билетов/тем. Кнопка «Ошибки» ведёт в `/tickets/errors`. Кнопка «Экзамен ГИБДД» ведёт в `/exam-gibdd`.

## Exam ГИБДД

Определяется `useTicketStore().mode = 'exam'` (тот же `TicketMode`, тот же TicketPlayer). Отдельного ExamPlayer нет.

ТЗ §3.2: 20 вопросов, 20 минут, результаты скрыты; +5 доп. вопросов за 1–2 ошибки по теме; доп. ошибки недопустимы.

ТЗ §4.3: `session/start` с `mode=gibdd_exam`, `time_limit_seconds: 1200`; `finish` с `correct_count`, `error_count`, `extra_questions`, `passed`. HTTP не вызывается.

### Вход / routing

```
Dashboard → «Экзамен ГИБДД»
AppHeader / BottomNav → /exam-gibdd
         → TicketSessionScreen (mode=exam)
         → тот же TicketPlayer
```

Прямое открытие `/exam-gibdd` (client-side, сессия Pinia жива) ставит `mode=exam`, без Theory. Anonymous → существующий auth guard.

Stub `ExamGibddScreen.vue` снят: маршрут использует TicketSessionScreen, как Errors.

### Mock session

`ApiClient.startExamSession()` / `finishExamSession()` — имена ASSUMPTION до OpenAPI.

Mock:

- 20 основных вопросов из `ticket-1.json` (не случайное число);
- публичный DTO без `is_correct` / `answer_tip` (ТЗ §4.2 скрытие до finish);
- `session_id` вида `mock-exam-session:{n}`;
- `time_limit_seconds = 1200`, если не задан test-only override.

UI fixture экзамена не импортирует.

### Timer

Состояние: `ticketStore.progress[id].remainingSeconds` + `examStatus`.

Интервал в TicketPlayer через `createCountdownTimer`: один timer, `clearInterval` на unmount / finish / timeout.

Production duration не меняется ради тестов. Test-only: `MockApiClient({ examTimeLimitSeconds })` или `window.__AV_TEST_EXAM_SECONDS__` (только e2e timeout).

### Answer / hidden feedback

После ответа нет «Верно/Неверно», нет подсветки correct/incorrect, нет пояснения. Выбранный вариант — нейтральный `selected`. Навигация не раскрывает правильность.

Ответ нельзя сменить (кнопки disabled). Навигация по вопросам разрешена (ASSUMPTION: ТЗ не запрещает вернуться к неотвеченным).

### +5 algorithm

Чистые функции: `src/domain/examRules.ts`.

- ошибка на основном вопросе №1 или №2 → +5 вопросов той же темы в сессию;
- третья и далее ошибки на базе не добавляют extras (ТЗ: «за 1–2 ошибки»);
- ошибка на дополнительном вопросе extras не добавляет («доп. ошибки недопустимы»).

Верхний предел числа доп. блоков сверх «1–2 ошибки» в ТЗ не задан отдельно — реализовано только правило 1–2.

ASSUMPTION: полного банка 800 нет; если уникальных вопросов темы не хватает, mock клонирует вопрос темы с id `{sourceId}__extra__{n}`.

ASSUMPTION: extras добавляются сразу после ошибки (рост сессии), хотя ТЗ §4.3 также отдаёт `extra_questions` на finish. `submitAnswer.appended_questions` — frontend ASSUMPTION до OpenAPI.

### Result

Только после «Завершить экзамен» (все текущие вопросы отвечены) или timeout.

`SessionResultModal`: верно / ошибки / «Экзамен сдан|не сдан» / при timeout текст о истечении времени / «На главную». GiftSubscriptionModal не показывается (Фаза 2).

`passed`: 0–2 ошибки на базе, 0 ошибок на extras, нет неотвеченных.

Досрочная сдача с неотвеченными кнопкой не предусмотрена (ASSUMPTION).

### Lives

Глобальная Lives-логика **не менялась**. Mock по-прежнему списывает Free при неверном ответе, в том числе в Exam (§4.3 это как раз разрешает для gibdd_exam). RestoreLivesModal не добавлялся.

OPEN QUESTION: индикатор жизней в шапке плеера может косвенно раскрыть ошибку до конца экзамена. Product decision не принимался.

## Что намеренно не реализовано

- настоящий backend, RealApiClient, HTTP, OpenAPI;
- настоящий OAuth Yandex/VK;
- настоящий эквайринг / payment provider SDK / PCI DSS / tokenization / автопродление worker / webhook / refund;
- промокод на Paywall (ТЗ §3.5), referral, partner promo;
- RestoreLivesModal, rewarded ads, regen worker/cron, локальный таймер восстановления;
- RestoreLivesModal, rewarded ads, regen worker/cron, локальный таймер восстановления;
- Marathon 800 / Exam Auto School 60;
- GiftSubscriptionModal / referral за 0 ошибок на экзамене (Фаза 2);
- сжатие текущего Errors-плеера сразу после верного ответа (меняется только следующий getErrorQuestions);
- HTTP `POST /session/start` и `finish`;
- SessionModeModal «На время / Без времени»;
- 3D-видеоразбор (кнопка медиа по-прежнему открывает существующий PaywallModal);
- Phase 2, iframe, White Label;
- большой redesign.

## Open questions

1. **Жизни: 5 vs 10.** Устный MVP brief — 5. ТЗ §4.7 default **10**. Fixture сейчас 10.
   **Не объявлено окончательным решением.** Менять только `livesFixture.ts`.
2. **В каких режимах списывать жизни.** §4.3: только `gibdd_exam` / `school_exam`; theory, errors, favorites, marathon не списывают;
   §4.7: «жизни расходуются во всех режимах». Этап **не** вводил исключение для Theory/Errors.
3. **Промокод на Paywall.** ТЗ §3.5 vs бриф Phase 1.
4. **Список билетов OpenAPI.**
5. **Statistics.** Маршрут из брифа, не из §3.1.
6. **B2B playground.**
7. **Имена `exchangeOAuthCode` / `submitAnswer`.** Frontend ASSUMPTION до OpenAPI.
8. **hint_text vs answer_tip vs explanation.** До OpenAPI mock отдаёт `answer_tip` как `explanation`.
9. **Errors history persistence.** ТЗ §3.2 требует удаление из списка при верном ответе. Не определено, возвращается ли вопрос после новой ошибки и сбрасывается ли история на login.
10. **Две ошибки в одной теме на экзамене.** Официальные правила ГИБДД часто трактуют это как несданный экзамен. ТЗ говорит «+5 за 1–2 ошибки по теме», без явного fail same-topic. Не реализован отдельный same-topic fail.
11. **Списание жизней на Exam vs скрытые результаты.** Индикатор жизней может раскрыть ошибку до finish.

12. **URL «Условия использования» и «Политика конфиденциальности».** ТЗ §3.5 требует ссылки под CTA Paywall. Страниц и URL в ТЗ нет. На этом этапе текст без отдельных маршрутов.
13. **Даты next_charge_date в mock Premium.** Фиксированные `2026-09-04` / `2026-10-01` для витрины, не календарь биллинга.

## Assumptions (явно)

- `submitAnswer` — внутреннее имя, не замороженный production contract.
- `session_id` и `selected_option_id` — временные идентификаторы до UUID сессии/опций.
- `lives_remaining: null` у Premium означает unlimited (в §4.3 null привязан к режиму экзамена —
  здесь использовано для Premium до решения OPEN QUESTION по режимам).
- `lives_*` нет в §4.1; до `getDashboard` store подставляет fixture.
- Hard reload сбрасывает сессию (Pinia in-memory).
- Все 40 билетов отдают одни и те же 20 вопросов `ticket-1.json`.
- `getDashboard` — frontend-витрина.
- Вход в плеер без `mode=errors` трактуется как theory.
- `answer_tip` = `explanation` до появления `hint_text` в API.
- `getErrorQuestions` — внутреннее имя, не HTTP URL; соответствует §4.3 session/start mode=errors.
- `session_id` для Errors: `mock-errors-session:errors-session`.
- Query `/auth?errors=none` — только mock/e2e пустая история.
- `TicketDetail.number = 0` для Errors-сессии — не номер билета.
- `startExamSession` / `finishExamSession` — внутренние имена, не production URL.
- `submitAnswer.appended_questions` — mid-session extras до OpenAPI.
- `session_id` exam: `mock-exam-session:{n}`.
- `TicketDetail.number = 0` и id `exam-gibdd` для exam-сессии — не uuid билета.
- Неотвеченные на timeout считаются ошибками; `passed=false`.
- Навигация назад по вопросам экзамена разрешена; смена ответа запрещена.
- Нет кнопки досрочного завершения при неотвеченных вопросах.
- Клоны extras `{id}__extra__{n}` — ограничение mock-банка, не контракт backend.
- `window.__AV_TEST_EXAM_SECONDS__` — только e2e, не production semantics.
- Имена `exchangeOAuthCode` / `submitAnswer` / `startExamSession` / `finishExamSession` / `getPremiumOffer` / `loadPaywall` / `checkout` / `loadCheckout` / `submitCheckout` — ASSUMPTION до OpenAPI.
- `getPremiumOffer` не соответствует HTTP URL; витрина тарифа до появления OpenAPI.
- `checkout` — внутреннее имя; expected HTTP `POST /api/v1/billing/checkout` из ТЗ §4.5, на клиенте не вызывается.
- `payment_method_token = mock-provider-placeholder` — не токен реального провайдера.
- Query `/auth?premium=1` / `premium=trial` — только mock/e2e Premium user.
- `window.__AV_TEST_CHECKOUT_FAIL__` / `__AV_TEST_CHECKOUT_CALLS__` / `__AV_TEST_PUSH__` — только DEV/e2e.
- Mock-даты подписки Premium — витрина, не биллинг-воркер.
- Юридические ссылки на Paywall и Checkout отложены до появления страниц/URL.
- CheckoutForm не является SDK провайдера; поля карты не покидают браузер.

## Следующий небольшой этап Phase 1

Не начинать в этой сессии. Кандидат: **управление подпиской в Profile** (отмена автопродления / CancelSubscriptionModal) без эквайринга, либо RestoreLivesModal — без worker/webhook.
