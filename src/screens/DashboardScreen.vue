<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import LivesCounter from '../components/dashboard/LivesCounter.vue';
import ProgressWidget from '../components/dashboard/ProgressWidget.vue';
import AppButton from '../components/ui/AppButton.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import AppSpinner from '../components/ui/AppSpinner.vue';
import { useCatalogStore } from '../stores/catalogStore';
import { useProgressStore } from '../stores/progressStore';
import { useSessionStore } from '../stores/sessionStore';
import { fadeUp, staggerDelay } from '../motion/variants';

const session = useSessionStore();
const catalog = useCatalogStore();
const progress = useProgressStore();
const router = useRouter();

/**
 * `:key="route.path"` on the parent RouterView (AppLayout.vue) remounts this screen on every
 * navigation, including a return from a ticket session, so onMounted alone keeps progress fresh —
 * no onActivated/keep-alive needed.
 */
onMounted(() => {
  void session.loadCurrentUser();
  if (catalog.tickets.length === 0) {
    void catalog.loadCatalog();
  }
  void progress.loadProgress();
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

/** D2: server-computed counters (UserOut.errors_count/favorites_count) drive both the badge and the disabled gate. */
const errorsCount = computed(() => session.user?.errors_count ?? 0);
const favoritesCount = computed(() => session.user?.favorites_count ?? 0);

function openErrors() {
  void router.push({ name: 'errors-session', query: { mode: 'errors' } });
}

function openFavorites() {
  void router.push({ name: 'favorites-session', query: { mode: 'favorites' } });
}

/** GET /api/v1/progress (via progressStore) — server-computed, survives reload. */
const ticketsTotal = computed(() => catalog.tickets.length);
const ticketsCompleted = computed(
  () => catalog.tickets.filter((ticket) => progress.ticketStatus(ticket.id) === 'passed').length,
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
      <section
        v-motion
        :initial="fadeUp().initial"
        :enter="fadeUp().enter"
        class="relative overflow-hidden rounded-card border border-border bg-surface p-6 sm:p-8"
      >
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
          </div>
        </div>
      </section>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ProgressWidget
          v-motion
          :initial="fadeUp().initial"
          :enter="fadeUp(staggerDelay(0)).enter"
          :current="progress.bank.passed"
          :total="progress.bank.total"
        />
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
              class="h-full w-full origin-left rounded-pill bg-accent transition-transform duration-500 ease-out"
              :style="{ transform: `scaleX(${ticketsPercent / 100})` }"
            />
          </div>
          <p class="mt-2 text-xs text-text-secondary">Пройдено билетов из общего набора</p>
        </section>
      </div>

      <section v-motion :initial="fadeUp().initial" :enter="fadeUp(staggerDelay(3)).enter">
        <h2 class="text-sm font-medium text-text-secondary">Другие режимы</h2>
        <div class="mt-3 flex flex-col gap-3 sm:flex-row">
          <AppButton
            variant="secondary"
            class="w-full sm:w-auto"
            :disabled="errorsCount === 0"
            @click="openErrors"
          >
            <svg viewBox="0 0 24 24" class="mr-2 h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M3 12a9 9 0 1 1 2.64 6.36" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M3 20v-5h5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Ошибки
            <span
              v-if="errorsCount > 0"
              class="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold tabular-nums text-text-on-accent"
            >
              {{ errorsCount }}
            </span>
          </AppButton>
          <AppButton
            variant="secondary"
            class="w-full sm:w-auto"
            :disabled="favoritesCount === 0"
            @click="openFavorites"
          >
            <svg viewBox="0 0 24 24" class="mr-2 h-4 w-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path
                d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.8L12 16.9l-5.2 2.62.99-5.8-4.21-4.1 5.82-.85L12 3.5z"
                stroke-linejoin="round"
              />
            </svg>
            Избранное
            <span
              v-if="favoritesCount > 0"
              class="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold tabular-nums text-text-on-accent"
            >
              {{ favoritesCount }}
            </span>
          </AppButton>
        </div>
      </section>

      <section
        v-if="!session.user.is_premium"
        v-motion
        :initial="fadeUp().initial"
        :enter="fadeUp(staggerDelay(4)).enter"
        class="flex flex-col items-center gap-4 rounded-card border border-accent/30 bg-accent/10 p-5 sm:flex-row sm:justify-between"
      >
        <div class="flex items-center gap-3">
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
