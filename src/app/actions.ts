'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { addFact, addMeeting, addNote, changeStage, findStaff, parseId, reassignOwner, type Outcome } from '@/lib/desk';
import { SESSION_COOKIE, SESSION_DAYS, signSession } from '@/lib/session';
import { signedInStaff } from './session';

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
};
const number = (form: FormData, key: string) => {
  const value = text(form, key);
  return value === undefined ? undefined : Number(value);
};

function back(accountId: number, outcome: Outcome<unknown>, anchor: string): never {
  redirect(`/accounts/${accountId}${outcome.ok ? '' : `?error=${outcome.code}`}#${anchor}`);
}

export async function signIn(form: FormData) {
  const id = parseId(text(form, 'staff_id'));
  const staff = id ? findStaff(getDb(), id) : undefined;
  if (!staff || !staff.active) redirect('/signin?error=unknown_staff');
  (await cookies()).set(SESSION_COOKIE, signSession(staff.id), {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86_400,
  });
  redirect('/accounts');
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/signin');
}

export async function addFactForm(form: FormData) {
  const accountId = parseId(text(form, 'account_id')) ?? 0;
  const outcome = addFact(getDb(), await signedInStaff(), accountId, {
    field: text(form, 'field'),
    value: text(form, 'value'),
    checked_on: text(form, 'checked_on'),
    checked_by: number(form, 'checked_by'),
    note: text(form, 'note') ?? '',
  });
  back(accountId, outcome, 'facts');
}

export async function addNoteForm(form: FormData) {
  const accountId = parseId(text(form, 'account_id')) ?? 0;
  back(accountId, addNote(getDb(), await signedInStaff(), accountId, { body: text(form, 'body') }), 'notes');
}

export async function addMeetingForm(form: FormData) {
  const accountId = parseId(text(form, 'account_id')) ?? 0;
  const outcome = addMeeting(getDb(), await signedInStaff(), accountId, {
    held_on: text(form, 'held_on'),
    notes: text(form, 'notes'),
    next_step: text(form, 'next_step') ?? '',
  });
  back(accountId, outcome, 'meetings');
}

export async function stageForm(form: FormData) {
  const accountId = parseId(text(form, 'account_id')) ?? 0;
  back(accountId, changeStage(getDb(), await signedInStaff(), accountId, { stage: text(form, 'stage') }), 'top');
}

export async function reassignForm(form: FormData) {
  const accountId = parseId(text(form, 'account_id')) ?? 0;
  back(accountId, reassignOwner(getDb(), await signedInStaff(), accountId, { owner_id: number(form, 'owner_id') }), 'top');
}
