<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue';
import type { Question } from '../../domain/question';
import type { QuestionState } from '../../types/ticket';

const props = withDefaults(
  defineProps<{
    questions: Question[];
    questionStates: QuestionState[];
    currentIndex: number;
    concealResults?: boolean;
    variant?: 'scroll' | 'sidebar';
  }>(),
  { variant: 'scroll' },
);

const emit = defineEmits<{ select: [index: number] }>();

const ITEM_SIZE = 44;
const ITEM_GAP = 8;
const ITEM_STRIDE = ITEM_SIZE + ITEM_GAP;
const PEEK = 12;

const scroller = ref<HTMLElement | null>(null);
const trackWrap = ref<HTMLElement | null>(null);
const trackWidth = ref<number | null>(null);
const hasOverflow = ref(false);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

const itemRefs: (HTMLLIElement | null)[] = [];
let resizeObserver: ResizeObserver | null = null;

function setItemRef(el: Element | ComponentPublicInstance | null, index: number) {
  itemRefs[index] = el as HTMLLIElement | null;
}

function fitTrack() {
  const wrap = trackWrap.value;
  if (!wrap) return;

  const available = wrap.clientWidth;
  const count = Math.max(1, Math.floor((available - PEEK) / ITEM_STRIDE));
  trackWidth.value = count * ITEM_STRIDE + PEEK;
  nextTick(updateScrollHints);
}

function updateScrollHints() {
  const el = scroller.value;
  if (!el) return;
  const maxScroll = el.scrollWidth - el.clientWidth;
  hasOverflow.value = maxScroll > 1;
  canScrollLeft.value = el.scrollLeft > 1;
  canScrollRight.value = el.scrollLeft < maxScroll - 1;
}

function scrollNav(direction: -1 | 1) {
  const el = scroller.value;
  if (!el) return;
  el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.75, 132), behavior: 'smooth' });
}

watch(
  () => props.currentIndex,
  (index) => {
    nextTick(() => {
      itemRefs[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      updateScrollHints();
    });
  },
);

onMounted(() => {
  nextTick(fitTrack);
  const wrap = trackWrap.value;
  if (!wrap || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(fitTrack);
  resizeObserver.observe(wrap);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

function statusLabel(status: QuestionState['status']) {
  if (props.concealResults) {
    return status === 'unanswered' ? ', не отвечен' : ', отвечен';
  }
  if (status === 'correct') return ', отвечено верно';
  if (status === 'incorrect') return ', отвечено неверно';
  return ', не отвечен';
}

function itemClasses(status: QuestionState['status'], isCurrent: boolean) {
  if (props.concealResults) {
    if (status !== 'unanswered') {
      return isCurrent
        ? 'bg-accent text-text-on-accent shadow-[0_2px_4px_rgba(0,0,0,0.18)]'
        : 'bg-surface-muted text-text-primary shadow-sm hover:bg-accent/10';
    }
    return isCurrent
      ? 'bg-accent text-text-on-accent shadow-[0_2px_4px_rgba(0,0,0,0.18)]'
      : 'bg-white text-text-primary shadow-sm hover:bg-accent/10';
  }
  if (status === 'correct') {
    return isCurrent
      ? 'bg-correct text-white shadow-[0_2px_4px_rgba(0,0,0,0.18)]'
      : 'bg-white text-correct shadow-sm hover:bg-correct/5';
  }
  if (status === 'incorrect') {
    return isCurrent
      ? 'bg-incorrect text-white shadow-[0_2px_4px_rgba(0,0,0,0.18)]'
      : 'bg-white text-incorrect shadow-sm hover:bg-incorrect/5';
  }
  return isCurrent
    ? 'bg-accent text-text-on-accent shadow-[0_2px_4px_rgba(0,0,0,0.18)]'
    : 'bg-white text-text-primary shadow-sm hover:bg-accent/10';
}
</script>

<template>
  <nav
    v-if="variant === 'sidebar'"
    aria-label="Навигация по вопросам билета"
  >
    <ul class="grid w-fit grid-cols-2 gap-2">
      <li v-for="(q, index) in questions" :key="q.id">
        <button
          type="button"
          class="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-sm font-bold outline-none transition duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          :class="itemClasses(questionStates[index]?.status ?? 'unanswered', index === currentIndex)"
          :aria-current="index === currentIndex ? 'true' : undefined"
          :aria-label="`Вопрос ${index + 1}${statusLabel(questionStates[index]?.status ?? 'unanswered')}`"
          @click="emit('select', index)"
        >
          <svg
            v-if="!concealResults && questionStates[index]?.status === 'correct'"
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
            v-else-if="!concealResults && questionStates[index]?.status === 'incorrect'"
            viewBox="0 0 24 24"
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
          </svg>
          <span v-else>{{ index + 1 }}</span>
        </button>
      </li>
    </ul>
  </nav>

  <div v-else class="flex items-center gap-1">
    <button
      v-show="hasOverflow"
      type="button"
      class="relative z-10 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white text-text-primary shadow-sm outline-none transition duration-200 ease-out hover:bg-accent/10 active:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary disabled:cursor-default disabled:opacity-30"
      :disabled="!canScrollLeft"
      aria-label="Прокрутить список вопросов назад"
      @click="scrollNav(-1)"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <div ref="trackWrap" class="relative min-w-0 flex-1">
      <nav
        ref="scroller"
        aria-label="Навигация по вопросам билета"
        class="snap-x snap-proximity overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        :style="trackWidth != null ? { width: `${trackWidth}px` } : undefined"
        @scroll.passive="updateScrollHints"
      >
        <ul class="flex w-max gap-2 py-2">
          <li
            v-for="(q, index) in questions"
            :key="q.id"
            :ref="(el) => setItemRef(el, index)"
            class="snap-start"
          >
            <button
              type="button"
              class="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-sm font-bold outline-none transition duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
              :class="itemClasses(questionStates[index]?.status ?? 'unanswered', index === currentIndex)"
              :aria-current="index === currentIndex ? 'true' : undefined"
              :aria-label="`Вопрос ${index + 1}${statusLabel(questionStates[index]?.status ?? 'unanswered')}`"
              @click="emit('select', index)"
            >
              <svg
                v-if="!concealResults && questionStates[index]?.status === 'correct'"
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
                v-else-if="!concealResults && questionStates[index]?.status === 'incorrect'"
                viewBox="0 0 24 24"
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
              </svg>
              <span v-else>{{ index + 1 }}</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
    <button
      v-show="hasOverflow"
      type="button"
      class="relative z-10 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white text-text-primary shadow-sm outline-none transition duration-200 ease-out hover:bg-accent/10 active:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary disabled:cursor-default disabled:opacity-30"
      :disabled="!canScrollRight"
      aria-label="Прокрутить список вопросов вперёд"
      @click="scrollNav(1)"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  </div>
</template>
