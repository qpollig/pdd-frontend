import { describe, expect, it } from 'vitest';
import type { TicketOut, TopicOut, TopicsListResponse } from '../api/types';
import { mapCatalog, mapTicket, mapTopic } from './catalogMapper';

describe('mapTopic (TopicOut → domain Topic)', () => {
  it('maps order_index to orderIndex without deriving it from array position', () => {
    const dto: TopicOut = { id: 't-1', title: 'Дорожные знаки', order_index: 5, questions_count: 12 };
    expect(mapTopic(dto)).toEqual({
      id: 't-1',
      title: 'Дорожные знаки',
      orderIndex: 5,
      questionsCount: 12,
    });
  });
});

describe('mapTicket (TicketOut → domain Ticket)', () => {
  it('maps id/number/category 1:1, without a title or progress fields', () => {
    const dto: TicketOut = { id: 'tk-1', number: 7, category: 'A_B' };
    const ticket = mapTicket(dto);
    expect(ticket).toEqual({ id: 'tk-1', number: 7, category: 'A_B' });
    expect(ticket).not.toHaveProperty('title');
    expect(ticket).not.toHaveProperty('questions_count');
    expect(ticket).not.toHaveProperty('answered_count');
  });

  it('passes the C_D category through unchanged', () => {
    expect(mapTicket({ id: 'tk-2', number: 1, category: 'C_D' }).category).toBe('C_D');
  });
});

describe('mapCatalog (TopicsListResponse → domain CatalogSnapshot)', () => {
  it('maps topics and tickets from the single /topics response, no questions', () => {
    const dto: TopicsListResponse = {
      topics: [{ id: 't-1', title: 'Тема', order_index: 0, questions_count: 3 }],
      tickets: [{ id: 'tk-1', number: 1, category: 'A_B' }],
    };
    const catalog = mapCatalog(dto);
    expect(catalog).toEqual({
      topics: [{ id: 't-1', title: 'Тема', orderIndex: 0, questionsCount: 3 }],
      tickets: [{ id: 'tk-1', number: 1, category: 'A_B' }],
    });
    expect(catalog).not.toHaveProperty('questions');
  });
});
