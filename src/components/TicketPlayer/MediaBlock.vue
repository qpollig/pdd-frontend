<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { mediaPlaceholderText } from './mediaPlaceholder';

const props = defineProps<{ image: string | null }>();

const errored = ref(false);
watch(
  () => props.image,
  () => {
    errored.value = false;
  },
);

const placeholderText = computed(() => mediaPlaceholderText(props.image, errored.value));
</script>

<template>
  <div class="overflow-hidden rounded-card border border-border bg-surface-muted">
    <img
      v-if="!placeholderText"
      :src="image!"
      alt=""
      class="block max-h-[70vh] w-full object-contain"
      fetchpriority="high"
      @error="errored = true"
    />
    <div v-else class="flex aspect-video flex-col items-center justify-center gap-2 px-4 text-center">
      <svg
        viewBox="0 0 24 24"
        class="h-8 w-8 text-text-secondary"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.75" />
        <path d="M21 16l-5.5-5.5a1.5 1.5 0 0 0-2.12 0L5 19" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <p class="text-sm text-text-secondary">{{ placeholderText }}</p>
    </div>
  </div>
</template>
