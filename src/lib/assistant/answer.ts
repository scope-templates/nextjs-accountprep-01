import { generateText, stepCountIs, type LanguageModel, type ModelMessage } from 'ai';
import type { Db } from '../db';
import { todayIso, type Account, type Staff } from '../desk';
import { deskTools } from './tools';

export const MAX_MODEL_CALLS = 6;
export const MAX_OUTPUT_TOKENS = 1024;

export type ToolCallRecord = { name: string; arguments: unknown };
export type AssistantAnswer = { answer: string; tool_calls: ToolCallRecord[] };

export function systemPrompt(account: Account, today = todayIso()): string {
  return [
    'You answer questions for the Pemberline account desk. The sales team keeps a record here for each bus and shuttle operator',
    'it sells maintenance-scheduling software to: the account, its contacts, meeting notes, facts with the date each was checked',
    'and who checked it, and notes. A rep asks about one account at a time, usually before a call.',
    '',
    `This question is about account ${account.id}: ${account.name} (${account.kind}, ${account.hq_city}, ${account.hq_state}).`,
    'Every tool reads or writes this account only.',
    '',
    'Tools: account_summary (owner, stage, last touched, and the notes written on the account), contacts, meetings (newest',
    'first, with notes), facts (with checked_on and checked_by), save_note (saves a note on this account under the signed-in',
    "rep's name, when the rep asks for one).",
    '',
    `Answer in plain sentences, short enough to read before a call. Give dates as the records show them. Today is ${today}.`,
  ].join('\n');
}

const resultValue = (output: unknown) => (output && typeof output === 'object' && 'value' in output ? output.value : output);

// The last call goes out with no tools, so earlier tool calls and results are passed as plain text.
export function asPlainText(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message): ModelMessage => {
    if (message.role === 'assistant' && typeof message.content !== 'string') {
      const lines = message.content.map((part) =>
        part.type === 'text' ? part.text : part.type === 'tool-call' ? `Called ${part.toolName} with ${JSON.stringify(part.input)}.` : '',
      );
      return { role: 'assistant', content: lines.filter(Boolean).join('\n') || '(no text)' };
    }
    if (message.role === 'tool') {
      return { role: 'user', content: message.content.map((part) => `Result of ${part.toolName}: ${JSON.stringify(resultValue(part.output))}`).join('\n') };
    }
    return message;
  });
}

export async function answerQuestion(args: {
  db: Db; model: LanguageModel; account: Account; actor: Staff; question: string; abortSignal?: AbortSignal; now?: Date;
}): Promise<AssistantAnswer> {
  const now = args.now ?? new Date();
  const result = await generateText({
    model: args.model,
    system: systemPrompt(args.account, todayIso(now)),
    prompt: args.question,
    tools: deskTools({ db: args.db, accountId: args.account.id, actor: args.actor, now }),
    stopWhen: stepCountIs(MAX_MODEL_CALLS),
    prepareStep: ({ stepNumber, messages }) =>
      stepNumber === MAX_MODEL_CALLS - 1 ? { toolChoice: 'none', messages: asPlainText(messages) } : undefined,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 0,
    abortSignal: args.abortSignal,
  });
  return {
    answer: result.text,
    tool_calls: result.steps.flatMap((step) => step.toolCalls.map((call) => ({ name: call.toolName, arguments: call.input }))),
  };
}
