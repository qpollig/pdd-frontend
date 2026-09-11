<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { TicketCategory } from '../api/types';
import type { Topic } from '../domain/catalog';
import type { TicketProgressStatus } from '../domain/progress';
import ErrorState from '../components/ui/ErrorState.vue';
import AppSpinner from '../components/ui/AppSpinner.vue';
import { useCatalogStore } from '../stores/catalogStore';
import { useProgressStore } from '../stores/progressStore';

const catalog = useCatalogStore();
const progress = useProgressStore();
const route = useRoute();
const router = useRouter();
const sessionQuery = computed(() => ({ mode: (route.query.mode as string) || 'theory' }));

/** Reflected in the URL so a reload or shared link keeps the chosen grouping (§ Navigation & State). */
const group = computed<'number' | 'topic'>(() => (route.query.group === 'topic' ? 'topic' : 'number'));

function setGroup(next: 'number' | 'topic') {
  void router.replace({ query: { ...route.query, group: next } });
}

/**
 * `:key="route.path"` on the parent RouterView (AppLayout.vue) already remounts this screen on every
 * navigation — including a return from a ticket session — so onMounted alone re-fetches progress
 * without any extra onActivated/keep-alive plumbing.
 */
onMounted(() => {
  void catalog.loadCatalog();
  void progress.loadProgress();
});

function categoryLabel(category: TicketCategory): string {
  return category === 'A_B' ? 'A, B' : 'C, D';
}

const TICKET_STATUS_LABELS: Record<TicketProgressStatus, string> = {
  passed: 'пройден без ошибок',
  in_progress: 'начат, не завершён',
  failed: 'пройден с ошибками',
  not_started: 'не начат',
};

/** in_progress and failed share red styling — both mean "needs another attempt" to the learner. */
function ticketStatusClasses(ticketId: string): string {
  const status = progress.ticketStatus(ticketId);
  if (status === 'passed') return 'border-correct bg-correct/10 hover:border-correct';
  if (status === 'not_started') return 'border-border bg-surface hover:border-accent';
  return 'border-incorrect bg-incorrect/10 hover:border-incorrect';
}

function ticketAriaLabel(ticket: { number: number; id: string }): string {
  return `Билет ${ticket.number} — ${TICKET_STATUS_LABELS[progress.ticketStatus(ticket.id)]}`;
}

function topicPercent(topic: Topic): number {
  const { passed } = progress.topicProgress(topic.id);
  if (topic.questionsCount <= 0) return 0;
  return Math.min(100, Math.round((passed / topic.questionsCount) * 100));
}
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold sm:text-2xl">Билеты</h1>
    <p class="mt-1 text-sm text-text-secondary">Выбор билета или темы · без ограничения времени</p>

    <div
      class="mt-4 inline-flex gap-0.5 rounded-pill border border-border bg-surface p-0.5"
      role="group"
      aria-label="Способ группировки билетов"
    >
      <button
        type="button"
        class="min-h-9 rounded-pill px-3.5 py-1.5 text-sm font-medium outline-none transition duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
        :class="group === 'number' ? 'bg-accent text-text-on-accent' : 'text-text-secondary hover:text-text-primary'"
        :aria-pressed="group === 'number'"
        @click="setGroup('number')"
      >
        По номерам
      </button>
      <button
        type="button"
        class="min-h-9 rounded-pill px-3.5 py-1.5 text-sm font-medium outline-none transition duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
        :class="group === 'topic' ? 'bg-accent text-text-on-accent' : 'text-text-secondary hover:text-text-primary'"
        :aria-pressed="group === 'topic'"
        @click="setGroup('topic')"
      >
        По темам
      </button>
    </div>

    <AppSpinner v-if="catalog.loading && catalog.tickets.length === 0" />
    <ErrorState v-else-if="catalog.error" title="Ошибка" :description="catalog.error" />

    <template v-else-if="group === 'number'">
      <ul class="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-text-secondary">
        <li class="flex items-center gap-1.5">
          <span class="h-2.5 w-2.5 rounded-full bg-correct" aria-hidden="true" />
          Пройден без ошибок
        </li>
        <li class="flex items-center gap-1.5">
          <span class="h-2.5 w-2.5 rounded-full bg-incorrect" aria-hidden="true" />
          Есть ошибки или не завершён
        </li>
        <li class="flex items-center gap-1.5">
          <span class="h-2.5 w-2.5 rounded-full border border-border" aria-hidden="true" />
          Не начат
        </li>
      </ul>

      <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <li v-for="ticket in catalog.tickets" :key="ticket.id">
          <RouterLink
            :to="{ name: 'ticket-session', params: { ticketId: ticket.id }, query: sessionQuery }"
            :aria-label="ticketAriaLabel(ticket)"
            class="block rounded-card border p-4 transition duration-200 ease-out hover:shadow-sm"
            :class="ticketStatusClasses(ticket.id)"
          >
            <p class="font-semibold">Билет {{ ticket.number }}</p>
            <p class="mt-1 text-xs text-text-secondary">{{ categoryLabel(ticket.category) }}</p>
            <p
              class="mt-1 text-xs font-medium"
              :class="{ invisible: progress.ticketStatus(ticket.id) === 'not_started' }"
              aria-hidden="true"
            >
              {{ TICKET_STATUS_LABELS[progress.ticketStatus(ticket.id)] }}
            </p>
          </RouterLink>
        </li>
      </ul>
    </template>

    <ul v-else class="mt-6 grid gap-3 sm:grid-cols-2">
      <li v-for="topic in catalog.topics" :key="topic.id">
        <RouterLink
          :to="{ name: 'topic-session', params: { topicId: topic.id } }"
          class="block rounded-card border border-border bg-surface p-4 hover:border-accent"
        >
          <p class="font-semibold">{{ topic.title }}</p>
          <p class="mt-1 text-xs text-text-secondary">
            {{ progress.topicProgress(topic.id).passed }} / {{ topic.questionsCount }}
          </p>
          <div class="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-surface-muted" role="presentation">
            <div
              class="h-full origin-left rounded-pill bg-accent transition-transform duration-500 ease-out"
              :style="{ transform: `scaleX(${topicPercent(topic) / 100})` }"
            />
          </div>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
