import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { signOut } from './actions';
import { signedInStaff } from './session';
import './globals.css';

export const metadata: Metadata = { title: 'Pemberline account desk' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const staff = await signedInStaff();
  return (
    <html lang="en">
      <body>
        <header className="top">
          <a href="/accounts" className="brand">Pemberline account desk</a>
          {staff && (
            <form action={signOut} className="who">
              <span>
                {staff.name} <small>({staff.role})</small>
              </span>
              <button type="submit">Sign out</button>
            </form>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
