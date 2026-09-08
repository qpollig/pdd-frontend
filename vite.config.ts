import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// Served as a GitHub Pages project site at /pdd-frontend/, not the domain root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/pdd-frontend/' : '/',
  plugins: [vue(), tailwindcss()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.spec.ts'],
    // Unit/e2e-фикстуры рассчитаны на MockApiClient. Переключение боевого рантайма на
    // RealApiClient идёт через .env.local (VITE_USE_MOCK_API=false) и не должно протекать
    // в тесты: здесь принудительно возвращаем моки независимо от .env.local.
    env: {
      VITE_USE_MOCK_API: 'true',
    },
  },
}))
