export { AI_COACH_CONFIG } from './config';
export { buildCoachSystemPrompt, buildFinanceContextMessage } from './prompts/coachSystemPrompt';
export { buildFinanceContext } from './context/buildFinanceContext';
export type { FinanceContextResult } from './context/buildFinanceContext';
export { chatCompletion, streamChatCompletion, OpenAiChatError } from './openai/chatCompletion';
export type { ChatMessage, StreamChatCompletionResult } from './openai/chatCompletion';
export { generateCoachFallback } from './fallback';
export { extractReceiptData } from './openai/visionExtraction';
export type { ReceiptExtraction } from './openai/visionExtraction';
