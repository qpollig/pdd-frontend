/**
 * Email+password auth (Фаза 1 backend): чистая доменная логика без сети — валидация форм перед
 * отправкой и перевод кодов ошибок backend'а (`{"detail": "КОД"}`, см. docs/API_ERRORS.md) в
 * конкретный текст. Тот же принцип, что src/domain/identity.ts::identityErrorMessage — инлайн
 * сообщение под конкретный код, не общий тост.
 */

/** 72 — предел bcrypt на backend (app/services/passwords.py), 8 — минимум по ТЗ задачи. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/**
 * Намеренно простая проверка формата (наличие @ и точки в домене) — НЕ полная RFC 5322 валидация
 * и не попытка угадать, существует ли такой адрес. Реальная проверка (EmailStr) — на backend;
 * здесь только чтобы не гонять по сети совсем пустой/битый ввод.
 */
const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_FORMAT_RE.test(email.trim());
}

export function isValidPasswordLength(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}

/**
 * Коды ошибок email+password auth → конкретный текст. Единая таблица для register/login/
 * forgot/reset — каждый код однозначно относится к своему эндпоинту (см. docs/API_ERRORS.md),
 * поэтому контекст (какая именно форма) не нужен.
 *
 * `RATE_LIMITED` — общий код и для /auth/login, и для /auth/password/forgot (тот же текст подходит
 * обоим: "слишком много попыток", ТЗ раздела 3 этой задачи).
 */
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  EMAIL_ALREADY_REGISTERED: 'Этот email уже зарегистрирован.',
  INVALID_CREDENTIALS: 'Неверный email или пароль.',
  RATE_LIMITED: 'Слишком много попыток. Попробуйте позже.',
  INVALID_OR_EXPIRED_TOKEN: 'Ссылка для сброса пароля недействительна или уже была использована.',
};

export function authErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return AUTH_ERROR_MESSAGES[code] ?? null;
}
