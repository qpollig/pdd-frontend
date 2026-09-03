<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import PricingCard from '../components/paywall/PricingCard.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppSpinner from '../components/ui/AppSpinner.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import {
  paywallKind,
  paywallPrimaryCta,
  premiumActiveHeadline,
  showsPurchaseCta,
} from '../domain/paywall';
import { useSessionStore } from '../stores/sessionStore';

const session = useSessionStore();
const router = useRouter();

onMounted(() => {
  void session.loadPaywall();
});

const kind = computed(() =>
  paywallKind({
    loading: session.loading,
    error: session.error,
    isPremium: session.isPremium,
    hasOffer: Boolean(session.premiumOffer),
  }),
);

const primaryCta = computed(() => {
  if (kind.value === 'free' || kind.value === 'premium') {
    return paywallPrimaryCta(kind.value);
  }
  return null;
});

const livesCurrent = computed(() => session.user?.lives_current ?? null);
const livesMax = computed(() => session.user?.lives_max ?? null);

function goPrimary() {
  if (!primaryCta.value) return;
  void router.push(primaryCta.value.to);
}
</script>

<template>
  <div class="min-w-0 max-w-xl">
    <AppSpinner v-if="kind === 'loading'" label="Загрузка тарифа" />

    <ErrorState
      v-else-if="kind === 'error'"
      title="Не удалось загрузить Premium"
      :description="session.error ?? undefined"
    >
      <AppButton class="w-full sm:w-auto" @click="session.loadPaywall()">Повторить</AppButton>
    </ErrorState>

    <div v-else-if="kind === 'premium'" class="min-w-0">
      <h1 class="text-xl font-semibold sm:text-2xl">Premium</h1>
      <h2 class="mt-4 text-lg font-semibold leading-snug">
        {{ premiumActiveHeadline(session.subscription) }}
      </h2>
      <p class="mt-3 text-sm leading-relaxed text-text-secondary">
        Бесконечные жизни уже действуют в этом аккаунте. 3D-видеоразборы появятся отдельным
        обновлением — видео пока не воспроизводится. Повторно подключать тариф не нужно.
      </p>
      <p
        v-if="session.subscription?.status === 'trialing' || session.subscription?.status === 'active'"
        class="mt-3 text-sm text-text-secondary"
      >
        Статус:
        {{ session.subscription.status === 'trialing' ? 'пробный период' : 'активная подписка' }}.
        Оплачено до:
        {{ session.subscription.paid_until }}.
      </p>
      <AppButton class="mt-6 w-full sm:w-auto" @click="goPrimary">
        {{ primaryCta?.label }}
      </AppButton>
    </div>

    <div v-else-if="kind === 'free' && session.premiumOffer" class="min-w-0">
      <h1 class="text-xl font-semibold sm:text-2xl">Premium</h1>
      <h2 class="mt-4 text-lg font-semibold leading-snug sm:text-xl">
        Premium: без ограничений по жизням
      </h2>
      <p class="mt-3 max-w-prose text-sm leading-relaxed text-text-secondary">
        Бесплатно можно решать билеты, пока есть жизни. Premium снимает этот лимит; 3D-разборы
        сложных ситуаций добавятся отдельно.
      </p>

      <div class="mt-5 min-w-0">
        <PricingCard :offer="session.premiumOffer" />
      </div>

      <AppButton
        v-if="showsPurchaseCta(kind)"
        class="mt-4 w-full sm:w-auto"
        data-testid="paywall-purchase-cta"
        @click="goPrimary"
      >
        {{ primaryCta?.label }}
      </AppButton>
      <p class="mt-3 text-sm leading-relaxed text-text-secondary">
        Оплата на этом экране не списывается. Дальше откроется оформление: пробный период
        {{ session.premiumOffer.trial_days }} дня за {{ session.premiumOffer.trial_price_rub }} ₽,
        затем {{ session.premiumOffer.monthly_price_rub }} ₽ в месяц с автопродлением.
      </p>

      <ul class="mt-8 space-y-3 text-sm leading-relaxed">
        <li class="flex min-w-0 items-start gap-2.5 break-words">
          <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0 text-correct" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
            <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Полное соответствие регламенту ГИБДД 2026
        </li>
        <li class="flex min-w-0 items-start gap-2.5 break-words">
          <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0 text-correct" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
            <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          3D-видеоразборы каверзных ситуаций на дорогах — скоро
        </li>
        <li class="flex min-w-0 items-start gap-2.5 break-words">
          <svg viewBox="0 0 24 24" class="mt-0.5 h-4 w-4 shrink-0 text-correct" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
            <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Бесконечные жизни: ответы не блокируются на нуле
        </li>
      </ul>

      <div class="mt-6 grid gap-3 sm:grid-cols-2">
        <section class="min-w-0 rounded-card border border-border bg-surface p-4" aria-label="Что доступно сейчас">
          <div class="flex items-center gap-2">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-text-secondary" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke-linecap="round" />
              </svg>
            </span>
            <h3 class="text-base font-semibold">Сейчас на Free</h3>
          </div>
          <p class="mt-2 text-sm leading-relaxed text-text-secondary">
            Теория, ошибки и экзамен ГИБДД открыты.
            <template v-if="livesCurrent !== null && livesMax !== null">
              Жизней сейчас {{ livesCurrent }} из {{ livesMax }}.
            </template>
            3D-видеоразбор закрыт замком.
          </p>
        </section>

        <section class="min-w-0 rounded-card border border-accent/30 bg-accent/10 p-4" aria-label="Что изменится после Premium">
          <div class="flex items-center gap-2">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-text-on-accent" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="3">
                <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <h3 class="text-base font-semibold">После подключения</h3>
          </div>
          <p class="mt-2 text-sm leading-relaxed text-text-primary">
            Жизни перестают ограничивать прохождение. 3D-видеоразборы входят в тариф; само видео пока
            не воспроизводится.
          </p>
        </section>
      </div>

      <div class="mt-6">
        <AppButton variant="ghost" class="w-full sm:w-auto" @click="router.push({ name: 'dashboard' })">
          Назад
        </AppButton>
      </div>

      <p class="mt-6 max-w-prose text-xs leading-relaxed text-text-secondary">
        Подключая Premium, вы соглашаетесь с автопродлением после пробного периода
        {{ session.premiumOffer.trial_days }} дня за {{ session.premiumOffer.trial_price_rub }} ₽:
        далее {{ session.premiumOffer.monthly_price_rub }} ₽ в месяц, пока подписка не будет отменена.
        Условия использования и Политика конфиденциальности — на экране оформления.
      </p>
    </div>
  </div>
</template>
