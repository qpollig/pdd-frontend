import { describe, expect, it } from 'vitest';
import { getPostSessionActions, nextTheoryTicketId } from './postSessionNav';

const tickets = [
  { id: 't-1', number: 1 },
  { id: 't-2', number: 2 },
  { id: 't-3', number: 3 },
];

describe('nextTheoryTicketId', () => {
  it('returns the next catalog ticket by number', () => {
    expect(nextTheoryTicketId(tickets, 't-1')).toBe('t-2');
    expect(nextTheoryTicketId(tickets, 't-2')).toBe('t-3');
  });

  it('returns null for the last ticket, unknown id, or an empty catalog', () => {
    expect(nextTheoryTicketId(tickets, 't-3')).toBeNull();
    expect(nextTheoryTicketId(tickets, 'missing')).toBeNull();
    expect(nextTheoryTicketId([], 't-1')).toBeNull();
    expect(nextTheoryTicketId(tickets, '')).toBeNull();
  });
});

describe('getPostSessionActions', () => {
  it('gives Theory a next-ticket primary and catalog/home secondary', () => {
    expect(getPostSessionActions({ mode: 'theory' })).toEqual({
      primary: { id: 'next-ticket', label: 'Следующий билет', variant: 'primary' },
      secondary: [
        { id: 'tickets', label: 'К билетам', variant: 'secondary' },
        { id: 'home', label: 'На главную', variant: 'ghost' },
      ],
    });
  });

  it('offers the next remaining error only when the runtime still has questions', () => {
    expect(getPostSessionActions({ mode: 'errors', remainingErrorCount: 2 }).primary).toEqual({
      id: 'next-error',
      label: 'К следующей ошибке',
      variant: 'primary',
    });
    expect(getPostSessionActions({ mode: 'errors', remainingErrorCount: 0 }).primary).toEqual({
      id: 'theory',
      label: 'Вернуться к теории',
      variant: 'primary',
    });
    expect(
      getPostSessionActions({ mode: 'errors', remainingErrorCount: 0 }).secondary.map((action) => action.id),
    ).not.toContain('next-error');
  });

  it('keeps Exam home as the primary and repeat as secondary', () => {
    expect(getPostSessionActions({ mode: 'exam' })).toEqual({
      primary: { id: 'home', label: 'На главную', variant: 'primary' },
      secondary: [{ id: 'repeat-exam', label: 'Повторить экзамен', variant: 'secondary' }],
    });
  });
});
