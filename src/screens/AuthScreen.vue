<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppButton from '../components/ui/AppButton.vue';
import AppSpinner from '../components/ui/AppSpinner.vue';
import ErrorState from '../components/ui/ErrorState.vue';
import logo from '../assets/logo.png';
import type { OAuthProvider } from '../api/types';
import { useSessionStore } from '../stores/sessionStore';
import { fadeUp } from '../motion/variants';

const router = useRouter();
const route = useRoute();
const session = useSessionStore();

async function login(provider: OAuthProvider) {
  try {
    await session.loginWithProvider(provider);
    await router.replace({ name: 'dashboard' });
  } catch {
    /* error is stored on sessionStore */
  }
}

// ── Вход по email+паролю — рядом с OAuth, на этом же экране (см. отчёт по задаче) ──────────────
const email = ref('');
const password = ref('');

/** Баннер после успешного сброса пароля (ResetPasswordScreen редиректит сюда с ?reset=success). */
const resetSuccessBanner = ref(false);

onMounted(async () => {
  if (route.query.reset === 'success') {
    resetSuccessBanner.value = true;
    const rest = { ...route.query };
    delete rest.reset;
    await router.replace({ query: rest });
  }
});

async function onSubmitPasswordLogin() {
  resetSuccessBanner.value = false;
  const ok = await session.loginWithPassword(email.value.trim(), password.value);
  if (ok) {
    await router.replace({ name: 'dashboard' });
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
            Войдите через Яндекс ID, VK ID или по email и паролю, чтобы открыть доступ к билетам ПДД.
          </p>
        </div>

        <div
          v-if="resetSuccessBanner"
          class="mt-6 rounded-card border border-correct/30 bg-correct/10 p-3 text-center text-sm text-correct"
          role="status"
          data-testid="auth-reset-success-banner"
        >
          Пароль изменён. Войдите с новым паролем.
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

        <div class="mt-6 flex items-center gap-3" aria-hidden="true">
          <div class="h-px flex-1 bg-border" />
          <span class="text-xs text-text-secondary">или войдите по email</span>
          <div class="h-px flex-1 bg-border" />
        </div>

        <form class="mt-4 space-y-3" data-testid="password-login-form" @submit.prevent="onSubmitPasswordLogin">
          <div>
            <label class="block text-xs text-text-secondary" for="login-email">Email</label>
            <input
              id="login-email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              class="mt-1 w-full rounded-card border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label class="block text-xs text-text-secondary" for="login-password">Пароль</label>
            <input
              id="login-password"
              v-model="password"
              type="password"
              required
              autocomplete="current-password"
              class="mt-1 w-full rounded-card border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

          <p v-if="session.authError" class="text-sm text-incorrect" role="alert" data-testid="password-login-error">
            {{ session.authError }}
          </p>

          <AppButton
            type="submit"
            class="w-full"
            :disabled="session.authLoading"
            data-testid="password-login-submit"
          >
            {{ session.authLoading ? 'Входим…' : 'Войти по email' }}
          </AppButton>
        </form>

        <div class="mt-4 flex flex-col items-center gap-1 text-sm">
          <RouterLink :to="{ name: 'forgot-password' }" class="text-text-secondary underline hover:text-text-primary">
            Забыли пароль?
          </RouterLink>
          <span class="text-text-secondary">
            Нет аккаунта?
            <RouterLink :to="{ name: 'register' }" class="text-accent underline hover:text-text-primary">
              Зарегистрироваться
            </RouterLink>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
