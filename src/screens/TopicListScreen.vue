<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { TicketCategory } from '../api/types';
import ErrorState from '../components/ui/ErrorState.vue';
import AppSpinner from '../components/ui/AppSpinner.vue';
import { useCatalogStore } from '../stores/catalogStore';

const catalog = useCatalogStore();
const route = useRoute();
const group = ref<'number' | 'topic'>('number');
const sessionQuery = computed(() => ({ mode: (route.query.mode as string) || 'theory' }));

onMounted(() => {
  void catalog.loadCatalog();
});

function categoryLabel(category: TicketCategory): string {
  return category === 'A_B' ? 'A, B' : 'C, D';
}
</script>

<template>
  <div>
    <h1 class="text-xl font-semibold sm:text-2xl">Билеты</h1>
    <p class="mt-1 text-sm text-text-secondary">Выбор билета или темы · без ограничения времени</p>

    <div
      class="mt-4 inline-flex gap-0.5 rounded-pill border border-border bg-surface-raised p-0.5"
      role="group"
      aria-label="Способ группировки билетов"
    >
      <button
        type="button"
        class="min-h-9 rounded-pill px-3.5 py-1.5 text-sm font-medium outline-none transition duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
        :class="group === 'number' ? 'bg-accent text-text-on-accent' : 'text-text-secondary hover:text-text-primary'"
        :aria-pressed="group === 'number'"
        @click="group = 'number'"
      >
        По номерам
      </button>
      <button
        type="button"
        class="min-h-9 rounded-pill px-3.5 py-1.5 text-sm font-medium outline-none transition duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
        :class="group === 'topic' ? 'bg-accent text-text-on-accent' : 'text-text-secondary hover:text-text-primary'"
        :aria-pressed="group === 'topic'"
        @click="group = 'topic'"
      >
        По темам
      </button>
    </div>

    <AppSpinner v-if="catalog.loading && catalog.tickets.length === 0" />
    <ErrorState v-else-if="catalog.error" title="Ошибка" :description="catalog.error" />

    <ul
      v-else-if="group === 'number'"
      class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <li v-for="ticket in catalog.tickets" :key="ticket.id">
        <RouterLink
          :to="{ name: 'ticket-session', params: { ticketId: ticket.id }, query: sessionQuery }"
          class="block rounded-card border border-border bg-surface p-4 transition duration-200 ease-out hover:border-accent hover:shadow-sm"
        >
          <p class="font-semibold">Билет {{ ticket.number }}</p>
          <p class="mt-1 text-xs text-text-secondary">{{ categoryLabel(ticket.category) }}</p>
        </RouterLink>
      </li>
    </ul>

    <ul v-else class="mt-6 grid gap-3 sm:grid-cols-2">
      <li v-for="topic in catalog.topics" :key="topic.id">
        <RouterLink
          :to="{ name: 'topic-session', params: { topicId: topic.id } }"
          class="block rounded-card border border-border bg-surface p-4 hover:border-accent"
        >
          <p class="font-semibold">{{ topic.title }}</p>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>
