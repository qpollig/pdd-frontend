<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TicketPlayer from '../components/TicketPlayer/TicketPlayer.vue';
import AppButton from '../components/ui/AppButton.vue';
import EmptyState from '../components/ui/EmptyState.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import AppSpinner from '../components/ui/AppSpinner.vue';
import { nextTheoryTicketId, type PostSessionActionId } from '../domain/postSessionNav';
import { useCatalogStore } from '../stores/catalogStore';
import type { TicketMode } from '../types/ticket';

const route = useRoute();
const router = useRouter();
const catalog = useCatalogStore();
const sessionGeneration = ref(0);

function resolveMode(): TicketMode {
  if (route.name === 'exam-gibdd') return 'exam';
  if (route.name === 'errors-session' || route.query.mode === 'errors') return 'errors';
  return 'theory';
}

const mode = computed<TicketMode>(resolveMode);

const hasErrorQuestions = computed(
  () => (catalog.currentTicket?.questions.length ?? 0) > 0,
);

const playerKey = computed(() => {
  if (mode.value === 'exam') return `${catalog.activeSessionId ?? 'exam'}:${sessionGeneration.value}`;
  if (mode.value === 'errors') {
    const questionKey =
      catalog.currentTicket?.questions.map((question) => question.id).join('|') || 'errors';
    return `${questionKey}:${sessionGeneration.value}`;
  }
  return `${catalog.currentTicket?.id ?? 'theory'}:${sessionGeneration.value}`;
});

async function load() {
  if (mode.value === 'exam') {
    await catalog.loadExamSession();
    document.title = 'Экзамен ГИБДД';
    return;
  }
  if (mode.value === 'errors') {
    await catalog.loadErrorQuestions();
    document.title = 'Ошибки ПДД 2026 - Проработка неверных ответов';
    return;
  }
  if (route.name === 'topic-session') {
    const topicId = String(route.params.topicId);
    await catalog.loadTopicSession(topicId);
    if (catalog.currentTicket) {
      document.title = `${catalog.currentTicket.topicTitle ?? 'Тема'} ПДД 2026 - Онлайн-тренажер экзамена ГИБДД`;
    }
    return;
  }
  const id = String(route.params.ticketId);
  await catalog.loadTicket(id);
  if (catalog.currentTicket) {
    document.title = `Билет №${catalog.currentTicket.number} ПДД 2026 - Онлайн-тренажер экзамена ГИБДД`;
  }
}

onMounted(() => {
  void load();
});

watch(
  () =>
    `${String(route.name)}:${String(route.params.ticketId ?? '')}:${String(route.params.topicId ?? '')}:${String(route.query.mode ?? '')}`,
  () => {
    void load();
  },
);

function exitPlayer() {
  if (mode.value === 'errors' || mode.value === 'exam') {
    void router.push({ name: 'dashboard' });
    return;
  }
  void router.push({ name: 'tickets', query: { mode: 'theory' } });
}

function goHome() {
  void router.push({ name: 'dashboard' });
}

function openTheory() {
  void router.push({ name: 'tickets', query: { mode: 'theory' } });
}

async function goNextTheoryTicket() {
  if (catalog.tickets.length === 0) {
    await catalog.loadCatalog();
  }
  const currentId = catalog.currentTicket?.id ?? String(route.params.ticketId ?? '');
  const nextId = nextTheoryTicketId(catalog.tickets, currentId);
  if (!nextId) {
    openTheory();
    return;
  }
  await router.push({
    name: 'ticket-session',
    params: { ticketId: nextId },
    query: { mode: 'theory' },
  });
}

function onResultNavigate(action: PostSessionActionId) {
  if (action === 'home') {
    goHome();
    return;
  }
  if (action === 'tickets' || action === 'theory') {
    openTheory();
    return;
  }
  if (action === 'next-ticket') {
    void goNextTheoryTicket();
    return;
  }
  if (action === 'next-error') {
    sessionGeneration.value += 1;
    void catalog.loadErrorQuestions();
    return;
  }
  if (action === 'repeat-exam') {
    sessionGeneration.value += 1;
    void catalog.loadExamSession();
  }
}
</script>

<template>
  <AppSpinner v-if="catalog.loading" />
  <div v-else-if="catalog.error" class="min-h-screen bg-bg p-4">
    <ErrorState
      :title="mode === 'exam' ? 'Не удалось начать экзамен' : 'Не удалось открыть билет'"
      :description="catalog.error"
    />
  </div>
  <div
    v-else-if="mode === 'errors' && catalog.currentTicket && !hasErrorQuestions"
    class="min-h-screen bg-bg px-4 py-8 text-text-primary sm:px-6"
  >
    <div class="mx-auto w-full max-w-md">
      <EmptyState
        title="Ошибок для проработки пока нет"
        description="Пройдите билеты в режиме «Теория». Вопросы, на которые вы ответите неверно, появятся здесь."
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <AppButton class="w-full sm:w-auto" @click="openTheory">К теории</AppButton>
          <AppButton variant="secondary" class="w-full sm:w-auto" @click="goHome">
            На главную
          </AppButton>
        </div>
      </EmptyState>
    </div>
  </div>
  <div
    v-else-if="mode === 'exam' && catalog.currentTicket && !catalog.currentTicket.questions.length"
    class="min-h-screen bg-bg px-4 py-8 text-text-primary sm:px-6"
  >
    <div class="mx-auto w-full max-w-md">
      <EmptyState
        title="Экзаменационная сессия пуста"
        description="Не удалось получить вопросы экзамена. Попробуйте открыть экзамен позже."
      >
        <AppButton class="w-full sm:w-auto" @click="goHome">На главную</AppButton>
      </EmptyState>
    </div>
  </div>
  <TicketPlayer
    v-else-if="catalog.currentTicket"
    :key="playerKey"
    :ticket-id="catalog.currentTicket.id"
    :questions="catalog.currentTicket.questions"
    :mode="mode"
    @exit="exitPlayer"
    @navigate="onResultNavigate"
  />
</template>
