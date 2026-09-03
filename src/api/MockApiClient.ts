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
import sourceTicket from '../data/ticket-1.json';
import type { FixtureQuestion } from '../types/ticket';
import type {
  AnswerSessionInput,
  AnswerSessionResult,
  ApiClient,
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
  CancelSubscriptionResponse,
  CheckoutRequest,
  CheckoutResult,
  CurrentUser,
  OAuthProvider,
  PremiumOffer,
  QuestionOut,
  SessionMode,
  Subscription,
  SubscriptionStatus,
  TicketCategory,
  TicketOut,
  TopicOut,
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
  /** Grows in place (exam extras) — order_index of each QuestionOut mirrors its position here. */
  questions: FixtureQuestion[];
  answers: Map<string, { answerId: string; isCorrect: boolean }>;
  finished: boolean;
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
    image_url: question.image || null,
    video_url: null,
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
  private checkoutInFlight: Promise<CheckoutResult> | null = null;
  private cancelInFlight: Promise<CancelSubscriptionResponse> | null = null;
  checkoutCallCount = 0;
  cancelCallCount = 0;
  private readonly sessions = new Map<string, SessionRecord>();

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

  /** openapi.json GET /api/v1/users/me — UserOut. Sole user-state source; no Dashboard DTO. */
  async getCurrentUser(): Promise<CurrentUser> {
    return this.currentUser();
  }

  async getTopics(): Promise<CatalogSnapshot> {
    return mapCatalog({ topics: TOPICS, tickets: TICKETS });
  }

  async getSubscription(): Promise<Subscription | null> {
    return this.currentSubscription();
  }

  async getPremiumOffer(): Promise<PremiumOffer> {
    return MOCK_PREMIUM_OFFER;
  }

  async checkout(request: CheckoutRequest): Promise<CheckoutResult> {
    if (this.checkoutInFlight) {
      return this.checkoutInFlight;
    }
    this.checkoutInFlight = this.performCheckout(request);
    try {
      return await this.checkoutInFlight;
    } finally {
      this.checkoutInFlight = null;
    }
  }

  private async performCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    this.checkoutCallCount += 1;
    if (typeof window !== 'undefined') {
      (window as Window & { __AV_TEST_CHECKOUT_CALLS__?: number }).__AV_TEST_CHECKOUT_CALLS__ =
        this.checkoutCallCount;
    }
    if (request.plan !== MOCK_PREMIUM_OFFER.plan) {
      throw new Error('UNKNOWN_PLAN');
    }
    if (this.isPremiumUser()) {
      throw new Error('ALREADY_PREMIUM');
    }
    if (this.checkoutFailsFixture || readTestCheckoutFail()) {
      throw new Error('CHECKOUT_FAILED');
    }

    this.premiumStatusFixture = 'trialing';
    this.activatedPremium = true;
    if (this.lastAuthUser) {
      this.lastAuthUser = { ...this.lastAuthUser, is_premium: true };
    }

    const subscription = this.currentSubscription();
    if (!subscription) {
      throw new Error('CHECKOUT_FAILED');
    }
    return { status: 'success', subscription };
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
    const questions = this.buildSessionQuestions(mode, input.ticketId ?? null, input.topicId ?? null);
    const revealCorrectness = mode !== 'gibdd_exam';
    const sessionId = newSessionId();
    this.sessions.set(sessionId, { mode, questions, answers: new Map(), finished: false });

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
    if (record.answers.has(input.questionId)) throw new Error('ANSWER_ALREADY_SUBMITTED');

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

    let sessionFinishedForced = false;
    if (!premium && !isCorrect) {
      this.livesCurrent = Math.max(0, this.livesCurrent - 1);
      if (this.livesCurrent === 0) sessionFinishedForced = true;
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
    record.finished = true;

    let correctCount = 0;
    let errorsCount = 0;
    let unanswered = 0;
    let baseMistakes = 0;
    let extraMistakes = 0;

    record.questions.forEach((question, index) => {
      const answer = record.answers.get(question.id);
      const isExamMode = record.mode === 'gibdd_exam';
      if (!answer) {
        unanswered += 1;
        errorsCount += 1;
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
}
