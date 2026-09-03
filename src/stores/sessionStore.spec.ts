import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { MOCK_INITIAL_LIVES } from '../api/livesFixture';
import { useSessionStore } from './sessionStore';

describe('sessionStore loadCurrentUser / loadProfile', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('loadCurrentUser refreshes session.user from GET /users/me', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    vi.spyOn(apiClient, 'getCurrentUser').mockResolvedValueOnce({
      id: session.user!.id,
      oauth_provider: 'yandex',
      name: 'Обновлённое имя',
      avatar_url: null,
      email: null,
      lives_current: 1,
      lives_max: 3,
      is_premium: false,
      errors_count: 2,
      favorites_count: 1,
      lives_regen_at: null,
    });

    await session.loadCurrentUser();

    expect(session.user?.name).toBe('Обновлённое имя');
    expect(session.user?.lives_current).toBe(1);
    expect(session.user?.errors_count).toBe(2);
    expect(session.user?.favorites_count).toBe(1);
    expect(session.error).toBeNull();
  });

  it('loadCurrentUser stores an error and leaves user untouched on failure', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    const before = session.user;
    vi.spyOn(apiClient, 'getCurrentUser').mockRejectedValueOnce(new Error('NETWORK'));

    await session.loadCurrentUser();

    expect(session.error).toBeTruthy();
    expect(session.user).toEqual(before);
  });

  it('loadProfile loads user and subscription together', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');

    await session.loadProfile();

    expect(session.user).not.toBeNull();
    expect(session.subscription).toBeNull();
    expect(session.error).toBeNull();
  });
});

describe('sessionStore authentication', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts anonymous without token or user', () => {
    const session = useSessionStore();
    expect(session.isAuthenticated).toBe(false);
    expect(session.accessToken).toBeNull();
    expect(session.user).toBeNull();
  });

  it('Yandex mock login stores token and user', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    expect(session.isAuthenticated).toBe(true);
    expect(session.accessToken).toBeTruthy();
    expect(session.user?.id).toBeTruthy();
    expect(session.user?.oauth_provider).toBe('yandex');
  });

  it('VK mock login stores token and user', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('vk');
    expect(session.isAuthenticated).toBe(true);
    expect(session.accessToken).toBeTruthy();
    expect(session.user?.name).toBeTruthy();
  });

  it('keeps anonymous state when authentication fails', async () => {
    const session = useSessionStore();
    vi.spyOn(apiClient, 'exchangeOAuthCode').mockRejectedValueOnce(new Error('AUTH_FAILED'));

    await expect(session.loginWithProvider('yandex')).rejects.toThrow('AUTH_FAILED');

    expect(session.isAuthenticated).toBe(false);
    expect(session.accessToken).toBeNull();
    expect(session.user).toBeNull();
    expect(session.error).toBeTruthy();
  });

  it('logout clears token and user', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    session.logout();
    expect(session.isAuthenticated).toBe(false);
    expect(session.accessToken).toBeNull();
    expect(session.user).toBeNull();
    expect(session.subscription).toBeNull();
    expect(session.premiumOffer).toBeNull();
    expect(session.user).toBeNull();
  });
});

describe('sessionStore answerSession lives', () => {
  const request = {
    sessionId: '11111111-1111-4111-8111-111111111111',
    questionId: 'ffd0c95b28a89bd4faff45a8874c4fb3',
    answerId: 'ffd0c95b28a89bd4faff45a8874c4fb3::a0',
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('writes livesCurrent from the API result into session user', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    vi.spyOn(apiClient, 'answerSession').mockResolvedValue({
      isCorrect: false,
      correctAnswerId: request.answerId,
      livesCurrent: MOCK_INITIAL_LIVES - 1,
      extraQuestions: [],
      sessionFinishedForced: false,
    });

    const result = await session.answerSession(request);

    expect(result.livesCurrent).toBe(MOCK_INITIAL_LIVES - 1);
    expect(session.user?.lives_current).toBe(MOCK_INITIAL_LIVES - 1);
  });

  it('keeps lives unchanged when the API result is a correct answer', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    const before = session.user?.lives_current;
    vi.spyOn(apiClient, 'answerSession').mockResolvedValue({
      isCorrect: true,
      correctAnswerId: request.answerId,
      livesCurrent: before ?? 0,
      extraQuestions: [],
      sessionFinishedForced: false,
    });

    await session.answerSession(request);

    expect(session.user?.lives_current).toBe(before);
  });

  it('writes the unchanged livesCurrent Premium reports back into session user', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    const before = session.user?.lives_current ?? 0;
    vi.spyOn(apiClient, 'answerSession').mockResolvedValue({
      isCorrect: false,
      correctAnswerId: request.answerId,
      livesCurrent: before,
      extraQuestions: [],
      sessionFinishedForced: false,
    });

    await session.answerSession(request);

    expect(session.user?.lives_current).toBe(before);
  });

  it('does not apply lives when the API blocks zero-lives answers', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    if (session.user) {
      session.user = { ...session.user, lives_current: 0 };
    }
    vi.spyOn(apiClient, 'answerSession').mockRejectedValue(new Error('LIVES_EXHAUSTED'));

    await expect(session.answerSession(request)).rejects.toThrow('LIVES_EXHAUSTED');
    expect(session.user?.lives_current).toBe(0);
  });
});

describe('sessionStore paywall', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('loads offer and subscription for a free user', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadPaywall();

    expect(session.error).toBeNull();
    expect(session.premiumOffer?.monthly_price_rub).toBe(299);
    expect(session.premiumOffer?.trial_price_rub).toBe(1);
    expect(session.premiumOffer?.trial_days).toBe(3);
    expect(session.subscription).toBeNull();
    expect(session.isPremium).toBe(false);
    expect(session.loading).toBe(false);
  });

  it('keeps loading false after a failed paywall load and stores error', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    vi.spyOn(apiClient, 'getPremiumOffer').mockRejectedValueOnce(new Error('OFFER_FAILED'));

    await session.loadPaywall();

    expect(session.loading).toBe(false);
    expect(session.error).toBe('Не удалось загрузить данные');
    expect(session.premiumOffer).toBeNull();
  });
});

describe('sessionStore checkout', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('starts idle after loadCheckout for a free user', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadCheckout();

    expect(session.checkoutStatus).toBe('idle');
    expect(session.checkoutError).toBeNull();
    expect(session.isPremium).toBe(false);
    expect(session.premiumOffer?.plan).toBe('trial_1rub_299');
  });

  it('submits mock payment and writes trial Premium into session', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadCheckout();
    const result = await session.submitCheckout();

    expect(result?.status).toBe('success');
    expect(session.checkoutStatus).toBe('success');
    expect(session.isPremium).toBe(true);
    expect(session.user?.is_premium).toBe(true);
    expect(session.subscription?.status).toBe('trialing');
    expect(session.subscription?.auto_renew).toBe(true);
  });

  it('records a payment error and keeps Free state', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadCheckout();
    vi.spyOn(apiClient, 'checkout').mockRejectedValueOnce(new Error('CHECKOUT_FAILED'));

    const result = await session.submitCheckout();

    expect(result).toBeNull();
    expect(session.checkoutStatus).toBe('error');
    expect(session.checkoutError).toBeTruthy();
    expect(session.isPremium).toBe(false);
  });

  it('sets processing while checkout is in flight', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadCheckout();

    let release: () => void = () => {};
    const pending = new Promise<Awaited<ReturnType<typeof apiClient.checkout>>>((resolve) => {
      release = () =>
        resolve({
          status: 'success',
          subscription: {
            id: '00000000-0000-4000-8000-000000000300',
            status: 'trialing',
            auto_renew: true,
            paid_until: '2026-09-04',
            price_rub: 299,
          },
        });
    });
    vi.spyOn(apiClient, 'checkout').mockReturnValue(pending);

    const submitPromise = session.submitCheckout();
    expect(session.checkoutStatus).toBe('processing');
    release();
    await submitPromise;
    expect(session.checkoutStatus).toBe('success');
  });

  it('does not send a second checkout request while processing', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadCheckout();

    let release: () => void = () => {};
    const pending = new Promise<Awaited<ReturnType<typeof apiClient.checkout>>>((resolve) => {
      release = () =>
        resolve({
          status: 'success',
          subscription: {
            id: '00000000-0000-4000-8000-000000000300',
            status: 'trialing',
            auto_renew: true,
            paid_until: '2026-09-04',
            price_rub: 299,
          },
        });
    });
    const spy = vi.spyOn(apiClient, 'checkout').mockReturnValue(pending);

    const first = session.submitCheckout();
    const second = await session.submitCheckout();
    expect(second).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('does not submit payment when the user is already Premium', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadCheckout();
    await session.submitCheckout();
    expect(session.isPremium).toBe(true);

    await session.loadCheckout();
    expect(session.checkoutStatus).toBe('already-premium');

    const spy = vi.spyOn(apiClient, 'checkout');
    const result = await session.submitCheckout();

    expect(result).toBeNull();
    expect(session.checkoutStatus).toBe('already-premium');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('sessionStore cancelAutoRenew', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  async function loginAsTrialPremium() {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadCheckout();
    await session.submitCheckout();
    return session;
  }

  it('turns off auto-renew and keeps Premium after a successful cancel', async () => {
    const session = await loginAsTrialPremium();

    const result = await session.cancelAutoRenew();

    expect(result?.subscription.auto_renew).toBe(false);
    expect(session.cancelStatus).toBe('success');
    expect(session.cancelError).toBeNull();
    expect(session.subscription?.auto_renew).toBe(false);
    expect(session.subscription?.status).toBe('cancelled');
    expect(session.isPremium).toBe(true);
  });

  it('records an error and keeps auto_renew on when the API call fails', async () => {
    const session = await loginAsTrialPremium();
    vi.spyOn(apiClient, 'cancelSubscription').mockRejectedValueOnce(new Error('CANCEL_FAILED'));

    const result = await session.cancelAutoRenew();

    expect(result).toBeNull();
    expect(session.cancelStatus).toBe('error');
    expect(session.cancelError).toBeTruthy();
    expect(session.subscription?.auto_renew).toBe(true);
  });

  it('does not send a second cancel request while processing', async () => {
    const session = await loginAsTrialPremium();

    let release: () => void = () => {};
    const pending = new Promise<Awaited<ReturnType<typeof apiClient.cancelSubscription>>>((resolve) => {
      release = () =>
        resolve({
          subscription: {
            id: '00000000-0000-4000-8000-000000000300',
            status: 'cancelled',
            auto_renew: false,
            paid_until: '2026-09-04',
            price_rub: 299,
          },
          message: 'Автопродление отключено. Premium активен до конца оплаченного периода.',
        });
    });
    const spy = vi.spyOn(apiClient, 'cancelSubscription').mockReturnValue(pending);

    const first = session.cancelAutoRenew();
    expect(session.cancelStatus).toBe('processing');
    const second = await session.cancelAutoRenew();

    expect(second).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(session.cancelStatus).toBe('success');
  });
});
