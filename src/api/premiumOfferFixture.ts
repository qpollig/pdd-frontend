import type { PremiumOffer } from './types';

/** ТЗ §3.5 PricingCard: 3 дня за 1 ₽ → 299 ₽/мес, автопродление. */
export const MOCK_PREMIUM_OFFER: PremiumOffer = {
  plan: 'trial_1rub_299',
  trial_price_rub: 1,
  trial_days: 3,
  monthly_price_rub: 299,
  auto_renew: true,
};
