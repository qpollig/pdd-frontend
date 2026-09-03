<script setup lang="ts">
import { computed, onMounted } from 'vue';
import EmptyState from '../components/ui/EmptyState.vue';
import { useCatalogStore } from '../stores/catalogStore';
import { useTicketStore } from '../stores/ticketStore';
import {
  ERRORS_SESSION_TICKET_ID,
  EXAM_SESSION_TICKET_ID,
  FAVORITES_SESSION_TICKET_ID,
} from '../types/ticket';
import { fadeUp, staggerDelay } from '../motion/variants';

const ticketStore = useTicketStore();
const catalog = useCatalogStore();
const ticketIds = computed(() => Object.keys(ticketStore.progress));

onMounted(() => {
  if (catalog.tickets.length === 0) {
    void catalog.loadCatalog();
  }
});

function sessionLabel(id: string) {
  if (id === ERRORS_SESSION_TICKET_ID) return 'Ошибки';
  if (id === EXAM_SESSION_TICKET_ID) return 'Экзамен ГИБДД';
  if (id === FAVORITES_SESSION_TICKET_ID) return 'Избранное';
  const ticket = catalog.tickets.find((item) => item.id === id);
  return ticket ? `Билет ${ticket.number}` : 'Билет';
}

function accuracyPercent(id: string) {
  const stats = ticketStore.getTicketStats(id);
  if (stats.answered === 0) return 0;
  return Math.min(100, Math.round((stats.correct / stats.answered) * 100));
}
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold sm:text-2xl">Статистика</h1>
    <p class="mt-2 text-sm text-text-secondary">
      Статистика по билетам, ошибкам и экзамену, пройденным в этой сессии.
    </p>
    <ul v-if="ticketIds.length" class="mt-6 space-y-3">
      <li
        v-for="(id, index) in ticketIds"
        :key="id"
        v-motion
        :initial="fadeUp().initial"
        :enter="fadeUp(staggerDelay(index)).enter"
        class="rounded-card border border-border bg-surface p-4"
      >
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-medium">{{ sessionLabel(id) }}</p>
          <p class="text-sm font-semibold tabular-nums text-text-secondary">
            {{ ticketStore.getTicketStats(id).correct }} / {{ ticketStore.getTicketStats(id).answered }}
          </p>
        </div>
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-surface-muted" role="presentation">
          <div
            class="h-full rounded-pill bg-correct"
            :style="{ width: `${accuracyPercent(id)}%` }"
          />
        </div>
        <p class="mt-2 text-xs text-text-secondary">
          верно {{ ticketStore.getTicketStats(id).correct }} из
          {{ ticketStore.getTicketStats(id).answered }} отвеченных
        </p>
      </li>
    </ul>
    <EmptyState
      v-else
      class="mt-6"
      title="Пока нет прохождений"
      description="Статистика появится здесь после первого билета, ошибок или экзамена в этой сессии."
    />
  </div>
</template>
