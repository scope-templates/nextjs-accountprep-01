import { getDb } from '@/lib/db';
import { listStaff } from '@/lib/desk';
import { signIn } from '../actions';

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const staff = listStaff(getDb()).filter((s) => s.active);
  return (
    <>
      <h1>Sign in</h1>
      <p className="muted">Pick your name. The desk keeps you signed in for a week on this computer.</p>
      {error && <p className="error">That person is not on the active staff list.</p>}
      <form action={signIn} className="inline">
        <label>
          Name
          <select name="staff_id" required defaultValue="">
            <option value="" disabled>Choose...</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.role})
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Sign in</button>
      </form>
    </>
  );
}
