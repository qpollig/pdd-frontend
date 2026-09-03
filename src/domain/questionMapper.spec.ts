import { describe, expect, it } from 'vitest';
import type { AnswerOut, QuestionOut } from '../api/types';
import { mapAnswer, mapQuestion } from './questionMapper';

describe('mapAnswer (AnswerOut → domain Answer)', () => {
  it('maps every field 1:1, preserving id and order_index', () => {
    const dto: AnswerOut = { id: 'a-1', order_index: 2, text: 'Вариант', is_correct: true };
    expect(mapAnswer(dto)).toEqual({ id: 'a-1', orderIndex: 2, text: 'Вариант', isCorrect: true });
  });

  it('does not coerce a withheld is_correct: null into false', () => {
    const dto: AnswerOut = { id: 'a-1', order_index: 0, text: 'Вариант', is_correct: null };
    expect(mapAnswer(dto).isCorrect).toBeNull();
  });

  it('treats a missing is_correct the same as null, not false', () => {
    const dto: AnswerOut = { id: 'a-1', order_index: 0, text: 'Вариант' };
    expect(mapAnswer(dto).isCorrect).toBeNull();
  });

  it('keeps an explicit false as false', () => {
    const dto: AnswerOut = { id: 'a-1', order_index: 0, text: 'Вариант', is_correct: false };
    expect(mapAnswer(dto).isCorrect).toBe(false);
  });
});

describe('mapQuestion (QuestionOut → domain Question)', () => {
  const baseDto: QuestionOut = {
    id: 'q-1',
    order_index: 3,
    text: 'Вопрос?',
    image_url: null,
    video_url: null,
    explanation: null,
    is_favorite: false,
    answers: [
      { id: 'q-1::a0', order_index: 0, text: 'A', is_correct: true },
      { id: 'q-1::a1', order_index: 1, text: 'B', is_correct: false },
    ],
  };

  it('maps id and order_index without deriving identity from array position', () => {
    const question = mapQuestion(baseDto);
    expect(question.id).toBe('q-1');
    expect(question.orderIndex).toBe(3);
    expect(question.answers.map((a) => a.id)).toEqual(['q-1::a0', 'q-1::a1']);
  });

  it('maps nullable image_url/video_url/explanation through unchanged', () => {
    const question = mapQuestion(baseDto);
    expect(question.imageUrl).toBeNull();
    expect(question.videoUrl).toBeNull();
    expect(question.explanation).toBeNull();
  });

  it('passes populated nullable fields through unchanged', () => {
    const question = mapQuestion({
      ...baseDto,
      image_url: 'https://cdn.example/img.jpg',
      video_url: 'https://cdn.example/vid.mp4',
      explanation: 'Пояснение',
      is_favorite: true,
    });
    expect(question.imageUrl).toBe('https://cdn.example/img.jpg');
    expect(question.videoUrl).toBe('https://cdn.example/vid.mp4');
    expect(question.explanation).toBe('Пояснение');
    expect(question.isFavorite).toBe(true);
  });

  it('maps every answer through mapAnswer, preserving withheld correctness as null', () => {
    const question = mapQuestion({
      ...baseDto,
      answers: [
        { id: 'q-1::a0', order_index: 0, text: 'A', is_correct: null },
        { id: 'q-1::a1', order_index: 1, text: 'B', is_correct: null },
      ],
    });
    expect(question.answers.every((a) => a.isCorrect === null)).toBe(true);
  });
});
