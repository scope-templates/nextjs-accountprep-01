import { generateText, stepCountIs, type AssistantContent, type LanguageModel, type ModelMessage, type StepResult, type ToolContent, type ToolSet } from 'ai';
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

function asLine(part: Exclude<AssistantContent, string>[number] | ToolContent[number]): string {
  switch (part.type) {
    case 'text':
      return part.text;
    case 'tool-call':
      return `Called ${part.toolName} with ${JSON.stringify(part.input)}.`;
    case 'tool-result':
      return `Result of ${part.toolName}: ${JSON.stringify(resultValue(part.output))}`;
    default:
      return '';
  }
}

// The last call goes out with no tools, so earlier tool calls and results are passed as plain text. A tool the
// provider runs itself puts its result in the assistant message rather than in a tool message.
export function asPlainText(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message): ModelMessage => {
    if (message.role === 'assistant' && typeof message.content !== 'string') {
      return { role: 'assistant', content: message.content.map(asLine).filter(Boolean).join('\n') || '(no text)' };
    }
    if (message.role === 'tool') {
      return { role: 'user', content: message.content.map(asLine).filter(Boolean).join('\n') };
    }
    return message;
  });
}

// Blank text and parts other than text and tools (sources, for one) do not count as what a call ended on.
const endsOnProviderTool = <T extends ToolSet>(step: StepResult<T>) => {
  const last = step.content.filter((part) => (part.type === 'text' ? part.text.trim() : part.type.startsWith('tool-'))).at(-1);
  return last !== undefined && last.type !== 'text' && 'providerExecuted' in last && last.providerExecuted === true;
};

export async function answerQuestion(args: {
  db: Db; model: LanguageModel; account: Account; actor: Staff; question: string; abortSignal?: AbortSignal; now?: Date;
}): Promise<AssistantAnswer> {
  const now = args.now ?? new Date();
  const tools = deskTools({ db: args.db, accountId: args.account.id, actor: args.actor, now });
  const messages: ModelMessage[] = [{ role: 'user', content: args.question }];
  const steps: StepResult<typeof tools>[] = [];
  let answer = '';
  // generateText stops after a call that asks for none of the desk's tools. When that call ended on a provider tool
  // (a paused turn, with or without some text before it), the loop goes on from there, inside the same six calls.
  do {
    const callsBefore = steps.length;
    const result = await generateText({
      model: args.model,
      system: systemPrompt(args.account, todayIso(now)),
      messages,
      tools,
      stopWhen: stepCountIs(MAX_MODEL_CALLS - callsBefore),
      prepareStep: ({ stepNumber, messages }) =>
        callsBefore + stepNumber === MAX_MODEL_CALLS - 1 ? { toolChoice: 'none', messages: asPlainText(messages) } : undefined,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 0,
      abortSignal: args.abortSignal,
    });
    steps.push(...result.steps);
    messages.push(...result.response.messages);
    answer = result.text;
  } while (steps.length < MAX_MODEL_CALLS && endsOnProviderTool(steps[steps.length - 1]));
  return {
    answer,
    tool_calls: steps.flatMap((step) => step.toolCalls.map((call) => ({ name: call.toolName, arguments: call.input }))),
  };
}
