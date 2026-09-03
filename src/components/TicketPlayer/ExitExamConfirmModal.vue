<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import AppButton from '../ui/AppButton.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; confirm: [] }>();

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) emit('close');
}

onMounted(() => window.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <Transition name="exit-exam-fade">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/80 p-4 backdrop-blur-sm"
      @click.self="$emit('close')"
    >
      <div
        class="relative w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-2xl sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exit-exam-title"
        aria-describedby="exit-exam-description"
      >
        <h2 id="exit-exam-title" class="text-lg font-semibold text-text-primary">
          Прервать экзамен?
        </h2>
        <p id="exit-exam-description" class="mt-2 text-sm leading-relaxed text-text-secondary">
          Результат не будет засчитан, а прогресс по этой попытке потеряется. Начать заново можно
          будет в любой момент.
        </p>

        <div class="mt-6 flex flex-col gap-2">
          <AppButton class="w-full" @click="$emit('close')">Продолжить экзамен</AppButton>
          <AppButton variant="ghost" class="w-full" @click="$emit('confirm')">
            Прервать экзамен
          </AppButton>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.exit-exam-fade-enter-active,
.exit-exam-fade-leave-active {
  transition: opacity 0.2s ease;
}
.exit-exam-fade-enter-from,
.exit-exam-fade-leave-to {
  opacity: 0;
}
.exit-exam-fade-enter-active > div,
.exit-exam-fade-leave-active > div {
  transition:
    transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease;
}
.exit-exam-fade-enter-from > div,
.exit-exam-fade-leave-to > div {
  transform: scale(0.96) translateY(8px);
  opacity: 0;
}
</style>
