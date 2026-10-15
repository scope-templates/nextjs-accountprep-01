import { describe, expect, it } from 'vitest';
import { findAccount, notesFor } from '@/lib/desk';
import { getAccount, getAccounts, patchStaff, postAccount, postMeeting, postNote, postOwner, postStaff, postStage } from '@/lib/handlers';
import { ADMIN, HEAD, IVY, MARCUS, TEODORA, accountOwnedBy, accountsUrl, activity, deps, jsonRequest, testDb } from './helpers';

const broken = () => new Request(accountsUrl(), { method: 'POST', body: '{' });

describe('reading', () => {
  it('lets a rep read every account, including ones they do not own', async () => {
    const db = testDb();
    const res = getAccount(deps(db, MARCUS), String(accountOwnedBy(db, TEODORA)));
    expect(res.status).toBe(200);
    expect(Object.keys(await res.json()).sort()).toEqual(['account', 'contacts', 'facts', 'meetings', 'notes', 'owner']);
  });

  it('filters the account list by stage and by rep', async () => {
    const db = testDb();
    const won = await getAccounts(deps(db, IVY), accountsUrl('?stage=won')).json();
    expect(won.length).toBeGreaterThan(0);
    expect(won.every((a: { stage: string }) => a.stage === 'won')).toBe(true);
    const teodora = await getAccounts(deps(db, IVY), accountsUrl(`?owner=${TEODORA}`)).json();
    expect(teodora.every((a: { owner_id: number }) => a.owner_id === TEODORA)).toBe(true);
    expect(getAccounts(deps(db, IVY), accountsUrl('?stage=closed')).status).toBe(400);
  });

  it('refuses reads without a session', () => {
    const db = testDb();
    expect(getAccounts(deps(db, null), accountsUrl()).status).toBe(401);
    expect(getAccount(deps(db, null), '1').status).toBe(401);
  });
});

describe('refusal order', () => {
  it('checks the session before reading the body on every write route', async () => {
    const db = testDb();
    const anon = deps(db, null);
    for (const res of [
      await postAccount(anon, broken()), await postNote(anon, '1', broken()), await postMeeting(anon, '1', broken()),
      await postOwner(anon, '1', broken()), await postStaff(anon, broken()), await patchStaff(anon, 'x', broken()),
      await postStage(anon, '1', broken()),
    ]) expect(res.status).toBe(401);
  });

  it('refuses a rep on the owner route before reading the body', async () => {
    const db = testDb();
    const res = await postOwner(deps(db, MARCUS), String(accountOwnedBy(db, MARCUS)), broken());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('head_only');
  });
});

describe('notes and meetings', () => {
  it('saves a note with the signed-in rep as author', async () => {
    const db = testDb();
    const id = accountOwnedBy(db, MARCUS);
    const res = await postNote(deps(db, MARCUS), String(id), jsonRequest({ body: 'GM wants pricing by Friday.' }));
    expect(res.status).toBe(201);
    expect(notesFor(db, id)[0]).toMatchObject({ author_id: MARCUS, body: 'GM wants pricing by Friday.', written_at: '2026-10-14T16:00:00Z' });
  });

  it("refuses a note on another rep's account, with an empty body, or with a body that is not JSON", async () => {
    const db = testDb();
    const id = String(accountOwnedBy(db, MARCUS));
    expect((await postNote(deps(db, IVY), id, jsonRequest({ body: 'x' }))).status).toBe(403);
    expect((await postNote(deps(db, MARCUS), id, jsonRequest({ body: '  ' }))).status).toBe(400);
    expect((await postNote(deps(db, MARCUS), id, broken())).status).toBe(400);
  });

  it('logs a meeting with the signed-in rep as attendee, moves last touched, and refuses a date after today', async () => {
    const db = testDb();
    const id = accountOwnedBy(db, MARCUS);
    const res = await postMeeting(deps(db, MARCUS), String(id), jsonRequest({ held_on: '2026-10-13', notes: 'Shop visit.' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ attended_by: MARCUS, held_on: '2026-10-13' });
    expect(findAccount(db, id)!.last_touched_on).toBe('2026-10-13');
    const later = await postMeeting(deps(db, MARCUS), String(id), jsonRequest({ held_on: '2026-10-15', notes: 'Planned visit.' }));
    expect((await later.json()).code).toBe('held_on_in_future');
  });
});

describe('stages', () => {
  const openAccount = (db: ReturnType<typeof testDb>, owner: number, stage: string) =>
    (db.prepare('SELECT id FROM accounts WHERE owner_id = ? AND stage = ? ORDER BY id LIMIT 1').get(owner, stage) as { id: number } | undefined)?.id;

  it('lets the owner move an account one stage on, and logs from and to', async () => {
    const db = testDb();
    const id = db.prepare("SELECT id, owner_id FROM accounts WHERE stage = 'demo' ORDER BY id LIMIT 1").get() as { id: number; owner_id: number };
    const res = await postStage(deps(db, id.owner_id), String(id.id), jsonRequest({ stage: 'proposal' }));
    expect(res.status).toBe(200);
    expect(findAccount(db, id.id)!.stage).toBe('proposal');
    expect(activity(db, 'stage_changed').at(-1)).toEqual({ actor_id: id.owner_id, action: 'stage_changed', account_id: id.id, detail: JSON.stringify({ from: 'demo', to: 'proposal' }) });
  });

  it('moves any open account to lost, refuses skipping a stage, and refuses changes once won or lost', async () => {
    const db = testDb();
    const lead = db.prepare("SELECT id FROM accounts WHERE stage = 'lead' ORDER BY id LIMIT 1").get() as { id: number };
    const head = deps(db, HEAD);
    expect((await (await postStage(head, String(lead.id), jsonRequest({ stage: 'demo' }))).json()).code).toBe('stage_not_next');
    expect((await postStage(head, String(lead.id), jsonRequest({ stage: 'lost' }))).status).toBe(200);
    expect((await (await postStage(head, String(lead.id), jsonRequest({ stage: 'qualified' }))).json()).code).toBe('stage_closed');
    const won = db.prepare("SELECT id FROM accounts WHERE stage = 'won' ORDER BY id LIMIT 1").get() as { id: number };
    expect((await postStage(head, String(won.id), jsonRequest({ stage: 'lost' }))).status).toBe(409);
  });

  it("refuses a rep moving another rep's account", async () => {
    const db = testDb();
    const id = openAccount(db, IVY, 'qualified') ?? openAccount(db, IVY, 'lead') ?? openAccount(db, IVY, 'demo');
    expect(id).toBeDefined();
    expect((await postStage(deps(db, MARCUS), String(id), jsonRequest({ stage: 'lost' }))).status).toBe(403);
  });
});

describe('owners', () => {
  it('lets the head reassign an owner and logs from and to', async () => {
    const db = testDb();
    const id = accountOwnedBy(db, MARCUS);
    const res = await postOwner(deps(db, HEAD), String(id), jsonRequest({ owner_id: IVY }));
    expect(res.status).toBe(200);
    expect(findAccount(db, id)!.owner_id).toBe(IVY);
    expect(activity(db, 'owner_changed').at(-1)).toEqual({ actor_id: HEAD, action: 'owner_changed', account_id: id, detail: JSON.stringify({ from: MARCUS, to: IVY }) });
  });

  it('refuses reassignment by a rep or an admin, and to someone outside sales', async () => {
    const db = testDb();
    const id = String(accountOwnedBy(db, MARCUS));
    expect(await (await postOwner(deps(db, MARCUS), id, jsonRequest({ owner_id: IVY }))).json()).toMatchObject({ code: 'head_only' });
    expect((await postOwner(deps(db, ADMIN), id, jsonRequest({ owner_id: IVY }))).status).toBe(403);
    expect(await (await postOwner(deps(db, HEAD), id, jsonRequest({ owner_id: ADMIN }))).json()).toMatchObject({ code: 'owner_not_sales' });
  });

  it('creates an account owned by the rep who typed it in; only the head picks another owner', async () => {
    const db = testDb();
    const account = { name: 'Varrow Creek Transit', kind: 'transit agency', hq_city: 'Varrow Creek', hq_state: 'OH', fleet_size_told: 30 };
    const mine = await postAccount(deps(db, IVY), jsonRequest(account));
    expect(mine.status).toBe(201);
    expect(await mine.json()).toMatchObject({ owner_id: IVY, stage: 'lead', created_on: '2026-10-14' });
    expect((await postAccount(deps(db, IVY), jsonRequest({ ...account, owner_id: MARCUS }))).status).toBe(403);
    expect((await postAccount(deps(db, HEAD), jsonRequest({ ...account, owner_id: MARCUS }))).status).toBe(201);
    expect((await postAccount(deps(db, ADMIN), jsonRequest(account))).status).toBe(403);
  });
});

describe('staff', () => {
  const newcomer = { name: 'Rhea Montclair', email: 'rhea.montclair@pemberline.com', role: 'rep' };

  it('lets only an admin add staff, and logs who was added', async () => {
    const db = testDb();
    expect((await postStaff(deps(db, HEAD), jsonRequest(newcomer))).status).toBe(403);
    const res = await postStaff(deps(db, ADMIN), jsonRequest(newcomer));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(activity(db, 'staff_added')).toEqual([{ actor_id: ADMIN, action: 'staff_added', account_id: null, detail: JSON.stringify({ staff_id: id, role: 'rep' }) }]);
    expect((await postStaff(deps(db, ADMIN), jsonRequest(newcomer))).status).toBe(409);
  });

  it('logs a deactivation with the person and the change', async () => {
    const db = testDb();
    const { id } = await (await postStaff(deps(db, ADMIN), jsonRequest(newcomer))).json();
    expect((await patchStaff(deps(db, ADMIN), String(id), jsonRequest({ active: false }, 'PATCH'))).status).toBe(200);
    const row = activity(db, 'staff_deactivated').at(-1)!;
    expect(row).toMatchObject({ actor_id: ADMIN, account_id: null });
    expect(JSON.parse(row.detail!)).toEqual({ staff_id: id, from: { role: 'rep', active: 1 }, to: { role: 'rep', active: 0 } });
  });

  it('refuses to deactivate someone who still owns accounts', async () => {
    const db = testDb();
    const res = await patchStaff(deps(db, ADMIN), String(MARCUS), jsonRequest({ active: false }, 'PATCH'));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('owns_accounts');
  });

  it('refuses to remove the last active admin or the last active head', async () => {
    const db = testDb();
    const admin = deps(db, ADMIN);
    expect(await (await patchStaff(admin, String(ADMIN), jsonRequest({ active: false }, 'PATCH'))).json()).toMatchObject({ code: 'last_admin' });
    expect(await (await patchStaff(admin, String(ADMIN), jsonRequest({ role: 'rep' }, 'PATCH'))).json()).toMatchObject({ code: 'last_admin' });
    db.prepare('UPDATE accounts SET owner_id = ? WHERE owner_id = ?').run(MARCUS, HEAD);
    expect(await (await patchStaff(admin, String(HEAD), jsonRequest({ role: 'rep' }, 'PATCH'))).json()).toMatchObject({ code: 'last_head' });
    expect((await patchStaff(admin, String(IVY), jsonRequest({ role: 'head' }, 'PATCH'))).status).toBe(200);
    expect((await patchStaff(admin, String(HEAD), jsonRequest({ role: 'rep' }, 'PATCH'))).status).toBe(200);
  });
});
