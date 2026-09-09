/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK_API?: string;
  readonly VITE_API_BASE_URL?: string;
  /** Публичный client_id OAuth-приложения (не секрет) — нужен только при VITE_USE_MOCK_API=false. */
  readonly VITE_YANDEX_OAUTH_CLIENT_ID?: string;
  readonly VITE_VK_OAUTH_CLIENT_ID?: string;
  /** Переопределение authorize-эндпоинта провайдера — см. src/auth/oauthRedirect.ts. */
  readonly VITE_YANDEX_OAUTH_AUTHORIZE_URL?: string;
  readonly VITE_VK_OAUTH_AUTHORIZE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
