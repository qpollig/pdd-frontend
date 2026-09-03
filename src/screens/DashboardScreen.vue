<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import LivesCounter from '../components/dashboard/LivesCounter.vue';
import ProgressWidget from '../components/dashboard/ProgressWidget.vue';
import AppButton from '../components/ui/AppButton.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import AppSpinner from '../components/ui/AppSpinner.vue';
import { useCatalogStore } from '../stores/catalogStore';
import { useSessionStore } from '../stores/sessionStore';
import { useTicketStore } from '../stores/ticketStore';

/**
 * Frontend constant: full official ГИБДД question bank (40 tickets × 20 questions).
 * Not from openapi.json — there is no bank-size endpoint; this is a fixed domain fact (ТЗ §3.1).
 */
const BANK_QUESTION_TOTAL = 800;

const session = useSessionStore();
const catalog = useCatalogStore();
const ticketStore = useTicketStore();
const router = useRouter();

onMounted(() => {
  void session.loadCurrentUser();
  if (catalog.tickets.length === 0) {
    void catalog.loadCatalog();
  }
});

const loading = computed(() => session.loading || catalog.loading);
const loadError = computed(() => session.error || catalog.error);
/** UserOut + catalog (GET /topics) are the two real sources Dashboard renders from. */
const ready = computed(() => Boolean(session.user) && catalog.tickets.length > 0);

function startQuick() {
  const ticketId = catalog.tickets[0]?.id;
  if (!ticketId) return;
  void router.push({ name: 'ticket-session', params: { ticketId }, query: { mode: 'theory' } });
}

function openTheory() {
  void router.push({ name: 'tickets', query: { mode: 'theory' } });
}

function openErrors() {
  void router.push({ name: 'errors-session', query: { mode: 'errors' } });
}

function openExam() {
  void router.push({ name: 'exam-gibdd' });
}

/**
 * Frontend-derived, session-only: openapi.json has no per-ticket progress endpoint, so this comes
 * from ticketStore's in-memory session progress (same source StatisticsScreen uses) rather than a
 * fabricated backend counter. Resets on reload/logout.
 */
const ticketsTotal = computed(() => catalog.tickets.length);
const ticketsCompleted = computed(
  () => catalog.tickets.filter((ticket) => ticketStore.isTicketComplete(ticket.id)).length,
);
const questionsAnswered = computed(() =>
  Object.keys(ticketStore.progress).reduce((sum, id) => sum + ticketStore.getTicketStats(id).answered, 0),
);

const ticketsPercent = computed(() => {
  if (ticketsTotal.value <= 0) return 0;
  return Math.min(100, Math.round((ticketsCompleted.value / ticketsTotal.value) * 100));
});
</script>

<template>
  <div>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold sm:text-2xl">Главная</h1>
        <p class="mt-1 text-sm text-text-secondary">Сервис подготовки к экзамену ПДД</p>
      </div>
      <p
        v-if="session.user"
        class="rounded-pill border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary"
      >
        {{ session.user.name ?? '—' }} ·
        <span class="font-semibold text-text-primary">{{
          session.user.is_premium ? 'Premium' : 'Free'
        }}</span>
      </p>
    </div>

    <AppSpinner v-if="loading && !ready" />
    <ErrorState v-else-if="loadError && !ready" title="Ошибка загрузки" :description="loadError" />
    <div v-else-if="ready && session.user" class="mt-6 space-y-6">
      <section class="relative overflow-hidden rounded-card border border-border bg-surface p-6 sm:p-8">
        <svg
          class="pointer-events-none absolute -right-8 -top-8 hidden h-52 w-52 text-accent/15 sm:block"
          viewBox="0 0 200 200"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="100" cy="100" r="88" stroke="currentColor" stroke-width="16" />
          <circle cx="100" cy="100" r="16" fill="currentColor" />
          <path
            d="M100 32v50M100 118v50M32 100h50M118 100h50"
            stroke="currentColor"
            stroke-width="14"
            stroke-linecap="round"
          />
        </svg>
        <div class="relative max-w-md">
          <h2 class="text-lg font-semibold sm:text-xl">Готовы продолжить подготовку?</h2>
          <p class="mt-1 text-sm text-text-secondary">
            Вопросы билета — с мгновенной проверкой и пояснением к каждому ответу.
          </p>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <AppButton class="w-full sm:w-auto" @click="startQuick">Начать обучение</AppButton>
            <AppButton variant="ghost" class="w-full sm:w-auto" @click="openTheory">Билеты</AppButton>
          </div>
        </div>
      </section>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ProgressWidget :current="questionsAnswered" :total="BANK_QUESTION_TOTAL" />
        <LivesCounter
          :current="session.user.lives_current"
          :max="session.user.lives_max"
          :is-premium="session.user.is_premium"
        />
        <section class="rounded-card border border-border bg-surface p-5">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-medium text-text-secondary">Билеты</h2>
            <span class="text-xs font-semibold tabular-nums text-text-secondary">{{ ticketsPercent }}%</span>
          </div>
          <p class="mt-1 text-2xl font-semibold tabular-nums">
            {{ ticketsCompleted }}<span class="text-base font-normal text-text-secondary">
              / {{ ticketsTotal }}</span
            >
          </p>
          <div class="mt-3 h-2 w-full overflow-hidden rounded-pill bg-surface-muted" role="presentation">
            <div
              class="h-full rounded-pill bg-accent transition-[width] duration-500 ease-out"
              :style="{ width: `${ticketsPercent}%` }"
            />
          </div>
          <p class="mt-2 text-xs text-text-secondary">Пройдено билетов из общего набора</p>
        </section>
      </div>

      <section>
        <h2 class="text-sm font-medium text-text-secondary">Другие режимы</h2>
        <div class="mt-3 flex flex-col gap-3 sm:flex-row">
          <AppButton variant="secondary" class="w-full sm:w-auto" @click="openErrors">
            <svg viewBox="0 0 24 24" class="mr-2 h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M3 12a9 9 0 1 1 2.64 6.36" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M3 20v-5h5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Ошибки
          </AppButton>
          <AppButton variant="secondary" class="w-full sm:w-auto" @click="openExam">
            <svg viewBox="0 0 24 24" class="mr-2 h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2.5 2.5" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M9 2h6" stroke-linecap="round" />
            </svg>
            Экзамен ГИБДД
          </AppButton>
        </div>
      </section>

      <section
        v-if="!session.user.is_premium"
        class="flex flex-col items-start gap-4 rounded-card border border-accent/30 bg-accent/10 p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-start gap-3">
          <span
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-text-on-accent"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke-linecap="round" />
            </svg>
          </span>
          <p class="text-sm text-text-primary">
            Premium снимает лимит жизней и открывает 3D-видеоразборы.
          </p>
        </div>
        <AppButton class="w-full sm:w-auto" @click="router.push('/paywall')">
          Получить Premium-доступ
        </AppButton>
      </section>
    </div>
  </div>
</template>
