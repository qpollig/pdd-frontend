/**
 * Детерминированная mock-история предыдущих ошибок.
 * Ссылается на существующие вопросы ticket-1.json (вопросы 2, 7, 13),
 * а не на первые N вопросов билета.
 *
 * ASSUMPTION: отдельного GET истории ошибок в ТЗ нет; это fixture до backend.
 */
export const MOCK_ERROR_QUESTION_IDS = [
  '050bbd8d2ba901e0b895141adadf7a60',
  'ca976eeda460719cc594c0a40bb82616',
  'd0063ffc0bad8476f04187c35b74b917',
] as const;
