import type { TicketMode } from '../types/ticket';

export type PostSessionActionId =
  | 'next-ticket'
  | 'tickets'
  | 'home'
  | 'next-error'
  | 'theory'
  | 'repeat-exam';

export interface PostSessionAction {
  id: PostSessionActionId;
  label: string;
  variant: 'primary' | 'secondary' | 'ghost';
}

export interface PostSessionActions {
  primary: PostSessionAction;
  secondary: PostSessionAction[];
}

/** Next catalog ticket by number. Null if the list is empty, current id is unknown, or this is the last ticket. */
export function nextTheoryTicketId(
  tickets: ReadonlyArray<{ id: string; number: number }>,
  currentTicketId: string,
): string | null {
  if (!currentTicketId || tickets.length === 0) return null;
  const ordered = [...tickets].sort((left, right) => left.number - right.number);
  const index = ordered.findIndex((ticket) => ticket.id === currentTicketId);
  if (index < 0) return null;
  return ordered[index + 1]?.id ?? null;
}

export function getPostSessionActions(input: {
  mode: TicketMode;
  remainingErrorCount?: number;
}): PostSessionActions {
  if (input.mode === 'theory') {
    return {
      primary: { id: 'next-ticket', label: 'Следующий билет', variant: 'primary' },
      secondary: [
        { id: 'tickets', label: 'К билетам', variant: 'secondary' },
        { id: 'home', label: 'На главную', variant: 'ghost' },
      ],
    };
  }

  if (input.mode === 'errors') {
    if ((input.remainingErrorCount ?? 0) > 0) {
      return {
        primary: { id: 'next-error', label: 'К следующей ошибке', variant: 'primary' },
        secondary: [{ id: 'home', label: 'На главную', variant: 'ghost' }],
      };
    }
    return {
      primary: { id: 'theory', label: 'Вернуться к теории', variant: 'primary' },
      secondary: [{ id: 'home', label: 'На главную', variant: 'ghost' }],
    };
  }

  return {
    primary: { id: 'home', label: 'На главную', variant: 'primary' },
    secondary: [{ id: 'repeat-exam', label: 'Повторить экзамен', variant: 'secondary' }],
  };
}
