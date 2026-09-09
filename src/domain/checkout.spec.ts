import { describe, expect, it } from 'vitest';
import type { PremiumOffer } from '../api/types';
import { canSubmitCheckout, checkoutKind, checkoutPayLabel } from './checkout';

const offer: PremiumOffer = {
  plan: 'trial_1rub_299',
  trial_price_rub: 1,
  trial_days: 3,
  monthly_price_rub: 299,
  auto_renew: true,
};

describe('checkout presentation', () => {
  it('starts idle when offer is loaded for a free user', () => {
    expect(
      checkoutKind({
        loading: false,
        loadError: null,
        isPremium: false,
        hasOffer: true,
        checkoutStatus: 'idle',
      }),
    ).toBe('idle');
  });

  it('is processing while checkout/init is in flight', () => {
    expect(
      checkoutKind({
        loading: false,
        loadError: null,
        isPremium: false,
        hasOffer: true,
        checkoutStatus: 'processing',
      }),
    ).toBe('processing');
  });

  it('is redirecting once confirmation_url is known, right before the browser navigates away', () => {
    expect(
      checkoutKind({
        loading: false,
        loadError: null,
        isPremium: false,
        hasOffer: true,
        checkoutStatus: 'redirecting',
      }),
    ).toBe('redirecting');
  });

  it('is already-premium when the user already has Premium', () => {
    expect(
      checkoutKind({
        loading: false,
        loadError: null,
        isPremium: true,
        hasOffer: true,
        checkoutStatus: 'idle',
      }),
    ).toBe('already-premium');
  });

  it('prefers already-premium over redirecting if isPremium flips mid-flow', () => {
    expect(
      checkoutKind({
        loading: false,
        loadError: null,
        isPremium: true,
        hasOffer: true,
        checkoutStatus: 'redirecting',
      }),
    ).toBe('already-premium');
  });

  it('is payment-error after checkout/init fails', () => {
    expect(
      checkoutKind({
        loading: false,
        loadError: null,
        isPremium: false,
        hasOffer: true,
        checkoutStatus: 'error',
      }),
    ).toBe('payment-error');
  });

  it('allows submit only from idle or payment-error', () => {
    expect(canSubmitCheckout('idle')).toBe(true);
    expect(canSubmitCheckout('payment-error')).toBe(true);
    expect(canSubmitCheckout('processing')).toBe(false);
    expect(canSubmitCheckout('redirecting')).toBe(false);
    expect(canSubmitCheckout('already-premium')).toBe(false);
  });

  it('labels the CTA with the TZ trial price', () => {
    expect(checkoutPayLabel(offer)).toBe('Оплатить 1 ₽');
  });
});
