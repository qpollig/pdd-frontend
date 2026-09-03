<script setup lang="ts">
import type { Answer, Question } from '../../domain/question';
import type { QuestionState } from '../../types/ticket';
import AnswerButton, { type AnswerVariant } from './AnswerButton.vue';

const props = defineProps<{
  question: Question;
  state: QuestionState;
  locked?: boolean;
  concealResults?: boolean;
}>();
const emit = defineEmits<{ 'select-answer': [answerId: string] }>();

function variantFor(answer: Answer): AnswerVariant {
  const { status, selectedAnswerId } = props.state;
  if (props.locked && status === 'unanswered') return 'disabled';
  if (status === 'unanswered') return 'default';
  if (props.concealResults) {
    if (answer.id === selectedAnswerId) return 'selected';
    return 'disabled';
  }
  if (answer.id === selectedAnswerId) return status === 'correct' ? 'correct' : 'incorrect';
  const correctId =
    props.state.correctAnswerId ?? props.question.answers.find((item) => item.isCorrect)?.id ?? null;
  if (status === 'incorrect' && answer.id === correctId) return 'correct-muted';
  return 'disabled';
}
</script>

<template>
  <div>
    <h2 class="text-lg font-semibold leading-snug sm:text-xl">{{ question.text }}</h2>

    <ul class="mt-4 flex flex-col gap-3">
      <li v-for="answer in question.answers" :key="answer.id">
        <AnswerButton
          :text="answer.text"
          :variant="variantFor(answer)"
          @click="emit('select-answer', answer.id)"
        />
      </li>
    </ul>
  </div>
</template>
