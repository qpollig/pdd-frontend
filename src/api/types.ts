/**
 * Wire DTO, зеркалящие components.schemas в docs/openapi.json (источник истины для контрактов).
 * Auth / User / Subscription / Question / Answer / Session* / Topic* / Ticket* / Favorite* отражают
 * реальный контракт. UI не работает с этими DTO напрямую — см. src/domain/question.ts +
 * src/domain/questionMapper.ts, src/domain/catalog.ts + src/domain/catalogMapper.ts и
 * src/api/ApiClient.ts (camelCase boundary).
 */

export type OAuthProvider = 'yandex' | 'vk';

/**
 * openapi.json components.schemas.UserOut — используется и как TokenResponse.user, и как §users/me.
 * `lives_regen_at`/`lives_reset_at` подтверждены живым backend (ТЗ §4.7): один и тот же UserOut
 * отдаётся и из /auth/oauth/{provider}, и из /users/me — оба поля общие для обоих ответов,
 * не только для "текущего" пользователя.
 */
export interface AuthUser {
  id: string;
  oauth_provider: OAuthProvider;
  name: string | null;
  avatar_url: string | null;
  email: string | null;
  lives_current: number;
  lives_max: number;
  is_premium: boolean;
  errors_count: number;
  favorites_count: number;
  lives_regen_at: string | null;
  lives_reset_at: string | null;
}

/**
 * openapi.json components.schemas.TokenResponse (POST /api/v1/auth/oauth/{provider}).
 * HTTP-путь здесь не вызывается — только форма ответа из OpenAPI.
 * До OpenAPI это поле называлось `session_token`; реальный контракт — `access_token` + `token_type`.
 */
export interface AuthSession {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

/**
 * Alias, не отдельная форма: живой backend отдаёт один и тот же UserOut (со всеми lives_* полями)
 * и из TokenResponse.user, и из /users/me — раньше здесь достраивался `lives_regen_at` вручную,
 * пока поля не было в контракте; теперь оно есть на AuthUser, дублировать нечего.
 */
export type CurrentUser = AuthUser;

/** openapi.json components.schemas.SubscriptionStatus (GET /api/v1/subscriptions/me). */
export type SubscriptionStatus = 'trialing' | 'active' | 'cancelled' | 'past_due';

/**
 * openapi.json components.schemas.SubscriptionOut.
 * Подтверждено на живом backend (аудит A→D2, 2026-09-08): GET /subscriptions/me отвечает
 * `200 null` для Free-пользователя без подписки, а не 404 — так задокументировано и в самом live
 * Swagger ("так в консоли браузера не мигает Failed to load resource: 404"). Устаревший локальный
 * docs/openapi.json (снимок от 2026-09-03) ещё показывал 404 SUBSCRIPTION_NOT_FOUND для этого
 * эндпоинта; тот код остаётся в RealApiClient.getSubscription() как безопасный запасной путь
 * (see там же), но реальный ответ — `null` в теле 200, что и моделирует этот тип.
 * `is_premium` больше не хранится тут — источник истины AuthUser/CurrentUser.is_premium (UserOut).
 * Убраны выдуманные `next_charge_date` / `subscription_end_date` — в контракте только `paid_until`.
 */
export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  auto_renew: boolean;
  paid_until: string;
  price_rub: number;
}

/**
 * openapi.json components.schemas.CancelSubscriptionResponse (POST /api/v1/subscriptions/cancel).
 * Имя метода на ApiClient — frontend ASSUMPTION до OpenAPI (URL не вызывается), но форма ответа
 * теперь соответствует контракту: `{ subscription, message }`.
 */
export interface CancelSubscriptionResponse {
  subscription: Subscription;
  message: string;
}

/**
 * openapi.json components.schemas.AnswerOut.
 * `is_correct` заполняется только в режимах theory/errors/favorites (build_question_out() на backend);
 * в gibdd_exam остаётся null до ответа — frontend не должен получать правильный ответ заранее.
 */
export interface AnswerOut {
  id: string;
  order_index: number;
  text: string;
  is_correct?: boolean | null;
}

/** openapi.json components.schemas.QuestionOut. */
export interface QuestionOut {
  id: string;
  order_index: number;
  text: string;
  image_url: string | null;
  video_url: string | null;
  explanation: string | null;
  is_favorite: boolean;
  answers: AnswerOut[];
}

/** openapi.json components.schemas.SessionMode. */
export type SessionMode = 'theory' | 'gibdd_exam' | 'errors' | 'favorites';

/** openapi.json components.schemas.SessionStatus. */
export type SessionStatus = 'in_progress' | 'finished';

/** openapi.json components.schemas.SessionStartRequest — POST /api/v1/tickets/session/start. */
export interface SessionStartRequest {
  mode: SessionMode;
  ticket_id?: string | null;
  topic_id?: string | null;
}

/** openapi.json components.schemas.SessionStartResponse. */
export interface SessionStartResponse {
  session_id: string;
  mode: SessionMode;
  questions: QuestionOut[];
  lives_current: number;
  lives_max: number;
  is_premium: boolean;
}

/** openapi.json components.schemas.SessionAnswerRequest — POST /api/v1/tickets/session/answer. */
export interface SessionAnswerRequest {
  session_id: string;
  question_id: string;
  answer_id: string;
}

/** openapi.json components.schemas.SessionAnswerResponse. */
export interface SessionAnswerResponse {
  is_correct: boolean | null;
  correct_answer_id?: string | null;
  lives_current: number;
  extra_questions?: QuestionOut[];
  session_finished_forced?: boolean;
}

/** openapi.json components.schemas.SessionFinishRequest — POST /api/v1/tickets/session/finish. */
export interface SessionFinishRequest {
  session_id: string;
}

/** openapi.json components.schemas.SessionFinishResponse. */
export interface SessionFinishResponse {
  session_id: string;
  mode: SessionMode;
  status: SessionStatus;
  total_questions: number;
  correct_count: number;
  errors_count: number;
  passed?: boolean | null;
}

/**
 * Витрина тарифа для Paywall.
 * ASSUMPTION — pending OpenAPI: отдельного GET offer в ТЗ нет.
 * Поля взяты из ТЗ §3.5 (отображение) и §4.5 plan = trial_1rub_299.
 * HTTP-путь на клиенте не вызывается.
 */
export interface PremiumOffer {
  plan: 'trial_1rub_299';
  trial_price_rub: number;
  trial_days: number;
  monthly_price_rub: number;
  auto_renew: boolean;
}

/**
 * openapi.json components.schemas.CheckoutInitResponse — POST /api/v1/billing/checkout/init.
 * Confirmed against the live backend (2026-09-08): no request body (Bearer auth only). Initiates
 * a payment with the acquirer and returns a redirect target — does not activate Premium
 * synchronously. Real activation happens out of band, via POST /api/v1/billing/webhook
 * (provider → backend), which the frontend never observes directly. See D1 report for the
 * confirmed live redirect chain (confirmation_url → mock pay page → 303 → BILLING_RETURN_URL).
 */
export interface CheckoutInitResponse {
  payment_id: string;
  confirmation_url: string;
  amount_rub: number;
  description: string;
}

/** openapi.json components.schemas.TicketCategory. */
export type TicketCategory = 'A_B' | 'C_D';

/** openapi.json components.schemas.TopicOut. */
export interface TopicOut {
  id: string;
  title: string;
  order_index: number;
  questions_count: number;
}

/** openapi.json components.schemas.TicketOut. */
export interface TicketOut {
  id: string;
  number: number;
  category: TicketCategory;
}

/**
 * openapi.json components.schemas.TopicsListResponse — GET /api/v1/topics.
 * Единственный каталожный endpoint: отдаёт topics и tickets вместе, без вопросов (см. QuestionOut) —
 * вопросы билета/темы приходят только через POST /api/v1/tickets/session/start.
 */
export interface TopicsListResponse {
  topics: TopicOut[];
  tickets: TicketOut[];
}

/** openapi.json components.schemas.FavoritesListResponse — GET /api/v1/questions/favorites. */
export interface FavoritesListResponse {
  questions: QuestionOut[];
}

/**
 * openapi.json components.schemas.FavoriteToggleResponse —
 * POST/DELETE /api/v1/questions/{question_id}/favorite.
 */
export interface FavoriteToggleResponse {
  question_id: string;
  is_favorite: boolean;
}

/** openapi.json components.schemas.TicketProgressStatus — GET /api/v1/progress. */
export type TicketProgressStatus = 'not_started' | 'in_progress' | 'passed' | 'failed';

/** openapi.json components.schemas.TicketProgressOut. */
export interface TicketProgressOut {
  ticket_id: string;
  status: TicketProgressStatus;
  attempts: number;
  best_correct: number;
  total_questions: number;
  last_attempt_at: string | null;
}

/** openapi.json components.schemas.TopicProgressOut. */
export interface TopicProgressOut {
  topic_id: string;
  questions_total: number;
  questions_passed: number;
}

/** openapi.json components.schemas.BankProgressOut. */
export interface BankProgressOut {
  questions_total: number;
  questions_passed: number;
}

/** openapi.json components.schemas.ProgressResponse — GET /api/v1/progress. */
export interface ProgressResponse {
  tickets: TicketProgressOut[];
  topics: TopicProgressOut[];
  bank: BankProgressOut;
}

