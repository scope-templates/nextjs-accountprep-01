import { notFound } from 'next/navigation';
import { FACT_FIELDS, getDb } from '@/lib/db';
import { accountRecord, canReassign, canWriteAccount, listStaff, nextStages, parseId, todayIso } from '@/lib/desk';
import { addFactForm, addMeetingForm, addNoteForm, reassignForm, stageForm } from '../../actions';
import { requireStaff } from '../../session';
import AssistantBox from './assistant-box';

const ERRORS: Record<string, string> = {
  signed_out: 'Sign in first.',
  not_owner: "Only the account's owner or the head of sales writes on this account.",
  head_only: 'Only the head of sales reassigns owners.',
  checked_required: 'A fact needs the date it was checked and who checked it.',
  checked_on_in_future: 'The checked date is after today.',
  held_on_in_future: 'The meeting date is after today.',
  unknown_staff: 'Checked by must be someone on the active staff list.',
  owner_not_sales: 'The owner must be an active rep or the head of sales.',
  invalid_body: 'Some fields are missing or not valid.',
  stage_not_next: 'Stages move one step at a time, or to lost.',
  stage_closed: 'The account is already won or lost.',
};

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string | string[] }> }) {
  const me = await requireStaff();
  const db = getDb();
  const id = parseId((await params).id);
  const record = id ? accountRecord(db, id) : undefined;
  if (!record) notFound();
  const { error } = await searchParams;
  const { account, owner, contacts, meetings, facts, notes } = record;
  const canWrite = canWriteAccount(me, account);
  const staff = listStaff(db).filter((s) => s.active);
  const today = todayIso();

  return (
    <>
      <p id="top"><a href="/accounts">All accounts</a></p>
      <h1>{account.name}</h1>
      <p className="muted">
        {account.kind} · {account.hq_city}, {account.hq_state} · <span className="stage">{account.stage}</span> · owner {owner.name} · created{' '}
        {account.created_on} · last touched {account.last_touched_on}
        {account.fleet_size_told != null && <> · fleet as told to us: {account.fleet_size_told}</>}
      </p>
      {typeof error === 'string' && <p className="error">{Object.hasOwn(ERRORS, error) ? ERRORS[error] : error}</p>}
      {canWrite && nextStages(account.stage).length > 0 && (
        <form action={stageForm} className="inline">
          <input type="hidden" name="account_id" value={account.id} />
          <label>
            Move stage
            <select name="stage">
              {nextStages(account.stage).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <button type="submit">Move</button>
        </form>
      )}
      {canReassign(me) && (
        <form action={reassignForm} className="inline">
          <input type="hidden" name="account_id" value={account.id} />
          <label>
            Owner
            <select name="owner_id" defaultValue={account.owner_id}>
              {staff.filter((s) => s.role !== 'admin').map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <button type="submit">Reassign</button>
        </form>
      )}

      <AssistantBox accountId={account.id} />

      <h2>Contacts</h2>
      <table>
        <thead><tr><th>Name</th><th>Title</th><th>Email</th><th>Phone</th><th>Notes</th></tr></thead>
        <tbody>
          {contacts.map((c) => (
            <tr key={c.id}><td>{c.name}</td><td>{c.title}</td><td>{c.email}</td><td>{c.phone}</td><td>{c.notes}</td></tr>
          ))}
        </tbody>
      </table>

      <h2 id="facts">Facts</h2>
      {facts.length === 0 ? (
        <p className="muted">No facts typed in for this account.</p>
      ) : (
        <table>
          <thead><tr><th>Field</th><th>Value</th><th>Checked on</th><th>Checked by</th><th>Note</th></tr></thead>
          <tbody>
            {facts.map((f) => (
              <tr key={f.id}><td>{f.field}</td><td>{f.value}</td><td>{f.checked_on}</td><td>{f.checked_by_name}</td><td>{f.note}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {canWrite && (
        <form action={addFactForm} className="inline">
          <input type="hidden" name="account_id" value={account.id} />
          <label>
            Field
            <select name="field" required>
              {FACT_FIELDS.map((f) => (<option key={f} value={f}>{f}</option>))}
            </select>
          </label>
          <label>Value<input name="value" required maxLength={200} /></label>
          <label>Checked on<input type="date" name="checked_on" required max={today} defaultValue={today} /></label>
          <label>
            Checked by
            <select name="checked_by" required defaultValue={me.id}>
              {staff.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </label>
          <label>How you know<input name="note" maxLength={500} placeholder="ops director said so on the call" /></label>
          <button type="submit">Add fact</button>
        </form>
      )}

      <h2 id="meetings">Meetings ({meetings.length})</h2>
      {canWrite && (
        <form action={addMeetingForm} className="stack">
          <input type="hidden" name="account_id" value={account.id} />
          <label>Held on<input type="date" name="held_on" required max={today} defaultValue={today} /></label>
          <label>Notes<textarea name="notes" required /></label>
          <label>Next step<input name="next_step" maxLength={300} /></label>
          <button type="submit">Log meeting</button>
        </form>
      )}
      {meetings.map((m) => (
        <div className="meeting" key={m.id}>
          <strong>{m.held_on}</strong> <small>with {m.attended_by_name}</small>
          <p>{m.notes}</p>
          {m.next_step && <small>Next step: {m.next_step}</small>}
        </div>
      ))}

      <h2 id="notes">Notes ({notes.length})</h2>
      {canWrite && (
        <form action={addNoteForm} className="stack">
          <input type="hidden" name="account_id" value={account.id} />
          <label>Note<textarea name="body" required maxLength={4000} /></label>
          <button type="submit">Save note</button>
        </form>
      )}
      {notes.map((n) => (
        <div className="note" key={n.id}>
          <small>{n.author_name} · {todayIso(new Date(n.written_at))}</small>
          <p>{n.body}</p>
        </div>
      ))}
    </>
  );
}
