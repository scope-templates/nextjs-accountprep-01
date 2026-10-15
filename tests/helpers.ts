import { MockLanguageModelV3 } from 'ai/test';
import { openDb, type Db } from '@/lib/db';
import { findStaff, type Staff } from '@/lib/desk';

export const HEAD = 1;
export const MARCUS = 2;
export const IVY = 3;
export const TEODORA = 4;
export const ADMIN = 6;

export const testDb = (): Db => openDb(':memory:');

// 11:00 Central on 2026-10-14; handlers and writes in tests use this instead of the real clock.
export const NOW = new Date('2026-10-14T16:00:00Z');

export const deps = (db: Db, staffId: number | null) => ({ db, staff: staffId ? findStaff(db, staffId)! : null, now: NOW });

export const person = (db: Db, id: number): Staff => findStaff(db, id)!;

export const accountOwnedBy = (db: Db, ownerId: number): number =>
  (db.prepare('SELECT id FROM accounts WHERE owner_id = ? ORDER BY id LIMIT 1').get(ownerId) as { id: number }).id;

export const accountsUrl = (query = '') => new URL(`http://desk.test/api/accounts${query}`);

export const jsonRequest = (body: unknown, method = 'POST') =>
  new Request(accountsUrl(), { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const activity = (db: Db, action: string) =>
  db.prepare('SELECT actor_id, action, account_id, detail FROM activity WHERE action = ? ORDER BY id').all(action) as {
    actor_id: number; action: string; account_id: number | null; detail: string | null;
  }[];

const usage = {
  inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 8, text: 8, reasoning: 0 },
};

const finish = (unified: 'stop' | 'tool-calls') => ({ unified, raw: undefined });

type Content = Awaited<ReturnType<MockLanguageModelV3['doGenerate']>>['content'];
type CallOptions = Parameters<MockLanguageModelV3['doGenerate']>[0];

type ScriptedCall = { toolName: string; input: Record<string, unknown> };

// Each turn returns the next scripted tool call while the script lasts, then a text answer.
export function scriptedModel(script: ScriptedCall[], answer = 'Here is what the desk has on them.') {
  let turn = 0;
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      const call = script[turn++];
      if (call && options.toolChoice?.type !== 'none') {
        return {
          content: [{ type: 'tool-call', toolCallId: `call-${turn}`, toolName: call.toolName, input: JSON.stringify(call.input) }],
          finishReason: finish('tool-calls'), usage, warnings: [],
        };
      }
      return { content: [{ type: 'text', text: answer }], finishReason: finish('stop'), usage, warnings: [] };
    },
  });
}

// Call n (from 1) returns turn(n), whatever the tool choice says. It finishes with tool-calls when that holds a call
// to one of the desk's tools, and with stop otherwise.
export function turnsModel(turn: (n: number, options: CallOptions) => Content) {
  let n = 0;
  return new MockLanguageModelV3({
    doGenerate: async (options) => {
      const content = turn(++n, options);
      const callsDeskTool = content.some((part) => part.type === 'tool-call' && !part.providerExecuted);
      return { content, finishReason: finish(callsDeskTool ? 'tool-calls' : 'stop'), usage, warnings: [] };
    },
  });
}

// Returns a tool call on every turn, whatever the tool choice says, alongside a line of text.
export const alwaysCallsTools = () =>
  turnsModel((turn) => [
    { type: 'text', text: `Turn ${turn}: reading the facts again.` },
    { type: 'tool-call', toolCallId: `call-${turn}`, toolName: 'facts', input: '{}' },
  ]);

// A tool the provider runs itself: its call and its result both come back in the model's response.
export const hostedLookup = (turn: number): Content => [
  { type: 'tool-call', toolCallId: `hosted-${turn}`, toolName: 'hosted_lookup', input: '{}', providerExecuted: true, dynamic: true },
  { type: 'tool-result', toolCallId: `hosted-${turn}`, toolName: 'hosted_lookup', result: { rows: [`row ${turn}`] }, dynamic: true },
];

// The tool results the model was sent on a given call, by tool name.
export function toolResultsSeen(model: MockLanguageModelV3, call: number) {
  const results: { toolName: string; output: unknown }[] = [];
  for (const message of model.doGenerateCalls[call].prompt) {
    if (message.role !== 'tool') continue;
    for (const part of message.content) {
      if (part.type === 'tool-result') results.push({ toolName: part.toolName, output: (part.output as { value: unknown }).value });
    }
  }
  return results;
}

// Every content part the model was sent on a given call, in order.
export const partsSent = (model: MockLanguageModelV3, call: number) =>
  model.doGenerateCalls[call].prompt.flatMap<{ type: string; text?: string }>((message) => (typeof message.content === 'string' ? [] : message.content));
