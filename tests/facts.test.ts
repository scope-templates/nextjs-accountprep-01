import { describe, expect, it } from 'vitest';
import { addFact, factsFor, todayIso } from '@/lib/desk';
import { postFact } from '@/lib/handlers';
import { ADMIN, HEAD, IVY, MARCUS, NOW, accountOwnedBy, activity, deps, jsonRequest, person, testDb } from './helpers';

const fact = (over: Record<string, unknown> = {}) => ({
  field: 'depots', value: '2 (main yard, airport lot)', checked_on: '2026-09-02', checked_by: MARCUS, note: 'asked on the call', ...over,
});

async function post(staffId: number | null, body: unknown, accountOwner = MARCUS) {
  const db = testDb();
  const id = accountOwnedBy(db, accountOwner);
  const res = await postFact(deps(db, staffId), String(id), jsonRequest(body));
  return { db, id, res, body: await res.json() };
}

describe('POST /api/accounts/[id]/facts', () => {
  it('saves a fact typed in by the owner with its checked date and checker, and logs the writer', async () => {
    const { db, id, res, body } = await post(MARCUS, fact());
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ field: 'depots', checked_on: '2026-09-02', checked_by: MARCUS, checked_by_name: 'Marcus Tellwright' });
    expect(factsFor(db, id).some((f) => f.id === body.id)).toBe(true);
    expect(activity(db, 'fact_added').at(-1)).toMatchObject({ actor_id: MARCUS, account_id: id });
  });

  it('records a colleague as the checker when they did the checking', async () => {
    const { res, body } = await post(MARCUS, fact({ checked_by: HEAD }));
    expect(res.status).toBe(201);
    expect(body.checked_by_name).toBe('Delphine Okoro');
  });

  it.each([
    ['checked_on', fact({ checked_on: undefined })],
    ['checked_by', fact({ checked_by: undefined })],
    ['an empty checked_on', fact({ checked_on: '' })],
  ])('refuses a row without %s', async (_, body) => {
    const { res, body: problem } = await post(MARCUS, body);
    expect(res.status).toBe(400);
    expect(problem.code).toBe('checked_required');
  });

  it('accepts a checked_on of today and refuses tomorrow', async () => {
    expect((await post(MARCUS, fact({ checked_on: todayIso(NOW) }))).res.status).toBe(201);
    expect((await post(MARCUS, fact({ checked_on: '2026-10-15' }))).body.code).toBe('checked_on_in_future');
  });

  it('counts today in Central time', () => {
    expect(todayIso(new Date('2026-10-15T03:30:00Z'))).toBe('2026-10-14');
    expect(todayIso(new Date('2026-10-15T06:30:00Z'))).toBe('2026-10-15');
    const db = testDb();
    const late = new Date('2026-10-15T03:30:00Z');
    expect(addFact(db, person(db, MARCUS), accountOwnedBy(db, MARCUS), fact({ checked_on: '2026-10-15' }), late)).toMatchObject({ code: 'checked_on_in_future' });
  });

  it('refuses a date that does not exist, one before 2000, and a field outside the list', async () => {
    for (const checked_on of ['2026-02-30', '2026-13-01', '2026-02-32', '1999-12-31']) {
      expect((await post(MARCUS, fact({ checked_on }))).body.code).toBe('invalid_body');
    }
    expect((await post(MARCUS, fact({ field: 'favorite color' }))).body.code).toBe('invalid_body');
  });

  it('refuses a checker who is not an active person on staff', async () => {
    expect((await post(MARCUS, fact({ checked_by: 999 }))).body.code).toBe('unknown_staff');
    expect((await post(MARCUS, fact({ checked_by: 7 }))).body.code).toBe('unknown_staff');
  });

  it('refuses writes without a session', async () => {
    const { db, id, res } = await post(null, fact());
    expect(res.status).toBe(401);
    expect(factsFor(db, id).some((f) => f.value === fact().value)).toBe(false);
  });

  it("refuses a rep on another rep's account, lets the head write, and refuses admin", async () => {
    expect((await post(IVY, fact({ checked_by: IVY }))).res.status).toBe(403);
    expect((await post(HEAD, fact({ checked_by: HEAD }))).res.status).toBe(201);
    expect((await post(ADMIN, fact({ checked_by: ADMIN }))).body.code).toBe('not_owner');
  });

  it('answers 404 for an account that does not exist', async () => {
    const db = testDb();
    expect((await postFact(deps(db, HEAD), '9999', jsonRequest(fact()))).status).toBe(404);
  });
});
