import type { OAuthProvider } from '../api/types';

/** Способ входа. camelCase-граница для UI (см. identityMapper). */
export type IdentityType = 'password' | OAuthProvider; // 'password' | 'yandex' | 'vk'

export interface Identity {
  type: IdentityType;
  identifier: string; // email для password; oauth_id для yandex/vk (пользователю не показываем)
  createdAt: string;
}

/** Человекочитаемое имя способа входа. */
export function identityLabel(type: IdentityType): string {
  if (type === 'yandex') return 'Яндекс';
  if (type === 'vk') return 'VK';
  return 'Email';
}

/**
 * Можно ли отвязать способ входа `type` у пользователя с этим списком.
 * Нельзя, если после удаления не осталось бы ни одного способа — тогда аккаунт станет
 * навсегда недоступен (backend вернёт CANNOT_UNLINK_LAST_IDENTITY, но кнопку дизейблим заранее).
 */
export function canUnlink(identities: Identity[], type: IdentityType): boolean {
  const present = identities.some((identity) => identity.type === type);
  const remainingAfter = identities.filter((identity) => identity.type !== type).length;
  return present && remainingAfter >= 1;
}

/**
 * Специфичные сообщения для кодов ошибок связывания (backend `{"detail": "КОД"}`,
 * см. docs/API_ERRORS.md раздел «Связывание способов входа»). Неизвестный код → null,
 * вызывающая сторона показывает общий текст.
 */
export const IDENTITY_ERROR_MESSAGES: Record<string, string> = {
  EMAIL_ALREADY_REGISTERED: 'Этот email уже используется другим аккаунтом.',
  PASSWORD_ALREADY_SET: 'Пароль уже привязан к этому аккаунту.',
  IDENTITY_ALREADY_LINKED: 'Этот Яндекс- или VK-аккаунт уже привязан к другому профилю.',
  CANNOT_UNLINK_LAST_IDENTITY: 'Это единственный способ входа — его нельзя отвязать.',
  IDENTITY_NOT_FOUND: 'Этот способ входа уже отвязан.',
  OAUTH_EXCHANGE_FAILED: 'Не удалось подтвердить аккаунт у провайдера. Попробуйте ещё раз.',
};

export function identityErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return IDENTITY_ERROR_MESSAGES[code] ?? null;
}
