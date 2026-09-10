<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppButton from '../ui/AppButton.vue';
import AppSpinner from '../ui/AppSpinner.vue';
import type { OAuthProvider } from '../../api/types';
import { canUnlink, identityErrorMessage, identityLabel } from '../../domain/identity';
import type { IdentityType } from '../../domain/identity';
import { useSessionStore } from '../../stores/sessionStore';

const session = useSessionStore();
const route = useRoute();
const router = useRouter();

const OAUTH_PROVIDERS: OAuthProvider[] = ['yandex', 'vk'];

/** Баннер об исходе OAuth-привязки, вернувшейся редиректом (ProfileScreen?link=...). */
const redirectBanner = ref<{ kind: 'success' | 'error'; text: string } | null>(null);

const linkedTypes = computed(() => new Set(session.identities.map((i) => i.type)));
const missingOAuthProviders = computed(() =>
  OAUTH_PROVIDERS.filter((provider) => !linkedTypes.value.has(provider)),
);
const hasPassword = computed(() => linkedTypes.value.has('password'));
const onlyOne = computed(() => session.identities.length === 1);

const email = ref('');
const password = ref('');
const showPasswordForm = ref(false);

onMounted(async () => {
  const link = route.query.link;
  if (typeof link === 'string' && link.length > 0) {
    redirectBanner.value =
      link === 'ok'
        ? { kind: 'success', text: 'Аккаунт привязан.' }
        : { kind: 'error', text: identityErrorMessage(link) ?? 'Не удалось привязать аккаунт.' };
    // вычистить одноразовый параметр из URL, чтобы баннер не «прилипал» при обновлении
    const rest = { ...route.query };
    delete rest.link;
    void router.replace({ query: rest });
  }
  await session.loadIdentities();
});

function dismiss() {
  redirectBanner.value = null;
  session.clearIdentitiesError();
}

async function onUnlink(type: IdentityType) {
  dismiss();
  await session.unlinkIdentity(type);
}

async function onLinkProvider(provider: OAuthProvider) {
  dismiss();
  await session.linkWithProvider(provider);
}

async function onSubmitPassword() {
  dismiss();
  const ok = await session.linkPassword(email.value.trim(), password.value);
  if (ok) {
    email.value = '';
    password.value = '';
    showPasswordForm.value = false;
  }
}
</script>

<template>
  <section class="rounded-card border border-border bg-surface p-5" data-testid="login-methods">
    <h2 class="text-sm font-medium text-text-secondary">Способы входа</h2>

    <div
      v-if="redirectBanner"
      class="mt-3 flex items-start justify-between gap-3 rounded-card border p-3 text-sm"
      :class="
        redirectBanner.kind === 'success'
          ? 'border-correct/30 bg-correct/10 text-correct'
          : 'border-incorrect/30 bg-incorrect/10 text-incorrect'
      "
      role="status"
      data-testid="login-methods-redirect-banner"
    >
      <span>{{ redirectBanner.text }}</span>
      <button type="button" class="shrink-0 underline" @click="dismiss">Скрыть</button>
    </div>

    <div
      v-if="session.identitiesError"
      class="mt-3 rounded-card border border-incorrect/30 bg-incorrect/10 p-3 text-sm text-incorrect"
      role="alert"
      data-testid="login-methods-error"
    >
      {{ session.identitiesError }}
    </div>

    <AppSpinner v-if="session.identitiesLoading && session.identities.length === 0" class="mt-4" />

    <ul v-else class="mt-3 divide-y divide-border">
      <li
        v-for="identity in session.identities"
        :key="identity.type"
        class="flex items-center justify-between gap-3 py-3"
        :data-testid="`identity-row-${identity.type}`"
      >
        <div class="min-w-0">
          <p class="font-medium">{{ identityLabel(identity.type) }}</p>
          <p v-if="identity.type === 'password'" class="truncate text-xs text-text-secondary">
            {{ identity.identifier }}
          </p>
        </div>
        <AppButton
          variant="secondary"
          :disabled="!canUnlink(session.identities, identity.type)"
          :title="onlyOne ? 'Это единственный способ входа' : undefined"
          :data-testid="`identity-unlink-${identity.type}`"
          @click="onUnlink(identity.type)"
        >
          Отвязать
        </AppButton>
      </li>
    </ul>

    <p v-if="onlyOne" class="mt-1 text-xs text-text-secondary">
      Это единственный способ входа — его нельзя отвязать.
    </p>

    <!-- Привязать недостающие OAuth -->
    <div v-if="missingOAuthProviders.length" class="mt-4 flex flex-wrap gap-2">
      <AppButton
        v-for="provider in missingOAuthProviders"
        :key="provider"
        variant="secondary"
        :disabled="session.linkStatus !== 'idle'"
        :data-testid="`identity-link-${provider}`"
        @click="onLinkProvider(provider)"
      >
        Привязать {{ identityLabel(provider) }}
      </AppButton>
    </div>

    <!-- Мини-форма привязки пароля (без отдельного экрана — временно, до задачи на регистрацию) -->
    <div v-if="!hasPassword" class="mt-4 border-t border-border pt-4">
      <AppButton
        v-if="!showPasswordForm"
        variant="secondary"
        data-testid="identity-show-password-form"
        @click="showPasswordForm = true"
      >
        Привязать пароль
      </AppButton>
      <form v-else class="space-y-3" data-testid="identity-password-form" @submit.prevent="onSubmitPassword">
        <div>
          <label class="block text-xs text-text-secondary" for="link-email">Email</label>
          <input
            id="link-email"
            v-model="email"
            type="email"
            required
            autocomplete="email"
            class="mt-1 w-full rounded-card border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label class="block text-xs text-text-secondary" for="link-password">Пароль</label>
          <input
            id="link-password"
            v-model="password"
            type="password"
            required
            minlength="8"
            autocomplete="new-password"
            class="mt-1 w-full rounded-card border border-border bg-surface-raised px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <p class="mt-1 text-xs text-text-secondary">Минимум 8 символов.</p>
        </div>
        <div class="flex gap-2">
          <AppButton type="submit" :disabled="session.linkStatus === 'processing'" data-testid="identity-password-submit">
            Привязать пароль
          </AppButton>
          <AppButton
            variant="ghost"
            :disabled="session.linkStatus === 'processing'"
            @click="showPasswordForm = false"
          >
            Отмена
          </AppButton>
        </div>
      </form>
    </div>
  </section>
</template>
