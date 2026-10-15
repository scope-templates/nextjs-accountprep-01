import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

export const ASSISTANT_MODEL_ID = 'claude-sonnet-4-5';

export function anthropicModel(apiKey: string, fetch?: typeof globalThis.fetch): LanguageModel {
  return createAnthropic({ apiKey, fetch })(ASSISTANT_MODEL_ID);
}

export function modelFromEnv(env: Record<string, string | undefined> = process.env): LanguageModel | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  return apiKey ? anthropicModel(apiKey) : null;
}
