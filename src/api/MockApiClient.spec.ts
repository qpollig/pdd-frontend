import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '../domain/question';
import {
  MockApiClient,
  MOCK_PASSWORD_TEST_EMAIL,
  MOCK_PASSWORD_TEST_PASSWORD,
  MOCK_VALID_RESET_TOKEN,
} from './MockApiClient';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function startTheorySession(client: MockApiClient) {
  const ticketId = (await client.getTopics()).tickets[0]?.id;
  return client.startSession({ mode: 'theory', ticketId });
}

function correctAnswer(question: Question) {
  const answer = question.answers.find((item) => item.isCorrect);
  if (!answer) throw new Error(`Question ${question.id} has no correct answer`);
  return answer;
}

function wrongAnswer(question: Question) {
  const answer = question.answers.find((item) => item.isCorrect === false);
  if (!answer) throw new Error(`Question ${question.id} has no wrong answer`);
  return answer;
}

/**
 * For a cloned/extra exam question (correctness withheld), find the answer id on `question`
 * that lines up positionally with the correct answer on `source` (the same question fetched
 * from a mode that reveals correctness) — needed because a cloned question's own answer ids are
 * prefixed with its own (possibly `__extra__`-suffixed) id, not the source's.
 */
function correctAnswerIdFor(question: Question, source: Question): string {
  const index = source.answers.findIndex((item) => item.isCorrect);
  const answer = question.answers[index];
  if (!answer) throw new Error(`No matching answer on ${question.id} for source ${source.id}`);
  return answer.id;
}

/** Same positional mapping as correctAnswerIdFor(), for a wrong answer instead. */
function wrongAnswerIdFor(question: Question, source: Question): string {
  const index = source.answers.findIndex((item) => item.isCorrect === false);
  const answer = question.answers[index];
  if (!answer) throw new Error(`No matching wrong answer on ${question.id} for source ${source.id}`);
  return answer.id;
}

describe('MockApiClient', () => {
  const api = new MockApiClient();

  it('returns topics and tickets together from a single GET /topics call', async () => {
    const result = await api.getTopics();

    expect(result.tickets).toHaveLength(40);
    expect(result.tickets[0]).toEqual({ id: expect.any(String), number: 1, category: 'A_B' });
    expect(result.topics.length).toBeGreaterThan(0);
    expect(result.topics[0]).toEqual({
      id: expect.any(String),
      title: expect.any(String),
      orderIndex: 0,
      questionsCount: expect.any(Number),
    });
  });

  it('does not include fake backend fields (group_by/questions_count/answered_count) or questions', async () => {
    const result = await api.getTopics();

    expect(result.tickets[0]).not.toHaveProperty('questions_count');
    expect(result.tickets[0]).not.toHaveProperty('answered_count');
    expect(result.tickets[0]).not.toHaveProperty('title');
    expect(result.tickets[0]).not.toHaveProperty('questions');
    expect(result.topics[0]).not.toHaveProperty('ticket_ids');
    expect(result.topics[0]).not.toHaveProperty('question_count');
    expect(result.topics[0]).not.toHaveProperty('questions');
    expect(result).not.toHaveProperty('group_by');
  });

  it('returns null subscription for a Free user, mirroring 404 SUBSCRIPTION_NOT_FOUND', async () => {
    const subscription = await api.getSubscription();
    expect(subscription).toBeNull();
  });

  it('returns the TZ §3.5 Premium offer without HTTP', async () => {
    const offer = await api.getPremiumOffer();
    expect(offer).toEqual({
      plan: 'trial_1rub_299',
      trial_price_rub: 1,
      trial_days: 3,
      monthly_price_rub: 299,
      auto_renew: true,
    });
  });

  it('marks the current user and subscription as Premium for the premium fixture', async () => {
    const client = new MockApiClient({ isPremium: true });
    const user = await client.getCurrentUser();
    const subscription = await client.getSubscription();
    expect(user.is_premium).toBe(true);
    expect(subscription?.status).toBe('active');
  });

  it('marks trial login as Premium with trialing subscription', async () => {
    const client = new MockApiClient();
    const session = await client.exchangeOAuthCode('yandex', 'mock-yandex-code-trial');
    expect(session.user.is_premium).toBe(true);
    const subscription = await client.getSubscription();
    expect(subscription?.status).toBe('trialing');
  });

  it('rejects starting a theory session for an unknown ticket id', async () => {
    await expect(api.startSession({ mode: 'theory', ticketId: 'does-not-exist' })).rejects.toThrow(
      'TICKET_NOT_FOUND',
    );
  });

  it('exchanges a Yandex mock code for an OpenAPI-shaped TokenResponse', async () => {
    const session = await api.exchangeOAuthCode('yandex', 'mock-yandex-code');
    expect(session.access_token).toBeTruthy();
    expect(session.token_type).toBe('bearer');
    expect(session.user).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        oauth_provider: 'yandex',
        name: expect.any(String),
        is_premium: false,
      }),
    );
    expect(session.access_token).toContain('yandex');
  });

  it('exchanges a VK mock code for an OpenAPI-shaped TokenResponse', async () => {
    const session = await api.exchangeOAuthCode('vk', 'mock-vk-code');
    expect(session.access_token).toBeTruthy();
    expect(session.user.oauth_provider).toBe('vk');
    expect(session.access_token).toContain('vk');
  });

  it('rejects an invalid mock OAuth code', async () => {
    await expect(api.exchangeOAuthCode('yandex', 'invalid')).rejects.toThrow('AUTH_FAILED');
  });
});

describe('MockApiClient email+password auth (register/login/forgot/reset)', () => {
  it('registerWithPassword auto-logs-in a new mock user with a single password identity', async () => {
    const client = new MockApiClient();
    const session = await client.registerWithPassword('new-student@example.com', 'a-strong-pass', 'Новый ученик');

    expect(session.access_token).toBeTruthy();
    expect(session.token_type).toBe('bearer');
    expect(session.user).toEqual(
      expect.objectContaining({
        oauth_provider: null,
        name: 'Новый ученик',
        email: 'new-student@example.com',
        is_premium: false,
      }),
    );
    expect((await client.getIdentities()).map((i) => i.type)).toEqual(['password']);
  });

  it('registerWithPassword normalizes email case', async () => {
    const client = new MockApiClient();
    const session = await client.registerWithPassword('New-Student@Example.com', 'a-strong-pass', 'X');
    expect(session.user.email).toBe('new-student@example.com');
  });

  it('registerWithPassword with the already-taken test email → EMAIL_ALREADY_REGISTERED', async () => {
    const client = new MockApiClient();
    await expect(
      client.registerWithPassword(MOCK_PASSWORD_TEST_EMAIL, 'a-strong-pass', 'X'),
    ).rejects.toThrow('EMAIL_ALREADY_REGISTERED');
  });

  it('loginWithPassword accepts the documented test credentials', async () => {
    const client = new MockApiClient();
    const session = await client.loginWithPassword(MOCK_PASSWORD_TEST_EMAIL, MOCK_PASSWORD_TEST_PASSWORD);

    expect(session.access_token).toBeTruthy();
    expect(session.user.email).toBe(MOCK_PASSWORD_TEST_EMAIL);
    expect(session.user.oauth_provider).toBeNull();
    expect((await client.getIdentities()).map((i) => i.type)).toEqual(['password']);
  });

  it('loginWithPassword with a wrong password → INVALID_CREDENTIALS (same code as unknown email)', async () => {
    const client = new MockApiClient();
    await expect(client.loginWithPassword(MOCK_PASSWORD_TEST_EMAIL, 'wrong-password')).rejects.toThrow(
      'INVALID_CREDENTIALS',
    );
  });

  it('loginWithPassword with an unknown email → INVALID_CREDENTIALS (same code, not a distinct one)', async () => {
    const client = new MockApiClient();
    await expect(
      client.loginWithPassword('nobody@example.com', MOCK_PASSWORD_TEST_PASSWORD),
    ).rejects.toThrow('INVALID_CREDENTIALS');
  });

  it('requestPasswordReset always resolves, regardless of the email', async () => {
    const client = new MockApiClient();
    await expect(client.requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
    await expect(client.requestPasswordReset(MOCK_PASSWORD_TEST_EMAIL)).resolves.toBeUndefined();
  });

  it('resetPassword accepts only the fixed mock-valid token', async () => {
    const client = new MockApiClient();
    await expect(client.resetPassword(MOCK_VALID_RESET_TOKEN, 'new-strong-pass')).resolves.toBeUndefined();
  });

  it('resetPassword with any other token → INVALID_OR_EXPIRED_TOKEN', async () => {
    const client = new MockApiClient();
    await expect(client.resetPassword('garbage-token', 'new-strong-pass')).rejects.toThrow(
      'INVALID_OR_EXPIRED_TOKEN',
    );
  });
});

describe('MockApiClient identities (link/unlink)', () => {
  it('starts with exactly one identity — the provider used to log in', async () => {
    const client = new MockApiClient();
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
    const identities = await client.getIdentities();
    expect(identities).toEqual([
      { type: 'yandex', identifier: expect.any(String), createdAt: expect.any(String) },
    ]);
  });

  it('re-login resets the identity list to the new provider', async () => {
    const client = new MockApiClient();
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
    await client.exchangeOAuthCode('vk', 'mock-vk-code');
    expect((await client.getIdentities()).map((i) => i.type)).toEqual(['vk']);
  });

  it('linkPassword adds a password identity and returns the updated list', async () => {
    const client = new MockApiClient();
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
    const after = await client.linkPassword('Me@Example.com', 'secret-password-1');
    expect(after.map((i) => i.type).sort()).toEqual(['password', 'yandex']);
    expect(after.find((i) => i.type === 'password')?.identifier).toBe('me@example.com'); // нормализован
    expect(await client.getIdentities()).toEqual(after); // состояние сохранилось
  });

  it('linkPassword twice → PASSWORD_ALREADY_SET', async () => {
    const client = new MockApiClient();
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
    await client.linkPassword('a@example.com', 'secret-password-1');
    await expect(client.linkPassword('b@example.com', 'secret-password-2')).rejects.toThrow(
      'PASSWORD_ALREADY_SET',
    );
  });

  it('linkPassword with a taken email → EMAIL_ALREADY_REGISTERED', async () => {
    const client = new MockApiClient();
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
    await expect(client.linkPassword('taken@example.com', 'secret-password-1')).rejects.toThrow(
      'EMAIL_ALREADY_REGISTERED',
    );
    expect((await client.getIdentities()).map((i) => i.type)).toEqual(['yandex']); // не изменилось
  });

  it('unlinkIdentity removes one of two and returns the remaining list', async () => {
    const client = new MockApiClient();
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
    await client.linkPassword('me@example.com', 'secret-password-1');
    const after = await client.unlinkIdentity('yandex');
    expect(after.map((i) => i.type)).toEqual(['password']);
    expect((await client.getIdentities()).map((i) => i.type)).toEqual(['password']);
  });

  it('unlinkIdentity on the last remaining identity → CANNOT_UNLINK_LAST_IDENTITY', async () => {
    const client = new MockApiClient();
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
    await expect(client.unlinkIdentity('yandex')).rejects.toThrow('CANNOT_UNLINK_LAST_IDENTITY');
    expect((await client.getIdentities()).map((i) => i.type)).toEqual(['yandex']); // осталась
  });

  it('unlinkIdentity for a type the user does not have → IDENTITY_NOT_FOUND', async () => {
    const client = new MockApiClient();
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
    await client.linkPassword('me@example.com', 'secret-password-1');
    await expect(client.unlinkIdentity('vk')).rejects.toThrow('IDENTITY_NOT_FOUND');
  });
});

const QUESTION_1 = 'ffd0c95b28a89bd4faff45a8874c4fb3';

describe('MockApiClient startSession (theory)', () => {
  it('issues an opaque UUID session id, not a synthetic mock- string', async () => {
    const client = new MockApiClient();
    const started = await startTheorySession(client);
    expect(started.sessionId).toMatch(UUID_RE);
    expect(started.mode).toBe('theory');
  });

  it('reveals answer correctness and explanation immediately for theory', async () => {
    const client = new MockApiClient();
    const started = await startTheorySession(client);
    const question = started.questions.find((item) => item.id === QUESTION_1)!;
    expect(question.explanation).toBeTruthy();
    expect(question.answers.some((a) => a.isCorrect === true)).toBe(true);
    expect(question.answers.some((a) => a.isCorrect === false)).toBe(true);
  });

  it('gives every answer a stable UUID/string id, not an index', async () => {
    const client = new MockApiClient();
    const started = await startTheorySession(client);
    const question = started.questions[0]!;
    for (const answer of question.answers) {
      expect(answer.id).not.toMatch(/^\d+$/);
      expect(answer.id.startsWith(question.id)).toBe(true);
    }
  });

  it('rejects theory session start for an unknown ticket', async () => {
    const client = new MockApiClient();
    await expect(client.startSession({ mode: 'theory', ticketId: 'nope' })).rejects.toThrow(
      'TICKET_NOT_FOUND',
    );
  });

  it('starts a topic-scoped theory session via topicId, filtered to that topic', async () => {
    const client = new MockApiClient();
    const catalog = await client.getTopics();
    const topic = catalog.topics[0]!;

    const started = await client.startSession({ mode: 'theory', topicId: topic.id });

    expect(started.questions.length).toBeGreaterThan(0);
    expect(started.questions.length).toBeLessThan((await startTheorySession(client)).questions.length);
  });

  it('rejects theory session start for an unknown topic', async () => {
    const client = new MockApiClient();
    await expect(client.startSession({ mode: 'theory', topicId: 'nope' })).rejects.toThrow(
      'TOPIC_NOT_FOUND',
    );
  });
});

describe('MockApiClient answerSession lives', () => {
  it('does not reduce lives on a correct answer', async () => {
    const client = new MockApiClient();
    const before = (await client.getCurrentUser()).lives_current;
    const started = await startTheorySession(client);
    const question = started.questions.find((item) => item.id === QUESTION_1)!;
    const result = await client.answerSession({
      sessionId: started.sessionId,
      questionId: question.id,
      answerId: correctAnswer(question).id,
    });
    const after = (await client.getCurrentUser()).lives_current;

    expect(result.isCorrect).toBe(true);
    expect(result.livesCurrent).toBe(before);
    expect(after).toBe(before);
  });

  it('reduces lives through the API result on a wrong answer', async () => {
    const client = new MockApiClient();
    const before = (await client.getCurrentUser()).lives_current;
    const started = await startTheorySession(client);
    const question = started.questions.find((item) => item.id === QUESTION_1)!;
    const result = await client.answerSession({
      sessionId: started.sessionId,
      questionId: question.id,
      answerId: wrongAnswer(question).id,
    });
    const after = (await client.getCurrentUser()).lives_current;

    expect(result.isCorrect).toBe(false);
    expect(result.livesCurrent).toBe(before - 1);
    expect(after).toBe(before - 1);
  });

  it('does not consume lives for Premium and does not block answers', async () => {
    const client = new MockApiClient({ isPremium: true, livesCurrent: 0 });
    const started = await startTheorySession(client);
    const question = started.questions.find((item) => item.id === QUESTION_1)!;
    const result = await client.answerSession({
      sessionId: started.sessionId,
      questionId: question.id,
      answerId: wrongAnswer(question).id,
    });
    const user = await client.getCurrentUser();

    expect(result.isCorrect).toBe(false);
    expect(result.livesCurrent).toBe(0);
    expect(user.is_premium).toBe(true);
    expect(user.lives_current).toBe(0);
  });

  it('blocks further answers when free lives are already zero', async () => {
    const client = new MockApiClient({ livesCurrent: 0 });
    const started = await startTheorySession(client);
    const question = started.questions.find((item) => item.id === QUESTION_1)!;
    await expect(
      client.answerSession({
        sessionId: started.sessionId,
        questionId: question.id,
        answerId: wrongAnswer(question).id,
      }),
    ).rejects.toThrow('LIVES_EXHAUSTED');
    expect((await client.getCurrentUser()).lives_current).toBe(0);
  });

  it('marks sessionFinishedForced true exactly on the answer that exhausts Free lives', async () => {
    const client = new MockApiClient({ livesCurrent: 1 });
    const started = await startTheorySession(client);
    const question = started.questions.find((item) => item.id === QUESTION_1)!;
    const result = await client.answerSession({
      sessionId: started.sessionId,
      questionId: question.id,
      answerId: wrongAnswer(question).id,
    });

    expect(result.livesCurrent).toBe(0);
    expect(result.sessionFinishedForced).toBe(true);
  });

  it('rejects a second answer for the same question in the same session', async () => {
    const client = new MockApiClient();
    const started = await startTheorySession(client);
    const question = started.questions.find((item) => item.id === QUESTION_1)!;
    await client.answerSession({
      sessionId: started.sessionId,
      questionId: question.id,
      answerId: correctAnswer(question).id,
    });
    await expect(
      client.answerSession({
        sessionId: started.sessionId,
        questionId: question.id,
        answerId: correctAnswer(question).id,
      }),
    ).rejects.toThrow('QUESTION_ALREADY_ANSWERED');
  });
});

const ERROR_Q2 = '050bbd8d2ba901e0b895141adadf7a60';
const ERROR_Q7 = 'ca976eeda460719cc594c0a40bb82616';
const ERROR_Q13 = 'd0063ffc0bad8476f04187c35b74b917';

describe('MockApiClient error questions', () => {
  it('returns a deterministic previous-error selection, not the first N ticket questions', async () => {
    const client = new MockApiClient();
    const started = await client.startSession({ mode: 'errors' });
    const ids = started.questions.map((question) => question.id);

    expect(ids).toEqual([ERROR_Q2, ERROR_Q7, ERROR_Q13]);
    expect(ids[0]).not.toBe(QUESTION_1);
  });

  it('returns an empty selection when the mock history has no errors', async () => {
    const client = new MockApiClient({ errorQuestionIds: [] });
    const started = await client.startSession({ mode: 'errors' });
    expect(started.questions).toEqual([]);
  });

  it('keeps existing Free lives deduction on a wrong Errors answer', async () => {
    const client = new MockApiClient();
    const before = (await client.getCurrentUser()).lives_current;
    const started = await client.startSession({ mode: 'errors' });
    const question = started.questions.find((item) => item.id === ERROR_Q2)!;

    const result = await client.answerSession({
      sessionId: started.sessionId,
      questionId: question.id,
      answerId: wrongAnswer(question).id,
    });

    expect(result.isCorrect).toBe(false);
    expect(result.livesCurrent).toBe(before - 1);
    const stillThere = (await client.startSession({ mode: 'errors' })).questions.map((item) => item.id);
    expect(stillThere).toContain(ERROR_Q2);
  });

  it('removes a question from the error history after a correct Errors answer', async () => {
    const client = new MockApiClient();
    const before = (await client.getCurrentUser()).lives_current;
    const started = await client.startSession({ mode: 'errors' });
    const question = started.questions.find((item) => item.id === ERROR_Q2)!;

    const result = await client.answerSession({
      sessionId: started.sessionId,
      questionId: question.id,
      answerId: correctAnswer(question).id,
    });

    expect(result.isCorrect).toBe(true);
    expect(result.livesCurrent).toBe(before);
    const remaining = (await client.startSession({ mode: 'errors' })).questions.map((item) => item.id);
    expect(remaining).not.toContain(ERROR_Q2);
  });

  it('starts with an empty error list after the mock no-errors login code', async () => {
    const client = new MockApiClient();
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code-no-errors');
    expect((await client.startSession({ mode: 'errors' })).questions).toEqual([]);
  });
});

describe('MockApiClient finishSession errors_count', () => {
  /**
   * Live backend confirmed (2026-09-09, 4 scripted finish scenarios against the live API):
   * errors_count counts only answered-wrong questions, never unanswered ones — a finish with
   * 15 correct + 5 unanswered + 0 wrong came back errors_count: 0, not 5.
   */
  it('does not count unanswered questions as errors', async () => {
    const client = new MockApiClient();
    const started = await startTheorySession(client);
    const questions = started.questions;

    await client.answerSession({
      sessionId: started.sessionId,
      questionId: questions[0]!.id,
      answerId: correctAnswer(questions[0]!).id,
    });
    // the rest of the ticket is left unanswered

    const finish = await client.finishSession({ sessionId: started.sessionId });
    expect(finish.correctCount).toBe(1);
    expect(finish.errorsCount).toBe(0);
    expect(finish.totalQuestions).toBe(questions.length);
  });

  it('counts wrongly answered questions but not unanswered ones when both are present', async () => {
    const client = new MockApiClient();
    const started = await startTheorySession(client);
    const questions = started.questions;

    await client.answerSession({
      sessionId: started.sessionId,
      questionId: questions[0]!.id,
      answerId: wrongAnswer(questions[0]!).id,
    });
    await client.answerSession({
      sessionId: started.sessionId,
      questionId: questions[1]!.id,
      answerId: correctAnswer(questions[1]!).id,
    });
    // remaining questions left unanswered

    const finish = await client.finishSession({ sessionId: started.sessionId });
    expect(finish.correctCount).toBe(1);
    expect(finish.errorsCount).toBe(1);
  });
});

describe('MockApiClient exam session', () => {
  it('starts a deterministic 20-question exam session with correctness withheld', async () => {
    const client = new MockApiClient();
    const started = await client.startSession({ mode: 'gibdd_exam' });
    expect(started.questions).toHaveLength(20);
    expect(started.mode).toBe('gibdd_exam');
    expect(started.sessionId).toMatch(UUID_RE);
    expect(started.questions[0]?.answers.every((answer) => answer.isCorrect === null)).toBe(true);
    expect(started.questions[0]?.explanation).toBeNull();
  });

  it('does not add extras when all 20 answers are correct and finish is passed', async () => {
    const client = new MockApiClient();
    const started = await client.startSession({ mode: 'gibdd_exam' });
    const bank = (await startTheorySession(client)).questions;

    for (const question of started.questions) {
      const source = bank.find((item) => item.id === question.id);
      if (!source) throw new Error('missing source');
      const result = await client.answerSession({
        sessionId: started.sessionId,
        questionId: question.id,
        answerId: correctAnswer(source).id,
      });
      expect(result.extraQuestions).toEqual([]);
    }

    const finish = await client.finishSession({ sessionId: started.sessionId });
    expect(finish.correctCount).toBe(20);
    expect(finish.errorsCount).toBe(0);
    expect(finish.totalQuestions).toBe(20);
    expect(finish.passed).toBe(true);
    expect(finish.status).toBe('finished');
  });

  it('adds 5 extra questions after the first mistake', async () => {
    const client = new MockApiClient();
    const started = await client.startSession({ mode: 'gibdd_exam' });
    const bank = (await startTheorySession(client)).questions;
    const first = started.questions[0]!;
    const source = bank.find((item) => item.id === first.id)!;

    const result = await client.answerSession({
      sessionId: started.sessionId,
      questionId: first.id,
      answerId: wrongAnswer(source).id,
    });

    expect(result.isCorrect).toBe(false);
    expect(result.extraQuestions).toHaveLength(5);

    const finish = await client.finishSession({ sessionId: started.sessionId });
    expect(finish.totalQuestions).toBe(25);
    expect(finish.passed).toBe(false);
  });

  it('adds another 5 extras for a second base mistake', async () => {
    const client = new MockApiClient();
    const started = await client.startSession({ mode: 'gibdd_exam' });
    const bank = (await startTheorySession(client)).questions;

    const first = started.questions[0]!;
    const second = started.questions[1]!;
    await client.answerSession({
      sessionId: started.sessionId,
      questionId: first.id,
      answerId: wrongAnswer(bank.find((item) => item.id === first.id)!).id,
    });
    const secondResult = await client.answerSession({
      sessionId: started.sessionId,
      questionId: second.id,
      answerId: wrongAnswer(bank.find((item) => item.id === second.id)!).id,
    });

    expect(secondResult.extraQuestions).toHaveLength(5);
    expect((await client.finishSession({ sessionId: started.sessionId })).totalQuestions).toBe(30);
  });

  it('passes after one base mistake if extras and remaining base questions are correct', async () => {
    const client = new MockApiClient();
    const started = await client.startSession({ mode: 'gibdd_exam' });
    const bank = (await startTheorySession(client)).questions;
    const first = started.questions[0]!;
    const firstSource = bank.find((item) => item.id === first.id)!;

    const mistake = await client.answerSession({
      sessionId: started.sessionId,
      questionId: first.id,
      answerId: wrongAnswer(firstSource).id,
    });
    expect(mistake.extraQuestions).toHaveLength(5);

    function sourceFor(id: string) {
      const originalId = id.split('__extra__')[0] ?? id;
      const found = bank.find((item) => item.id === originalId);
      if (!found) throw new Error(`missing source ${id}`);
      return found;
    }

    for (const question of [...started.questions.slice(1), ...mistake.extraQuestions]) {
      await client.answerSession({
        sessionId: started.sessionId,
        questionId: question.id,
        answerId: correctAnswerIdFor(question, sourceFor(question.id)),
      });
    }

    const finish = await client.finishSession({ sessionId: started.sessionId });
    expect(finish.errorsCount).toBe(1);
    expect(finish.passed).toBe(true);
  });

  it('does not add extras for a third base mistake', async () => {
    const client = new MockApiClient();
    const started = await client.startSession({ mode: 'gibdd_exam' });
    const bank = (await startTheorySession(client)).questions;

    for (const question of started.questions.slice(0, 3)) {
      const source = bank.find((item) => item.id === question.id)!;
      const result = await client.answerSession({
        sessionId: started.sessionId,
        questionId: question.id,
        answerId: wrongAnswer(source).id,
      });
      if (question === started.questions[2]) {
        expect(result.extraQuestions).toEqual([]);
      }
    }
  });

  it('force-finishes the exam when an extra question is answered incorrectly (ТЗ §3.2 — no second chance)', async () => {
    const client = new MockApiClient();
    const started = await client.startSession({ mode: 'gibdd_exam' });
    const bank = (await startTheorySession(client)).questions;
    const first = started.questions[0]!;

    const mistake = await client.answerSession({
      sessionId: started.sessionId,
      questionId: first.id,
      answerId: wrongAnswer(bank.find((item) => item.id === first.id)!).id,
    });
    expect(mistake.extraQuestions).toHaveLength(5);
    expect(mistake.sessionFinishedForced).toBe(false);

    const extra = mistake.extraQuestions[0]!;
    const extraSource = bank.find((item) => item.id === extra.id.split('__extra__')[0])!;
    const extraMistake = await client.answerSession({
      sessionId: started.sessionId,
      questionId: extra.id,
      answerId: wrongAnswerIdFor(extra, extraSource),
    });

    expect(extraMistake.sessionFinishedForced).toBe(true);
  });

  it('does not force-finish when the extra question is answered correctly', async () => {
    const client = new MockApiClient();
    const started = await client.startSession({ mode: 'gibdd_exam' });
    const bank = (await startTheorySession(client)).questions;
    const first = started.questions[0]!;

    const mistake = await client.answerSession({
      sessionId: started.sessionId,
      questionId: first.id,
      answerId: wrongAnswer(bank.find((item) => item.id === first.id)!).id,
    });
    const extra = mistake.extraQuestions[0]!;
    const extraSource = bank.find((item) => item.id === extra.id.split('__extra__')[0])!;

    const extraResult = await client.answerSession({
      sessionId: started.sessionId,
      questionId: extra.id,
      answerId: correctAnswerIdFor(extra, extraSource),
    });

    expect(extraResult.sessionFinishedForced).toBe(false);
  });

  it('SESSION_ALREADY_FINISHED: a second finishSession call on the same session is rejected, not silently re-finished', async () => {
    const client = new MockApiClient();
    const started = await startTheorySession(client);
    await client.finishSession({ sessionId: started.sessionId });

    await expect(client.finishSession({ sessionId: started.sessionId })).rejects.toThrow(
      'SESSION_ALREADY_FINISHED',
    );
  });

  it('SESSION_ALREADY_FINISHED: answerSession after finishSession is rejected distinctly from QUESTION_ALREADY_ANSWERED', async () => {
    const client = new MockApiClient();
    const started = await startTheorySession(client);
    const [first, second] = started.questions;
    await client.answerSession({
      sessionId: started.sessionId,
      questionId: first!.id,
      answerId: correctAnswer(first!).id,
    });
    await client.finishSession({ sessionId: started.sessionId });

    await expect(
      client.answerSession({
        sessionId: started.sessionId,
        questionId: second!.id,
        answerId: correctAnswer(second!).id,
      }),
    ).rejects.toThrow('SESSION_ALREADY_FINISHED');
  });

  it('rejects answerSession/finishSession for an unknown session id', async () => {
    const client = new MockApiClient();
    await expect(
      client.answerSession({ sessionId: 'not-a-session', questionId: 'q', answerId: 'a' }),
    ).rejects.toThrow('SESSION_NOT_FOUND');
    await expect(client.finishSession({ sessionId: 'not-a-session' })).rejects.toThrow(
      'SESSION_NOT_FOUND',
    );
  });
});

describe('MockApiClient checkout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a redirect-oriented result and does not accept card data or a plan/promo body', async () => {
    const client = new MockApiClient();
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
    // checkout() takes no request body at all — mirrors the live backend (confirmed 2026-09-08).
    const result = await client.checkout();

    expect(result).toEqual({
      paymentId: expect.any(String),
      confirmationUrl: expect.stringContaining('checkout=success'),
      amountRub: expect.any(Number),
      description: expect.any(String),
    });
  });

  it('does not activate Premium synchronously, or before the mock activation delay elapses', async () => {
    const client = new MockApiClient();
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
    await client.checkout();

    expect((await client.getCurrentUser()).is_premium).toBe(false);
    await vi.advanceTimersByTimeAsync(400);
    expect((await client.getCurrentUser()).is_premium).toBe(false);
  });

  it('activates Premium once the mock activation delay elapses, then stays active (models async webhook)', async () => {
    const client = new MockApiClient();
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
    await client.checkout();

    await vi.advanceTimersByTimeAsync(800);
    const activated = await client.getCurrentUser();
    expect(activated.is_premium).toBe(true);

    const subscription = await client.getSubscription();
    expect(subscription?.status).toBe('trialing');
    expect(subscription?.auto_renew).toBe(true);

    expect((await client.getCurrentUser()).is_premium).toBe(true);
  });

  it('an unrelated getCurrentUser() call elsewhere does not activate Premium early, only elapsed time does', async () => {
    const client = new MockApiClient();
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
    await client.checkout();

    // Simulates something unrelated (e.g. LivesCounter) polling repeatedly before the delay elapses.
    await client.getCurrentUser();
    await client.getCurrentUser();
    await client.getCurrentUser();
    expect((await client.getCurrentUser()).is_premium).toBe(false);
  });

  it('fails deterministically when checkoutFails is set, without starting activation', async () => {
    const client = new MockApiClient({ checkoutFails: true });
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
    await expect(client.checkout()).rejects.toThrow('CHECKOUT_FAILED');
    await vi.advanceTimersByTimeAsync(2000);
    expect((await client.getCurrentUser()).is_premium).toBe(false);
  });

  it('rejects checkout when Premium is already active', async () => {
    const client = new MockApiClient({ isPremium: true });
    await expect(client.checkout()).rejects.toThrow('ALREADY_PREMIUM');
  });

  it('does not start a second payment while one is in flight', async () => {
    const client = new MockApiClient();
    await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
    const first = client.checkout();
    const second = client.checkout();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(client.checkoutCallCount).toBe(1);
  });
});

describe('MockApiClient cancelSubscription', () => {
  it('turns off auto-renew but keeps Premium until the paid period ends (ТЗ §4.5)', async () => {
    const client = new MockApiClient({ isPremium: true, premiumStatus: 'active' });
    const before = await client.getSubscription();
    expect(before?.auto_renew).toBe(true);

    const result = await client.cancelSubscription();

    expect(result).toEqual({
      subscription: {
        id: before?.id,
        status: 'cancelled',
        auto_renew: false,
        paid_until: before?.paid_until,
        price_rub: before?.price_rub,
      },
      message: expect.any(String),
    });

    const after = await client.getSubscription();
    expect(after?.status).toBe('cancelled');
    expect(after?.auto_renew).toBe(false);
    expect(after?.paid_until).toBe(before?.paid_until);
  });

  it('keeps trial Premium active with its own period end after cancel', async () => {
    const client = new MockApiClient({ isPremium: true, premiumStatus: 'trialing' });
    const before = await client.getSubscription();

    await client.cancelSubscription();

    const after = await client.getSubscription();
    expect(after?.status).toBe('cancelled');
    expect(after?.paid_until).toBe(before?.paid_until);
  });

  it('rejects cancelling for a Free user', async () => {
    const client = new MockApiClient();
    await expect(client.cancelSubscription()).rejects.toThrow('NOT_PREMIUM');
  });

  it('fails deterministically when cancelFails is set, without changing auto_renew', async () => {
    const client = new MockApiClient({ isPremium: true, cancelFails: true });
    await expect(client.cancelSubscription()).rejects.toThrow('CANCEL_FAILED');
    expect((await client.getSubscription())?.auto_renew).toBe(true);
  });

  it('coalesces concurrent cancel calls into a single request', async () => {
    const client = new MockApiClient({ isPremium: true });
    const first = client.cancelSubscription();
    const second = client.cancelSubscription();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(client.cancelCallCount).toBe(1);
  });
});

describe('MockApiClient favorites', () => {
  it('starts with an empty favorites list', async () => {
    const client = new MockApiClient();
    expect(await client.getFavoriteQuestions()).toEqual([]);
  });

  it('adds a question to favorites by its UUID, not an index', async () => {
    const client = new MockApiClient();
    const result = await client.addFavorite(QUESTION_1);

    expect(result).toEqual({ questionId: QUESTION_1, isFavorite: true });
    const favorites = await client.getFavoriteQuestions();
    expect(favorites.map((question) => question.id)).toEqual([QUESTION_1]);
    expect(favorites[0]?.isFavorite).toBe(true);
  });

  it('rejects favoriting an unknown question id', async () => {
    await expect(new MockApiClient().addFavorite('not-a-question')).rejects.toThrow(
      'QUESTION_NOT_FOUND',
    );
  });

  it('is idempotent when the same question is favorited twice', async () => {
    const client = new MockApiClient();
    await client.addFavorite(QUESTION_1);
    await client.addFavorite(QUESTION_1);

    const favorites = await client.getFavoriteQuestions();
    expect(favorites.map((question) => question.id)).toEqual([QUESTION_1]);
  });

  it('removes a question from favorites by UUID and returns isFavorite: false', async () => {
    const client = new MockApiClient();
    await client.addFavorite(QUESTION_1);

    const result = await client.removeFavorite(QUESTION_1);

    expect(result).toEqual({ questionId: QUESTION_1, isFavorite: false });
    expect(await client.getFavoriteQuestions()).toEqual([]);
  });

  it('does not throw when removing a question that was never favorited', async () => {
    const client = new MockApiClient();
    await expect(client.removeFavorite(QUESTION_1)).resolves.toEqual({
      questionId: QUESTION_1,
      isFavorite: false,
    });
  });

  it('marks a favorited question is_favorite: true in theory/errors/exam sessions too', async () => {
    const client = new MockApiClient({ favoriteQuestionIds: [QUESTION_1] });
    const started = await startTheorySession(client);
    const question = started.questions.find((item) => item.id === QUESTION_1)!;
    expect(question.isFavorite).toBe(true);
  });

  it('reflects the favorites count on the user via favorites_count, not a second counter', async () => {
    const client = new MockApiClient();
    expect((await client.getCurrentUser()).favorites_count).toBe(0);

    await client.addFavorite(QUESTION_1);

    expect((await client.getCurrentUser()).favorites_count).toBe(1);
  });
});

describe('MockApiClient getCurrentUser', () => {
  it('maps to UserOut shape with nullable name/avatar/email before login', async () => {
    const client = new MockApiClient();
    const user = await client.getCurrentUser();

    expect(user).toEqual({
      id: expect.any(String),
      oauth_provider: expect.any(String),
      name: expect.any(String),
      avatar_url: null,
      email: null,
      lives_current: expect.any(Number),
      lives_max: expect.any(Number),
      is_premium: false,
      errors_count: expect.any(Number),
      favorites_count: 0,
      lives_regen_at: null,
      lives_reset_at: null,
    });
  });

  it('errors_count matches the mock error-history fixture length, not a separate counter', async () => {
    const client = new MockApiClient({ errorQuestionIds: [ERROR_Q2, ERROR_Q7] });
    expect((await client.getCurrentUser()).errors_count).toBe(2);
  });

  it('errors_count decreases after a question is answered correctly in Errors mode', async () => {
    const client = new MockApiClient();
    const before = (await client.getCurrentUser()).errors_count;
    const started = await client.startSession({ mode: 'errors' });
    const question = started.questions.find((item) => item.id === ERROR_Q2)!;

    await client.answerSession({
      sessionId: started.sessionId,
      questionId: question.id,
      answerId: correctAnswer(question).id,
    });

    expect((await client.getCurrentUser()).errors_count).toBe(before - 1);
  });

  it('is_premium follows the mock subscription state after login/checkout activation completes', async () => {
    vi.useFakeTimers();
    try {
      const client = new MockApiClient();
      await client.exchangeOAuthCode('yandex', 'mock-yandex-code');
      expect((await client.getCurrentUser()).is_premium).toBe(false);

      await client.checkout();
      await vi.advanceTimersByTimeAsync(800);

      expect((await client.getCurrentUser()).is_premium).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lives_current stays consistent with the value answerSession reports', async () => {
    const client = new MockApiClient();
    const ticketId = (await client.getTopics()).tickets[0]!.id;
    const started = await client.startSession({ mode: 'theory', ticketId });
    const question = started.questions.find((item) => item.id === QUESTION_1)!;

    const result = await client.answerSession({
      sessionId: started.sessionId,
      questionId: question.id,
      answerId: wrongAnswer(question).id,
    });

    expect((await client.getCurrentUser()).lives_current).toBe(result.livesCurrent);
  });
});

describe('MockApiClient getProgress', () => {
  it('reports not_started for every ticket and zeroed topic/bank counts before any activity', async () => {
    const client = new MockApiClient();
    const catalog = await client.getTopics();
    const progress = await client.getProgress();

    expect(progress.ticketStatus.size).toBe(catalog.tickets.length);
    for (const ticket of catalog.tickets) {
      expect(progress.ticketStatus.get(ticket.id)).toBe('not_started');
    }
    expect(progress.bank).toEqual({ passed: 0, total: expect.any(Number) });
    for (const topic of catalog.topics) {
      expect(progress.topicProgress.get(topic.id)).toEqual({ passed: 0, total: topic.questionsCount });
    }
  });

  it('marks a ticket in_progress once started, passed once finished with no mistakes', async () => {
    const client = new MockApiClient();
    const ticketId = (await client.getTopics()).tickets[0]!.id;
    const started = await client.startSession({ mode: 'theory', ticketId });

    expect((await client.getProgress()).ticketStatus.get(ticketId)).toBe('in_progress');

    for (const question of started.questions) {
      await client.answerSession({
        sessionId: started.sessionId,
        questionId: question.id,
        answerId: correctAnswer(question).id,
      });
    }
    await client.finishSession({ sessionId: started.sessionId });

    expect((await client.getProgress()).ticketStatus.get(ticketId)).toBe('passed');
  });

  it('marks a ticket failed after a mistake, then passed again after a clean retry', async () => {
    const client = new MockApiClient();
    const ticketId = (await client.getTopics()).tickets[0]!.id;

    const firstAttempt = await client.startSession({ mode: 'theory', ticketId });
    const [firstQuestion, ...restFirst] = firstAttempt.questions;
    await client.answerSession({
      sessionId: firstAttempt.sessionId,
      questionId: firstQuestion!.id,
      answerId: wrongAnswer(firstQuestion!).id,
    });
    for (const question of restFirst) {
      await client.answerSession({
        sessionId: firstAttempt.sessionId,
        questionId: question.id,
        answerId: correctAnswer(question).id,
      });
    }
    await client.finishSession({ sessionId: firstAttempt.sessionId });
    expect((await client.getProgress()).ticketStatus.get(ticketId)).toBe('failed');

    const secondAttempt = await client.startSession({ mode: 'theory', ticketId });
    for (const question of secondAttempt.questions) {
      await client.answerSession({
        sessionId: secondAttempt.sessionId,
        questionId: question.id,
        answerId: correctAnswer(question).id,
      });
    }
    await client.finishSession({ sessionId: secondAttempt.sessionId });

    expect((await client.getProgress()).ticketStatus.get(ticketId)).toBe('passed');
  });

  it('counts a question toward topic/bank progress only once, even across separate ticket sessions', async () => {
    const client = new MockApiClient();
    const catalog = await client.getTopics();

    const attempt = await startTheorySession(client);
    for (const question of attempt.questions) {
      await client.answerSession({
        sessionId: attempt.sessionId,
        questionId: question.id,
        answerId: correctAnswer(question).id,
      });
    }
    await client.finishSession({ sessionId: attempt.sessionId });
    const afterFirst = await client.getProgress();
    expect(afterFirst.bank.passed).toBe(afterFirst.bank.total);

    const secondTicketId = catalog.tickets[1]!.id;
    const attempt2 = await client.startSession({ mode: 'theory', ticketId: secondTicketId });
    for (const question of attempt2.questions) {
      await client.answerSession({
        sessionId: attempt2.sessionId,
        questionId: question.id,
        answerId: correctAnswer(question).id,
      });
    }
    await client.finishSession({ sessionId: attempt2.sessionId });

    expect((await client.getProgress()).bank).toEqual(afterFirst.bank);
  });
});
