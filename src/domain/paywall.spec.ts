import { describe, expect, it } from 'vitest';
import type { PremiumOffer, Subscription } from '../api/types';
import {
  formatPremiumPriceLine,
  paywallKind,
  paywallPrimaryCta,
  premiumActiveHeadline,
  showsPurchaseCta,
  subscriptionStatusLabel,
} from './paywall';

const offer: PremiumOffer = {
  plan: 'trial_1rub_299',
  trial_price_rub: 1,
  trial_days: 3,
  monthly_price_rub: 299,
  auto_renew: true,
};

describe('paywall presentation', () => {
  it('formats TZ §3.5 trial then monthly price', () => {
    expect(formatPremiumPriceLine(offer)).toBe('3 дня за 1 ₽ → 299 ₽/мес');
  });

  it('is loading until offer arrives', () => {
    expect(
      paywallKind({ loading: true, error: null, isPremium: false, hasOffer: false }),
    ).toBe('loading');
  });

  it('is error when load failed and there is no offer', () => {
    expect(
      paywallKind({
        loading: false,
        error: 'Не удалось загрузить данные',
        isPremium: false,
        hasOffer: false,
      }),
    ).toBe('error');
  });

  it('is free for a non-premium user with an offer', () => {
    expect(
      paywallKind({ loading: false, error: null, isPremium: false, hasOffer: true }),
    ).toBe('free');
  });

  it('is premium when the user already has Premium', () => {
    expect(
      paywallKind({ loading: false, error: null, isPremium: true, hasOffer: true }),
    ).toBe('premium');
  });

  it('sends free CTA to checkout and premium CTA to dashboard', () => {
    expect(paywallPrimaryCta('free')).toEqual({
      label: 'Подключить Premium',
      to: { name: 'checkout' },
    });
    expect(paywallPrimaryCta('premium')).toEqual({
      label: 'На главную',
      to: { name: 'dashboard' },
    });
    expect(showsPurchaseCta('free')).toBe(true);
    expect(showsPurchaseCta('premium')).toBe(false);
    expect(showsPurchaseCta('loading')).toBe(false);
    expect(showsPurchaseCta('error')).toBe(false);
  });

  it('labels trialing vs active subscription without a purchase CTA', () => {
    const trial: Subscription = {
      id: '00000000-0000-4000-8000-000000000300',
      status: 'trialing',
      auto_renew: true,
      paid_until: '2026-09-04',
      price_rub: 299,
    };
    const active: Subscription = { ...trial, status: 'active' };
    expect(premiumActiveHeadline(trial)).toBe('Пробный период активен');
    expect(premiumActiveHeadline(active)).toBe('Premium уже активен');
  });

  it('labels subscription status in plain Russian, not raw API values', () => {
    expect(subscriptionStatusLabel('trialing')).toBe('Пробный период');
    expect(subscriptionStatusLabel('active')).toBe('Активна');
    expect(subscriptionStatusLabel('cancelled')).toBe('Отменена');
    expect(subscriptionStatusLabel('past_due')).toBe('Просрочен платёж');
  });
});
