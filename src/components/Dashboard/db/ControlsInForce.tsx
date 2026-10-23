/**
 * "Controls in force" (DB-01 node 77:900) and, on DB-02, the same card
 * titled "What the Storekeeper role can't do".
 *
 * FIXED TEXT, DELIBERATELY. These five sentences are statements about
 * the quality system, not about this database: "Only approved suppliers
 * can be used" is true whether or not a row says so, and a card that
 * read its own rules out of the data it governs would stop saying
 * anything the moment the data was wrong. The counts elsewhere on these
 * dashboards are live; this is not a count.
 *
 * The two framings are the design's own and they are not the same card
 * with a different heading. DB-01 states what the system enforces for
 * everybody. DB-02 states what this role cannot do — the same
 * boundaries from the other side, written for the person they restrict,
 * which is the difference between a policy and an explanation.
 */

import type { CSSProperties } from 'react';

export interface ControlsInForceProps {
  title: string;
  subtitle: string;
  items: string[];
}

export default function ControlsInForce({ title, subtitle, items }: ControlsInForceProps) {
  return (
    <section style={card}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{title}</h3>
        <span style={sub}>{subtitle}</span>
      </header>
      <ol style={list}>
        {items.map((text, i) => (
          <li key={text} style={item}>
            <span style={num} aria-hidden>{i + 1}</span>
            <span style={{ fontSize: 13.5, lineHeight: '20px', minWidth: 0 }}>{text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** DB-01's five, verbatim. */
export const QA_MANAGER_CONTROLS = [
  'Only approved suppliers can be used.',
  'Materials are tested and approved before production.',
  'Production can only use approved lots.',
  'Batches need complete QC and QA review before release.',
  'Every action is logged in the audit trail.',
];

/** DB-02's five, verbatim. The same system, stated as limits. */
export const STOREKEEPER_CONTROLS = [
  'Receive material, but not approve its quality.',
  'Issue only lots that QA has approved.',
  'Held or rejected lots stay blocked from issue.',
  'Dispatch only batches QA has released.',
  'Every action is logged in the audit trail.',
];

const card: CSSProperties = {
  background: '#fff', border: '1px solid #e3e6eb', borderRadius: 14,
  padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0,
};
const sub: CSSProperties = { fontSize: 13, color: '#5b6472', lineHeight: '19px' };
const list: CSSProperties = {
  margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 11,
};
const item: CSSProperties = {
  listStyle: 'none', display: 'flex', gap: 11, alignItems: 'flex-start', minWidth: 0,
};
const num: CSSProperties = {
  width: 21, height: 21, borderRadius: 999, background: '#1d2433', color: '#fff',
  display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
  marginTop: 1,
};
