/**
 * My tasks — DB-01 and DB-02's first rail item, which routed to a panel
 * saying the screen was not built.
 *
 * ── IT IS A DERIVATION AND IT SAYS SO ──
 *
 * Nothing in the schema holds a work item assigned to a person. A task
 * here is a record sitting in a state only this role can move it out
 * of, which is what the design's own example rows are. The screen
 * carries one line saying that, because a list headed "My tasks" that
 * is actually "records waiting on your role" is a different promise,
 * and the difference shows up the first time somebody asks why a task
 * disappeared without them touching it.
 *
 * ── NO DUE DATES, AND NO INVENTED ONES ──
 *
 * The design draws "Today" and "Overdue 2 days". Nothing records
 * either, so every row shows a dash. An age computed from created_at
 * would look like the design and mean something else: how long the
 * record has existed is not how long the task has been outstanding.
 *
 * ── A SHORT LIST IS NOT THE SAME AS A CLEAR ONE ──
 *
 * If a source cannot be read, the screen names it. The derivation this
 * replaced swallowed its errors into a logger.debug, and two of its
 * three sources had been returning nothing for the life of the
 * feature — a quiet empty list is how that survived.
 */

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { listTasks, sourcesForRole, type Task } from '../../lib/tasks/taskSources';
import type { WorkRole } from '../../lib/access/permissionRequests';

export interface MyTasksPageProps {
  companyId?: string | null;
  role?: WorkRole | null;
  onOpen?: (page: string) => void;
}

export default function MyTasksPage({ companyId, role, onOpen }: MyTasksPageProps) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setBusy(true);
    const r = await listTasks(companyId, role);
    setTasks(r.tasks);
    setUnreadable(r.unreadable);
    setBusy(false);
  }, [companyId, role]);

  useEffect(() => { void load(); }, [load]);

  if (!companyId) {
    return <p style={empty}>Tasks belong to a workspace. Finish setting one up and they
      appear here.</p>;
  }

  const sources = sourcesForRole(role);

  return (
    <div style={col}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1 style={title}>My tasks</h1>
        <p style={sub}>
          Records waiting on a decision only your role can make.
        </p>
      </header>

      {/*  SAID ON THE SCREEN. "My tasks" and "records waiting on your
          role" are different promises, and nobody should have to work
          out which one this is. */}
      <p style={note}>
        This list is derived rather than assigned: nothing in the system holds a task with
        your name on it, so these are the records sitting in a state your role is the one
        that can move. A task leaves this list when the record moves, whoever moved it.
      </p>

      {unreadable.length > 0 && (
        <p style={bad} role="status">
          {unreadable.length === 1 ? 'One source' : `${unreadable.length} sources`} could not
          be read — {unreadable.join(', ')}. This list is incomplete, which is not the same
          as being clear.
        </p>
      )}

      {role === null || role === undefined ? (
        <p style={empty}>
          Your work role has not resolved, so nothing can be said about what is waiting on
          you.
        </p>
      ) : sources.length === 0 ? (
        //  Not an error. PM-03 gives the Storekeeper Act on goods
        //  receipt, material lots and distribution, and none of those
        //  holds a record WAITING on a decision — a receipt is an act,
        //  not a queue.
        <p style={empty}>
          Nothing in this workspace waits on a decision from your role. Your work arrives
          as material and batches rather than as a queue; the sections in your sidebar are
          where it is.
        </p>
      ) : tasks === null ? (
        <p style={empty}>Loading…</p>
      ) : tasks.length === 0 ? (
        <p style={empty}>
          Nothing is waiting on you across {sources.length}{' '}
          {sources.length === 1 ? 'area' : 'areas'}: {sources.map((s) => s.kind).join(', ')}.
        </p>
      ) : (
        <ul style={listStyle}>
          {tasks.map((t) => (
            <li key={t.id}>
              <button type="button" style={row} onClick={() => onOpen?.(t.page)}>
                <span style={kindChip}>{t.kind}</span>
                <span style={{ fontWeight: 600, minWidth: 0, flex: 1, textAlign: 'left' }}>
                  {t.reference}
                </span>
                <span style={{ fontSize: 13, color: '#5b6472', minWidth: 0 }}>{t.detail}</span>
                {/*  A dash, not an age. Nothing records when this
                    became somebody's problem. */}
                <span style={due}>{t.due}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" style={refresh} disabled={busy} onClick={() => void load()}>
        {busy ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}

const col: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0,
  fontFamily: 'var(--nv-font-body)',
};
const title: CSSProperties = {
  margin: 0, fontFamily: 'var(--nv-font-display)', fontWeight: 600,
  fontSize: 24, lineHeight: '32px', textWrap: 'balance',
};
const sub: CSSProperties = { margin: 0, fontSize: 14, lineHeight: '21px', color: '#5b6472' };
const note: CSSProperties = {
  margin: 0, padding: '11px 14px', borderRadius: 10, maxWidth: '72ch',
  background: 'var(--nv-light-surface-sunken, #f3f5f8)',
  border: '1px solid var(--nv-light-border, #e3e6eb)',
  fontSize: 13, lineHeight: '19px', color: '#5b6472',
};
const listStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 8, margin: 0, padding: 0, listStyle: 'none',
};
const row: CSSProperties = {
  display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
  width: '100%', boxSizing: 'border-box', minHeight: 54, padding: '10px 14px',
  borderRadius: 10, background: '#fff', border: '1px solid #e3e6eb',
  font: 'inherit', fontSize: 15, cursor: 'pointer', textAlign: 'left',
};
const kindChip: CSSProperties = {
  padding: '3px 9px', borderRadius: 6, flexShrink: 0,
  fontFamily: 'var(--nv-font-mono, ui-monospace, monospace)', fontSize: 11, lineHeight: '16px',
  background: '#f3f5f8', color: '#5b6472', border: '1px solid #e3e6eb',
};
const due: CSSProperties = {
  fontFamily: 'var(--nv-font-mono, ui-monospace, monospace)', fontSize: 12,
  color: '#8a919c', marginLeft: 'auto', flexShrink: 0,
};
const empty: CSSProperties = {
  margin: 0, padding: '16px 18px', borderRadius: 10, maxWidth: '72ch',
  background: 'var(--nv-light-surface-sunken, #f3f5f8)',
  border: '1px dashed var(--nv-light-border, #e3e6eb)',
  fontSize: 14, lineHeight: '21px', color: '#5b6472',
};
const bad: CSSProperties = {
  margin: 0, borderRadius: 10, padding: '11px 14px', fontSize: 14, lineHeight: '21px',
  background: '#f3d7d2', border: '1px solid #c62f1e', color: '#b42c1d', maxWidth: '72ch',
};
const refresh: CSSProperties = {
  alignSelf: 'flex-start', minHeight: 44, padding: '0 14px', borderRadius: 10,
  background: '#fff', border: '1px solid #e3e6eb', color: '#1d2433',
  font: 'inherit', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};
