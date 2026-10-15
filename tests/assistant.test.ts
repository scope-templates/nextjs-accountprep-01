import { describe, expect, it } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { MAX_MODEL_CALLS, answerQuestion } from '@/lib/assistant/answer';
import { ASSISTANT_MODEL_ID, anthropicModel, modelFromEnv } from '@/lib/assistant/model';
import { findAccount, notesFor } from '@/lib/desk';
import { getAccounts, postAssistant, postNote } from '@/lib/handlers';
import {
  IVY, MARCUS, NOW, accountOwnedBy, accountsUrl, activity, alwaysCallsTools, deps, hostedLookup, jsonRequest, partsSent, person, scriptedModel, testDb,
  toolResultsSeen, turnsModel,
} from './helpers';

const DESK_TOOLS = ['account_summary', 'contacts', 'meetings', 'facts', 'save_note'];
const ask = (question = 'Who runs their shop?') => jsonRequest({ question });

describe('model construction', () => {
  it('builds no model when ANTHROPIC_API_KEY is unset or blank', () => {
    expect(modelFromEnv({})).toBeNull();
    expect(modelFromEnv({ ANTHROPIC_API_KEY: '   ' })).toBeNull();
  });

  it('builds the Anthropic model when the key is set', () => {
    const model = modelFromEnv({ ANTHROPIC_API_KEY: 'test-key' });
    expect((model as { modelId: string }).modelId).toBe(ASSISTANT_MODEL_ID);
  });
});

describe('assistant route', () => {
  it('asks for a session before anything else', async () => {
    const db = testDb();
    const res = await postAssistant({ ...deps(db, null), model: null }, '1', new Request(accountsUrl(), { method: 'POST', body: '{' }));
    expect(res.status).toBe(401);
  });

  it('answers 503 assistant_unconfigured as a problem when there is no model', async () => {
    const db = testDb();
    const res = await postAssistant({ ...deps(db, MARCUS), model: null }, '1', ask());
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toBe('application/problem+json');
    expect(await res.json()).toMatchObject({ status: 503, code: 'assistant_unconfigured' });
  });

  it('leaves every other route working when there is no model', async () => {
    const db = testDb();
    expect(getAccounts(deps(db, MARCUS), accountsUrl()).status).toBe(200);
    const note = await postNote(deps(db, MARCUS), String(accountOwnedBy(db, MARCUS)), jsonRequest({ body: 'Called the GM.' }));
    expect(note.status).toBe(201);
  });

  it('returns the answer and every tool call with its name and arguments', async () => {
    const db = testDb();
    const id = accountOwnedBy(db, MARCUS);
    const model = scriptedModel([{ toolName: 'account_summary', input: {} }, { toolName: 'meetings', input: { limit: 3 } }], 'Three meetings, last one in August.');
    const res = await postAssistant({ ...deps(db, MARCUS), model }, String(id), ask('Catch me up.'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      answer: 'Three meetings, last one in August.',
      tool_calls: [
        { name: 'account_summary', arguments: {} },
        { name: 'meetings', arguments: { limit: 3 } },
      ],
    });
    expect(activity(db, 'assistant_asked').at(-1)).toEqual({ actor_id: MARCUS, action: 'assistant_asked', account_id: id, detail: null });
  });

  it('refuses an empty question without calling the model', async () => {
    const db = testDb();
    const model = scriptedModel([]);
    expect((await postAssistant({ ...deps(db, MARCUS), model }, '1', ask(' '))).status).toBe(400);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it('answers 502 model_call_failed when the final answer is empty', async () => {
    const db = testDb();
    const res = await postAssistant({ ...deps(db, MARCUS), model: scriptedModel([], '') }, '1', ask());
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('model_call_failed');
  });

  it('aborts the model call when the rep closes the request', async () => {
    const db = testDb();
    const closed = new AbortController();
    const model = turnsModel((_, { abortSignal }) => {
      closed.abort();
      abortSignal?.throwIfAborted();
      return [{ type: 'text', text: 'Too late.' }];
    });
    const req = new Request(ask(), { signal: closed.signal });
    const res = await postAssistant({ ...deps(db, MARCUS), model }, '1', req);
    expect(model.doGenerateCalls[0].abortSignal?.aborted).toBe(true);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(res.status).toBe(502);
  });

  it('answers 502 model_call_failed without the provider text when the model call throws', async () => {
    const db = testDb();
    const model = new MockLanguageModelV3({ doGenerate: async () => { throw new Error('upstream said: secret-detail'); } });
    const res = await postAssistant({ ...deps(db, MARCUS), model }, '1', ask());
    const text = await res.text();
    expect(res.status).toBe(502);
    expect(JSON.parse(text).code).toBe('model_call_failed');
    expect(text).not.toContain('secret-detail');
  });
});

describe('tool-calling loop', () => {
  it.each(DESK_TOOLS)('offers %s and refuses it for another account, logging scope_refused', async (name) => {
    const db = testDb();
    const id = accountOwnedBy(db, MARCUS);
    const other = id + 1;
    const model = scriptedModel([{ toolName: name, input: name === 'save_note' ? { account_id: other, body: 'x' } : { account_id: other } }]);
    const result = await answerQuestion({ db, now: NOW, model, account: findAccount(db, id)!, actor: person(db, MARCUS), question: 'Check the other one.' });
    expect(model.doGenerateCalls[0].tools!.map((t) => t.name)).toContain(name);
    expect(toolResultsSeen(model, 1)[0].output).toMatchObject({ refused: 'scope_refused' });
    expect(result.answer).toBe('Here is what the desk has on them.');
    expect(activity(db, 'scope_refused')).toEqual([{ actor_id: MARCUS, action: 'scope_refused', account_id: id, detail: JSON.stringify({ asked_for: other }) }]);
  });

  it('treats a numeric-string id for the same account as that account and refuses any other id', async () => {
    const db = testDb();
    const model = scriptedModel([
      { toolName: 'contacts', input: { account_id: '1' } },
      { toolName: 'contacts', input: { account_id: '2' } },
      { toolName: 'contacts', input: { account_id: 'one' } },
    ]);
    await answerQuestion({ db, now: NOW, model, account: findAccount(db, 1)!, actor: person(db, MARCUS), question: 'Who do I call?' });
    const [same, two, word] = toolResultsSeen(model, 3);
    expect(same.output).toEqual(expect.arrayContaining([expect.objectContaining({ account_id: 1 })]));
    expect(two.output).toMatchObject({ refused: 'scope_refused' });
    expect(word.output).toMatchObject({ refused: 'scope_refused' });
    expect(activity(db, 'scope_refused')).toHaveLength(2);
  });

  it('stops a model that returns tool calls every turn at six calls; the sixth has tool choice none, no tool parts, and its text is the answer', async () => {
    const db = testDb();
    const model = alwaysCallsTools();
    const result = await answerQuestion({ db, now: NOW, model, account: findAccount(db, 1)!, actor: person(db, MARCUS), question: 'Anything new?' });
    expect(MAX_MODEL_CALLS).toBe(6);
    expect(model.doGenerateCalls).toHaveLength(6);
    expect(model.doGenerateCalls.slice(0, 5).map((c) => c.toolChoice)).toEqual(Array(5).fill({ type: 'auto' }));
    const last = model.doGenerateCalls[5];
    expect(last.toolChoice).toEqual({ type: 'none' });
    expect(last.prompt.some((m) => m.role === 'tool')).toBe(false);
    expect(partsSent(model, 5).some((p) => p.type === 'tool-call' || p.type === 'tool-result')).toBe(false);
    expect(result.answer).toBe('Turn 6: reading the facts again.');
  });

  it('writes a provider-run tool result out as text on the sixth call, as it does a desk tool result', async () => {
    const db = testDb();
    const model = turnsModel((turn) => [
      ...(turn === 1 ? hostedLookup(turn) : []),
      { type: 'tool-call', toolCallId: `call-${turn}`, toolName: 'facts', input: '{}' },
    ]);
    await answerQuestion({ db, now: NOW, model, account: findAccount(db, 1)!, actor: person(db, MARCUS), question: 'Anything to add?' });
    expect(model.doGenerateCalls).toHaveLength(MAX_MODEL_CALLS);
    const sent = partsSent(model, MAX_MODEL_CALLS - 1);
    expect(sent.some((p) => p.type === 'tool-call' || p.type === 'tool-result')).toBe(false);
    const text = sent.map((p) => p.text ?? '').join('\n');
    expect(text).toContain('hosted_lookup');
    expect(text).toContain('row 1');
    expect(text).toContain('Result of facts: [');
  });

  it('takes the next call when a call ends with no text after a provider-run tool, and sends that result back', async () => {
    const db = testDb();
    const model = turnsModel((turn) => (turn === 1 ? hostedLookup(turn) : [{ type: 'text', text: 'Done.' }]));
    const res = await postAssistant({ ...deps(db, MARCUS), model }, '1', ask('Anything to add?'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ answer: 'Done.' });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(model.doGenerateCalls[1].toolChoice).toEqual({ type: 'auto' });
    expect(partsSent(model, 1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tool-call', toolName: 'hosted_lookup' }),
      expect.objectContaining({ type: 'tool-result', toolName: 'hosted_lookup' }),
    ]));
  });

  it('takes the next call when a call wrote some text and then ended on a provider-run tool', async () => {
    const db = testDb();
    const model = turnsModel((turn) =>
      turn === 1
        ? [{ type: 'text', text: 'One moment.' }, ...hostedLookup(turn), { type: 'text', text: ' ' }]
        : [{ type: 'text', text: 'Done.' }],
    );
    const res = await postAssistant({ ...deps(db, MARCUS), model }, '1', ask('Anything to add?'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ answer: 'Done.' });
    expect(model.doGenerateCalls).toHaveLength(2);
  });

  it('keeps those calls inside the six: a provider-run tool with no text on every call ends at six, the sixth with tool choice none, and answers 502', async () => {
    const db = testDb();
    const model = turnsModel((turn) => hostedLookup(turn));
    const res = await postAssistant({ ...deps(db, MARCUS), model }, '1', ask('Anything to add?'));
    expect(model.doGenerateCalls).toHaveLength(MAX_MODEL_CALLS);
    expect(model.doGenerateCalls[MAX_MODEL_CALLS - 1].toolChoice).toEqual({ type: 'none' });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('model_call_failed');
  });

  it('keeps those calls inside the six when desk tools follow a provider-run tool', async () => {
    const db = testDb();
    const model = turnsModel((turn) =>
      turn === 1 ? hostedLookup(turn) : [{ type: 'tool-call', toolCallId: `call-${turn}`, toolName: 'facts', input: '{}' }],
    );
    await postAssistant({ ...deps(db, MARCUS), model }, '1', ask('Anything to add?'));
    expect(model.doGenerateCalls).toHaveLength(MAX_MODEL_CALLS);
    expect(model.doGenerateCalls[MAX_MODEL_CALLS - 1].toolChoice).toEqual({ type: 'none' });
  });

  it('sends the sixth request to the Anthropic API with no tools and no tool blocks, and returns its text', async () => {
    const db = testDb();
    const bodies: { tools?: unknown; messages: { content: string | { type: string }[] }[] }[] = [];
    const fetch: typeof globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      const n = bodies.length;
      const content = n < 6 ? [{ type: 'tool_use', id: `toolu_${n}`, name: 'facts', input: {} }] : [{ type: 'text', text: 'Three facts, the newest from August.' }];
      return new Response(
        JSON.stringify({ type: 'message', id: `msg_${n}`, model: ASSISTANT_MODEL_ID, role: 'assistant', content, stop_reason: n < 6 ? 'tool_use' : 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const result = await answerQuestion({ db, now: NOW, model: anthropicModel('dummy-key-for-tests', fetch), account: findAccount(db, 1)!, actor: person(db, MARCUS), question: 'Facts?' });
    expect(bodies).toHaveLength(6);
    expect(bodies.slice(0, 5).every((b) => Array.isArray(b.tools))).toBe(true);
    expect(bodies[5].tools).toBeUndefined();
    const blocks = bodies[5].messages.flatMap((m) => (typeof m.content === 'string' ? [] : m.content.map((c) => c.type)));
    expect(blocks).not.toContain('tool_use');
    expect(blocks).not.toContain('tool_result');
    expect(result.answer).toBe('Three facts, the newest from August.');
  });

  it('reads the account the question was asked about when the model gives no account id', async () => {
    const db = testDb();
    const { id, n } = db.prepare('SELECT account_id AS id, count(*) AS n FROM facts GROUP BY account_id ORDER BY n DESC LIMIT 1').get() as { id: number; n: number };
    const model = scriptedModel([{ toolName: 'facts', input: {} }]);
    await answerQuestion({ db, now: NOW, model, account: findAccount(db, id)!, actor: person(db, MARCUS), question: 'Fleet size?' });
    const [seen] = toolResultsSeen(model, 1);
    expect(seen.output).toHaveLength(n);
    expect(seen.output).toEqual(expect.arrayContaining([expect.objectContaining({ checked_on: expect.any(String), checked_by: expect.any(String) })]));
  });

  it('account_summary carries the notes written on the account', async () => {
    const db = testDb();
    const id = accountOwnedBy(db, MARCUS);
    await postNote(deps(db, MARCUS), String(id), jsonRequest({ body: 'Their GM prefers mornings.' }));
    const model = scriptedModel([{ toolName: 'account_summary', input: {} }]);
    await answerQuestion({ db, now: NOW, model, account: findAccount(db, id)!, actor: person(db, MARCUS), question: 'Any notes?' });
    const summary = toolResultsSeen(model, 1)[0].output as { id: number; notes: { body: string }[] };
    expect(summary.id).toBe(id);
    expect(summary.notes.map((n) => n.body)).toContain('Their GM prefers mornings.');
  });

  it('save_note writes the note with the signed-in rep as author and logs it', async () => {
    const db = testDb();
    const id = accountOwnedBy(db, MARCUS);
    const model = scriptedModel([{ toolName: 'save_note', input: { body: 'Call prep: ask about the third yard.' } }], 'Saved.');
    await answerQuestion({ db, now: NOW, model, account: findAccount(db, id)!, actor: person(db, MARCUS), question: 'Save that as a note.' });
    expect(notesFor(db, id)[0]).toMatchObject({ author_id: MARCUS, body: 'Call prep: ask about the third yard.' });
    expect(activity(db, 'note_added').at(-1)).toMatchObject({ actor_id: MARCUS, account_id: id });
  });

  it('saves at most one note per question', async () => {
    const db = testDb();
    const id = accountOwnedBy(db, MARCUS);
    const before = notesFor(db, id).length;
    const model = scriptedModel([{ toolName: 'save_note', input: { body: 'First.' } }, { toolName: 'save_note', input: { body: 'Second.' } }]);
    await answerQuestion({ db, now: NOW, model, account: findAccount(db, id)!, actor: person(db, MARCUS), question: 'Save two notes.' });
    expect(toolResultsSeen(model, 2)[1].output).toMatchObject({ refused: 'one_note_per_question' });
    expect(notesFor(db, id).map((n) => n.body)).toEqual(expect.arrayContaining(['First.']));
    expect(notesFor(db, id)).toHaveLength(before + 1);
  });

  it('save_note on an account the rep does not own is refused and writes nothing', async () => {
    const db = testDb();
    const id = accountOwnedBy(db, IVY);
    const before = notesFor(db, id).length;
    const model = scriptedModel([{ toolName: 'save_note', input: { body: 'Hello' } }]);
    await answerQuestion({ db, now: NOW, model, account: findAccount(db, id)!, actor: person(db, MARCUS), question: 'Save a note.' });
    expect(toolResultsSeen(model, 1)[0].output).toMatchObject({ refused: 'not_owner' });
    expect(notesFor(db, id)).toHaveLength(before);
  });
});
