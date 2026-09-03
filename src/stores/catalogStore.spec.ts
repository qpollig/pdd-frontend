import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiClient } from '../api/client';
import { useCatalogStore } from './catalogStore';

describe('catalogStore loadCatalog', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('loads topics and tickets from a single GET /topics call', async () => {
    const catalog = useCatalogStore();

    await catalog.loadCatalog();

    expect(catalog.error).toBeNull();
    expect(catalog.tickets.length).toBeGreaterThan(0);
    expect(catalog.topics.length).toBeGreaterThan(0);
    expect(catalog.tickets[0]).toEqual({
      id: expect.any(String),
      number: expect.any(Number),
      category: expect.stringMatching(/^A_B|C_D$/),
    });
  });
});

describe('catalogStore loadTicket', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('lazily loads the catalog and starts a theory session for the chosen ticket', async () => {
    const { tickets } = await apiClient.getTopics();
    const target = tickets[0]!;
    const catalog = useCatalogStore();

    await catalog.loadTicket(target.id);

    expect(catalog.error).toBeNull();
    expect(catalog.currentTicket).toEqual({
      id: target.id,
      number: target.number,
      category: target.category,
      questions: expect.any(Array),
    });
    expect(catalog.currentTicket?.questions.length).toBeGreaterThan(0);
    expect(catalog.activeSessionId).toEqual(expect.any(String));
  });

  it('sets an error and clears currentTicket for an unknown ticket id', async () => {
    const catalog = useCatalogStore();

    await catalog.loadTicket('does-not-exist');

    expect(catalog.error).toBeTruthy();
    expect(catalog.currentTicket).toBeNull();
  });
});

describe('catalogStore loadTopicSession', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts a topic-scoped session using the real topic id, not a ticket', async () => {
    const { topics } = await apiClient.getTopics();
    const target = topics[0]!;
    const catalog = useCatalogStore();

    await catalog.loadTopicSession(target.id);

    expect(catalog.error).toBeNull();
    expect(catalog.currentTicket?.topicTitle).toBe(target.title);
    expect(catalog.currentTicket?.category).toBeNull();
    expect(catalog.currentTicket?.questions.length).toBeGreaterThan(0);
  });

  it('sets an error for an unknown topic id', async () => {
    const catalog = useCatalogStore();

    await catalog.loadTopicSession('does-not-exist');

    expect(catalog.error).toBeTruthy();
    expect(catalog.currentTicket).toBeNull();
  });
});

describe('catalogStore loadFavoritesSession', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts a favorites-scoped session with an empty list by default', async () => {
    const catalog = useCatalogStore();

    await catalog.loadFavoritesSession();

    expect(catalog.error).toBeNull();
    expect(catalog.currentTicket?.questions).toEqual([]);
    expect(catalog.activeSessionId).toEqual(expect.any(String));
  });

  it('includes a question once it has been favorited', async () => {
    const target = (await apiClient.getTopics()).tickets[0]!;
    const catalog = useCatalogStore();
    await catalog.loadTicket(target.id);
    const questionId = catalog.currentTicket!.questions[0]!.id;
    await apiClient.addFavorite(questionId);

    await catalog.loadFavoritesSession();

    expect(catalog.currentTicket?.questions.map((q) => q.id)).toContain(questionId);
  });
});
