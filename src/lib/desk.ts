import { z } from 'zod';
import { FACT_FIELDS, KINDS, ROLES, STAGES, type Db } from './db';

export type Role = (typeof ROLES)[number];
export type Staff = { id: number; name: string; email: string; role: Role; active: number };
export type Account = {
  id: number; name: string; kind: string; hq_city: string; hq_state: string; fleet_size_told: number | null;
  stage: string; owner_id: number; created_on: string; last_touched_on: string;
};
export type Contact = { id: number; account_id: number; name: string; title: string; email: string; phone: string; notes: string };
export type Meeting = { id: number; account_id: number; held_on: string; attended_by: number; attended_by_name: string; notes: string; next_step: string };
export type Fact = { id: number; account_id: number; field: string; value: string; checked_on: string; checked_by: number; checked_by_name: string; note: string };
export type Note = { id: number; account_id: number; author_id: number; author_name: string; written_at: string; body: string };

export type Refusal = { ok: false; status: number; code: string; title: string; detail?: string };
export type Outcome<T> = { ok: true; value: T } | Refusal;

export const refuse = (status: number, code: string, title: string, detail?: string): Refusal => ({ ok: false, status, code, title, detail });
const done = <T,>(value: T): Outcome<T> => ({ ok: true, value });

export const DESK_TIME_ZONE = 'America/Chicago';
const deskDate = new Intl.DateTimeFormat('en-CA', { timeZone: DESK_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export const todayIso = (at = new Date()) => deskDate.format(at);
export const nowIso = (at = new Date()) => at.toISOString().replace(/\.\d{3}Z$/, 'Z');

export const canWriteAccount = (staff: Staff, account: Account) =>
  staff.role === 'head' || (staff.role === 'rep' && account.owner_id === staff.id);
export const canReassign = (staff: Staff) => staff.role === 'head';
export const canManageStaff = (staff: Staff) => staff.role === 'admin';

export const SIGNED_OUT = refuse(401, 'signed_out', 'Sign in first', 'The desk is for signed-in staff.');
export const STAFF_NOT_FOUND = refuse(404, 'staff_not_found', 'No such person on staff');
export const NOT_FOUND = refuse(404, 'account_not_found', 'No such account');
export const HEAD_ONLY = refuse(403, 'head_only', 'Only the head of sales reassigns owners');
const NOT_OWNER = refuse(403, 'not_owner', 'Not your account', "Only the account's owner or the head of sales writes on it.");

export function parseId(raw: string | number | null | undefined): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const isRealDate = (s: string) => {
  const at = Date.parse(`${s}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(at) && new Date(at).toISOString().startsWith(s);
};
const isoDate = z
  .string()
  .refine(isRealDate, 'must be a date as YYYY-MM-DD')
  .refine((s) => s >= '2000-01-01', 'must be on or after 2000-01-01');

function invalid(error: z.ZodError): Refusal {
  const detail = error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
  return refuse(400, 'invalid_body', 'The request body is not valid', detail);
}

export function findStaff(db: Db, id: number): Staff | undefined {
  return db.prepare('SELECT id, name, email, role, active FROM staff WHERE id = ?').get(id) as Staff | undefined;
}

export function listStaff(db: Db): Staff[] {
  return db.prepare('SELECT id, name, email, role, active FROM staff ORDER BY active DESC, name').all() as Staff[];
}

export function findAccount(db: Db, id: number): Account | undefined {
  return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as Account | undefined;
}

export type AccountListRow = Account & { owner_name: string; fact_count: number };

export function listAccounts(db: Db, filter: { stage?: string | null; ownerId?: number | null } = {}): AccountListRow[] {
  return db
    .prepare(
      `SELECT a.*, s.name AS owner_name, (SELECT count(*) FROM facts f WHERE f.account_id = a.id) AS fact_count
       FROM accounts a JOIN staff s ON s.id = a.owner_id
       WHERE (@stage IS NULL OR a.stage = @stage) AND (@owner IS NULL OR a.owner_id = @owner)
       ORDER BY a.last_touched_on DESC, a.id`,
    )
    .all({ stage: filter.stage ?? null, owner: filter.ownerId ?? null }) as AccountListRow[];
}

export function contactsFor(db: Db, accountId: number): Contact[] {
  return db.prepare('SELECT * FROM contacts WHERE account_id = ? ORDER BY id').all(accountId) as Contact[];
}

export function meetingsFor(db: Db, accountId: number, limit = 1000): Meeting[] {
  return db
    .prepare(
      `SELECT m.*, s.name AS attended_by_name FROM meetings m JOIN staff s ON s.id = m.attended_by
       WHERE m.account_id = ? ORDER BY m.held_on DESC, m.id DESC LIMIT ?`,
    )
    .all(accountId, limit) as Meeting[];
}

export function factsFor(db: Db, accountId: number): Fact[] {
  return db
    .prepare(
      `SELECT f.*, s.name AS checked_by_name FROM facts f JOIN staff s ON s.id = f.checked_by
       WHERE f.account_id = ? ORDER BY f.field, f.checked_on DESC, f.id DESC`,
    )
    .all(accountId) as Fact[];
}

export function notesFor(db: Db, accountId: number): Note[] {
  return db
    .prepare(
      `SELECT n.*, s.name AS author_name FROM notes n JOIN staff s ON s.id = n.author_id
       WHERE n.account_id = ? ORDER BY n.written_at DESC, n.id DESC`,
    )
    .all(accountId) as Note[];
}

export function accountRecord(db: Db, id: number) {
  const account = findAccount(db, id);
  if (!account) return undefined;
  return {
    account,
    owner: findStaff(db, account.owner_id)!,
    contacts: contactsFor(db, id),
    meetings: meetingsFor(db, id),
    facts: factsFor(db, id),
    notes: notesFor(db, id),
  };
}

export function logActivity(db: Db, actorId: number, action: string, accountId: number | null, detail: object | null = null, at = new Date()) {
  db.prepare('INSERT INTO activity (actor_id, action, account_id, detail, at) VALUES (?, ?, ?, ?, ?)').run(
    actorId, action, accountId, detail ? JSON.stringify(detail) : null, nowIso(at),
  );
}

const touch = (db: Db, accountId: number, day: string) =>
  db.prepare('UPDATE accounts SET last_touched_on = max(last_touched_on, ?) WHERE id = ?').run(day, accountId);

function writableAccount(db: Db, actor: Staff | null, accountId: number): Outcome<{ actor: Staff; account: Account }> {
  if (!actor) return SIGNED_OUT;
  const account = findAccount(db, accountId);
  if (!account) return NOT_FOUND;
  if (!canWriteAccount(actor, account)) return NOT_OWNER;
  return done({ actor, account });
}

const factInput = z.object({
  field: z.enum(FACT_FIELDS),
  value: z.string().trim().min(1).max(200),
  checked_on: isoDate,
  checked_by: z.number().int().positive(),
  note: z.string().trim().max(500).default(''),
});

export function addFact(db: Db, actor: Staff | null, accountId: number, input: unknown, at = new Date()): Outcome<Fact> {
  const target = writableAccount(db, actor, accountId);
  if (!target.ok) return target;
  const body = (input ?? {}) as Record<string, unknown>;
  if (body.checked_on == null || body.checked_on === '' || body.checked_by == null || body.checked_by === '') {
    return refuse(400, 'checked_required', 'A fact needs checked_on and checked_by', 'Say when it was checked and who checked it.');
  }
  const parsed = factInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const fact = parsed.data;
  const today = todayIso(at);
  if (fact.checked_on > today) return refuse(400, 'checked_on_in_future', 'checked_on is after today', `${fact.checked_on} is after ${today}.`);
  const checker = findStaff(db, fact.checked_by);
  if (!checker || !checker.active) return refuse(400, 'unknown_staff', 'checked_by is not a person on the staff list');
  const id = db.transaction(() => {
    const row = db
      .prepare('INSERT INTO facts (account_id, field, value, checked_on, checked_by, note) VALUES (?, ?, ?, ?, ?, ?)')
      .run(accountId, fact.field, fact.value, fact.checked_on, fact.checked_by, fact.note);
    logActivity(db, target.value.actor.id, 'fact_added', accountId, null, at);
    touch(db, accountId, today);
    return Number(row.lastInsertRowid);
  })();
  return done(factsFor(db, accountId).find((f) => f.id === id)!);
}

const noteInput = z.object({ body: z.string().trim().min(1).max(4000) });

export function addNote(db: Db, actor: Staff | null, accountId: number, input: unknown, at = new Date()): Outcome<Note> {
  const target = writableAccount(db, actor, accountId);
  if (!target.ok) return target;
  const parsed = noteInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const id = db.transaction(() => {
    const row = db
      .prepare('INSERT INTO notes (account_id, author_id, written_at, body) VALUES (?, ?, ?, ?)')
      .run(accountId, target.value.actor.id, nowIso(at), parsed.data.body);
    logActivity(db, target.value.actor.id, 'note_added', accountId, null, at);
    touch(db, accountId, todayIso(at));
    return Number(row.lastInsertRowid);
  })();
  return done(notesFor(db, accountId).find((n) => n.id === id)!);
}

const meetingInput = z.object({
  held_on: isoDate,
  notes: z.string().trim().min(1).max(8000),
  next_step: z.string().trim().max(300).default(''),
});

export function addMeeting(db: Db, actor: Staff | null, accountId: number, input: unknown, at = new Date()): Outcome<Meeting> {
  const target = writableAccount(db, actor, accountId);
  if (!target.ok) return target;
  const parsed = meetingInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const meeting = parsed.data;
  const today = todayIso(at);
  if (meeting.held_on > today) return refuse(400, 'held_on_in_future', 'held_on is after today', `${meeting.held_on} is after ${today}.`);
  const id = db.transaction(() => {
    const row = db
      .prepare('INSERT INTO meetings (account_id, held_on, attended_by, notes, next_step) VALUES (?, ?, ?, ?, ?)')
      .run(accountId, meeting.held_on, target.value.actor.id, meeting.notes, meeting.next_step);
    logActivity(db, target.value.actor.id, 'meeting_logged', accountId, null, at);
    touch(db, accountId, meeting.held_on);
    return Number(row.lastInsertRowid);
  })();
  return done(meetingsFor(db, accountId).find((m) => m.id === id)!);
}

const accountInput = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(KINDS),
  hq_city: z.string().trim().min(1).max(80),
  hq_state: z.string().trim().regex(/^[A-Z]{2}$/, 'must be a two-letter state code'),
  fleet_size_told: z.number().int().min(0).max(5000).nullable().default(null),
  stage: z.enum(STAGES).default('lead'),
  owner_id: z.number().int().positive().optional(),
});

export function createAccount(db: Db, actor: Staff | null, input: unknown, at = new Date()): Outcome<Account> {
  if (!actor) return SIGNED_OUT;
  if (actor.role === 'admin') return refuse(403, 'sales_only', 'Accounts are created by the sales team');
  const parsed = accountInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const a = parsed.data;
  const ownerId = a.owner_id ?? actor.id;
  if (ownerId !== actor.id && !canReassign(actor)) return refuse(403, 'head_only', 'Only the head of sales picks another owner');
  const owner = findStaff(db, ownerId);
  if (!owner || !owner.active || owner.role === 'admin') return refuse(400, 'owner_not_sales', 'The owner must be an active rep or the head of sales');
  const today = todayIso(at);
  const id = db.transaction(() => {
    const row = db
      .prepare(
        `INSERT INTO accounts (name, kind, hq_city, hq_state, fleet_size_told, stage, owner_id, created_on, last_touched_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(a.name, a.kind, a.hq_city, a.hq_state, a.fleet_size_told, a.stage, ownerId, today, today);
    const accountId = Number(row.lastInsertRowid);
    logActivity(db, actor.id, 'account_created', accountId, null, at);
    return accountId;
  })();
  return done(findAccount(db, id)!);
}

const OPEN_STAGES = STAGES.filter((s) => s !== 'won' && s !== 'lost');

export const nextStages = (stage: string): string[] => {
  const at = OPEN_STAGES.indexOf(stage as (typeof OPEN_STAGES)[number]);
  return at < 0 ? [] : [STAGES[at + 1], 'lost'];
};

const stageInput = z.object({ stage: z.enum(STAGES) });

export function changeStage(db: Db, actor: Staff | null, accountId: number, input: unknown, at = new Date()): Outcome<Account> {
  const target = writableAccount(db, actor, accountId);
  if (!target.ok) return target;
  const parsed = stageInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { account } = target.value;
  const allowed = nextStages(account.stage);
  if (!allowed.length) return refuse(409, 'stage_closed', `The account is already ${account.stage}`);
  if (!allowed.includes(parsed.data.stage)) {
    return refuse(400, 'stage_not_next', 'Stages move one step at a time, or to lost', `From ${account.stage}: ${allowed.join(' or ')}.`);
  }
  db.transaction(() => {
    db.prepare('UPDATE accounts SET stage = ? WHERE id = ?').run(parsed.data.stage, accountId);
    logActivity(db, target.value.actor.id, 'stage_changed', accountId, { from: account.stage, to: parsed.data.stage }, at);
    touch(db, accountId, todayIso(at));
  })();
  return done(findAccount(db, accountId)!);
}

const ownerInput = z.object({ owner_id: z.number().int().positive() });

export function reassignOwner(db: Db, actor: Staff | null, accountId: number, input: unknown, at = new Date()): Outcome<Account> {
  if (!actor) return SIGNED_OUT;
  if (!canReassign(actor)) return HEAD_ONLY;
  const account = findAccount(db, accountId);
  if (!account) return NOT_FOUND;
  const parsed = ownerInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const owner = findStaff(db, parsed.data.owner_id);
  if (!owner || !owner.active || owner.role === 'admin') return refuse(400, 'owner_not_sales', 'The owner must be an active rep or the head of sales');
  db.transaction(() => {
    db.prepare('UPDATE accounts SET owner_id = ? WHERE id = ?').run(owner.id, accountId);
    logActivity(db, actor.id, 'owner_changed', accountId, { from: account.owner_id, to: owner.id }, at);
  })();
  return done(findAccount(db, accountId)!);
}

const staffInput = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ROLES),
});
const staffUpdate = z.object({ role: z.enum(ROLES).optional(), active: z.boolean().optional() });

export function addStaff(db: Db, actor: Staff | null, input: unknown, at = new Date()): Outcome<Staff> {
  if (!actor) return SIGNED_OUT;
  if (!canManageStaff(actor)) return refuse(403, 'admin_only', 'Only an admin manages staff');
  const parsed = staffInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const s = parsed.data;
  if (db.prepare('SELECT 1 FROM staff WHERE email = ?').get(s.email)) return refuse(409, 'email_taken', 'Someone on staff already has that email');
  const id = db.transaction(() => {
    const staffId = Number(db.prepare('INSERT INTO staff (name, email, role) VALUES (?, ?, ?)').run(s.name, s.email, s.role).lastInsertRowid);
    logActivity(db, actor.id, 'staff_added', null, { staff_id: staffId, role: s.role }, at);
    return staffId;
  })();
  return done(findStaff(db, id)!);
}

export function updateStaff(db: Db, actor: Staff | null, staffId: number, input: unknown, at = new Date()): Outcome<Staff> {
  if (!actor) return SIGNED_OUT;
  if (!canManageStaff(actor)) return refuse(403, 'admin_only', 'Only an admin manages staff');
  const person = findStaff(db, staffId);
  if (!person) return STAFF_NOT_FOUND;
  const parsed = staffUpdate.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const role = parsed.data.role ?? person.role;
  const active = parsed.data.active === undefined ? person.active : Number(parsed.data.active);
  if (active === 0 || role === 'admin') {
    const owned = db.prepare('SELECT count(*) AS n FROM accounts WHERE owner_id = ?').get(staffId) as { n: number };
    if (owned.n > 0) return refuse(409, 'owns_accounts', 'Reassign their accounts first', `${person.name} owns ${owned.n} accounts.`);
  }
  for (const kept of ['admin', 'head'] as const) {
    const others = db.prepare('SELECT count(*) AS n FROM staff WHERE role = ? AND active = 1 AND id != ?').get(kept, staffId) as { n: number };
    if (person.role === kept && person.active && (role !== kept || !active) && others.n === 0) {
      return refuse(409, `last_${kept}`, `${person.name} is the only active ${kept}`);
    }
  }
  db.transaction(() => {
    db.prepare('UPDATE staff SET role = ?, active = ? WHERE id = ?').run(role, active, staffId);
    const action = person.active && !active ? 'staff_deactivated' : 'staff_updated';
    logActivity(db, actor.id, action, null, { staff_id: staffId, from: { role: person.role, active: person.active }, to: { role, active } }, at);
  })();
  return done(findStaff(db, staffId)!);
}
