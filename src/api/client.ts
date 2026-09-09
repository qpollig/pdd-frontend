import type { ApiClient } from './ApiClient';
import { MockApiClient } from './MockApiClient';
import { RealApiClient } from './RealApiClient';

/**
 * Единственная точка смены реализации. UI и Pinia импортируют только `apiClient`.
 *
 * Переключение — через .env / .env.local (Vite):
 *   VITE_USE_MOCK_API=false        — включить RealApiClient (по умолчанию true — моки,
 *                                     чтобы существующие unit/e2e-тесты не сломались молча)
 *   VITE_API_BASE_URL=http://...   — адрес backend (по умолчанию http://localhost:8000)
 */
const useMock = import.meta.env.VITE_USE_MOCK_API !== 'false';
// ?? (не ||): пустая строка — осознанное значение (same-origin запросы через Nginx-прокси
// в проде, см. Dockerfile/nginx.conf), а не "переменная не задана". || затирал бы её дефолтом.
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export const apiClient: ApiClient = useMock ? new MockApiClient() : new RealApiClient(baseUrl);

/**
 * Разводит sessionStore.loginWithProvider() между фиксированным mock-кодом (dev/e2e, см.
 * MockApiClient) и настоящим OAuth-редиректом на провайдера (RealApiClient) — единственное место,
 * которое об этом переключении знает, тем же способом, что и apiClient выше.
 */
export const isMockApi = useMock;

/**
 * Способ входа отвязан от источника данных: `VITE_MOCK_LOGIN=true` форсирует mock-вход
 * (фиксированный код на backend с OAUTH_ALLOW_MOCK=true) даже при `VITE_USE_MOCK_API=false` —
 * это позволяет тянуть РЕАЛЬНЫЕ билеты/темы с backend, пока нет зарегистрированных
 * Yandex/VK OAuth-приложений. Если флаг не задан — поведение как раньше, следует за useMock.
 */
export const useMockLogin = import.meta.env.VITE_MOCK_LOGIN === 'true' || useMock;
