<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { FinishSessionResult } from '../../api/ApiClient';
import { EXAM_BASE_QUESTION_COUNT, formatExamClock } from '../../domain/examRules';
import { createCountdownTimer } from '../../domain/examTimer';
import type { PostSessionActionId } from '../../domain/postSessionNav';
import type { Question } from '../../domain/question';
import { useCatalogStore } from '../../stores/catalogStore';
import { useProgressStore } from '../../stores/progressStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useTicketStore } from '../../stores/ticketStore';
import type { ForcedFinishReason, TicketMode } from '../../types/ticket';
import logo from '../../assets/logo.png';
import AppButton from '../ui/AppButton.vue';
import FavoriteButton from './FavoriteButton.vue';
import MediaBlock from './MediaBlock.vue';
import MediaUnlockCta from './MediaUnlockCta.vue';
import PaywallModal from './PaywallModal.vue';
import QuestionContent from './QuestionContent.vue';
import QuestionNav from './QuestionNav.vue';
import SessionResultModal from './SessionResultModal.vue';

const props = withDefaults(
  defineProps<{ ticketId: string; questions: Question[]; mode?: TicketMode }>(),
  { mode: 'theory' },
);
defineEmits<{ exit: []; navigate: [action: PostSessionActionId] }>();

const router = useRouter();
const session = useSessionStore();
const catalog = useCatalogStore();
const store = useTicketStore();
const progressStore = useProgressStore();

const isPaywallOpen = ref(false);
const isResultOpen = ref(false);
const submitting = ref(false);
const submitError = ref<string | null>(null);
const completing = ref(false);
const finishResult = ref<FinishSessionResult | null>(null);
const remainingErrorCount = ref(0);
const extraQuestionsNotice = ref<string | null>(null);
const forcedFinishReason = ref<ForcedFinishReason>(null);

function pluralizeQuestions(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'вопрос';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'вопроса';
  return 'вопросов';
}

function beginSession() {
  isResultOpen.value = false;
  finishResult.value = null;
  completing.value = false;
  remainingErrorCount.value = 0;
  extraQuestionsNotice.value = null;
  forcedFinishReason.value = null;
  submitError.value = null;
  store.startTicket(props.ticketId, props.questions, props.mode, {
    remainingSeconds: catalog.examTimeLimitSeconds ?? undefined,
  });
}

beginSession();

const currentIndex = computed(() => store.progress[props.ticketId].currentIndex);
const questionStates = computed(() => store.progress[props.ticketId].questionStates);
const currentQuestion = computed(() => props.questions[currentIndex.value]);
const currentState = computed(() => questionStates.value[currentIndex.value]);
const remainingSeconds = computed(() => store.progress[props.ticketId]?.remainingSeconds ?? 0);
const concealResults = computed(() => props.mode === 'exam');

const livesLocked = computed(
  () => !session.isPremium && (session.user?.lives_current ?? 0) <= 0,
);

const answersLocked = computed(
  () => submitting.value || (livesLocked.value && currentState.value.status === 'unanswered'),
);

function goToQuestion(index: number) {
  // Once a forced-finish is underway, the exam is over — no jumping to another question while
  // it wraps up (see completeSession()).
  if (completing.value) return;
  store.goToQuestion(props.ticketId, index);
}

async function selectAnswer(answerId: string) {
  const sessionId = catalog.activeSessionId;
  if (currentState.value.status !== 'unanswered' || submitting.value || livesLocked.value || !sessionId) {
    return;
  }

  submitting.value = true;
  submitError.value = null;
  try {
    const result = await session.answerSession({
      sessionId,
      questionId: currentQuestion.value.id,
      answerId,
    });
    store.applyAnswerResult(props.ticketId, {
      selectedAnswerId: answerId,
      isCorrect: result.isCorrect ?? false,
      correctAnswerId: result.correctAnswerId,
    });
    if (result.extraQuestions.length) {
      const count = result.extraQuestions.length;
      store.appendQuestionSlots(props.ticketId, count);
      catalog.appendToCurrentTicket(result.extraQuestions);
      extraQuestionsNotice.value = `Ошибка по теме — добавлено ещё ${count} ${pluralizeQuestions(count)} по той же теме.`;
    }
    if (result.sessionFinishedForced) {
      // ТЗ §3.2: an exam extra/bonus question has no second chance — a mistake there is the one
      // forced-finish case with its own SessionResultModal message (see ForcedFinishReason).
      if (props.mode === 'exam' && currentIndex.value >= EXAM_BASE_QUESTION_COUNT && result.isCorrect === false) {
        forcedFinishReason.value = 'extra_question_mistake';
      }
      await completeSession('finished');
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : '';
    if (message === 'LIVES_EXHAUSTED') {
      submitError.value = 'Жизни закончились. Дальнейшие ответы недоступны.';
      return;
    }
    if (message === 'SESSION_ALREADY_FINISHED') {
      // Backend already considers this session over (e.g. a forced-finish we missed) — go
      // straight to the terminal/result state instead of a red "try again" toast.
      await completeSession('finished');
      return;
    }
    // QUESTION_ALREADY_ANSWERED and any other failure keep this generic retry message — neither
    // is a finished-session signal.
    submitError.value = 'Не удалось отправить ответ. Попробуйте ещё раз.';
  } finally {
    submitting.value = false;
  }
}

function toggleFavorite() {
  void store.toggleFavorite(props.ticketId, currentQuestion.value.id);
}

function goToNext() {
  if (completing.value) return;
  extraQuestionsNotice.value = null;
  store.goToNextQuestion(props.ticketId);
}

const examTimer = createCountdownTimer({
  tick: () => store.tickExamTimer(props.ticketId),
  isZero: () => (store.progress[props.ticketId]?.remainingSeconds ?? 1) <= 0,
  onZero: () => {
    void completeSession('timed_out');
  },
});

/** Calls finishSession and opens the result modal. Used for exam finish/timeout and for any
 * mode's forced finish (session.answerSession returned sessionFinishedForced). */
async function completeSession(status: 'finished' | 'timed_out') {
  if (completing.value) return;
  completing.value = true;
  if (props.mode === 'exam') {
    examTimer.stop();
    store.stopExam(props.ticketId, status);
  }
  const sessionId = catalog.activeSessionId;
  if (sessionId) {
    try {
      finishResult.value = await session.finishSession({ sessionId });
      // Refreshes ticket/topic/bank progress so TopicListScreen/Dashboard don't show stale data
      // on return — covers the normal/timeout/forced-finish paths alike, all funnel through here.
      void progressStore.loadProgress();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      if (message === 'SESSION_ALREADY_FINISHED') {
        // Backend already closed this session (e.g. an earlier forced-finish beat us to it) —
        // this is a normal terminal state, not a failure. finishResult stays null; the modal below
        // and resultCorrect/resultErrors already fall back to locally-known ticketStats without it
        // — no fabricated SessionFinishResponse to satisfy the type.
        void progressStore.loadProgress();
      } else {
        submitError.value = 'Не удалось завершить сессию.';
      }
    }
  }
  isResultOpen.value = true;
}

async function finishTicket() {
  if (!store.isTicketComplete(props.ticketId)) return;
  if (props.mode === 'errors') {
    remainingErrorCount.value = await catalog.peekErrorQuestionCount();
  }
  await completeSession('finished');
}

onMounted(() => {
  if (props.mode === 'exam') examTimer.start();
});

onUnmounted(() => {
  examTimer.stop();
});

watch(
  () => `${props.mode}:${props.ticketId}`,
  () => {
    examTimer.stop();
    beginSession();
    if (props.mode === 'exam') examTimer.start();
  },
);

const ticketStats = computed(() => store.getTicketStats(props.ticketId));
const isLast = computed(() => store.isLastQuestion(props.ticketId));
const canAdvance = computed(
  () => currentState.value.status !== 'unanswered' && !isLast.value && !completing.value,
);
const canFinish = computed(() => store.isTicketComplete(props.ticketId) && !completing.value);
const modeLabel = computed(() => {
  if (store.mode === 'theory') return 'Теория';
  if (store.mode === 'errors') return 'Ошибки';
  if (store.mode === 'favorites') return 'Избранное';
  if (store.mode === 'exam') return 'Экзамен ГИБДД';
  return '';
});
const explanationText = computed(() => currentQuestion.value.explanation);
const headerTitle = computed(() => {
  if (props.mode === 'exam') return 'Экзамен ГИБДД';
  if (props.mode === 'errors') return 'Ошибки';
  if (props.mode === 'favorites') return 'Избранное';
  if (catalog.currentTicket?.topicTitle) return catalog.currentTicket.topicTitle;
  return `Билет ${catalog.currentTicket?.number ?? ''}`;
});
const finishLabel = computed(() => {
  if (props.mode === 'exam') return 'Завершить экзамен';
  if (props.mode === 'errors') return 'Завершить проработку ошибок';
  if (props.mode === 'favorites') return 'Завершить проработку избранного';
  return 'Завершить билет';
});
const resultTitle = computed(() => {
  if (props.mode === 'exam') return 'Результат экзамена';
  if (props.mode === 'errors') return 'Результат проработки ошибок';
  if (props.mode === 'favorites') return 'Результат проработки избранного';
  return 'Результат билета';
});
const resultCorrect = computed(() => finishResult.value?.correctCount ?? ticketStats.value.correct);
const resultErrors = computed(() =>
  finishResult.value ? finishResult.value.errorsCount : ticketStats.value.answered - ticketStats.value.correct,
);

function openPaywall() {
  isPaywallOpen.value = true;
  document.body.classList.add('modal-open');
}

function closePaywall() {
  isPaywallOpen.value = false;
  document.body.classList.remove('modal-open');
}

function continueToPaywall() {
  closePaywall();
  void router.push({ name: 'paywall' });
}
</script>

<template>
  <div class="min-h-screen bg-bg text-text-primary">
    <header
      class="sticky top-0 z-20 border-b border-border bg-bg px-4 py-3 sm:px-6 sm:py-4 lg:px-8"
    >
      <div class="mx-auto flex w-full max-w-[1200px] items-center gap-3">
        <button
          type="button"
          class="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-pill bg-accent text-text-on-accent outline-none transition duration-200 ease-out hover:brightness-95 active:brightness-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          aria-label="Назад"
          @click="$emit('exit')"
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <div class="min-w-0 flex-1 text-center">
          <p v-if="props.mode === 'theory'" class="text-xs font-medium text-text-secondary">
            {{ modeLabel }}
          </p>
          <h1 class="truncate text-base font-semibold sm:text-lg">
            {{ headerTitle }}
          </h1>
          <p
            v-if="props.mode === 'exam'"
            class="mt-1 text-xs tabular-nums text-text-secondary sm:text-sm"
          >
            {{ currentIndex + 1 }} / {{ questions.length }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-3 sm:gap-4">
          <p v-if="props.mode === 'exam'" class="text-right text-sm font-semibold tabular-nums">
            <span class="block font-medium text-text-secondary">Время</span>
            <time role="timer" :datetime="`PT${remainingSeconds}S`">{{
              formatExamClock(remainingSeconds)
            }}</time>
          </p>
          <p class="text-right text-sm font-semibold tabular-nums" role="status" aria-label="Жизни">
            <span class="block font-medium text-text-secondary">Жизни</span>
            <span v-if="session.isPremium">∞</span>
            <span v-else>{{ session.user?.lives_current ?? 0 }} / {{ session.user?.lives_max ?? 0 }}</span>
          </p>
          <img
            :src="logo"
            alt="Третий Рим"
            class="hidden h-10 w-10 shrink-0 rounded-xl object-contain sm:block sm:h-12 sm:w-12"
          />
        </div>
      </div>
    </header>

    <div class="mx-auto w-full max-w-[1200px] px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-6 lg:px-8 lg:pb-12 lg:pt-8">
      <QuestionNav
        :questions="questions"
        :question-states="questionStates"
        :current-index="currentIndex"
        :conceal-results="concealResults"
        @select="goToQuestion"
      />

      <p
        v-if="extraQuestionsNotice"
        class="mt-3 rounded-card border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-text-primary"
        role="status"
      >
        {{ extraQuestionsNotice }}
      </p>

      <main class="mt-4 sm:mt-6 lg:grid lg:grid-cols-[minmax(320px,420px)_1fr] lg:items-start lg:gap-8">
        <div class="lg:sticky lg:top-6">
          <MediaBlock :image="currentQuestion.imageUrl" />
          <div v-if="mode !== 'exam'" class="mt-3 hidden lg:block">
            <MediaUnlockCta @open-paywall="openPaywall" />
          </div>
        </div>

        <div class="mt-5 lg:mt-0">
          <section
            v-if="livesLocked"
            class="mb-5 rounded-card border border-incorrect/30 bg-incorrect/5 p-4"
            role="status"
          >
            <h2 class="text-base font-semibold">Жизни закончились</h2>
            <p class="mt-1 text-sm text-text-secondary">
              Бесплатные попытки исчерпаны. Новые ответы в этом режиме недоступны. Premium снимает
              ограничение по жизням.
            </p>
            <AppButton class="mt-4 w-full sm:w-auto" @click="router.push('/paywall')">
              К экрану Premium
            </AppButton>
          </section>

          <p v-if="submitError" class="mb-4 text-sm text-incorrect">{{ submitError }}</p>

          <QuestionContent
            :question="currentQuestion"
            :state="currentState"
            :locked="answersLocked"
            :conceal-results="concealResults"
            @select-answer="selectAnswer"
          />

          <p
            v-if="!concealResults && currentState.status !== 'unanswered'"
            class="mt-4 flex items-center gap-1.5 text-sm font-semibold"
            :class="currentState.status === 'correct' ? 'text-correct' : 'text-incorrect'"
            role="status"
            aria-label="Результат ответа"
          >
            <svg
              v-if="currentState.status === 'correct'"
              viewBox="0 0 24 24"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              aria-hidden="true"
            >
              <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              class="h-4 w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
            </svg>
            {{ currentState.status === 'correct' ? 'Верно' : 'Неверно' }}
          </p>

          <section
            v-if="!concealResults && currentState.status !== 'unanswered' && explanationText"
            class="mt-4 rounded-card border border-border bg-accent/10 p-4 text-sm leading-relaxed break-words text-text-primary"
            role="region"
            aria-label="Пояснение"
          >
            <h2 class="text-sm font-semibold">Пояснение</h2>
            <p class="mt-2">{{ explanationText }}</p>
          </section>

          <div class="mt-5 flex flex-wrap items-center justify-between gap-4">
            <FavoriteButton
              v-if="mode !== 'exam'"
              :is-favorite="currentState.isFavorite"
              @toggle="toggleFavorite"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
              <AppButton v-if="canAdvance" class="w-full sm:w-auto" @click="goToNext">
                Следующий вопрос
              </AppButton>
              <AppButton v-if="canFinish" class="w-full sm:w-auto" @click="finishTicket">
                {{ finishLabel }}
              </AppButton>
            </div>
          </div>

          <div v-if="mode !== 'exam'" class="mt-5 lg:hidden">
            <MediaUnlockCta @open-paywall="openPaywall" />
          </div>
        </div>
      </main>
    </div>

    <PaywallModal :open="isPaywallOpen" @close="closePaywall" @continue="continueToPaywall" />
    <SessionResultModal
      :open="isResultOpen"
      :title="resultTitle"
      :mode="mode"
      :mode-label="modeLabel"
      :correct-count="resultCorrect"
      :error-count="resultErrors"
      :passed="finishResult?.passed ?? null"
      :timed-out="store.progress[ticketId]?.examStatus === 'timed_out'"
      :remaining-error-count="remainingErrorCount"
      :forced-finish-reason="forcedFinishReason"
      @navigate="$emit('navigate', $event)"
    />
  </div>
</template>
