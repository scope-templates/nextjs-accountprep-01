import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type Db = Database.Database;

export const STAGES = ['lead', 'qualified', 'demo', 'proposal', 'won', 'lost'] as const;
export const KINDS = ['transit agency', 'airport shuttle', 'school bus contractor', 'paratransit provider', 'campus shuttle', 'charter coach'] as const;
export const FACT_FIELDS = ['headcount', 'fleet size', 'depots', 'parent company', 'operating area', 'contract renewals', 'recent change'] as const;
export const ROLES = ['rep', 'head', 'admin'] as const;

const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(', ');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN (${list(ROLES)})),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (${list(KINDS)})),
  hq_city TEXT NOT NULL,
  hq_state TEXT NOT NULL CHECK (length(hq_state) = 2),
  fleet_size_told INTEGER CHECK (fleet_size_told IS NULL OR fleet_size_told >= 0),
  stage TEXT NOT NULL CHECK (stage IN (${list(STAGES)})),
  owner_id INTEGER NOT NULL REFERENCES staff(id),
  created_on TEXT NOT NULL,
  last_touched_on TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  held_on TEXT NOT NULL,
  attended_by INTEGER NOT NULL REFERENCES staff(id),
  notes TEXT NOT NULL,
  next_step TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS facts (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  field TEXT NOT NULL CHECK (field IN (${list(FACT_FIELDS)})),
  value TEXT NOT NULL CHECK (length(value) > 0),
  checked_on TEXT NOT NULL CHECK (checked_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  checked_by INTEGER NOT NULL REFERENCES staff(id),
  note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  author_id INTEGER NOT NULL REFERENCES staff(id),
  written_at TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(body) > 0)
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  actor_id INTEGER NOT NULL REFERENCES staff(id),
  action TEXT NOT NULL,
  account_id INTEGER REFERENCES accounts(id),
  detail TEXT CHECK (detail IS NULL OR json_valid(detail)),
  at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS activity_no_replace BEFORE INSERT ON activity
WHEN EXISTS (SELECT 1 FROM activity WHERE id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'activity log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS activity_no_update BEFORE UPDATE ON activity
BEGIN SELECT RAISE(ABORT, 'activity log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS activity_no_delete BEFORE DELETE ON activity
BEGIN SELECT RAISE(ABORT, 'activity log is append-only'); END;
CREATE INDEX IF NOT EXISTS contacts_account ON contacts(account_id);
CREATE INDEX IF NOT EXISTS meetings_account ON meetings(account_id, held_on);
CREATE INDEX IF NOT EXISTS facts_account ON facts(account_id);
CREATE INDEX IF NOT EXISTS notes_account ON notes(account_id, written_at);
CREATE INDEX IF NOT EXISTS activity_account ON activity(account_id, at);
`;

const SEED_FILE = path.join(process.cwd(), 'data', 'seed.json');
const SEED_TABLES = ['staff', 'accounts', 'contacts', 'meetings', 'facts', 'notes', 'activity'] as const;

export function openDb(file: string, seedFile = SEED_FILE): Db {
  const db = new Database(file);
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  const { n } = db.prepare('SELECT count(*) AS n FROM staff').get() as { n: number };
  if (n === 0) loadSeed(db, JSON.parse(readFileSync(seedFile, 'utf8')));
  return db;
}

function loadSeed(db: Db, seed: Record<(typeof SEED_TABLES)[number], Record<string, unknown>[]>) {
  db.transaction(() => {
    for (const table of SEED_TABLES) {
      const rows = seed[table];
      if (!rows.length) continue;
      const columns = Object.keys(rows[0]);
      const insert = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`);
      for (const row of rows) insert.run(row);
    }
  })();
}

const holder = globalThis as typeof globalThis & { deskDb?: Db };

export function getDb(): Db {
  if (!holder.deskDb) {
    const dir = path.join(process.cwd(), 'var');
    mkdirSync(dir, { recursive: true });
    holder.deskDb = openDb(path.join(dir, 'desk.sqlite'));
  }
  return holder.deskDb;
}
