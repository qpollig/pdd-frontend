import type { TicketOut, TopicOut, TopicsListResponse } from '../api/types';
import type { CatalogSnapshot, Ticket, Topic } from './catalog';

/** TopicOut → domain Topic. */
export function mapTopic(dto: TopicOut): Topic {
  return {
    id: dto.id,
    title: dto.title,
    orderIndex: dto.order_index,
  };
}

/** TicketOut → domain Ticket. */
export function mapTicket(dto: TicketOut): Ticket {
  return {
    id: dto.id,
    number: dto.number,
    category: dto.category,
  };
}

/** TopicsListResponse (GET /api/v1/topics) → domain CatalogSnapshot. */
export function mapCatalog(dto: TopicsListResponse): CatalogSnapshot {
  return {
    topics: dto.topics.map(mapTopic),
    tickets: dto.tickets.map(mapTicket),
  };
}
