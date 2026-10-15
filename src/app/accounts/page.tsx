import { getDb, STAGES } from '@/lib/db';
import { listAccounts, listStaff, parseId } from '@/lib/desk';
import { requireStaff } from '../session';

export default async function Accounts({ searchParams }: { searchParams: Promise<{ stage?: string; owner?: string }> }) {
  await requireStaff();
  const db = getDb();
  const query = await searchParams;
  const stage = (STAGES as readonly string[]).includes(query.stage ?? '') ? query.stage! : null;
  const ownerId = parseId(query.owner);
  const accounts = listAccounts(db, { stage, ownerId });
  const owners = listStaff(db).filter((s) => s.active && s.role !== 'admin');

  return (
    <>
      <h1>Accounts</h1>
      <form className="inline" method="get">
        <label>
          Stage
          <select name="stage" defaultValue={stage ?? ''}>
            <option value="">All stages</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Rep
          <select name="owner" defaultValue={ownerId ?? ''}>
            <option value="">Everyone</option>
            {owners.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>
      <p className="muted">{accounts.length} accounts</p>
      <table>
        <thead>
          <tr>
            <th>Operator</th><th>Kind</th><th>HQ</th><th>Fleet (as told)</th><th>Stage</th><th>Owner</th><th>Facts</th><th>Last touched</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id}>
              <td><a href={`/accounts/${a.id}`}>{a.name}</a></td>
              <td>{a.kind}</td>
              <td>{a.hq_city}, {a.hq_state}</td>
              <td>{a.fleet_size_told ?? '-'}</td>
              <td><span className="stage">{a.stage}</span></td>
              <td>{a.owner_name}</td>
              <td>{a.fact_count}</td>
              <td>{a.last_touched_on}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
