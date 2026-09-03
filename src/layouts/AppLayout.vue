<script setup lang="ts">
import { RouterView } from 'vue-router';
import AppHeader from '../components/shell/AppHeader.vue';
</script>

<template>
  <div class="flex min-h-screen flex-col bg-bg text-text-primary">
    <AppHeader />
    <div class="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-8 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
      <RouterView v-slot="{ Component, route }">
        <Transition name="page-fade" mode="out-in">
          <component :is="Component" :key="route.path" />
        </Transition>
      </RouterView>
    </div>
    <footer class="border-t border-border px-4 py-4 text-center text-xs text-text-secondary sm:px-8">
      Подготовка к экзамену ГИБДД.
    </footer>
  </div>
</template>
