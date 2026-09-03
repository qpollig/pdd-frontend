<script setup lang="ts">
import { computed, reactive } from 'vue';

const props = defineProps<{
  disabled?: boolean;
}>();

const emit = defineEmits<{
  submit: [];
}>();

const fields = reactive({
  number: '',
  expiry: '',
  cvv: '',
});

const canPay = computed(
  () =>
    !props.disabled &&
    fields.number.trim().length > 0 &&
    fields.expiry.trim().length > 0 &&
    fields.cvv.trim().length > 0,
);

function onSubmit() {
  if (!canPay.value) return;
  emit('submit');
}
</script>

<template>
  <form class="min-w-0" @submit.prevent="onSubmit">
    <fieldset
      :disabled="disabled"
      class="min-w-0 space-y-4 rounded-card border border-border bg-surface p-5 sm:p-6"
    >
      <legend class="px-1 text-base font-semibold">Способ оплаты</legend>
      <p class="text-sm leading-relaxed text-text-secondary">
        Это тестовая форма оплаты: реальный платёжный провайдер ещё не подключён. Введённые данные
        карты никуда не отправляются.
      </p>

      <div class="min-w-0">
        <label class="block text-sm font-medium" for="checkout-card-number">Номер карты</label>
        <input
          id="checkout-card-number"
          v-model="fields.number"
          class="mt-1 w-full min-h-11 min-w-0 rounded-card border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
          inputmode="numeric"
          autocomplete="off"
          name="checkout-card-number"
          placeholder="0000 0000 0000 0000"
          data-testid="checkout-card-number"
        />
      </div>

      <div class="grid min-w-0 grid-cols-2 gap-3">
        <div class="min-w-0">
          <label class="block text-sm font-medium" for="checkout-card-expiry">Срок</label>
          <input
            id="checkout-card-expiry"
            v-model="fields.expiry"
            class="mt-1 w-full min-h-11 min-w-0 rounded-card border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
            inputmode="numeric"
            autocomplete="off"
            name="checkout-card-expiry"
            placeholder="MM/YY"
            data-testid="checkout-card-expiry"
          />
        </div>
        <div class="min-w-0">
          <label class="block text-sm font-medium" for="checkout-card-cvv">CVV</label>
          <input
            id="checkout-card-cvv"
            v-model="fields.cvv"
            class="mt-1 w-full min-h-11 min-w-0 rounded-card border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text-primary"
            inputmode="numeric"
            autocomplete="off"
            name="checkout-card-cvv"
            placeholder="000"
            data-testid="checkout-card-cvv"
          />
        </div>
      </div>
    </fieldset>
    <slot :can-pay="canPay" />
  </form>
</template>
