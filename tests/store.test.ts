import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '@/lib/db';
import { addNote, findStaff, logActivity } from '@/lib/desk';
import { cookieValue, readSession, signSession, staffForSession } from '@/lib/session';
import { SEED_PATH, buildSeed, serializeSeed } from '../scripts/generate-seed';
import { MARCUS, NOW, accountOwnedBy, testDb } from './helpers';

type Db = ReturnType<typeof testDb>;
const count = (db: Db, table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
const none = (db: Db, sql: string) => expect(db.prepare(sql).get()).toEqual({ n: 0 });

describe('seed', () => {
  it('regenerates the committed seed file byte for byte', () => {
    expect(serializeSeed(buildSeed())).toBe(readFileSync(SEED_PATH, 'utf8'));
  });

  it('loads every row of the seed file into its table, with accounts in every stage', () => {
    const db = testDb();
    const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as Record<string, unknown[]>;
    for (const [table, rows] of Object.entries(seed)) expect(count(db, table)).toBe(rows.length);
    const stages = db.prepare('SELECT DISTINCT stage FROM accounts ORDER BY stage').all().map((r) => (r as { stage: string }).stage);
    expect(stages).toEqual(['demo', 'lead', 'lost', 'proposal', 'qualified', 'won']);
  });

  it("matches each account's stage to the last stage change in its activity log", () => {
    const db = testDb();
    const rows = db
      .prepare(
        `SELECT a.stage, (SELECT json_extract(detail, '$.to') FROM activity x WHERE x.account_id = a.id AND x.action = 'stage_changed' ORDER BY x.at DESC, x.id DESC LIMIT 1) AS logged FROM accounts a`,
      )
      .all() as { stage: string; logged: string | null }[];
    for (const row of rows) expect(row.stage).toBe(row.logged ?? 'lead');
  });

  it('holds meetings on weekdays from October 2025 through September 2026, none before the account was created', () => {
    const db = testDb();
    none(db, "SELECT count(*) AS n FROM meetings WHERE held_on < '2025-10-01' OR held_on > '2026-09-30'");
    none(db, "SELECT count(*) AS n FROM meetings WHERE strftime('%w', held_on) IN ('0', '6')");
    none(db, 'SELECT count(*) AS n FROM meetings m JOIN accounts a ON a.id = m.account_id WHERE m.held_on < a.created_on');
  });

  it('dates every fact on or after its account was created and no later than September 2026, with a checker on staff', () => {
    const db = testDb();
    none(db, 'SELECT count(*) AS n FROM facts f JOIN accounts a ON a.id = f.account_id WHERE f.checked_on < a.created_on');
    none(db, "SELECT count(*) AS n FROM facts WHERE checked_on > '2026-09-30'");
    none(db, 'SELECT count(*) AS n FROM facts f LEFT JOIN staff s ON s.id = f.checked_by WHERE s.id IS NULL');
    none(db, 'SELECT count(*) AS n FROM activity a LEFT JOIN staff s ON s.id = a.actor_id WHERE s.id IS NULL');
  });
});

describe('store', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('loads the seed on first start only, and keeps what was written after', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'desk-'));
    const file = path.join(dir, 'desk.sqlite');
    const first = openDb(file);
    expect(addNote(first, findStaff(first, MARCUS)!, accountOwnedBy(first, MARCUS), { body: 'Kept across restarts.' }, NOW).ok).toBe(true);
    const notes = count(first, 'notes');
    first.close();
    const again = openDb(file);
    expect(count(again, 'accounts')).toBe(60);
    expect(count(again, 'notes')).toBe(notes);
    again.close();
  });

  it('keeps the activity log append-only, including against INSERT OR REPLACE', () => {
    const db = testDb();
    logActivity(db, MARCUS, 'note_added', 1, null, NOW);
    expect(() => db.prepare('UPDATE activity SET action = ? WHERE id = 1').run('edited')).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM activity WHERE id = 1').run()).toThrow(/append-only/);
    expect(() =>
      db.prepare("INSERT OR REPLACE INTO activity (id, actor_id, action, account_id, at) VALUES (1, ?, 'edited', 1, '2026-10-14T16:00:00Z')").run(MARCUS),
    ).toThrow(/append-only/);
  });

  it('refuses an activity row without an actor, with someone not on staff, or with detail that is not JSON', () => {
    const db = testDb();
    const insert = db.prepare('INSERT INTO activity (actor_id, action, account_id, detail, at) VALUES (?, ?, ?, ?, ?)');
    expect(() => insert.run(null, 'note_added', 1, null, '2026-10-01T15:00:00Z')).toThrow(/NOT NULL/);
    expect(() => insert.run(999, 'note_added', 1, null, '2026-10-01T15:00:00Z')).toThrow(/FOREIGN KEY/);
    expect(() => insert.run(MARCUS, 'note_added', 1, 'not json', '2026-10-01T15:00:00Z')).toThrow(/CHECK/);
  });

  it('refuses a fact row without a checker or a checked date at the table level', () => {
    const db = testDb();
    const insert = db.prepare("INSERT INTO facts (account_id, field, value, checked_on, checked_by) VALUES (1, 'depots', '2', ?, ?)");
    expect(() => insert.run('2026-01-05', null)).toThrow(/NOT NULL/);
    expect(() => insert.run(null, MARCUS)).toThrow(/NOT NULL/);
  });
});

describe('session cookie', () => {
  const key = 'test-session-key';

  it('reads back the staff id it signed', () => {
    expect(readSession(signSession(MARCUS, key, NOW.getTime()), key, NOW.getTime())).toBe(MARCUS);
  });

  it('refuses a tampered, foreign-key or expired cookie', () => {
    const value = signSession(MARCUS, key, NOW.getTime());
    expect(readSession(value.replace(/^2\./, '1.'), key, NOW.getTime())).toBeNull();
    expect(readSession(value, 'another-key', NOW.getTime())).toBeNull();
    expect(readSession(value, key, NOW.getTime() + 8 * 86_400_000)).toBeNull();
    expect(readSession('garbage', key)).toBeNull();
  });

  it('signs in active staff only', () => {
    const db = testDb();
    expect(staffForSession(db, signSession(MARCUS, key), key)?.name).toBe('Marcus Tellwright');
    expect(staffForSession(db, signSession(7, key), key)).toBeNull();
  });

  it('finds the session cookie in a Cookie header and ignores a malformed one', () => {
    expect(cookieValue('theme=dark; desk_session=2.1.abc')).toBe('2.1.abc');
    expect(cookieValue('desk_session=%E0%A4%A')).toBeUndefined();
    expect(cookieValue(null)).toBeUndefined();
  });
});
