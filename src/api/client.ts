import type { ApiClient } from './ApiClient';
import { MockApiClient } from './MockApiClient';

/**
 * Единственная точка смены реализации. UI и Pinia импортируют только `apiClient`.
 * Когда появится OpenAPI backend, здесь подключается RealApiClient.
 */
export const apiClient: ApiClient = new MockApiClient();
