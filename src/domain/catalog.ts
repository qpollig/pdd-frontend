import type { TicketCategory } from '../api/types';

/**
 * UI-facing domain model for a catalog topic.
 * Mapped from openapi.json TopicOut via catalogMapper — components never see the wire DTO shape.
 */
export interface Topic {
  id: string;
  title: string;
  orderIndex: number;
  questionsCount: number;
}

/**
 * UI-facing domain model for a catalog ticket.
 * Mapped from openapi.json TicketOut. No question data — see TicketPlayer/catalogStore, questions
 * for a ticket come from startSession, not from this model.
 */
export interface Ticket {
  id: string;
  number: number;
  category: TicketCategory;
}

/** GET /api/v1/topics response, mapped to domain models. */
export interface CatalogSnapshot {
  topics: Topic[];
  tickets: Ticket[];
}
