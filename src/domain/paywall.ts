import type { PremiumOffer, Subscription, SubscriptionStatus } from '../api/types';

export type PaywallKind = 'loading' | 'error' | 'free' | 'premium';

export function formatPremiumPriceLine(offer: PremiumOffer): string {
  return `${offer.trial_days} дня за ${offer.trial_price_rub} ₽ → ${offer.monthly_price_rub} ₽/мес`;
}

export function paywallKind(input: {
  loading: boolean;
  error: string | null;
  isPremium: boolean;
  hasOffer: boolean;
}): PaywallKind {
  if (input.loading && !input.hasOffer) return 'loading';
  if (input.error && !input.hasOffer) return 'error';
  if (input.isPremium) return 'premium';
  return 'free';
}

export function paywallPrimaryCta(kind: Extract<PaywallKind, 'free' | 'premium'>): {
  label: string;
  to: { name: 'checkout' | 'dashboard' };
} {
  if (kind === 'premium') {
    return { label: 'На главную', to: { name: 'dashboard' } };
  }
  return { label: 'Подключить Premium', to: { name: 'checkout' } };
}

export function showsPurchaseCta(kind: PaywallKind): boolean {
  return kind === 'free';
}

export function premiumActiveHeadline(subscription: Subscription | null): string {
  if (subscription?.status === 'trialing') return 'Пробный период активен';
  return 'Premium уже активен';
}

export function subscriptionStatusLabel(status: SubscriptionStatus): string {
  if (status === 'trialing') return 'Пробный период';
  if (status === 'active') return 'Активна';
  if (status === 'cancelled') return 'Отменена';
  return 'Просрочен платёж';
}

/** Formats an ISO `YYYY-MM-DD` (`paid_until`) as a localized Russian date, e.g. "4 сентября 2026". */
export function formatRuDate(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}
