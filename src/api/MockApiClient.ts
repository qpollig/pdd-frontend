import {
  EXAM_BASE_QUESTION_COUNT,
  computeExamPassed,
  extrasToAddForBaseMistake,
  pickExtraQuestions,
} from '../domain/examRules';
import { mapCatalog } from '../domain/catalogMapper';
import type { CatalogSnapshot } from '../domain/catalog';
import type { Question } from '../domain/question';
import { mapQuestion } from '../domain/questionMapper';
import { mapProgress } from '../domain/progressMapper';
import type { ProgressSnapshot } from '../domain/progress';
import sourceTicket from '../data/ticket-1.json';
import type { FixtureQuestion } from '../types/ticket';
import type {
  AnswerSessionInput,
  AnswerSessionResult,
  ApiClient,
  CheckoutInitResult,
  FavoriteToggleResult,
  FinishSessionInput,
  FinishSessionResult,
  StartSessionInput,
  StartSessionResult,
} from './ApiClient';
import { MOCK_ERROR_QUESTION_IDS } from './errorQuestionsFixture';
import { MOCK_INITIAL_LIVES, MOCK_LIVES_MAX } from './livesFixture';
import { MOCK_PREMIUM_OFFER } from './premiumOfferFixture';
import type {
  AuthSession,
  AuthUser,
  BankProgressOut,
  CancelSubscriptionResponse,
  CurrentUser,
  OAuthProvider,
  PremiumOffer,
  QuestionOut,
  SessionMode,
  Subscription,
  SubscriptionStatus,
  TicketCategory,
  TicketOut,
  TicketProgressOut,
  TicketProgressStatus,
  TopicOut,
  TopicProgressOut,
} from './types';

const QUESTIONS = sourceTicket as FixtureQuestion[];
const TICKET_COUNT = 40;
/** All mock tickets belong to the combined A/B track — the fixture bank has no C_D questions. */
const TICKET_CATEGORY: TicketCategory = 'A_B';
const MOCK_SUBSCRIPTION_ID = '00000000-0000-4000-8000-000000000300';
/** ТЗ §3.5 / §4.5: 299 ₽/мес — то же значение, что MOCK_PREMIUM_OFFER.monthly_price_rub. */
const MOCK_SUBSCRIPTION_PRICE_RUB = 299;
/** Separator between a question id and its answer's order_index in the synthesized mock answer id. */
const ANSWER_ID_INFIX = '::a';

function ticketUuid(number: number): string {
  return `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

function topicUuid(index: number): string {
  return `00000000-0000-4000-9000-${String(index + 1).padStart(12, '0')}`;
}

function buildTickets(): TicketOut[] {
  return Array.from({ length: TICKET_COUNT }, (_, index) => ({
    id: ticketUuid(index + 1),
    number: index + 1,
    category: TICKET_CATEGORY,
  }));
}

/** Unique topic titles from the fixture bank, in first-seen order — mirrors GET /api/v1/topics TopicOut. */
function buildTopics(): TopicOut[] {
  const titles = [...new Set(QUESTIONS.flatMap((question) => question.topic))];
  return titles.map((title, index) => ({
    id: topicUuid(index),
    title,
    order_index: index,
    questions_count: QUESTIONS.filter((question) => question.topic.includes(title)).length,
  }));
}

const TICKETS = buildTickets();
const TOPICS = buildTopics();
const TOPIC_TITLE_BY_ID = new Map(TOPICS.map((topic) => [topic.id, topic.title]));

const MOCK_USER: CurrentUser = {
  id: '00000000-0000-4000-8000-000000000100',
  oauth_provider: 'yandex',
  name: 'Ученик',
  avatar_url: null,
  email: null,
  is_premium: false,
  lives_current: MOCK_INITIAL_LIVES,
  lives_max: MOCK_LIVES_MAX,
  errors_count: 0,
  favorites_count: 0,
  lives_regen_at: null,
  lives_reset_at: null,
};

const MOCK_AUTH_USERS: Record<OAuthProvider, AuthUser> = {
  yandex: {
    id: '00000000-0000-4000-8000-000000000101',
    oauth_provider: 'yandex',
    name: 'Ученик Яндекс',
    avatar_url: null,
    email: null,
    is_premium: false,
    lives_current: MOCK_INITIAL_LIVES,
    lives_max: MOCK_LIVES_MAX,
    errors_count: 0,
    favorites_count: 0,
    lives_regen_at: null,
    lives_reset_at: null,
  },
  vk: {
    id: '00000000-0000-4000-8000-000000000102',
    oauth_provider: 'vk',
    name: 'Ученик VK',
    avatar_url: null,
    email: null,
    is_premium: false,
    lives_current: MOCK_INITIAL_LIVES,
    lives_max: MOCK_LIVES_MAX,
    errors_count: 0,
    favorites_count: 0,
    lives_regen_at: null,
    lives_reset_at: null,
  },
};

export type MockApiClientFixtures = {
  isPremium?: boolean;
  /** Test-only: trial vs paid Premium. Default for isPremium is active. */
  premiumStatus?: Extract<SubscriptionStatus, 'trialing' | 'active'>;
  livesCurrent?: number;
  /** ASSUMPTION: mock history of previously incorrect questions. */
  errorQuestionIds?: string[];
  /** ASSUMPTION: mock initial favorites, keyed by Question UUID. Default is empty. */
  favoriteQuestionIds?: string[];
  /** Test-only: mock payment always fails. Not a production payment outcome. */
  checkoutFails?: boolean;
  /** Test-only: mock subscription cancel always fails. Not a production outcome. */
  cancelFails?: boolean;
};

type SessionRecord = {
  mode: SessionMode;
  /** Only set for mode 'theory' sessions started with a ticketId — drives ticketProgress on finish. */
  ticketId: string | null;
  /** Grows in place (exam extras) — order_index of each QuestionOut mirrors its position here. */
  questions: FixtureQuestion[];
  answers: Map<string, { answerId: string; isCorrect: boolean }>;
  finished: boolean;
};

/** In-memory GET /api/v1/progress bookkeeping for a single ticket — see MockApiClient.getProgress(). */
type TicketProgressRecord = {
  attempts: number;
  bestCorrect: number;
  totalQuestions: number;
  lastAttemptAt: string | null;
  inProgress: boolean;
};

function cloneQuestion(question: FixtureQuestion): FixtureQuestion {
  return {
    ...question,
    answers: question.answers.map((answer) => ({ ...answer })),
    topic: [...question.topic],
  };
}

function newSessionId(): string {
  const cryptoRef = typeof crypto !== 'undefined' ? crypto : undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function answerId(questionId: string, orderIndex: number): string {
  return `${questionId}${ANSWER_ID_INFIX}${orderIndex}`;
}

/** Fixture-data sentinel for "this question has no photo" (see types/ticket.ts FixtureQuestion.image) — not a real URL. */
const NO_IMAGE_SENTINEL = './images/no_image.jpg';

/**
 * Test-only mock video (small, CORS-enabled traffic footage from Wikimedia Commons) — there is no
 * real video CDN yet, this just makes the <video> player exercisable in mock mode without a backend.
 */
const MOCK_VIDEO_URL = 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Cars_Passing_by_at_Night.webm';
/**
 * Fixture questions that carry the mock video: one with no image (video-only branch), one that
 * also has a real image (exercises the image-over-video priority rule).
 */
const MOCK_VIDEO_QUESTION_IDS = new Set([
  '627f7626e7460498d50c0570c86d82f4',
  '050bbd8d2ba901e0b895141adadf7a60',
]);

/** Inverse of answerId(); returns -1 for an answer id that doesn't belong to this question. */
function answerIndexFromId(questionId: string, candidateAnswerId: string): number {
  const prefix = `${questionId}${ANSWER_ID_INFIX}`;
  if (!candidateAnswerId.startsWith(prefix)) return -1;
  const index = Number(candidateAnswerId.slice(prefix.length));
  return Number.isInteger(index) ? index : -1;
}

/**
 * FixtureQuestion → QuestionOut. `revealCorrectness` mirrors the backend's build_question_out():
 * true for theory/errors/favorites, false for gibdd_exam (frontend must not learn the correct
 * answer before answerSession is called for that question). `is_favorite` reflects the caller's
 * current favorites, independently of revealCorrectness.
 */
function toQuestionOut(
  question: FixtureQuestion,
  orderIndex: number,
  revealCorrectness: boolean,
  favoriteQuestionIds: ReadonlySet<string>,
): QuestionOut {
  return {
    id: question.id,
    order_index: orderIndex,
    text: question.question,
    image_url: question.image && question.image !== NO_IMAGE_SENTINEL ? question.image : null,
    video_url: MOCK_VIDEO_QUESTION_IDS.has(question.id) ? MOCK_VIDEO_URL : null,
    explanation: revealCorrectness ? question.answer_tip : null,
    is_favorite: favoriteQuestionIds.has(question.id),
    answers: question.answers.map((answer, index) => ({
      id: answerId(question.id, index),
      order_index: index,
      text: answer.answer_text,
      is_correct: revealCorrectness ? answer.is_correct : null,
    })),
  };
}

function toDomainQuestions(
  questions: FixtureQuestion[],
  revealCorrectness: boolean,
  favoriteQuestionIds: ReadonlySet<string>,
  startIndex = 0,
): Question[] {
  return questions.map((question, index) =>
    mapQuestion(toQuestionOut(question, startIndex + index, revealCorrectness, favoriteQuestionIds)),
  );
}

/** Test-only deterministic payment failure. Not a real acquirer outcome. */
function readTestCheckoutFail(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as Window & { __AV_TEST_CHECKOUT_FAIL__?: boolean }).__AV_TEST_CHECKOUT_FAIL__);
}

/** Test-only deterministic cancel failure. Not a real billing outcome. */
function readTestCancelFail(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as Window & { __AV_TEST_CANCEL_FAIL__?: boolean }).__AV_TEST_CANCEL_FAIL__);
}

/**
 * Mirrors the live backend's BILLING_RETURN_URL, which (confirmed live 2026-09-08) always points
 * at /profile?checkout=success — MockApiClient models that same redirect-oriented contract rather
 * than the acquirer's own interactive page (that page is backend-owned, out of scope here).
 */
function mockCheckoutReturnUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${base}profile?checkout=success`;
}

export class MockApiClient implements ApiClient {
  private lastAuthUser: AuthUser | null = null;
  private livesCurrent: number;
  private readonly livesMax: number;
  private readonly isPremiumFixture: boolean;
  private premiumStatusFixture: Extract<SubscriptionStatus, 'trialing' | 'active'> | null;
  private activatedPremium = false;
  private autoRenewCancelled = false;
  private readonly initialErrorQuestionIds: string[];
  private errorQuestionIds: string[];
  private favoriteQuestionIds: Set<string>;
  private readonly checkoutFailsFixture: boolean;
  private readonly cancelFailsFixture: boolean;
  private checkoutInFlight: Promise<CheckoutInitResult> | null = null;
  private cancelInFlight: Promise<CancelSubscriptionResponse> | null = null;
  /**
   * Models the backend's async webhook activation: set by checkout(), Premium flips on once
   * enough wall-clock time has passed. Time-based rather than poll-count-based on purpose — a
   * count would activate early if anything unrelated (e.g. LivesCounter's own periodic
   * getCurrentUser() refresh) happens to call the same polling entry points; a real backend's
   * webhook likewise lands at some point in time, independent of who is asking. null = no mock
   * checkout pending.
   */
  private checkoutInitiatedAt: number | null = null;
  private static readonly MOCK_CHECKOUT_ACTIVATION_DELAY_MS = 800;
  checkoutCallCount = 0;
  cancelCallCount = 0;
  private readonly sessions = new Map<string, SessionRecord>();
  /** GET /api/v1/progress: unique questions ever answered correctly, across all modes. */
  private correctQuestionIds = new Set<string>();
  /** GET /api/v1/progress: per-ticket attempts/best result, keyed by ticket id. */
  private ticketProgress = new Map<string, TicketProgressRecord>();

  constructor(fixtures: MockApiClientFixtures = {}) {
    this.livesCurrent = fixtures.livesCurrent ?? MOCK_INITIAL_LIVES;
    this.livesMax = MOCK_LIVES_MAX;
    this.isPremiumFixture = fixtures.isPremium ?? false;
    this.premiumStatusFixture = fixtures.premiumStatus ?? (fixtures.isPremium ? 'active' : null);
    this.initialErrorQuestionIds = fixtures.errorQuestionIds
      ? [...fixtures.errorQuestionIds]
      : [...MOCK_ERROR_QUESTION_IDS];
    this.errorQuestionIds = [...this.initialErrorQuestionIds];
    this.favoriteQuestionIds = new Set(fixtures.favoriteQuestionIds ?? []);
    this.checkoutFailsFixture = fixtures.checkoutFails ?? false;
    this.cancelFailsFixture = fixtures.cancelFails ?? false;
  }

  private isPremiumUser(): boolean {
    return this.isPremiumFixture || this.activatedPremium || this.lastAuthUser?.is_premium === true;
  }

  /** null = нет подписки, зеркалит 404 SUBSCRIPTION_NOT_FOUND у GET /api/v1/subscriptions/me. */
  private currentSubscription(): Subscription | null {
    if (!this.isPremiumUser()) {
      return null;
    }
    const status = this.premiumStatusFixture ?? 'active';
    const paidUntil = status === 'trialing' ? '2026-09-04' : '2026-10-01';
    return {
      id: MOCK_SUBSCRIPTION_ID,
      status: this.autoRenewCancelled ? 'cancelled' : status,
      auto_renew: !this.autoRenewCancelled,
      paid_until: paidUntil,
      price_rub: MOCK_SUBSCRIPTION_PRICE_RUB,
    };
  }

  private currentUser(): CurrentUser {
    const authUser = this.lastAuthUser;
    return {
      ...MOCK_USER,
      ...(authUser ?? {}),
      is_premium: this.isPremiumUser(),
      lives_current: this.livesCurrent,
      lives_max: this.livesMax,
      errors_count: this.errorQuestionIds.length,
      favorites_count: this.favoriteQuestionIds.size,
    };
  }

  async exchangeOAuthCode(provider: OAuthProvider, code: string): Promise<AuthSession> {
    const isPremiumLogin = code === `mock-${provider}-code-premium`;
    const isTrialLogin = code === `mock-${provider}-code-trial`;
    const isEmptyErrors = code === `mock-${provider}-code-no-errors`;
    if (code !== `mock-${provider}-code` && !isEmptyErrors && !isPremiumLogin && !isTrialLogin) {
      throw new Error('AUTH_FAILED');
    }
    this.autoRenewCancelled = false;
    this.livesCurrent = MOCK_INITIAL_LIVES;
    this.errorQuestionIds = isEmptyErrors ? [] : [...this.initialErrorQuestionIds];
    this.correctQuestionIds = new Set();
    this.ticketProgress = new Map();
    this.checkoutInitiatedAt = null;
    const user: AuthUser = {
      ...MOCK_AUTH_USERS[provider],
      is_premium: isPremiumLogin || isTrialLogin,
      errors_count: this.errorQuestionIds.length,
      favorites_count: this.favoriteQuestionIds.size,
    };
    this.lastAuthUser = user;
    if (isTrialLogin) {
      this.premiumStatusFixture = 'trialing';
      this.activatedPremium = true;
    } else if (isPremiumLogin) {
      this.premiumStatusFixture = 'active';
      this.activatedPremium = true;
    } else if (!this.isPremiumFixture) {
      this.premiumStatusFixture = null;
      this.activatedPremium = false;
    }
    return {
      access_token: `mock-access-token-${provider}`,
      token_type: 'bearer',
      user,
    };
  }

  /** See checkoutInitiatedAt doc comment. Checked on every getCurrentUser()/getSubscription() call. */
  private maybeActivateCheckout(): void {
    if (this.checkoutInitiatedAt === null) return;
    if (Date.now() - this.checkoutInitiatedAt < MockApiClient.MOCK_CHECKOUT_ACTIVATION_DELAY_MS) return;
    this.checkoutInitiatedAt = null;
    this.premiumStatusFixture = 'trialing';
    this.activatedPremium = true;
    if (this.lastAuthUser) {
      this.lastAuthUser = { ...this.lastAuthUser, is_premium: true };
    }
  }

  /** openapi.json GET /api/v1/users/me — UserOut. Sole user-state source; no Dashboard DTO. */
  async getCurrentUser(): Promise<CurrentUser> {
    this.maybeActivateCheckout();
    return this.currentUser();
  }

  async getTopics(): Promise<CatalogSnapshot> {
    return mapCatalog({ topics: TOPICS, tickets: TICKETS });
  }

  async getSubscription(): Promise<Subscription | null> {
    this.maybeActivateCheckout();
    return this.currentSubscription();
  }

  async getPremiumOffer(): Promise<PremiumOffer> {
    return MOCK_PREMIUM_OFFER;
  }

  /** MockApiClient never validates Bearer tokens, so there is nothing to restore. */
  restoreAccessToken(): void {
    /* no-op */
  }

  async checkout(): Promise<CheckoutInitResult> {
    if (this.checkoutInFlight) {
      return this.checkoutInFlight;
    }
    this.checkoutInFlight = this.performCheckout();
    try {
      return await this.checkoutInFlight;
    } finally {
      this.checkoutInFlight = null;
    }
  }

  /**
   * openapi.json POST /api/v1/billing/checkout/init — mirrors the real, redirect-oriented
   * contract: returns a confirmation_url and leaves Premium untouched until the activation delay
   * elapses (see maybeActivateCheckout()), instead of activating it synchronously here.
   */
  private async performCheckout(): Promise<CheckoutInitResult> {
    this.checkoutCallCount += 1;
    if (typeof window !== 'undefined') {
      (window as Window & { __AV_TEST_CHECKOUT_CALLS__?: number }).__AV_TEST_CHECKOUT_CALLS__ =
        this.checkoutCallCount;
      // Also mirrored into sessionStorage (test-only): the window property above does not survive
      // the real full-page reload that checkout() triggers, but e2e needs the dedup count to.
      try {
        window.sessionStorage.setItem('__av_test_checkout_calls__', String(this.checkoutCallCount));
      } catch {
        /* ignore — test instrumentation only */
      }
    }
    if (this.isPremiumUser()) {
      throw new Error('ALREADY_PREMIUM');
    }
    if (this.checkoutFailsFixture || readTestCheckoutFail()) {
      throw new Error('CHECKOUT_FAILED');
    }

    this.checkoutInitiatedAt = Date.now();

    return {
      paymentId: newSessionId(),
      confirmationUrl: mockCheckoutReturnUrl(),
      amountRub: MOCK_PREMIUM_OFFER.trial_price_rub,
      description: `Пробный период ${MOCK_PREMIUM_OFFER.trial_days} дня за ${MOCK_PREMIUM_OFFER.trial_price_rub} ₽`,
    };
  }

  async cancelSubscription(): Promise<CancelSubscriptionResponse> {
    if (this.cancelInFlight) {
      return this.cancelInFlight;
    }
    this.cancelInFlight = this.performCancel();
    try {
      return await this.cancelInFlight;
    } finally {
      this.cancelInFlight = null;
    }
  }

  private async performCancel(): Promise<CancelSubscriptionResponse> {
    this.cancelCallCount += 1;
    if (typeof window !== 'undefined') {
      (window as Window & { __AV_TEST_CANCEL_CALLS__?: number }).__AV_TEST_CANCEL_CALLS__ =
        this.cancelCallCount;
    }
    if (!this.isPremiumUser()) {
      throw new Error('NOT_PREMIUM');
    }
    if (this.cancelFailsFixture || readTestCancelFail()) {
      throw new Error('CANCEL_FAILED');
    }

    this.autoRenewCancelled = true;
    const subscription = this.currentSubscription();
    if (!subscription) {
      throw new Error('NOT_PREMIUM');
    }
    return {
      subscription,
      /** openapi.json CancelSubscriptionResponse.message default. */
      message: 'Автопродление отключено. Premium активен до конца оплаченного периода.',
    };
  }

  private buildSessionQuestions(
    mode: SessionMode,
    ticketId: string | null,
    topicId: string | null,
  ): FixtureQuestion[] {
    if (mode === 'gibdd_exam') {
      return QUESTIONS.slice(0, EXAM_BASE_QUESTION_COUNT).map(cloneQuestion);
    }
    if (mode === 'errors') {
      return this.errorQuestionIds
        .map((id) => QUESTIONS.find((question) => question.id === id))
        .filter((question): question is FixtureQuestion => Boolean(question))
        .map(cloneQuestion);
    }
    if (mode === 'favorites') {
      return QUESTIONS.filter((question) => this.favoriteQuestionIds.has(question.id)).map(cloneQuestion);
    }
    if (mode === 'theory') {
      if (ticketId) {
        if (!TICKETS.some((ticket) => ticket.id === ticketId)) {
          throw new Error('TICKET_NOT_FOUND');
        }
        return QUESTIONS.map(cloneQuestion);
      }
      if (topicId) {
        const title = TOPIC_TITLE_BY_ID.get(topicId);
        if (!title) throw new Error('TOPIC_NOT_FOUND');
        return QUESTIONS.filter((question) => question.topic.includes(title)).map(cloneQuestion);
      }
      throw new Error('TICKET_NOT_FOUND');
    }
    return [];
  }

  async startSession(input: StartSessionInput): Promise<StartSessionResult> {
    const { mode } = input;
    const ticketId = input.ticketId ?? null;
    const questions = this.buildSessionQuestions(mode, ticketId, input.topicId ?? null);
    const revealCorrectness = mode !== 'gibdd_exam';
    const sessionId = newSessionId();
    this.sessions.set(sessionId, { mode, ticketId, questions, answers: new Map(), finished: false });

    if (mode === 'theory' && ticketId) {
      const previous = this.ticketProgress.get(ticketId);
      this.ticketProgress.set(ticketId, {
        attempts: previous?.attempts ?? 0,
        bestCorrect: previous?.bestCorrect ?? 0,
        totalQuestions: questions.length,
        lastAttemptAt: previous?.lastAttemptAt ?? null,
        inProgress: true,
      });
    }

    return {
      sessionId,
      mode,
      questions: toDomainQuestions(questions, revealCorrectness, this.favoriteQuestionIds),
      livesCurrent: this.livesCurrent,
      livesMax: this.livesMax,
      isPremium: this.isPremiumUser(),
    };
  }

  async answerSession(input: AnswerSessionInput): Promise<AnswerSessionResult> {
    const record = this.sessions.get(input.sessionId);
    if (!record) throw new Error('SESSION_NOT_FOUND');
    if (record.finished) throw new Error('SESSION_ALREADY_FINISHED');

    const questionIndex = record.questions.findIndex((question) => question.id === input.questionId);
    const question = record.questions[questionIndex];
    if (!question) throw new Error('QUESTION_NOT_FOUND');
    if (record.answers.has(input.questionId)) throw new Error('QUESTION_ALREADY_ANSWERED');

    const selectedIndex = answerIndexFromId(question.id, input.answerId);
    const selected = question.answers[selectedIndex];
    if (!selected) throw new Error('ANSWER_NOT_FOUND');

    const premium = this.isPremiumUser();
    if (!premium && this.livesCurrent <= 0) {
      throw new Error('LIVES_EXHAUSTED');
    }

    const isCorrect = selected.is_correct;
    const previousBaseMistakes =
      record.mode === 'gibdd_exam'
        ? record.questions
            .slice(0, EXAM_BASE_QUESTION_COUNT)
            .filter((item) => record.answers.get(item.id)?.isCorrect === false).length
        : 0;

    record.answers.set(input.questionId, { answerId: input.answerId, isCorrect });
    if (isCorrect) this.correctQuestionIds.add(input.questionId);

    let sessionFinishedForced = false;
    if (!premium && !isCorrect) {
      this.livesCurrent = Math.max(0, this.livesCurrent - 1);
      if (this.livesCurrent === 0) sessionFinishedForced = true;
    }

    /**
     * ТЗ §3.2: an exam extra/bonus question has no second chance — a mistake there force-ends the
     * exam immediately. Confirmed against the live backend directly: session_finished_forced came
     * back true right on an extra-question mistake, via a separate rule from the lives-exhaustion
     * check above (base-question mistakes alone did not trigger it in that run).
     */
    const isExtraExamQuestion = record.mode === 'gibdd_exam' && questionIndex >= EXAM_BASE_QUESTION_COUNT;
    if (!isCorrect && isExtraExamQuestion) {
      sessionFinishedForced = true;
    }

    /** ТЗ §3.2: верный ответ в режиме «Ошибки» — удаление из истории ошибок. */
    if (isCorrect && record.mode === 'errors') {
      this.errorQuestionIds = this.errorQuestionIds.filter((id) => id !== input.questionId);
    }

    const isBaseExamQuestion =
      record.mode === 'gibdd_exam' && questionIndex >= 0 && questionIndex < EXAM_BASE_QUESTION_COUNT;
    let extraQuestions: FixtureQuestion[] = [];
    const baseLengthBeforeExtras = record.questions.length;
    if (!isCorrect && isBaseExamQuestion) {
      const extraCount = extrasToAddForBaseMistake(previousBaseMistakes);
      if (extraCount > 0) {
        const used = new Set(record.questions.map((item) => item.id));
        extraQuestions = pickExtraQuestions(QUESTIONS, used, question.topic[0], extraCount).map(cloneQuestion);
        record.questions.push(...extraQuestions);
      }
    }

    const correctIndex = question.answers.findIndex((answer) => answer.is_correct);
    const revealCorrectness = record.mode !== 'gibdd_exam';

    return {
      isCorrect,
      correctAnswerId: answerId(question.id, correctIndex),
      livesCurrent: this.livesCurrent,
      extraQuestions: toDomainQuestions(
        extraQuestions,
        revealCorrectness,
        this.favoriteQuestionIds,
        baseLengthBeforeExtras,
      ),
      sessionFinishedForced,
    };
  }

  async finishSession(input: FinishSessionInput): Promise<FinishSessionResult> {
    const record = this.sessions.get(input.sessionId);
    if (!record) throw new Error('SESSION_NOT_FOUND');
    if (record.finished) throw new Error('SESSION_ALREADY_FINISHED');
    record.finished = true;

    let correctCount = 0;
    /**
     * Live backend confirmed (2026-09-09): SessionFinishResponse.errors_count counts only
     * answered-wrong questions, not unanswered ones — do not fold `unanswered` into this.
     */
    let errorsCount = 0;
    let unanswered = 0;
    let baseMistakes = 0;
    let extraMistakes = 0;

    record.questions.forEach((question, index) => {
      const answer = record.answers.get(question.id);
      const isExamMode = record.mode === 'gibdd_exam';
      if (!answer) {
        unanswered += 1;
        if (isExamMode) {
          if (index < EXAM_BASE_QUESTION_COUNT) baseMistakes += 1;
          else extraMistakes += 1;
        }
        return;
      }
      if (answer.isCorrect) {
        correctCount += 1;
        return;
      }
      errorsCount += 1;
      if (isExamMode) {
        if (index < EXAM_BASE_QUESTION_COUNT) baseMistakes += 1;
        else extraMistakes += 1;
      }
    });

    const passed =
      record.mode === 'gibdd_exam'
        ? computeExamPassed({ baseMistakes, extraMistakes, unanswered, timedOut: unanswered > 0 })
        : null;

    if (record.mode === 'theory' && record.ticketId) {
      const previous = this.ticketProgress.get(record.ticketId);
      this.ticketProgress.set(record.ticketId, {
        attempts: (previous?.attempts ?? 0) + 1,
        bestCorrect: Math.max(previous?.bestCorrect ?? 0, correctCount),
        totalQuestions: record.questions.length,
        lastAttemptAt: new Date().toISOString(),
        inProgress: false,
      });
    }

    return {
      sessionId: input.sessionId,
      mode: record.mode,
      status: 'finished',
      totalQuestions: record.questions.length,
      correctCount,
      errorsCount,
      passed,
    };
  }

  async getFavoriteQuestions(): Promise<Question[]> {
    const favorites = QUESTIONS.filter((question) => this.favoriteQuestionIds.has(question.id));
    return toDomainQuestions(favorites, true, this.favoriteQuestionIds);
  }

  async addFavorite(questionId: string): Promise<FavoriteToggleResult> {
    if (!QUESTIONS.some((question) => question.id === questionId)) {
      throw new Error('QUESTION_NOT_FOUND');
    }
    this.favoriteQuestionIds.add(questionId);
    return { questionId, isFavorite: true };
  }

  async removeFavorite(questionId: string): Promise<FavoriteToggleResult> {
    this.favoriteQuestionIds.delete(questionId);
    return { questionId, isFavorite: false };
  }

  /**
   * GET /api/v1/progress on fixtures. Ticket status/attempts come from ticketProgress (updated by
   * startSession/finishSession); topic/bank counts come from correctQuestionIds (unique questions
   * ever answered correctly, any mode) — mirrors the "only correct, not all answered" backend rule.
   */
  async getProgress(): Promise<ProgressSnapshot> {
    const tickets: TicketProgressOut[] = TICKETS.map((ticket) => {
      const record = this.ticketProgress.get(ticket.id);
      if (!record) {
        return {
          ticket_id: ticket.id,
          status: 'not_started' as TicketProgressStatus,
          attempts: 0,
          best_correct: 0,
          total_questions: QUESTIONS.length,
          last_attempt_at: null,
        };
      }
      const status: TicketProgressStatus = record.inProgress
        ? 'in_progress'
        : record.bestCorrect >= record.totalQuestions
          ? 'passed'
          : 'failed';
      return {
        ticket_id: ticket.id,
        status,
        attempts: record.attempts,
        best_correct: record.bestCorrect,
        total_questions: record.totalQuestions,
        last_attempt_at: record.lastAttemptAt,
      };
    });

    const topics: TopicProgressOut[] = TOPICS.map((topic) => {
      const topicQuestionIds = QUESTIONS.filter((question) => question.topic.includes(topic.title)).map(
        (question) => question.id,
      );
      const questionsPassed = topicQuestionIds.filter((id) => this.correctQuestionIds.has(id)).length;
      return { topic_id: topic.id, questions_total: topicQuestionIds.length, questions_passed: questionsPassed };
    });

    const bank: BankProgressOut = {
      questions_total: QUESTIONS.length,
      questions_passed: this.correctQuestionIds.size,
    };

    return mapProgress({ tickets, topics, bank });
  }
}
