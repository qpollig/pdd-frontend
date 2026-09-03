/**
 * UI-facing domain model for a question and its answers.
 * Mapped from openapi.json QuestionOut/AnswerOut via questionMapper — components
 * never see the wire DTO shape (snake_case, mode-gated is_correct) directly.
 */
export interface Answer {
  id: string;
  orderIndex: number;
  text: string;
  /** null when the backend withholds correctness for this session mode (e.g. gibdd_exam pre-answer). */
  isCorrect: boolean | null;
}

export interface Question {
  id: string;
  orderIndex: number;
  text: string;
  imageUrl: string | null;
  videoUrl: string | null;
  /** null when withheld for the current session mode. */
  explanation: string | null;
  isFavorite: boolean;
  answers: Answer[];
}
