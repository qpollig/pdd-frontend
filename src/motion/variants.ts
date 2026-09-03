/**
 * Shared enter-animation presets for @vueuse/motion (v-motion directive).
 * Subtle, fast, opacity+transform only — per emil-design-eng guidance: entrance
 * animations for occasionally-seen page content, under 300ms, no scale(0), no bounce.
 */

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const DURATION_MS = 220;

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fade + 8px rise. `delayMs` staggers siblings (see `staggerDelay`). */
export function fadeUp(delayMs = 0) {
  if (prefersReducedMotion) {
    return { initial: { opacity: 1 }, enter: { opacity: 1 } };
  }
  return {
    initial: { opacity: 0, y: 8 },
    enter: { opacity: 1, y: 0, transition: { duration: DURATION_MS, ease: EASE_OUT, delay: delayMs } },
  };
}

/** Caps total stagger spread so long lists don't take seconds to finish revealing. */
export function staggerDelay(index: number, stepMs = 45, capMs = 240): number {
  return Math.min(index * stepMs, capMs);
}

/** Subtle scale+fade "pop" for rare, celebratory moments (e.g. a success checkmark). */
export function popIn() {
  if (prefersReducedMotion) {
    return { initial: { opacity: 1 }, enter: { opacity: 1 } };
  }
  return {
    initial: { opacity: 0, scale: 0.9 },
    enter: { opacity: 1, scale: 1, transition: { duration: 260, ease: EASE_OUT } },
  };
}
