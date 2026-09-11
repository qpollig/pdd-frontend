import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { MOCK_INITIAL_LIVES } from '../api/livesFixture';
import {
  MOCK_PASSWORD_TEST_EMAIL,
  MOCK_PASSWORD_TEST_PASSWORD,
  MOCK_VALID_RESET_TOKEN,
} from '../api/MockApiClient';
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
      lives_reset_at: null,
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

describe('sessionStore hydrateFromCheckoutBridge', () => {
  const BRIDGE_KEY = 'av_checkout_auth_bridge';

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('does nothing when there is no bridge entry — ordinary app boot is unaffected', async () => {
    const session = useSessionStore();
    const spy = vi.spyOn(apiClient, 'getCurrentUser');

    await session.hydrateFromCheckoutBridge();

    expect(session.accessToken).toBeNull();
    expect(session.user).toBeNull();
    expect(session.isAuthenticated).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('restores accessToken and loads the user from a valid bridge entry, then deletes it', async () => {
    sessionStorage.setItem(BRIDGE_KEY, 'mock-access-token-yandex');
    const session = useSessionStore();
    const restoreSpy = vi.spyOn(apiClient, 'restoreAccessToken');

    await session.hydrateFromCheckoutBridge();

    expect(session.accessToken).toBe('mock-access-token-yandex');
    expect(session.user).not.toBeNull();
    expect(session.isAuthenticated).toBe(true);
    expect(restoreSpy).toHaveBeenCalledWith('mock-access-token-yandex');
    expect(sessionStorage.getItem(BRIDGE_KEY)).toBeNull();
  });

  it('does not create a fake authenticated state from an invalid/stale token, and still deletes the bridge', async () => {
    sessionStorage.setItem(BRIDGE_KEY, 'stale-token');
    vi.spyOn(apiClient, 'getCurrentUser').mockRejectedValueOnce(new Error('UNAUTHORIZED'));
    const session = useSessionStore();

    await session.hydrateFromCheckoutBridge();

    expect(session.accessToken).toBeNull();
    expect(session.user).toBeNull();
    expect(session.isAuthenticated).toBe(false);
    expect(sessionStorage.getItem(BRIDGE_KEY)).toBeNull();
  });

  it('leaves an already-authenticated session untouched, even if a bridge entry exists', async () => {
    sessionStorage.setItem(BRIDGE_KEY, 'some-other-token');
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    const tokenBeforeHydrate = session.accessToken;
    const spy = vi.spyOn(apiClient, 'getCurrentUser');

    await session.hydrateFromCheckoutBridge();

    expect(session.accessToken).toBe(tokenBeforeHydrate);
    expect(spy).not.toHaveBeenCalled();
    // Bridge from an unrelated, still-pending checkout is left alone here — only ever consumed
    // when there is no live session to protect.
    expect(sessionStorage.getItem(BRIDGE_KEY)).toBe('some-other-token');
  });

  it('never touches localStorage while hydrating — sessionStorage only, one-shot, tab-scoped', async () => {
    sessionStorage.setItem(BRIDGE_KEY, 'mock-access-token-yandex');
    const session = useSessionStore();

    await session.hydrateFromCheckoutBridge();

    expect(localStorage.length).toBe(0);
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
  const originalLocation = window.location;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    vi.useFakeTimers();
    sessionStorage.clear();
    // checkout/init is redirect-oriented (D1): submitCheckout() does a real window.location.href
    // assignment. Stub location so that's observable without it navigating the test environment.
    // @ts-expect-error -- deliberately replacing the read-only `location` for this test only.
    delete window.location;
    window.location = { ...originalLocation, href: 'http://localhost:3000/checkout' } as Location;
  });

  afterEach(() => {
    window.location = originalLocation;
    vi.useRealTimers();
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

  it('checkout/init does not activate Premium locally, and the browser is sent to confirmation_url', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadCheckout();
    const result = await session.submitCheckout();

    expect(result?.confirmationUrl).toContain('checkout=success');
    expect(session.checkoutStatus).toBe('redirecting');
    // Not activated by the init call itself — only a later, backend-confirmed poll can do that.
    expect(session.isPremium).toBe(false);
    expect(session.user?.is_premium).toBe(false);
    expect(window.location.href).toBe(result?.confirmationUrl);
  });

  it('stashes the current accessToken into the one-shot checkout bridge right before redirecting', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadCheckout();
    const tokenBeforeRedirect = session.accessToken;

    await session.submitCheckout();

    expect(sessionStorage.getItem('av_checkout_auth_bridge')).toBe(tokenBeforeRedirect);
    expect(localStorage.getItem('av_checkout_auth_bridge')).toBeNull();
  });

  it('records an init error and keeps Free state, without touching the bridge', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadCheckout();
    vi.spyOn(apiClient, 'checkout').mockRejectedValueOnce(new Error('CHECKOUT_FAILED'));

    const result = await session.submitCheckout();

    expect(result).toBeNull();
    expect(session.checkoutStatus).toBe('error');
    expect(session.checkoutError).toBeTruthy();
    expect(session.isPremium).toBe(false);
    expect(sessionStorage.getItem('av_checkout_auth_bridge')).toBeNull();
  });

  it('sets processing while checkout/init is in flight, then redirecting once it resolves', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadCheckout();

    let release: () => void = () => {};
    const pending = new Promise<Awaited<ReturnType<typeof apiClient.checkout>>>((resolve) => {
      release = () =>
        resolve({
          paymentId: 'pay_1',
          confirmationUrl: 'http://backend.example/mock-pay/pay_1',
          amountRub: 1,
          description: 'Пробный период',
        });
    });
    vi.spyOn(apiClient, 'checkout').mockReturnValue(pending);

    const submitPromise = session.submitCheckout();
    expect(session.checkoutStatus).toBe('processing');
    release();
    await submitPromise;
    expect(session.checkoutStatus).toBe('redirecting');
  });

  it('does not send a second checkout request while processing', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadCheckout();

    let release: () => void = () => {};
    const pending = new Promise<Awaited<ReturnType<typeof apiClient.checkout>>>((resolve) => {
      release = () =>
        resolve({
          paymentId: 'pay_1',
          confirmationUrl: 'http://backend.example/mock-pay/pay_1',
          amountRub: 1,
          description: 'Пробный период',
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

  it('does not submit a second payment once Premium is confirmed active', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadCheckout();
    await session.submitCheckout();
    // MockApiClient confirms the mock "webhook" after its activation delay (see MockApiClient.spec.ts).
    await vi.advanceTimersByTimeAsync(800);
    await session.loadCurrentUser();
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
  const originalLocation = window.location;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    vi.useFakeTimers();
    // submitCheckout() below does a real window.location.href assignment (D1) — stub it so the
    // test environment isn't actually navigated.
    // @ts-expect-error -- deliberately replacing the read-only `location` for this test only.
    delete window.location;
    window.location = { ...originalLocation, href: 'http://localhost:3000/checkout' } as Location;
  });

  afterEach(() => {
    window.location = originalLocation;
    vi.useRealTimers();
  });

  async function loginAsTrialPremium() {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadCheckout();
    await session.submitCheckout();
    // MockApiClient confirms the mock "webhook" after its activation delay (see MockApiClient.spec.ts);
    // loadProfile() (not loadCurrentUser()) so subscription is populated too, like the real return flow.
    await vi.advanceTimersByTimeAsync(800);
    await session.loadProfile();
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

describe('sessionStore email+password auth (register/login/forgot/reset)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('registerWithPassword logs the user in immediately, reusing applySession like OAuth', async () => {
    const session = useSessionStore();
    const ok = await session.registerWithPassword('new-student@example.com', 'a-strong-pass', 'Ученик');

    expect(ok).toBe(true);
    expect(session.isAuthenticated).toBe(true);
    expect(session.user?.email).toBe('new-student@example.com');
    expect(session.authError).toBeNull();
    expect(session.authLoading).toBe(false);
  });

  it('registerWithPassword surfaces EMAIL_ALREADY_REGISTERED as a specific message, not a crash', async () => {
    const session = useSessionStore();
    const ok = await session.registerWithPassword(MOCK_PASSWORD_TEST_EMAIL, 'a-strong-pass', 'Ученик');

    expect(ok).toBe(false);
    expect(session.isAuthenticated).toBe(false);
    expect(session.authErrorCode).toBe('EMAIL_ALREADY_REGISTERED');
    expect(session.authError).toBeTruthy();
  });

  it('loginWithPassword logs in with the documented test credentials', async () => {
    const session = useSessionStore();
    const ok = await session.loginWithPassword(MOCK_PASSWORD_TEST_EMAIL, MOCK_PASSWORD_TEST_PASSWORD);

    expect(ok).toBe(true);
    expect(session.isAuthenticated).toBe(true);
    expect(session.user?.email).toBe(MOCK_PASSWORD_TEST_EMAIL);
  });

  it('loginWithPassword with a wrong password shows one undifferentiated message, not user-existence info', async () => {
    const session = useSessionStore();
    const ok = await session.loginWithPassword(MOCK_PASSWORD_TEST_EMAIL, 'wrong-password');

    expect(ok).toBe(false);
    expect(session.isAuthenticated).toBe(false);
    expect(session.authErrorCode).toBe('INVALID_CREDENTIALS');
    expect(session.authError).toBe('Неверный email или пароль.');
  });

  it('loginWithPassword with an unknown email shows the exact same message as a wrong password', async () => {
    const session = useSessionStore();
    await session.loginWithPassword('nobody@example.com', MOCK_PASSWORD_TEST_PASSWORD);
    const unknownEmailMessage = session.authError;

    setActivePinia(createPinia());
    const session2 = useSessionStore();
    await session2.loginWithPassword(MOCK_PASSWORD_TEST_EMAIL, 'wrong-password');

    expect(unknownEmailMessage).toBe(session2.authError);
  });

  it('requestPasswordReset always reaches the neutral "sent" status, regardless of the email', async () => {
    const session = useSessionStore();
    await session.requestPasswordReset('nobody@example.com');
    expect(session.forgotStatus).toBe('sent');

    setActivePinia(createPinia());
    const session2 = useSessionStore();
    await session2.requestPasswordReset(MOCK_PASSWORD_TEST_EMAIL);
    expect(session2.forgotStatus).toBe('sent');
  });

  it('requestPasswordReset surfaces RATE_LIMITED as a distinct status, not the generic error', async () => {
    const session = useSessionStore();
    vi.spyOn(apiClient, 'requestPasswordReset').mockRejectedValueOnce(new Error('RATE_LIMITED'));

    await session.requestPasswordReset('someone@example.com');

    expect(session.forgotStatus).toBe('rate-limited');
  });

  it('resetForgotStatus resets forgotStatus back to idle', async () => {
    const session = useSessionStore();
    await session.requestPasswordReset('someone@example.com');
    expect(session.forgotStatus).toBe('sent');

    session.resetForgotStatus();

    expect(session.forgotStatus).toBe('idle');
  });

  it('resetPasswordWithToken succeeds with the fixed mock-valid token and does NOT auto-login', async () => {
    const session = useSessionStore();
    const ok = await session.resetPasswordWithToken(MOCK_VALID_RESET_TOKEN, 'brand-new-pass');

    expect(ok).toBe(true);
    expect(session.resetStatus).toBe('success');
    expect(session.isAuthenticated).toBe(false);
    expect(session.accessToken).toBeNull();
  });

  it('resetPasswordWithToken with any other token → INVALID_OR_EXPIRED_TOKEN, specific message', async () => {
    const session = useSessionStore();
    const ok = await session.resetPasswordWithToken('garbage-token', 'brand-new-pass');

    expect(ok).toBe(false);
    expect(session.resetStatus).toBe('error');
    expect(session.resetError).toBeTruthy();
  });

  it('logout clears all email+password auth state', async () => {
    const session = useSessionStore();
    await session.loginWithPassword(MOCK_PASSWORD_TEST_EMAIL, 'wrong-password');
    await session.requestPasswordReset('someone@example.com');

    session.logout();

    expect(session.authError).toBeNull();
    expect(session.authErrorCode).toBeNull();
    expect(session.forgotStatus).toBe('idle');
    expect(session.resetStatus).toBe('idle');
    expect(session.resetError).toBeNull();
  });
});

describe('sessionStore login methods (identities)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
  });

  it('loadIdentities pulls the current list from the API', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadIdentities();
    expect(session.identities.map((i) => i.type)).toEqual(['yandex']);
    expect(session.identitiesError).toBeNull();
  });

  it('linkPassword adds a password identity and clears any prior error', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    const ok = await session.linkPassword('me@example.com', 'secret-password-1');
    expect(ok).toBe(true);
    expect(session.identities.map((i) => i.type).sort()).toEqual(['password', 'yandex']);
  });

  it('linkPassword surfaces EMAIL_ALREADY_REGISTERED as a specific message, not a crash', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadIdentities();
    const ok = await session.linkPassword('taken@example.com', 'secret-password-1');
    expect(ok).toBe(false);
    expect(session.identitiesError).toMatch(/другим аккаунтом/);
    expect(session.identities.map((i) => i.type)).toEqual(['yandex']); // список не тронут
  });

  it('unlinkIdentity refuses the last identity with a specific message', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadIdentities();
    const ok = await session.unlinkIdentity('yandex');
    expect(ok).toBe(false);
    expect(session.identitiesError).toMatch(/единственный способ/);
    expect(session.identities.map((i) => i.type)).toEqual(['yandex']);
  });

  it('unlinkIdentity removes one of two', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.linkPassword('me@example.com', 'secret-password-1');
    const ok = await session.unlinkIdentity('yandex');
    expect(ok).toBe(true);
    expect(session.identities.map((i) => i.type)).toEqual(['password']);
  });

  it('logout wipes identities state', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadIdentities();
    session.logout();
    expect(session.identities).toEqual([]);
    expect(session.identitiesError).toBeNull();
  });

  it('linkWithProvider degrades gracefully against MockApiClient (no OAuth link backend)', async () => {
    const session = useSessionStore();
    await session.loginWithProvider('yandex');
    await session.loadIdentities();
    await session.linkWithProvider('vk');
    // MockApiClient не реализует OAuth-привязку — понятное сообщение, без исключения
    expect(session.identitiesError).toBeTruthy();
    expect(session.identities.map((i) => i.type)).toEqual(['yandex']);
  });
});
