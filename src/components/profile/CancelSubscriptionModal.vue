<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import AppButton from '../ui/AppButton.vue';

const props = defineProps<{
  open: boolean;
  status: 'idle' | 'processing' | 'error';
  errorMessage?: string | null;
  subscriptionEndDate?: string | null;
}>();
const emit = defineEmits<{ close: []; confirm: [] }>();

function close() {
  if (props.status === 'processing') return;
  emit('close');
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) close();
}

onMounted(() => window.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <Transition name="cancel-fade">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
      @click.self="close"
    >
      <div
        class="relative w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-2xl sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-subscription-title"
        aria-describedby="cancel-subscription-description"
      >
        <button
          type="button"
          class="absolute right-3 top-3 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-text-secondary outline-none transition duration-200 ease-out hover:bg-surface-raised hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Закрыть"
          :disabled="status === 'processing'"
          @click="close"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round" />
          </svg>
        </button>

        <h2 id="cancel-subscription-title" class="pr-8 text-lg font-semibold text-text-primary">
          Отключить автопродление?
        </h2>
        <p id="cancel-subscription-description" class="mt-2 text-sm leading-relaxed text-text-secondary">
          Premium останется активным до
          {{ subscriptionEndDate ?? 'конца оплаченного периода' }}. После этой даты подписка не
          продлится, и доступ станет Free.
        </p>

        <p v-if="status === 'error'" class="mt-4 text-sm text-incorrect" role="alert">
          {{ errorMessage ?? 'Не удалось отключить автопродление.' }}
        </p>

        <div class="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
          <AppButton
            variant="danger"
            class="w-full"
            data-testid="cancel-subscription-confirm"
            :disabled="status === 'processing'"
            @click="emit('confirm')"
          >
            {{
              status === 'processing'
                ? 'Отключаем…'
                : status === 'error'
                  ? 'Повторить'
                  : 'Отключить автопродление'
            }}
          </AppButton>
          <AppButton
            variant="secondary"
            class="w-full"
            data-testid="cancel-subscription-dismiss"
            :disabled="status === 'processing'"
            @click="close"
          >
            Не сейчас
          </AppButton>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cancel-fade-enter-active,
.cancel-fade-leave-active {
  transition: opacity 0.2s ease;
}
.cancel-fade-enter-from,
.cancel-fade-leave-to {
  opacity: 0;
}
.cancel-fade-enter-active > div,
.cancel-fade-leave-active > div {
  transition:
    transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease;
}
.cancel-fade-enter-from > div,
.cancel-fade-leave-to > div {
  transform: scale(0.96) translateY(8px);
  opacity: 0;
}
</style>
