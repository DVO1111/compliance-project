/**
 * "Notifications" (DB-01 node 77:731, DB-02 node 79:1096).
 *
 * The subtitle is the card's scope and it differs by role for a reason:
 * "Only what QA is responsible for" against "Only what the warehouse is
 * responsible for". A notification list that showed everything would be
 * the same list for everybody, which is how people stop reading it.
 *
 * The leading dot marks unread. It is a dot and not a colour-coded
 * state, because unread is not a record state — a read notification
 * about a rejection is still about a rejection.
 */

import type { CSSProperties } from 'react';

export interface NoticeRow {
  id: string;
  title: string;
  detail: string;
  /** "09:41", "Yesterday". Shown as drawn, not re-formatted. */
  when: string;
  unread?: boolean;
}

export interface NotificationsCardProps {
  subtitle: string;
  notices: NoticeRow[];
  loading?: boolean;
  emptyText: string;
}

export default function NotificationsCard(p: NotificationsCardProps) {
  return (
    <section style={card}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Notifications</h3>
        <span style={sub}>{p.subtitle}</span>
      </header>

      {p.loading && <p style={empty}>Loading…</p>}
      {!p.loading && p.notices.length === 0 && <p style={empty}>{p.emptyText}</p>}

      <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {p.notices.map((n, i) => (
          <li key={n.id} style={{ ...row, borderTop: i === 0 ? 'none' : '1px solid #eef0f3' }}>
            <span style={{ ...dot, background: n.unread ? '#12A05A' : '#d4d8df' }} aria-hidden />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: '19px' }}>{n.title}</span>
              <span style={{ fontSize: 12.5, color: '#5b6472', lineHeight: '18px' }}>{n.detail}</span>
              <span style={{ fontSize: 11.5, color: '#8a919c', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {n.when}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const card: CSSProperties = {
  background: '#fff', border: '1px solid #e3e6eb', borderRadius: 14,
  padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
};
const sub: CSSProperties = { fontSize: 13, color: '#5b6472', lineHeight: '19px' };
const row: CSSProperties = {
  listStyle: 'none', display: 'flex', gap: 10, alignItems: 'flex-start',
  padding: '12px 0', minWidth: 0,
};
const dot: CSSProperties = {
  width: 7, height: 7, borderRadius: 999, flexShrink: 0, marginTop: 7,
};
const empty: CSSProperties = {
  margin: 0, padding: '14px 0', fontSize: 13.5, lineHeight: '20px', color: '#5b6472',
};
