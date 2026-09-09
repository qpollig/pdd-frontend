import type { ProgressResponse } from '../api/types';
import type { ProgressSnapshot } from './progress';

/** GET /api/v1/progress → domain ProgressSnapshot. */
export function mapProgress(dto: ProgressResponse): ProgressSnapshot {
  return {
    ticketStatus: new Map(dto.tickets.map((ticket) => [ticket.ticket_id, ticket.status])),
    topicProgress: new Map(
      dto.topics.map((topic) => [
        topic.topic_id,
        { passed: topic.questions_passed, total: topic.questions_total },
      ]),
    ),
    bank: { passed: dto.bank.questions_passed, total: dto.bank.questions_total },
  };
}
