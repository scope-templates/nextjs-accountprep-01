'use client';

import { useState, type FormEvent } from 'react';

type Reply = { answer: string; tool_calls: { name: string; arguments: unknown }[] };

export default function AssistantBox({ accountId }: { accountId: number }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<Reply | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function ask(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    setReply(null);
    try {
      const res = await fetch(`/api/accounts/${accountId}/assistant`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const body = await res.json();
      if (res.ok) setReply(body as Reply);
      else setProblem(`${body.title ?? 'Request refused'} (${body.code ?? res.status})`);
    } catch {
      setProblem('The desk did not answer. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="assistant">
      <form onSubmit={ask} className="stack">
        <label>
          Ask about this account
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should I know before my call with them on Thursday?" required maxLength={2000} />
        </label>
        <button type="submit" disabled={busy || !question.trim()}>{busy ? 'Working...' : 'Ask'}</button>
      </form>
      {problem && <p className="error">{problem}</p>}
      {reply && (
        <>
          <p className="answer">{reply.answer}</p>
          {reply.tool_calls.length > 0 && (
            <details>
              <summary>Tool calls ({reply.tool_calls.length})</summary>
              <ol>
                {reply.tool_calls.map((call, i) => (
                  <li key={i}><code>{call.name}</code> {JSON.stringify(call.arguments)}</li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </section>
  );
}
