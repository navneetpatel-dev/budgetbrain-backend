export { AI_COACH_CONFIG } from './config';
export { buildCoachSystemPrompt, buildFinanceContextMessage } from './prompts/coachSystemPrompt';
export { buildFinanceContext } from './context/buildFinanceContext';
export type { FinanceContextResult } from './context/buildFinanceContext';
export { chatCompletion, OpenAiChatError } from './openai/chatCompletion';
export type { ChatMessage } from './openai/chatCompletion';
export { generateCoachFallback } from './fallback';
