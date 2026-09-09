<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import CheckoutForm from '../components/checkout/CheckoutForm.vue';
import PricingCard from '../components/paywall/PricingCard.vue';
import AppButton from '../components/ui/AppButton.vue';
import AppSpinner from '../components/ui/AppSpinner.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import { canSubmitCheckout, checkoutKind, checkoutPayLabel } from '../domain/checkout';
import { premiumActiveHeadline } from '../domain/paywall';
import { fadeUp } from '../motion/variants';
import { useSessionStore } from '../stores/sessionStore';

const session = useSessionStore();
const router = useRouter();

onMounted(() => {
  void session.loadCheckout();
});

const kind = computed(() =>
  checkoutKind({
    loading: session.loading,
    loadError: session.error,
    isPremium: session.isPremium,
    hasOffer: Boolean(session.premiumOffer),
    checkoutStatus: session.checkoutStatus,
  }),
);

const payDisabled = computed(() => !canSubmitCheckout(kind.value));

async function pay() {
  if (!canSubmitCheckout(kind.value)) return;
  await session.submitCheckout();
}
</script>

<template>
  <div class="min-w-0 max-w-xl">
    <AppSpinner v-if="kind === 'loading'" label="Загрузка оформления" />

    <ErrorState
      v-else-if="kind === 'load-error'"
      title="Не удалось загрузить оформление"
      :description="session.error ?? undefined"
    >
      <AppButton class="w-full sm:w-auto" @click="session.loadCheckout()">Повторить</AppButton>
    </ErrorState>

    <div v-else-if="kind === 'already-premium'" class="min-w-0" data-testid="checkout-already-premium">
      <h1 class="text-xl font-semibold sm:text-2xl">Оформление</h1>
      <h2 class="mt-4 text-lg font-semibold leading-snug">
        {{ premiumActiveHeadline(session.subscription) }}
      </h2>
      <p class="mt-3 text-sm leading-relaxed text-text-secondary">
        Повторно оплачивать Premium не нужно. Доступ уже действует в этом аккаунте.
      </p>
      <AppButton class="mt-6 w-full sm:w-auto" @click="router.push({ name: 'dashboard' })">
        На главную
      </AppButton>
    </div>

    <div v-else-if="kind === 'redirecting'" class="min-w-0" data-testid="checkout-redirecting">
      <h1 class="text-xl font-semibold sm:text-2xl">Оформление</h1>
      <AppSpinner label="Переход к оплате" class="mt-6" />
      <p class="mt-3 text-sm leading-relaxed text-text-secondary">
        Сейчас откроется страница оплаты. После оплаты вы вернётесь обратно и увидите статус
        Premium в профиле.
      </p>
    </div>

    <div v-else-if="session.premiumOffer" class="min-w-0">
      <h1 class="text-xl font-semibold sm:text-2xl">Оформление</h1>

      <div v-motion :initial="fadeUp().initial" :enter="fadeUp().enter" class="mt-4 min-w-0">
        <PricingCard :offer="session.premiumOffer" />
      </div>

      <p
        class="mt-4 break-words rounded-card border border-border bg-surface-raised p-3 text-sm font-medium leading-relaxed"
      >
        После {{ session.premiumOffer.trial_days }} дней за {{ session.premiumOffer.trial_price_rub }} ₽
        будет автоматически списываться {{ session.premiumOffer.monthly_price_rub }} ₽ в месяц, пока
        подписка не будет отменена.
      </p>

      <div v-if="kind === 'payment-error'" class="mt-6" data-testid="checkout-error">
        <ErrorState
          title="Оплата не прошла"
          :description="session.checkoutError ?? undefined"
        />
      </div>

      <div
        v-motion
        :initial="fadeUp().initial"
        :enter="fadeUp(60).enter"
        class="mt-6 min-w-0"
      >
        <CheckoutForm :disabled="payDisabled || kind === 'processing'" @submit="pay">
          <template #default="{ canPay }">
            <AppButton
              class="mt-6 w-full sm:w-auto"
              type="submit"
              data-testid="checkout-pay-cta"
              :disabled="payDisabled || !canPay || kind === 'processing'"
            >
              {{ kind === 'processing' ? 'Оплата…' : checkoutPayLabel(session.premiumOffer) }}
            </AppButton>
          </template>
        </CheckoutForm>
      </div>

      <div class="mt-3">
        <AppButton
          variant="ghost"
          class="w-full sm:w-auto"
          :disabled="kind === 'processing'"
          @click="router.push({ name: 'paywall' })"
        >
          Назад к тарифу
        </AppButton>
      </div>

      <p class="mt-6 max-w-prose break-words text-xs leading-relaxed text-text-secondary">
        Нажимая «{{ checkoutPayLabel(session.premiumOffer) }}», вы соглашаетесь с автопродлением.
        Условия использования и Политика конфиденциальности.
      </p>
    </div>
  </div>
</template>
