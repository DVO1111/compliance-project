/**
 * PM-01's "People" tab, and PM-04 · "Person access — restrict or
 * revoke" (nodes 81:885 and 86:1180) behind it.
 *
 * PersonAccessPanel was built from PM-04 and nothing opened it. The
 * roles matrix sets what a ROLE holds, and its own footnote says "One
 * person's exception is set on their own record, not here" — so until
 * this tab existed, that sentence pointed at a screen with no route to
 * it, and an individual's extra grant could be given out by the review
 * drawer and then never taken back.
 *
 * THE TWO HALVES ARE DELIBERATELY DIFFERENT KINDS OF THING. What the
 * role gives is read from PM-03's grid and is not editable here: change
 * it on the matrix and it changes for everybody holding the role. What
 * this person has ON TOP of the role — a grant from an approved request
 * — is theirs alone and is what can be narrowed or revoked.
 *
 * Both are real reads. Members come from company_members, grants from
 * access_grants_active, and a revoke goes through access_grant_revoke
 * so the audit trail records it. Nothing here is local state pretending
 * to be a permission change.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import PersonAccessPanel, {
  type RoleAccessLine, type ExtraGrant, type Restriction, type HistoryEntry,
} from './PersonAccessPanel';
import {
  listActiveGrants, revokeGrant, type GrantRow,
} from '../../lib/access/accessRequestService';
import {
  ROLE_LABELS,
  type WorkRole, type AccessSection, type AccessLevel,
} from '../../lib/access/permissionRequests';
import { sectionAccess, resolveWorkRole, type PmSection } from '../../lib/access/roleAccess';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

/** PM-03's columns, which is what a person's role access is shown over. */
const SECTIONS: AccessSection[] = [
  'suppliers', 'goods_receipt', 'material_lots', 'qc_testing', 'qa_disposition',
  'batch_records', 'batch_release', 'deviation_capa', 'coa_register',
  'traceability', 'distribution',
];

interface Member {
  userId: string;
  name: string;
  role: WorkRole | null;
  rawRole: string;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0]!.toUpperCase()).join('') || '??';
}

export interface PeopleTabProps {
  companyId: string;
  /** Whether the viewer may change anybody's access. */
  canManage: boolean;
}

export default function PeopleTab({ companyId, canManage }: PeopleTabProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [open, setOpen] = useState<Member | null>(null);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('company_members')
      //  company_members.role, not company_role: the column is `role`,
      //  and it is an enum on the live database and text in a
      //  from-scratch build, so it is read as a string either way.
      .select('user_id, role, status')
      .eq('company_id', companyId);
    setReady(!error);
    if (error) { setLoading(false); return; }

    const rows = (data ?? []) as unknown as { user_id: string; role?: string | null }[];
    //  Names live on profiles, which is a separate table; asked for in
    //  one go rather than per row.
    const ids = rows.map((r) => r.user_id);
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profs, error: pErr } = await supabase
        .from('profiles').select('id, full_name').in('id', ids);
      if (pErr) logger.error('[people] names unavailable', { error: pErr });
      for (const pr of (profs ?? []) as { id: string; full_name?: string | null }[]) {
        if (pr.full_name) names.set(pr.id, pr.full_name);
      }
    }

    setMembers(rows.map((r) => ({
      userId: r.user_id,
      name: names.get(r.user_id) ?? 'Unnamed person',
      role: resolveWorkRole({ company_role: r.role }),
      rawRole: r.role ?? '',
    })));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  useEffect(() => {
    if (!open) { setGrants([]); return; }
    void (async () => { setGrants(await listActiveGrants(companyId, open.userId)); })();
  }, [open, companyId]);

  const roleAccess: RoleAccessLine[] = useMemo(() => {
    if (!open) return [];
    return SECTIONS.map((s) => {
      const held = sectionAccess(open.role, s as unknown as PmSection);
      //  Undefined where the role gives nothing, which is how the panel
      //  draws "no access" — the same convention as the matrix.
      return { section: s, level: held === 'none' ? undefined : (held as AccessLevel) };
    });
  }, [open]);

  const extraGrants: ExtraGrant[] = useMemo(() => grants.map((g) => ({
    id: String(g.id),
    section: g.section_key as AccessSection,
    level: g.level as AccessLevel,
    scope: g.scope ?? 'This workspace',
    until: g.valid_until ?? null,
    provenance: `Granted ${g.granted_at ? new Date(g.granted_at).toLocaleDateString('en-GB') : ''}`.trim(),
  })), [grants]);

  const revoke = useCallback(async (grantId: string, reason: string) => {
    const result = await revokeGrant(grantId, reason);
    if (!result.ok) { setNotice(result.message); return; }
    setNotice('Access revoked. The change is in the audit trail.');
    if (open) setGrants(await listActiveGrants(companyId, open.userId));
  }, [companyId, open]);

  if (ready === false) {
    return (
      <p style={empty}>
        The access tables are not deployed in this workspace yet, so the people who hold
        each role cannot be read.
      </p>
    );
  }

  if (open) {
    const peopleInRole = members.filter((m) => m.role === open.role).length;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <button type="button" style={back} onClick={() => setOpen(null)}>← All people</button>
        {notice && <p style={noticeStyle} role="status">{notice}</p>}
        <PersonAccessPanel
          person={{
            name: open.name,
            initials: initials(open.name),
            role: open.role ?? 'other',
            standing: open.role
              ? ROLE_LABELS[open.role]
              : `Role not recognised${open.rawRole ? ` (“${open.rawRole}”)` : ''}`,
            peopleInRole,
          }}
          roleAccess={roleAccess}
          extraGrants={extraGrants}
          //  Individual restrictions and the per-person history are
          //  real features of PM-04 with no table behind them yet.
          //  Passed empty rather than filled with examples: a revoke
          //  history that invents entries is worse than one that is
          //  honestly short.
          restrictions={[] as Restriction[]}
          history={[] as HistoryEntry[]}
          onRestrict={canManage ? (id, c) => void revoke(id, c.reason) : () => {}}
          onRevoke={canManage ? (id, reason) => void revoke(id, reason) : () => {}}
        />
      </div>
    );
  }

  return (
    <section style={card}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>People</h2>
        <span style={sub}>
          What each person holds, and anything granted to them on top of their role.
        </span>
      </header>

      {loading && <p style={empty}>Loading…</p>}
      {!loading && members.length === 0 && (
        <p style={empty}>Nobody has joined this workspace yet.</p>
      )}

      <ul style={{ margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {members.map((m) => (
          <li key={m.userId} style={{ listStyle: 'none' }}>
            <button type="button" style={row} onClick={() => setOpen(m)}>
              <span style={avatar} aria-hidden>{initials(m.name)}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</span>
                <span style={{ fontSize: 12.5, color: '#5b6472' }}>
                  {m.role ? ROLE_LABELS[m.role] : `Role not recognised${m.rawRole ? ` (“${m.rawRole}”)` : ''}`}
                </span>
              </span>
              <span style={{ fontSize: 12.5, color: '#5b6472' }}>
                {m.role
                  ? `${SECTIONS.filter((s) => sectionAccess(m.role, s as unknown as PmSection) !== 'none').length} of ${SECTIONS.length} sections`
                  : 'no sections'}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p style={footnote}>
        Changing a role here changes it for everybody holding it. One person’s exception is
        set on their own record.
      </p>
    </section>
  );
}

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e3e6eb', borderRadius: 14,
  padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
};
const sub: React.CSSProperties = { fontSize: 13, color: '#5b6472', lineHeight: '19px' };
const row: React.CSSProperties = {
  width: '100%', display: 'flex', gap: 12, alignItems: 'center',
  border: '1px solid #e3e6eb', borderRadius: 10, background: '#fff',
  padding: '11px 13px', cursor: 'pointer', textAlign: 'left', minWidth: 0, font: 'inherit',
};
const avatar: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 999, background: '#eceff4', color: '#3b4252',
  display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
};
const back: React.CSSProperties = {
  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
  fontSize: 14, color: '#2b3038', fontWeight: 600, alignSelf: 'flex-start',
};
const empty: React.CSSProperties = {
  margin: 0, padding: '14px 0', fontSize: 14, lineHeight: '21px', color: '#5b6472',
};
const footnote: React.CSSProperties = {
  margin: 0, fontSize: 12.5, color: '#5b6472', lineHeight: '18px',
};
const noticeStyle: React.CSSProperties = {
  margin: 0, background: '#eef3fb', border: '1px solid #cfe0f5', borderRadius: 10,
  padding: '11px 14px', fontSize: 14, lineHeight: '21px',
};
