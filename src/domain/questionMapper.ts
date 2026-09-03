import type { AnswerOut, QuestionOut } from '../api/types';
import type { Answer, Question } from './question';

/** AnswerOut → domain Answer. `is_correct` stays null when the backend withholds it (never coerced to false). */
export function mapAnswer(dto: AnswerOut): Answer {
  return {
    id: dto.id,
    orderIndex: dto.order_index,
    text: dto.text,
    isCorrect: dto.is_correct ?? null,
  };
}

/** QuestionOut → domain Question. */
export function mapQuestion(dto: QuestionOut): Question {
  return {
    id: dto.id,
    orderIndex: dto.order_index,
    text: dto.text,
    imageUrl: dto.image_url,
    videoUrl: dto.video_url,
    explanation: dto.explanation,
    isFavorite: dto.is_favorite,
    answers: dto.answers.map(mapAnswer),
  };
}
