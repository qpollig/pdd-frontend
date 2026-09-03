/**
 * Wire DTO, зеркалящие components.schemas в docs/openapi.json (источник истины для контрактов).
 * Auth / User / Subscription / Question / Answer / Session* / Topic* / Ticket* / Favorite* отражают
 * реальный контракт. UI не работает с этими DTO напрямую — см. src/domain/question.ts +
 * src/domain/questionMapper.ts, src/domain/catalog.ts + src/domain/catalogMapper.ts и
 * src/api/ApiClient.ts (camelCase boundary).
 */

export type OAuthProvider = 'yandex' | 'vk';

/** openapi.json components.schemas.UserOut — используется и как TokenResponse.user, и как §users/me. */
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
 * UserOut уже содержит lives_*, поэтому CurrentUser = AuthUser + `lives_regen_at`.
 * `lives_regen_at` — frontend ASSUMPTION: поле ещё не появилось в openapi.json (ТЗ §4.7 регенерация
 * жизней), backend его пока не отдаёт. Mock всегда null.
 */
export interface CurrentUser extends AuthUser {
  lives_regen_at: string | null;
}

/** openapi.json components.schemas.SubscriptionStatus (GET /api/v1/subscriptions/me). */
export type SubscriptionStatus = 'trialing' | 'active' | 'cancelled' | 'past_due';

/**
 * openapi.json components.schemas.SubscriptionOut.
 * У Free-пользователя подписки нет вовсе — реальный backend отвечает 404 SUBSCRIPTION_NOT_FOUND;
 * здесь это смоделировано как `null` (нет отдельного HTTP-слоя, который бы кидал 404).
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
 * KNOWN DIVERGENCE from openapi.json — не исправлено на этом этапе, см. отчёт.
 * Реальный контракт — POST /api/v1/billing/checkout/init → CheckoutInitResponse
 * `{ payment_id, confirmation_url, amount_rub, description }`: инициирует платёж у провайдера,
 * не активирует Premium немедленно и не принимает `plan` / `payment_method_token` / `promo_code`
 * в теле. Реальная активация Premium происходит асинхронно (webhook/redirect), не в этом ответе.
 * CheckoutRequest/CheckoutResult ниже — frontend ASSUMPTION, смоделированная как синхронная покупка
 * (Phase 1 без провайдера). Задача этапа явно запрещает придумывать confirmation_url/redirect/webhook
 * flow, поэтому это поведение сохранено как есть; только вложенный `Subscription` приведён к реальной
 * форме SubscriptionOut, чтобы не плодить второй набор выдуманных дат/полей is_premium.
 */
export interface CheckoutRequest {
  plan: 'trial_1rub_299';
  payment_method_token: string;
  promo_code: string | null;
}

export interface CheckoutResult {
  status: 'success';
  subscription: Subscription;
}

/** openapi.json components.schemas.TicketCategory. */
export type TicketCategory = 'A_B' | 'C_D';

/** openapi.json components.schemas.TopicOut. */
export interface TopicOut {
  id: string;
  title: string;
  order_index: number;
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

