<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppButton from '../components/ui/AppButton.vue';
import logo from '../assets/logo.png';
import { useSessionStore } from '../stores/sessionStore';
import { fadeUp } from '../motion/variants';

const session = useSessionStore();

const email = ref('');

// Не показываем стейл-статус от предыдущего визита на этот экран.
onMounted(() => {
  session.resetForgotStatus();
});

async function onSubmit() {
  await session.requestPasswordReset(email.value.trim());
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
          <h1 class="mt-5 text-2xl font-bold tracking-tight">Забыли пароль?</h1>
          <p class="mt-2 max-w-[22rem] text-sm text-text-secondary">
            Укажите email, привязанный к аккаунту — если он зарегистрирован, на него придёт ссылка
            для сброса пароля.
          </p>
        </div>

        <!--
          Нейтральный текст рисуется здесь явно, на фронте, а не берётся из тела ответа backend
          (который и так всегда отвечает одинаково) — намеренно не различаем "email существует"/
          "не существует" ни при каких обстоятельствах (см. ТЗ этой задачи).
        -->
        <div
          v-if="session.forgotStatus === 'sent'"
          class="mt-6 rounded-card border border-correct/30 bg-correct/10 p-4 text-center text-sm text-correct"
          role="status"
          data-testid="forgot-sent"
        >
          Если такой email зарегистрирован, на него отправлено письмо со ссылкой для сброса пароля.
        </div>

        <div
          v-else-if="session.forgotStatus === 'rate-limited'"
          class="mt-6 rounded-card border border-incorrect/30 bg-incorrect/10 p-4 text-center text-sm text-incorrect"
          role="alert"
          data-testid="forgot-rate-limited"
        >
          Слишком много попыток. Попробуйте позже.
        </div>

        <form v-else class="mt-6 space-y-3" data-testid="forgot-form" @submit.prevent="onSubmit">
          <div>
            <label class="block text-xs text-text-secondary" for="forgot-email">Email</label>
            <input
              id="forgot-email"
              v-model="email"
              type="email"
              required
              autocomplete="email"
              class="mt-1 w-full rounded-card border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>

          <p
            v-if="session.forgotStatus === 'error'"
            class="text-sm text-incorrect"
            role="alert"
            data-testid="forgot-error"
          >
            Не удалось отправить письмо. Попробуйте ещё раз позже.
          </p>

          <AppButton
            type="submit"
            class="w-full"
            :disabled="session.forgotStatus === 'processing'"
            data-testid="forgot-submit"
          >
            {{ session.forgotStatus === 'processing' ? 'Отправляем…' : 'Отправить ссылку' }}
          </AppButton>
        </form>

        <p class="mt-4 text-center text-sm text-text-secondary">
          Вспомнили пароль?
          <RouterLink :to="{ name: 'auth' }" class="text-accent underline hover:text-text-primary">
            Войти
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
