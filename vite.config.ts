import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// GitHub Pages раздаёт проект как project-site по адресу /pdd-frontend/ — это дефолт для сборки.
// Docker/Nginx-деплой раздаёт с корня, поэтому там образ собирается с VITE_BASE_PATH=/ (см.
// Dockerfile). Переменная окружения переопределяет и dev, и build.
export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE_PATH || (command === 'build' ? '/pdd-frontend/' : '/'),
  plugins: [vue(), tailwindcss()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.spec.ts'],
    // Unit/e2e-фикстуры рассчитаны на MockApiClient. Переключение боевого рантайма через
    // .env / .env.local (VITE_USE_MOCK_API=false, VITE_MOCK_LOGIN=true) не должно протекать
    // в тесты: принудительно возвращаем дефолт независимо от .env*. Специализированные спеки
    // (sessionStore.oauthRedirect.spec.ts) переопределяют это через vi.stubEnv.
    env: {
      VITE_USE_MOCK_API: 'true',
      VITE_MOCK_LOGIN: 'false',
    },
  },
}))
