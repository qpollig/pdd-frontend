import type { OAuthProvider } from '../api/types';

/**
 * Публичные Authorization Code endpoint'ы Yandex ID / VK OAuth.
 * ASSUMPTION: классический authorization code grant (без PKCE) — это единственный вариант,
 * совместимый с реальным backend-контрактом OAuthLoginRequest { code, redirect_uri? }
 * (openapi.json /api/v1/auth/oauth/{provider}): в нём нет поля code_verifier, которое требовал бы
 * PKCE-вариант VK ID (id.vk.com). VITE_*_OAUTH_AUTHORIZE_URL переопределяет только сам URL —
 * этого достаточно для другого КЛАССИЧЕСКОГО (code + redirect_uri, без PKCE) эндпоинта, но
 * НЕДОСТАТОЧНО для переключения на VK ID: этот код не добавляет code_challenge к authorize-
 * запросу, и даже если бы добавлял, у OAuthLoginRequest на backend нет поля code_verifier для
 * завершения PKCE-обмена. Переключение на VK ID требует правки backend-контракта — это вне
 * возможностей одного этого escape hatch.
 */
const DEFAULT_AUTHORIZE_ENDPOINTS: Record<OAuthProvider, string> = {
  yandex: 'https://oauth.yandex.ru/authorize',
  vk: 'https://oauth.vk.com/authorize',
};

/** VK classic OAuth requires an API version on every authorize request. */
const VK_API_VERSION = '5.199';

function authorizeEndpoint(provider: OAuthProvider): string {
  const override =
    provider === 'yandex'
      ? import.meta.env.VITE_YANDEX_OAUTH_AUTHORIZE_URL
      : import.meta.env.VITE_VK_OAUTH_AUTHORIZE_URL;
  return override || DEFAULT_AUTHORIZE_ENDPOINTS[provider];
}

function clientId(provider: OAuthProvider): string | undefined {
  return provider === 'yandex' ? import.meta.env.VITE_YANDEX_OAUTH_CLIENT_ID : import.meta.env.VITE_VK_OAUTH_CLIENT_ID;
}

/** client_id не секрет (виден в адресной строке после редиректа), но без него редирект бессмысленен. */
export function isOAuthProviderConfigured(provider: OAuthProvider): boolean {
  return Boolean(clientId(provider));
}

/**
 * Колбэк-роут самого фронтенда, на который провайдер вернёт пользователя (см. router: 'oauth-callback').
 * Тот же паттерн абсолютизации BASE_URL, что и MockApiClient.mockCheckoutReturnUrl() для checkout.
 */
export function buildOAuthCallbackUrl(provider: OAuthProvider): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${base}auth/callback/${provider}`;
}

/** CSRF-защита OAuth-редиректа: непредсказуемое значение, проверяемое на возврате из провайдера. */
export function generateOAuthState(): string {
  const cryptoRef = typeof crypto !== 'undefined' ? crypto : undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Полный URL страницы авторизации провайдера, на которую отправляется браузер. */
export function buildAuthorizeUrl(provider: OAuthProvider, options: { redirectUri: string; state: string }): string {
  const id = clientId(provider);
  if (!id) {
    throw new Error(`OAUTH_PROVIDER_NOT_CONFIGURED: ${provider}`);
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: id,
    redirect_uri: options.redirectUri,
    state: options.state,
  });
  if (provider === 'vk') {
    params.set('v', VK_API_VERSION);
    params.set('display', 'page');
  }
  return `${authorizeEndpoint(provider)}?${params.toString()}`;
}
