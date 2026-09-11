import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  authErrorMessage,
  isValidEmailFormat,
  isValidPasswordLength,
} from './auth';

describe('isValidEmailFormat', () => {
  it('accepts a plausible email', () => {
    expect(isValidEmailFormat('me@example.com')).toBe(true);
    expect(isValidEmailFormat('  me@example.com  ')).toBe(true); // обрезка пробелов
  });

  it('rejects obviously malformed input', () => {
    expect(isValidEmailFormat('not-an-email')).toBe(false);
    expect(isValidEmailFormat('me@')).toBe(false);
    expect(isValidEmailFormat('@example.com')).toBe(false);
    expect(isValidEmailFormat('')).toBe(false);
  });
});

describe('isValidPasswordLength', () => {
  it('accepts 8..72 (bcrypt limit)', () => {
    expect(isValidPasswordLength('a'.repeat(PASSWORD_MIN_LENGTH))).toBe(true);
    expect(isValidPasswordLength('a'.repeat(PASSWORD_MAX_LENGTH))).toBe(true);
  });

  it('rejects shorter than 8 or longer than 72', () => {
    expect(isValidPasswordLength('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
    expect(isValidPasswordLength('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toBe(false);
  });
});

describe('authErrorMessage', () => {
  it('maps known codes to specific text', () => {
    expect(authErrorMessage('EMAIL_ALREADY_REGISTERED')).toMatch(/уже зарегистрирован/);
    expect(authErrorMessage('INVALID_CREDENTIALS')).toMatch(/Неверный email или пароль/);
    expect(authErrorMessage('RATE_LIMITED')).toMatch(/Слишком много попыток/);
    expect(authErrorMessage('INVALID_OR_EXPIRED_TOKEN')).toMatch(/недействительна/);
  });

  it('does not distinguish "wrong password" from "no such user" — same single code/text', () => {
    // backend намеренно не различает эти два случая (тайминг-защита) — фронт не должен
    // придумывать собственную формулировку, которая бы это различие выдала.
    expect(authErrorMessage('INVALID_CREDENTIALS')).toBe('Неверный email или пароль.');
  });

  it('returns null for unknown or empty codes', () => {
    expect(authErrorMessage('SOMETHING_ELSE')).toBeNull();
    expect(authErrorMessage(null)).toBeNull();
    expect(authErrorMessage(undefined)).toBeNull();
    expect(authErrorMessage('')).toBeNull();
  });
});
