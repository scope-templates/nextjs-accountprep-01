import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import type { Staff } from '@/lib/desk';
import { SESSION_COOKIE, staffForSession } from '@/lib/session';

export async function signedInStaff(): Promise<Staff | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return value ? staffForSession(getDb(), value) : null;
}

export async function requireStaff(): Promise<Staff> {
  const staff = await signedInStaff();
  if (!staff) redirect('/signin');
  return staff;
}
