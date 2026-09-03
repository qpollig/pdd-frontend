<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppButton from '../components/ui/AppButton.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import AppSpinner from '../components/ui/AppSpinner.vue';
import CancelSubscriptionModal from '../components/profile/CancelSubscriptionModal.vue';
import { useSessionStore } from '../stores/sessionStore';
import { subscriptionStatusLabel } from '../domain/paywall';

const session = useSessionStore();
const router = useRouter();

onMounted(() => {
  void session.loadProfile();
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
const paidUntilText = computed(() => session.subscription?.paid_until ?? '—');

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
    <div v-else-if="session.user" class="mt-6 max-w-lg space-y-4">
      <section class="rounded-card border border-border bg-surface p-5">
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
      <section class="rounded-card border border-border bg-surface p-5">
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
      <div class="flex flex-col gap-3 sm:flex-row">
        <AppButton class="w-full sm:w-auto" @click="router.push('/paywall')">Premium</AppButton>
        <AppButton variant="secondary" class="w-full sm:w-auto" @click="logout">Выйти</AppButton>
      </div>
    </div>
    <CancelSubscriptionModal
      :open="showCancelModal"
      :status="cancelModalStatus"
      :error-message="session.cancelError"
      :subscription-end-date="session.subscription?.paid_until"
      @close="closeCancelModal"
      @confirm="confirmCancelAutoRenew"
    />
  </div>
</template>
