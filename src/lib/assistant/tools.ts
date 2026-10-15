import { tool } from 'ai';
import { z } from 'zod';
import type { Db } from '../db';
import { addNote, contactsFor, factsFor, findAccount, findStaff, logActivity, meetingsFor, notesFor, todayIso, type Staff } from '../desk';

export type ToolScope = { db: Db; accountId: number; actor: Staff; now: Date };

const accountId = z
  .union([z.number(), z.string()])
  .optional()
  .describe('The account id. Leave it out; the tool uses the account the question is about.');

export function deskTools(scope: ToolScope) {
  const { db, actor, now } = scope;
  let noteSaved = false;

  function scoped<A extends { account_id?: number | string }, R>(run: (args: A) => R) {
    return async (args: A) => {
      if (args.account_id !== undefined && Number(args.account_id) !== scope.accountId) {
        logActivity(db, actor.id, 'scope_refused', scope.accountId, { asked_for: args.account_id }, now);
        return { refused: 'scope_refused', detail: `This question is about account ${scope.accountId}; the tools read and write that account only.` };
      }
      return run(args);
    };
  }

  return {
    account_summary: tool({
      description:
        'The account row (operator name, kind, HQ, fleet size as told to us, stage, owner, created and last touched dates) and the notes written on it, newest first.',
      inputSchema: z.object({ account_id: accountId }),
      execute: scoped(() => {
        const account = findAccount(db, scope.accountId)!;
        const notes = notesFor(db, scope.accountId).map((n) => ({ written_on: todayIso(new Date(n.written_at)), author: n.author_name, body: n.body }));
        return { ...account, owner_name: findStaff(db, account.owner_id)?.name, notes };
      }),
    }),
    contacts: tool({
      description: 'People at the account: name, title, email, phone and our notes on them.',
      inputSchema: z.object({ account_id: accountId }),
      execute: scoped(() => contactsFor(db, scope.accountId)),
    }),
    meetings: tool({
      description: 'Meetings with the account, newest first: date, who from our side attended, typed notes and next step.',
      inputSchema: z.object({ account_id: accountId, limit: z.number().int().min(1).max(50).default(10).describe('How many meetings, newest first.') }),
      execute: scoped(({ limit }: { account_id?: number | string; limit: number }) => meetingsFor(db, scope.accountId, limit)),
    }),
    facts: tool({
      description: 'Every fact row for the account: field, value, checked_on, checked_by and the note on each.',
      inputSchema: z.object({ account_id: accountId }),
      execute: scoped(() =>
        factsFor(db, scope.accountId).map((f) => ({ field: f.field, value: f.value, checked_on: f.checked_on, checked_by: f.checked_by_name, note: f.note })),
      ),
    }),
    save_note: tool({
      description: "Saves a note on the account under the signed-in rep's name, at most one per question. Use it when the rep asks for a note to be saved.",
      inputSchema: z.object({ account_id: accountId, body: z.string().min(1).max(4000).describe('The note text.') }),
      execute: scoped(({ body }: { account_id?: number | string; body: string }) => {
        if (noteSaved) return { refused: 'one_note_per_question', detail: 'A note was already saved for this question.' };
        const saved = addNote(db, actor, scope.accountId, { body }, now);
        if (!saved.ok) return { refused: saved.code, detail: saved.title };
        noteSaved = true;
        return { saved: saved.value.id, author: saved.value.author_name, written_on: todayIso(new Date(saved.value.written_at)) };
      }),
    }),
  };
}
