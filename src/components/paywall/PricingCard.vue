<script setup lang="ts">
import type { PremiumOffer } from '../../api/types';
import { formatPremiumPriceLine } from '../../domain/paywall';

defineProps<{ offer: PremiumOffer }>();
</script>

<template>
  <section
    class="min-w-0 rounded-card border border-border bg-accent px-4 py-5 text-text-on-accent sm:px-5"
    aria-label="Тариф Premium"
  >
    <p class="text-xs font-semibold uppercase tracking-wide">ХИТ</p>
    <p class="mt-2 break-words text-xl font-semibold leading-snug sm:text-2xl">
      {{ formatPremiumPriceLine(offer) }}
    </p>
    <p class="mt-2 text-sm leading-relaxed">
      После пробного периода списывается {{ offer.monthly_price_rub }} ₽ в месяц, пока подписка
      активна. Автопродление можно отключить в профиле в любой момент.
    </p>
  </section>
</template>
