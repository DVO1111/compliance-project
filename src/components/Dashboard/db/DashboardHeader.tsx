/**
 * The greeting line on DB-01 and DB-02 (nodes 77:360 / 79:545).
 *
 * "Good morning, Adaeze" over "Ikeja plant · Thursday 8 October 2026 ·
 * showing the sections the QA Manager role can open".
 *
 * THE THIRD CLAUSE IS WHY THIS IS A SHARED COMPONENT RATHER THAN TWO
 * HEADINGS. Both dashboards end that line by naming the role whose
 * sections are on screen, which is the design telling the person that
 * what they are looking at is theirs specifically. It is built from the
 * viewer's own role, so it cannot say "QA Manager" to a Storekeeper —
 * which is exactly the failure this repair exists to fix.
 *
 * The greeting follows the clock rather than being fixed at "Good
 * morning", because a dashboard that says good morning at six in the
 * evening is the kind of detail that makes people stop trusting the
 * rest of the numbers.
 */

import type { CSSProperties } from 'react';

export interface DashboardHeaderProps {
  personName?: string | null;
  roleLabel: string;
  siteName?: string | null;
  /** Fixed clock, for tests. Defaults to now. */
  now?: Date;
  /** Drawn at the right of the line: filters, a primary action. */
  children?: React.ReactNode;
}

export function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardHeader(p: DashboardHeaderProps) {
  const now = p.now ?? new Date();
  //  First name only, as drawn. A full name in a greeting reads like a
  //  letter from a bank.
  const first = (p.personName ?? '').trim().split(/\s+/)[0] ?? '';
  const date = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <header style={wrap}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <h1 style={title}>
          {greetingFor(now)}{first ? `, ${first}` : ''}
        </h1>
        <p style={line}>
          {p.siteName ? `${p.siteName} · ` : ''}{date} · showing the sections the {p.roleLabel} role can open
        </p>
      </div>
      {p.children && <div style={actions}>{p.children}</div>}
    </header>
  );
}

const wrap: CSSProperties = {
  display: 'flex', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between',
  flexWrap: 'wrap', minWidth: 0,
};
const title: CSSProperties = {
  margin: 0, fontSize: 27, fontWeight: 600, lineHeight: '34px', textWrap: 'balance',
};
const line: CSSProperties = {
  margin: 0, fontSize: 13.5, color: '#5b6472', lineHeight: '20px',
};
const actions: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
};
