/**
 * Work left waiting when a role was withdrawn.
 *
 * `20261124000000` built the report and an auditable reassignment path
 * and nothing called either, so a revocation could leave a material lot
 * or a batch record waiting on somebody who may no longer act — with
 * SQL as the only route to resolution. For quality-critical work that
 * is not a route.
 *
 * ── WHY REASSIGNMENT IS HERE AND NOT JUST A LIST ──
 *
 * A read-only page tells somebody there is a problem and offers no way
 * to end it. The reassignment path already enforces what it needs to:
 * the actor must administer roles or be able to act in the section, the
 * *target* must be able to act in the section, a reason is mandatory,
 * and the result is a row — not an edit — so the original attribution
 * survives.
 *
 * ── THE PICKER ONLY OFFERS PEOPLE WHO COULD FINISH IT ──
 *
 * Reassigning to another person who also cannot act moves the problem
 * and closes the report entry, which is worse than leaving it open. The
 * database refuses that with STRANDED_WORK_TARGET_CANNOT_ACT; this
 * screen does not offer it in the first place, and says so when the
 * list of candidates is empty.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listStrandedWork, reassignStrandedWork, type StrandedWorkRow,
} from '../../lib/access/strandedWorkService';
import {
  mayReassign, mayReceive, outstanding, strandedLines, strandedHeadline,
  waitingFor, reassignComplete, sectionLabel, entityLabel,
} from '../../lib/access/strandedWorkRules';
import { listAssignments, type RoleAssignment } from '../../lib/access/operationalRoleService';
import { supabase } from '../../lib/supabase';
import type { WorkRole } from '../../lib/access/permissionRequests';
import { logger } from '../../lib/logger';

export interface StrandedWorkPanelProps {
  companyId?: string | null;
  /** The viewer's full role set — a two-role holder gets the union. */
  roles: WorkRole[];
}

const card: React.CSSProperties = {
  display: 'grid', gap: 10, padding: 14, borderRadius: 10,
  border: '1px solid #e4e7ec', background: '#fff',
};
const note: React.CSSProperties = { margin: 0, fontSize: 13.5, color: '#5b6472', lineHeight: 1.5 };
const small: React.CSSProperties = { fontSize: 12.5, color: '#6b7280' };
const primary: React.CSSProperties = {
  padding: '7px 13px', borderRadius: 8, border: 'none', background: '#0f2744',
  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', justifySelf: 'start',
};
const field: React.CSSProperties = {
  padding: '7px 9px', borderRadius: 7, border: '1px solid #d6dae0', fontSize: 13,
  width: '100%', boxSizing: 'border-box',
};

export default function StrandedWorkPanel({ companyId, roles }: StrandedWorkPanelProps) {
  const [rows, setRows] = useState<StrandedWorkRow[]>([]);
  const [assignments, setAssignments] = useState<RoleAssignment[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [toUser, setToUser] = useState<string>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setFailed(false);
    try {
      const [work, people, profiles] = await Promise.all([
        listStrandedWork(companyId),
        listAssignments(companyId),
        //  Names, so the list does not identify people by uuid. A
        //  missing profile falls back to the id rather than to blank.
        supabase.from('profiles').select('id, full_name').eq('company_id', companyId),
      ]);
      setRows(work);
      setAssignments(people);
      const map: Record<string, string> = {};
      for (const row of ((profiles.data ?? []) as { id: string; full_name: string | null }[])) {
        if (row.full_name) map[row.id] = row.full_name;
      }
      setNames(map);
    } catch (err) {
      logger.error('[stranded] panel load failed', { err: String(err) });
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  /** Who currently holds which roles, from the live assignment register. */
  const rolesByUser = useMemo(() => {
    const map = new Map<string, { name: string; roles: WorkRole[] }>();
    for (const a of assignments) {
      if (a.revoked_at) continue;
      const entry = map.get(a.user_id) ?? { name: names[a.user_id] ?? a.user_id, roles: [] };
      entry.roles.push(a.role as WorkRole);
      map.set(a.user_id, entry);
    }
    return map;
  }, [assignments, names]);

  const open = outstanding(rows);
  const visible = strandedLines(open);

  async function submit(row: StrandedWorkRow) {
    setBusy(true);
    setNotice(null);
    try {
      await reassignStrandedWork({
        companyId: companyId as string,
        entityType: row.entity_type,
        entityId: row.entity_id,
        toUser,
        reason,
      });
      setNotice({
        ok: true,
        text:
          `${entityLabel(row.entity_type)} reassigned. The original actor stays on the ` +
          'record — the reassignment is a new entry, not an edit.',
      });
      setOpenRow(null);
      setToUser('');
      setReason('');
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={card} aria-label="Work left by a withdrawn role">
      <h3 style={{ margin: 0, fontSize: 16 }}>Work left by a withdrawn role</h3>

      {notice && (
        <p
          role="status"
          style={{
            ...note, padding: '8px 10px', borderRadius: 8,
            background: notice.ok ? '#eaf7ee' : '#fdecec',
            color: notice.ok ? '#1b5e34' : '#8a1f1f',
            border: `1px solid ${notice.ok ? '#bfe3cb' : '#f0bfbf'}`,
          }}
        >
          {notice.text}
        </p>
      )}

      {!companyId && <p style={note}>No workspace selected.</p>}
      {companyId && loading && <p style={note}>Loading…</p>}

      {companyId && !loading && failed && (
        <p style={note}>
          Could not load the stranded-work report just now. Nothing has been lost — try
          again in a moment.
        </p>
      )}

      {companyId && !loading && !failed && (
        <>
          <p style={note}>{strandedHeadline(rows)}</p>

          {visible.length === 0 && (
            <p style={small}>
              When a role is withdrawn, any record its holder was the last to touch appears
              here until somebody who can act in that section carries it on.
            </p>
          )}

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {visible.map((r) => {
              const key = `${r.entity_type}:${r.entity_id}`;
              const canAct = mayReassign(roles, r.section);
              const candidates = [...rolesByUser.entries()].filter(
                ([id, v]) => id !== r.last_actor && mayReceive(v.roles, r.section),
              );
              const lastActor = r.last_actor ? rolesByUser.get(r.last_actor)?.name : null;

              return (
                <li
                  key={key}
                  style={{
                    display: 'grid', gap: 7, padding: 10, borderRadius: 8,
                    border: '1px solid #eceff3', background: '#fbfcfd',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 13.5 }}>{entityLabel(r.entity_type)}</strong>
                    <span style={small}>{sectionLabel(r.section)}</span>
                    {r.state_key && <span style={small}>· {r.state_key}</span>}
                    <span style={small}>· waiting {waitingFor(r)}</span>
                  </div>

                  <span style={small}>
                    Last touched by {lastActor ?? 'a person no longer holding the role'}
                    {r.roles_lost && r.roles_lost.length > 0
                      ? `, who lost ${r.roles_lost.join(', ')}`
                      : ''}
                    {r.roles_remaining && r.roles_remaining.length > 0
                      ? ` and still holds ${r.roles_remaining.join(', ')}`
                      : ' and holds no role with Act here'}
                    .
                  </span>

                  {!canAct && (
                    <span style={small}>
                      You can see this but not reassign it. Reassigning is for somebody who
                      administers roles, or who may act in {sectionLabel(r.section)}.
                    </span>
                  )}

                  {canAct && candidates.length === 0 && (
                    <span style={small}>
                      Nobody else currently holds a role with Act on{' '}
                      {sectionLabel(r.section)}, so there is no one who could carry this on.
                      Grant the role first, then reassign.
                    </span>
                  )}

                  {canAct && candidates.length > 0 && openRow !== key && (
                    <button type="button" style={primary} onClick={() => {
                      setOpenRow(key); setToUser(''); setReason(''); setNotice(null);
                    }}>
                      Reassign
                    </button>
                  )}

                  {canAct && candidates.length > 0 && openRow === key && (
                    <div style={{ display: 'grid', gap: 7 }}>
                      <label style={{ display: 'grid', gap: 4, ...small }}>
                        Hand it to
                        <select
                          style={field}
                          value={toUser}
                          onChange={(e) => setToUser(e.target.value)}
                        >
                          <option value="">Choose a person…</option>
                          {candidates.map(([id, v]) => (
                            <option key={id} value={id}>
                              {v.name} — {v.roles.join(', ')}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label style={{ display: 'grid', gap: 4, ...small }}>
                        Reason
                        <input
                          style={field}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="e.g. QA officer left; handing to the QA manager"
                        />
                      </label>

                      <span style={small}>
                        The reason, who authorised it and who it went to all become part of
                        the audit record. The original actor is not overwritten.
                      </span>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          style={{
                            ...primary,
                            opacity: reassignComplete(toUser || null, reason) && !busy ? 1 : 0.5,
                          }}
                          disabled={!reassignComplete(toUser || null, reason) || busy}
                          onClick={() => void submit(r)}
                        >
                          {busy ? 'Reassigning…' : 'Confirm reassignment'}
                        </button>
                        <button
                          type="button"
                          style={{
                            ...primary, background: 'transparent',
                            color: '#0f2744', border: '1px solid #d6dae0',
                          }}
                          disabled={busy}
                          onClick={() => setOpenRow(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
