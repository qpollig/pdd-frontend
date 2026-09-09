import type { TicketProgressStatus } from '../api/types';

export type { TicketProgressStatus };

/** UI-facing domain model for GET /api/v1/progress — mapped via progressMapper. */
export interface ProgressSnapshot {
  ticketStatus: Map<string, TicketProgressStatus>;
  topicProgress: Map<string, { passed: number; total: number }>;
  bank: { passed: number; total: number };
}
