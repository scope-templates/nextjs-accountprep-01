import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Db } from './db';
import { findStaff, type Staff } from './desk';

export const SESSION_COOKIE = 'desk_session';
export const SESSION_DAYS = 7;

const holder = globalThis as typeof globalThis & { deskSessionKey?: string };

// Without SESSION_SECRET each server process signs with its own random key, so sessions end on restart.
export function sessionKey(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) return configured;
  holder.deskSessionKey ??= randomBytes(32).toString('hex');
  return holder.deskSessionKey;
}

const sign = (payload: string, key: string) => createHmac('sha256', key).update(payload).digest('base64url');

export function signSession(staffId: number, key = sessionKey(), issuedAt = Date.now()): string {
  const payload = `${staffId}.${Math.floor(issuedAt / 1000)}`;
  return `${payload}.${sign(payload, key)}`;
}

export function readSession(value: string | undefined | null, key = sessionKey(), now = Date.now()): number | null {
  const parts = value?.split('.') ?? [];
  if (parts.length !== 3) return null;
  const [id, issued, mac] = parts;
  const expected = Buffer.from(sign(`${id}.${issued}`, key));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (now / 1000 - Number(issued) > SESSION_DAYS * 86_400) return null;
  const staffId = Number(id);
  return Number.isInteger(staffId) && staffId > 0 ? staffId : null;
}

export function cookieValue(header: string | null, name = SESSION_COOKIE): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [k, ...v] = part.trim().split('=');
    if (k !== name) continue;
    try {
      return decodeURIComponent(v.join('='));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function staffForSession(db: Db, value: string | undefined | null, key = sessionKey()): Staff | null {
  const id = readSession(value, key);
  const staff = id ? findStaff(db, id) : undefined;
  return staff && staff.active ? staff : null;
}
