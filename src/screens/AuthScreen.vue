<script setup lang="ts">
import { useRouter } from 'vue-router';
import AppSpinner from '../components/ui/AppSpinner.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import logo from '../assets/logo.png';
import type { OAuthProvider } from '../api/types';
import { useSessionStore } from '../stores/sessionStore';
import { fadeUp } from '../motion/variants';

const router = useRouter();
const session = useSessionStore();

async function login(provider: OAuthProvider) {
  try {
    await session.loginWithProvider(provider);
    await router.replace({ name: 'dashboard' });
  } catch {
    /* error is stored on sessionStore */
  }
}
</script>

<template>
  <div
    class="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg px-4 py-10 text-text-primary sm:px-6"
  >
    <div
      class="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--color-border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute left-1/2 top-0 h-72 w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-accent/25 blur-3xl"
      aria-hidden="true"
    />

    <div
      v-motion
      :initial="fadeUp().initial"
      :enter="fadeUp().enter"
      class="relative w-full max-w-[26rem]"
    >
      <div class="relative overflow-hidden rounded-card border border-border bg-surface p-8 shadow-2xl shadow-black/[0.06] sm:p-10">
        <div class="absolute inset-x-0 top-0 h-1.5 bg-accent" aria-hidden="true" />

        <div class="flex flex-col items-center text-center">
          <img :src="logo" alt="" class="h-14 w-14 rounded-2xl object-contain ring-1 ring-border" />
          <h1 class="mt-5 text-2xl font-bold tracking-tight">Вход</h1>
          <p class="mt-2 max-w-[22rem] text-sm text-text-secondary">
            Войдите через Яндекс ID или VK ID, чтобы открыть доступ к билетам ПДД.
          </p>
        </div>

        <AppSpinner v-if="session.loading" label="Вход" class="mt-6" />

        <ErrorState
          v-if="session.error && !session.loading"
          class="mt-6"
          title="Не удалось войти"
          :description="session.error"
        />

        <div class="mt-8 flex flex-col gap-3">
          <button
            type="button"
            :disabled="session.loading"
            class="group inline-flex min-h-14 cursor-pointer items-center gap-3 rounded-pill border border-border bg-surface px-4 text-left outline-none transition duration-200 ease-out hover:border-text-primary/20 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            @click="login('yandex')"
          >
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FC3F1D] text-base font-bold text-white"
              aria-hidden="true"
            >
              Я
            </span>
            <span class="flex-1 text-sm font-semibold">Войти через Яндекс</span>
          </button>

          <button
            type="button"
            :disabled="session.loading"
            class="group inline-flex min-h-14 cursor-pointer items-center gap-3 rounded-pill border border-border bg-surface px-4 text-left outline-none transition duration-200 ease-out hover:border-text-primary/20 hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            @click="login('vk')"
          >
            <span
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0077FF] text-sm font-bold text-white"
              aria-hidden="true"
            >
              VK
            </span>
            <span class="flex-1 text-sm font-semibold">Войти через VK</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
