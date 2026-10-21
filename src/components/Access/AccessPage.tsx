/**
 * W2·0 — Dashboard & permissions, as a page.
 *
 * The seven components under src/components/Access/ were built from the
 * design file and never assembled into anything reachable: the roles
 * matrix, the person panel, the requests inbox, the review drawer, the
 * locked-sections card and the request dialog all existed, and no route
 * led to any of them. This is the route.
 *
 * WHAT IT SHOWS WITHOUT A DATABASE. The roles matrix is the half of
 * this screen that is constitutional rather than transactional: which
 * work roles exist, which sections they may act in, and which
 * separations are enforced. That comes from permissionRequests.ts,
 * which imports no client, so it renders on a workspace whose access
 * tables have not been migrated yet — which is every workspace today.
 *
 * The requests inbox is transactional and cannot. Rather than draw an
 * empty inbox — which says "nobody is waiting", a claim — it says the
 * section is not connected. See SectionNotReady.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import RolesMatrix from './RolesMatrix';
import AccessRequestsInbox from './AccessRequestsInbox';
import ReviewRequestDrawer from './ReviewRequestDrawer';
import SectionNotReady from '../Common/SectionNotReady';
import type { RoleRow, StepPermission } from './RolesMatrix';
import type { WaitingRequest, DecidedRequest } from './AccessRequestsInbox';
import {
  SECTION_LABELS, ROLE_LABELS, forbiddenActSections,
  type AccessSection, type WorkRole, type AccessLevel, type Decision,
} from '../../lib/access/permissionRequests';
import {
  listWaiting, listDecided, decide, type PermissionRequestRow,
} from '../../lib/access/accessRequestService';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

export interface AccessPageProps {
  companyId?: string | null;
  /** Whether this viewer may decide on requests. The inbox is shown to
   *  everybody — seeing who is waiting is not privileged — but the
   *  review drawer only opens for somebody who can act on it. */
  canDecide?: boolean;
}

const SECTIONS = Object.keys(SECTION_LABELS) as AccessSection[];
const ROLES = Object.keys(ROLE_LABELS) as WorkRole[];

/**
 * The steps panel. Fixed rather than derived, because these are
 * statements about the regulation and not about this database: a batch
 * is released by QA with a signature whether or not any row says so.
 */
const STEPS: StepPermission[] = [
  { step: 'Release a batch', whoCanDoIt: 'QA Manager', needs: 'signature' },
  { step: 'Reject a batch', whoCanDoIt: 'QA Manager', needs: 'signature' },
  { step: 'Approve a master formula', whoCanDoIt: 'QA Manager', needs: 'signature' },
  { step: 'Close a deviation', whoCanDoIt: 'QA Manager or compliance admin', needs: 'signature' },
  { step: 'Record an in-process reading', whoCanDoIt: 'Production operator', needs: 'logged' },
  { step: 'Verify a dispense', whoCanDoIt: 'A second person, not the dispenser', needs: 'logged' },
  { step: 'Clear a line', whoCanDoIt: 'Production supervisor', needs: 'logged' },
];

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
}

/** A request row from the database, in the shape the inbox draws. */
function toWaiting(r: PermissionRequestRow): WaitingRequest {
  const name = (r as unknown as { requester_name?: string }).requester_name ?? 'Unknown person';
  return {
    id: String(r.id),
    person: {
      name,
      initials: initials(name),
      standing: ROLE_LABELS[(r.work_role as WorkRole) ?? 'other'] ?? 'Unknown role',
      role: (r.work_role as WorkRole) ?? 'other',
    },
    askedAgo: r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB') : '—',
    section: r.section_key as AccessSection,
    level: r.level as AccessLevel,
    scope: r.scope ?? 'This workspace',
    duration: r.requested_until
      ? `until ${new Date(r.requested_until).toLocaleDateString('en-GB')}`
      : 'no end date',
    reason: r.reason ?? '',
  };
}

/** The decision recorded against a request, in the shape the inbox
 *  draws. 'withdrawn' is not a decision somebody made — it is the
 *  requester taking it back — so it reads as a decline carrying that
 *  sentence rather than being dressed as a refusal. */
function decisionOf(r: PermissionRequestRow): Decision {
  if (r.status === 'granted') return { kind: 'grant_as_asked' };
  if (r.status === 'granted_narrowed') {
    return {
      kind: 'grant_with_limits',
      level: r.granted_level ?? r.level,
      scope: r.granted_scope ?? r.scope,
      until: r.granted_until,
      note: r.decision_note ?? '',
    };
  }
  if (r.status === 'withdrawn') {
    return { kind: 'decline', reason: 'Withdrawn by the person who asked.' };
  }
  return { kind: 'decline', reason: r.decision_note ?? '' };
}

function toDecided(r: PermissionRequestRow): DecidedRequest {
  const name = (r as unknown as { requester_name?: string }).requester_name ?? 'Unknown person';
  return {
    id: String(r.id),
    person: { name, initials: initials(name), standing: ROLE_LABELS[(r.work_role as WorkRole) ?? 'other'] },
    section: r.section_key as AccessSection,
    level: r.level as AccessLevel,
    //  The database's five statuses map onto the drawer's three
    //  decision shapes. A narrowed grant carries the level and scope
    //  that were actually granted, not the ones that were asked for —
    //  showing the request back as though it were the decision is how a
    //  narrowing becomes invisible in the history.
    decision: decisionOf(r),
    by: (r as unknown as { decided_by_name?: string }).decided_by_name ?? 'A reviewer',
  };
}

export default function AccessPage({ companyId, canDecide = false }: AccessPageProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [waiting, setWaiting] = useState<WaitingRequest[]>([]);
  const [decided, setDecided] = useState<DecidedRequest[]>([]);
  const [requestsReady, setRequestsReady] = useState<boolean | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  //  How many people hold each role. Counted from company_members,
  //  which exists on every workspace, so the matrix carries a real
  //  number rather than a placeholder.
  useEffect(() => {
    if (!companyId) return;
    void (async () => {
      const { data, error } = await supabase
        .from('company_members')
        .select('company_role')
        .eq('company_id', companyId);
      if (error) { logger.error('[access] member counts failed', { error }); return; }
      const tally: Record<string, number> = {};
      for (const row of (data ?? []) as { company_role?: string | null }[]) {
        const key = row.company_role ?? 'other';
        tally[key] = (tally[key] ?? 0) + 1;
      }
      setCounts(tally);
    })();
  }, [companyId]);

  const loadRequests = useCallback(async () => {
    if (!companyId) return;
    const rows = await listWaiting(companyId);
    //  listWaiting returns [] both when nobody is waiting and when the
    //  table is absent, so the table is asked about directly. An empty
    //  inbox and a missing one must not look the same.
    const { error } = await supabase
      .from('access_permission_requests').select('id').limit(1);
    const ready = !error;
    setRequestsReady(ready);
    if (!ready) return;
    setWaiting(rows.map(toWaiting));
    setDecided((await listDecided(companyId)).map(toDecided));
  }, [companyId]);

  useEffect(() => { void loadRequests(); }, [loadRequests]);

  const roles: RoleRow[] = useMemo(() => ROLES.map((role) => {
    const forbidden = new Set(forbiddenActSections(role));
    const access: RoleRow['access'] = {};
    for (const s of SECTIONS) access[s] = forbidden.has(s) ? 'view' : 'act';
    return { role, peopleCount: counts[role] ?? 0, access };
  }), [counts]);

  const pending = useMemo(
    () => waiting.find((w) => w.id === open) ?? null,
    [waiting, open],
  );

  if (!companyId) {
    return (
      <p style={empty}>
        Roles and access belong to a workspace. Finish setting one up and they appear here.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      {notice && <p style={noticeStyle} role="status">{notice}</p>}

      {/*  THE MATRIX IS DERIVED WHEN THE TABLES ARE ABSENT, and says so.
           access_act_owners names which roles may act in a section
           where the section has named owners; without it the only
           restriction knowable from here is the segregation-of-duties
           list, which permissionRequests.ts carries as constants. So
           the matrix is right about what is FORBIDDEN and optimistic
           about what is permitted. On a permissions screen that gap
           has to be visible, not inferred from a missing banner. */}
      {requestsReady === false && (
        <SectionNotReady
          section="The access tables"
          whatItWillShow={
            'Once they are deployed this matrix reads the roles allowed to act in each '
            + 'section from the database. Until then it shows the segregation-of-duties '
            + 'rules only, so a section with named owners will read as open to more '
            + 'roles than it really is.'
          }
        />
      )}

      <RolesMatrix roles={roles} sections={SECTIONS} steps={STEPS} />

      {requestsReady === false ? (
        <SectionNotReady
          section="Access requests"
          whatItWillShow={
            'Requests for extra access, who is waiting, and the decisions already made '
            + 'will appear here.'
          }
        />
      ) : (
        <AccessRequestsInbox
          waiting={waiting}
          decided={decided}
          onReview={(id) => {
            if (!canDecide) {
              setNotice('Only a compliance admin or QA manager can decide on a request.');
              return;
            }
            setOpen(id);
          }}
        />
      )}

      {pending && (
        <ReviewRequestDrawer
          pending={{
            reference: pending.id.slice(0, 8),
            askedAgo: pending.askedAgo,
            person: {
              name: pending.person.name,
              initials: pending.person.initials,
              standing: pending.person.standing,
              role: pending.person.role,
              roleLabel: ROLE_LABELS[pending.person.role],
            },
            request: {
              section: pending.section,
              level: pending.level,
              scope: pending.scope,
              until: null,
              reason: pending.reason,
            },
            //  The two scopes the drawer offers when narrowing. The
            //  second is the request's own, so "narrow" always has
            //  something narrower than what was asked for.
            scopeOptions: ['This workspace', pending.scope],
          }}
          onClose={() => setOpen(null)}
          onDecide={async (d) => {
            const result = await decide(pending.id, d);
            if (!result.ok) { setNotice(result.message); return; }
            setOpen(null);
            setNotice('Decision recorded.');
            await loadRequests();
          }}
        />
      )}
    </div>
  );
}

const empty: React.CSSProperties = {
  margin: 0, padding: '28px 0', fontSize: 15, lineHeight: '23px', color: '#5b6472',
};
const noticeStyle: React.CSSProperties = {
  margin: 0, background: '#eef3fb', border: '1px solid #cfe0f5', borderRadius: 10,
  padding: '11px 14px', fontSize: 14, lineHeight: '21px',
};
