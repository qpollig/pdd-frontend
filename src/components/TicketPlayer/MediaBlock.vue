<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import placeholder from '../../assets/image-placeholder.svg';

const props = defineProps<{ image: string | null }>();

const errored = ref(false);
watch(
  () => props.image,
  () => {
    errored.value = false;
  },
);

const src = computed(() => (errored.value || !props.image ? placeholder : props.image));
</script>

<template>
  <div class="overflow-hidden rounded-card border border-border bg-surface-muted">
    <img
      :src="src"
      alt=""
      class="aspect-video w-full object-cover"
      loading="lazy"
      @error="errored = true"
    />
  </div>
</template>
