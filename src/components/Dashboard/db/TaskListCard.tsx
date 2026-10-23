/**
 * "My tasks" (DB-01 node 77:596, DB-02 node 79:760) and "Notifications"
 * (77:731 / 79:1096), which sit side by side under the flow card.
 *
 * BOTH DASHBOARDS DRAW THE SAME TWO CARDS AND FILL THEM DIFFERENTLY.
 * The QA Manager's list is "Routed to QA Manager · oldest first" and
 * holds dispositions, releases and deviation reviews. The Storekeeper's
 * is "Routed to Storekeeper" and holds put-aways, GRNs and issue
 * requests. The subtitle is the card telling you WHY these particular
 * rows are here, so it is a prop rather than a constant.
 *
 * The right-hand badge is the shared design-system StateBadge, not a
 * local colour: Approved, Rejected, On hold and Overdue mean the same
 * thing on this card as they do on a batch record, and a dashboard that
 * invented its own palette would be the place those meanings started to
 * drift.
 *
 * An empty list says so in the card's own words. "No tasks" and "we
 * could not read your tasks" are different facts and only one of them
 * means you are free to leave.
 */

import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import StateBadge, { type BadgeState } from '../../Common/StateBadge';

export interface TaskRow {
  id: string;
  /** "Material disposition · Sucrose lot ML-2610-031" */
  title: string;
  /** "QC complete 07:52 · I. Nwosu (QC Analyst)" */
  detail: string;
  state: BadgeState;
  /** The badge's words when they differ from the state's default. */
  stateLabel?: string;
  /** "Today", "6 Oct", or "—" when nothing is due. */
  due: string;
  icon?: LucideIcon;
  page?: string;
}

export interface TaskListCardProps {
  title: string;
  subtitle: string;
  tasks: TaskRow[];
  /** "View all 24". Omitted when there is nothing to view. */
  viewAllLabel?: string;
  onViewAll?: () => void;
  onOpen?: (task: TaskRow) => void;
  loading?: boolean;
  /** Shown instead of the rows when the list is empty and loaded. */
  emptyText: string;
}

export default function TaskListCard(p: TaskListCardProps) {
  return (
    <section style={card}>
      <header style={head}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{p.title}</h3>
          <span style={sub}>{p.subtitle}</span>
        </div>
        {p.viewAllLabel && p.tasks.length > 0 && (
          <button type="button" style={viewAll} onClick={p.onViewAll}>{p.viewAllLabel}</button>
        )}
      </header>

      {p.loading && <p style={empty}>Loading…</p>}
      {!p.loading && p.tasks.length === 0 && <p style={empty}>{p.emptyText}</p>}

      <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {p.tasks.map((t, i) => {
          const Icon = t.icon;
          const Row = (
            <>
              <span style={iconWrap} aria-hidden>
                {Icon ? <Icon size={17} strokeWidth={1.6} /> : null}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600, lineHeight: '20px' }}>{t.title}</span>
                <span style={{ fontSize: 12.5, color: '#5b6472', lineHeight: '18px' }}>{t.detail}</span>
              </span>
              <StateBadge state={t.state}>{t.stateLabel}</StateBadge>
              <span style={dueCol}>{t.due}</span>
            </>
          );
          const style: CSSProperties = { ...row, borderTop: i === 0 ? 'none' : '1px solid #eef0f3' };
          return (
            <li key={t.id} style={{ listStyle: 'none', minWidth: 0 }}>
              {t.page && p.onOpen ? (
                <button type="button" style={{ ...style, cursor: 'pointer', font: 'inherit', width: '100%', textAlign: 'left' }}
                  onClick={() => p.onOpen!(t)}>{Row}</button>
              ) : (
                <div style={style}>{Row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const card: CSSProperties = {
  background: '#fff', border: '1px solid #e3e6eb', borderRadius: 14,
  padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
};
const head: CSSProperties = {
  display: 'flex', gap: 14, alignItems: 'flex-start', justifyContent: 'space-between',
  flexWrap: 'wrap', minWidth: 0,
};
const sub: CSSProperties = { fontSize: 13, color: '#5b6472', lineHeight: '19px' };
const viewAll: CSSProperties = {
  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
  fontSize: 14, fontWeight: 600, color: '#1d2433', whiteSpace: 'nowrap',
};
const row: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', minWidth: 0,
  background: 'transparent', border: 'none',
};
const iconWrap: CSSProperties = {
  width: 30, height: 30, borderRadius: 8, background: '#f3f5f8', color: '#5b6472',
  display: 'grid', placeItems: 'center', flexShrink: 0,
};
const dueCol: CSSProperties = {
  fontSize: 12.5, color: '#5b6472', minWidth: 52, textAlign: 'right',
  fontVariantNumeric: 'tabular-nums', flexShrink: 0,
};
const empty: CSSProperties = {
  margin: 0, padding: '14px 0', fontSize: 13.5, lineHeight: '20px', color: '#5b6472',
};
