<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppButton from '../components/ui/AppButton.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import AppSpinner from '../components/ui/AppSpinner.vue';
import CancelSubscriptionModal from '../components/profile/CancelSubscriptionModal.vue';
import LoginMethodsSection from '../components/profile/LoginMethodsSection.vue';
import LivesCounter from '../components/dashboard/LivesCounter.vue';
import { useSessionStore } from '../stores/sessionStore';
import { useCheckoutReturn } from '../composables/useCheckoutReturn';
import { isCheckoutReturnQuery } from '../domain/checkoutReturn';
import { formatRuDate, subscriptionStatusLabel } from '../domain/paywall';
import { fadeUp, staggerDelay } from '../motion/variants';

const session = useSessionStore();
const router = useRouter();
const route = useRoute();

/**
 * D1: the live backend's BILLING_RETURN_URL lands directly on /profile?checkout=success (see D1
 * report) — there is no dedicated /checkout/return route. `?checkout=success` only means "back
 * from the payment redirect", never proof Premium is active; useCheckoutReturn owns the bounded
 * polling that turns it into a real, backend-confirmed state.
 */
const isCheckoutReturn = computed(() => isCheckoutReturnQuery(route.query.checkout));
const checkoutReturn = useCheckoutReturn({
  checkoutQuery: () => route.query.checkout,
  isPremium: () => session.isPremium,
  refresh: () => session.loadProfile(),
});

onMounted(() => {
  // useCheckoutReturn already drives session.loadProfile() as its own poll — avoid a redundant
  // parallel fetch on the very same mount.
  if (!isCheckoutReturn.value) {
    void session.loadProfile();
  }
});

const showCancelModal = ref(false);

/** ТЗ §4.5 DoD: управление доступно, пока автопродление ещё включено. */
const canManageAutoRenew = computed(
  () => session.isPremium && session.subscription?.auto_renew === true,
);
const cancelJustSucceeded = computed(() => session.cancelStatus === 'success');
const cancelModalStatus = computed<'idle' | 'processing' | 'error'>(() => {
  if (session.cancelStatus === 'processing') return 'processing';
  if (session.cancelStatus === 'error') return 'error';
  return 'idle';
});

function openCancelModal() {
  showCancelModal.value = true;
}

function closeCancelModal() {
  if (session.cancelStatus === 'processing') return;
  showCancelModal.value = false;
}

async function confirmCancelAutoRenew() {
  const result = await session.cancelAutoRenew();
  if (result) {
    showCancelModal.value = false;
  }
}

const initials = computed(() => {
  const name = session.user?.name ?? '';
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '');
  return letters.join('') || '?';
});

const statusToneClass = computed(() => {
  const status = session.subscription?.status;
  if (status === 'active' || status === 'trialing') return 'bg-correct/10 text-correct';
  return 'bg-surface-muted text-text-secondary';
});

/**
 * Free-пользователь у реального backend не имеет SubscriptionOut вовсе (404
 * SUBSCRIPTION_NOT_FOUND, здесь смоделировано как session.subscription === null).
 * "Не активна" — presentation-only fallback для этого случая, не выдуманное значение
 * SubscriptionStatus в самом DTO.
 */
const subscriptionStatusText = computed(() =>
  session.subscription ? subscriptionStatusLabel(session.subscription.status) : 'Не активна',
);
const autoRenewText = computed(() => (session.subscription?.auto_renew ? 'Включено' : 'Выключено'));
const paidUntilText = computed(() =>
  session.subscription?.paid_until ? formatRuDate(session.subscription.paid_until) : '—',
);

function logout() {
  session.logout();
  void router.replace({ name: 'auth' });
}
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold sm:text-2xl">Профиль</h1>
    <AppSpinner v-if="session.loading && !session.user" />
    <ErrorState v-else-if="session.error && !session.user" title="Ошибка" :description="session.error" />
    <div v-else-if="session.user" class="mt-6 space-y-4">
      <div
        v-if="checkoutReturn.status.value === 'checking'"
        class="rounded-card border border-border bg-surface-raised p-4 text-sm"
        role="status"
        data-testid="checkout-return-checking"
      >
        <AppSpinner label="Проверяем оплату" />
      </div>
      <div
        v-else-if="checkoutReturn.status.value === 'success'"
        class="rounded-card border border-correct/30 bg-correct/10 p-4 text-sm font-medium text-correct"
        role="status"
        data-testid="checkout-return-success"
      >
        Premium подключён.
      </div>
      <div
        v-else-if="checkoutReturn.status.value === 'timeout'"
        class="rounded-card border border-border bg-surface-raised p-4 text-sm leading-relaxed"
        data-testid="checkout-return-timeout"
      >
        Платёж обрабатывается. Premium ещё не активирован. Попробуйте обновить страницу позже.
      </div>
      <section
        v-motion
        :initial="fadeUp().initial"
        :enter="fadeUp(staggerDelay(0)).enter"
        class="rounded-card border border-border bg-surface p-5"
      >
        <div class="flex items-center gap-4">
          <span
            class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-semibold text-text-on-accent"
            aria-hidden="true"
          >
            {{ initials }}
          </span>
          <div class="min-w-0">
            <p class="truncate font-semibold">{{ session.user.name ?? '—' }}</p>
            <p
              class="mt-1 inline-flex rounded-pill border border-border bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-text-secondary"
            >
              {{ session.user.is_premium ? 'Premium' : 'Free' }}
            </p>
          </div>
        </div>
      </section>
      <LivesCounter
        v-motion
        :initial="fadeUp().initial"
        :enter="fadeUp(staggerDelay(1)).enter"
        :current="session.user.lives_current"
        :max="session.user.lives_max"
        :is-premium="session.user.is_premium"
        :lives-regen-at="session.user.lives_regen_at"
        @regen-due="session.loadCurrentUser()"
      />
      <section
        v-motion
        :initial="fadeUp().initial"
        :enter="fadeUp(staggerDelay(2)).enter"
        class="rounded-card border border-border bg-surface p-5"
      >
        <h2 class="text-sm font-medium text-text-secondary">Подписка</h2>
        <dl class="mt-3 space-y-2 text-sm">
          <div class="flex items-center justify-between gap-4">
            <dt class="text-text-secondary">Статус</dt>
            <dd>
              <span class="inline-flex rounded-pill px-2.5 py-0.5 text-xs font-semibold" :class="statusToneClass">
                {{ subscriptionStatusText }}
              </span>
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-text-secondary">Автопродление</dt>
            <dd>{{ autoRenewText }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-text-secondary">Оплачено до</dt>
            <dd>{{ paidUntilText }}</dd>
          </div>
        </dl>
        <AppButton
          v-if="canManageAutoRenew"
          variant="secondary"
          class="mt-4 w-full sm:w-auto"
          data-testid="profile-cancel-auto-renew"
          @click="openCancelModal"
        >
          Отключить автопродление
        </AppButton>
        <p
          v-else-if="session.isPremium"
          class="mt-4 text-sm"
          :class="cancelJustSucceeded ? 'text-correct' : 'text-text-secondary'"
          :role="cancelJustSucceeded ? 'status' : undefined"
        >
          {{ cancelJustSucceeded ? 'Автопродление отключено.' : 'Автопродление выключено.' }}
          Premium активен до {{ paidUntilText }}.
        </p>
      </section>
      <LoginMethodsSection
        v-motion
        :initial="fadeUp().initial"
        :enter="fadeUp(staggerDelay(3)).enter"
      />
      <div
        v-motion
        :initial="fadeUp().initial"
        :enter="fadeUp(staggerDelay(4)).enter"
        class="flex flex-col gap-3 sm:flex-row"
      >
        <AppButton v-if="!session.isPremium" class="w-full sm:w-auto" @click="router.push('/paywall')">
          Premium
        </AppButton>
        <AppButton variant="secondary" class="w-full sm:w-auto" @click="logout">Выйти</AppButton>
      </div>
    </div>
    <CancelSubscriptionModal
      :open="showCancelModal"
      :status="cancelModalStatus"
      :error-message="session.cancelError"
      :subscription-end-date="session.subscription?.paid_until ? formatRuDate(session.subscription.paid_until) : null"
      @close="closeCancelModal"
      @confirm="confirmCancelAutoRenew"
    />
  </div>
</template>
