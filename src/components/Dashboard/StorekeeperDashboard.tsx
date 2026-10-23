/**
 * DB-02 · Dashboard — Storekeeper (restricted, can request access),
 * node 79:526.
 *
 * NOT DB-01 WITH A DIFFERENT NAME ON IT. The two frames share a shape —
 * tiles, the flow card, two columns underneath — and share almost no
 * content. Six tiles instead of seven, and not one metric in common:
 * PUT-AWAY, READY TO ISSUE, HELD / REJECTED and DISPATCH exist nowhere
 * on the QA Manager's screen, and QC PENDING and QA REVIEW exist
 * nowhere on this one. Where DB-01 puts Release readiness, this puts
 * "Sections you can't open". Where DB-01 lists what the system
 * enforces, this lists what the role cannot do.
 *
 * THE RESTRICTED HALF IS THE DESIGN'S ACTUAL SUBJECT. A Storekeeper's
 * locked stages still show their lots — "Stages you can't open still
 * show where your lots are" — and every locked section carries the way
 * to ask for it. That is the product rule underneath: users don't see
 * actions they can't take, but they do see sections they can't open,
 * because a section you cannot see is a part of the system you do not
 * know exists, and people work around what they cannot see.
 *
 * The request itself is real. It goes through raiseRequest() into
 * access_permission_requests, which is the same table the Compliance
 * admin's inbox reads on PM-01 — so a request raised here appears
 * there, and the pending chip on this screen is that row coming back.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ListChecks, PackageX, PackageCheck, Boxes, Ban, Truck,
} from 'lucide-react';
import DashTiles, { type Tile } from './db/DashTiles';
import MaterialBatchFlowCard from './db/MaterialBatchFlowCard';
import TaskListCard, { type TaskRow } from './db/TaskListCard';
import NotificationsCard, { type NoticeRow } from './db/NotificationsCard';
import ControlsInForce, { STOREKEEPER_CONTROLS } from './db/ControlsInForce';
import DashboardHeader from './db/DashboardHeader';
import LockedSectionsCard from '../Access/LockedSectionsCard';
import RequestAccessDialog from '../Access/RequestAccessDialog';
import SectionNotReady from '../Common/SectionNotReady';
import {
  ROLE_LABELS, SECTION_LABELS,
  type WorkRole, type AccessSection, type AccessRequestInput,
} from '../../lib/access/permissionRequests';
import { raiseRequest } from '../../lib/access/accessRequestService';
import {
  storekeeperCounts, myPendingSections, derivedTasks,
  type StorekeeperCounts, type DerivedTask,
} from '../../lib/dashboard/roleDashboardService';
import { canAct, type PmSection } from '../../lib/access/roleAccess';
import type { StageCount } from './db/materialBatchFlow';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

export interface StorekeeperDashboardProps {
  companyId?: string | null;
  userId?: string | null;
  role: WorkRole;
  personName?: string | null;
  siteName?: string | null;
  onNavigate?: (page: string) => void;
}

/**
 * The sections DB-02 lists as closed to a Storekeeper, in its order,
 * with the design's own one-line reason for each.
 *
 * batch_release is last and is NOT requestable — the design marks it
 * "QA release role only · can't be requested", and permissionRequests
 * carries the same rule, so the card reads it from there rather than
 * hard-coding a second copy that could drift.
 */
const LOCKED_FOR_STOREKEEPER: { section: AccessSection; why: string }[] = [
  { section: 'qc_testing',     why: 'View results for lots you received' },
  { section: 'deviation_capa', why: 'View deviations linked to your lots' },
  { section: 'audit_trail',    why: 'View the history of your records' },
  { section: 'batch_release',  why: 'QA release role only · can’t be requested' },
];

export default function StorekeeperDashboard(p: StorekeeperDashboardProps) {
  const [c, setC] = useState<StorekeeperCounts | null>(null);
  const [tasks, setTasks] = useState<DerivedTask[]>([]);
  const [pending, setPending] = useState<string[]>([]);
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState<AccessSection | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!p.companyId) return;
    setLoading(true);
    const { error } = await supabase.from('material_lots').select('id').limit(1);
    setReady(!error);
    if (!error) {
      const [counts, t] = await Promise.all([
        storekeeperCounts(p.companyId),
        derivedTasks(p.companyId, (sec) => canAct(p.role, sec as PmSection)),
      ]);
      setC(counts); setTasks(t);
    }
    if (p.userId) setPending(await myPendingSections(p.userId));
    setLoading(false);
  }, [p.companyId, p.userId, p.role]);

  useEffect(() => { void load(); }, [load]);

  const tiles: Tile[] = useMemo(() => [
    { label: 'MY TASKS',        value: tasks.length,           caption: 'waiting on you',      icon: ListChecks, page: 'my-tasks' },
    { label: 'QUARANTINE',      value: c?.quarantine ?? null,  caption: 'lots blocked from issue', icon: PackageX, page: 'materials' },
    { label: 'PUT-AWAY',        value: c?.putAway ?? null,     caption: 'QA approved, waiting',  icon: PackageCheck, page: 'materials' },
    { label: 'READY TO ISSUE',  value: c?.readyToIssue ?? null, caption: 'approved lots',        icon: Boxes,      page: 'materials' },
    { label: 'HELD / REJECTED', value: c?.heldRejected ?? null, caption: 'awaiting disposal',    icon: Ban,        page: 'materials' },
    { label: 'DISPATCH',        value: c?.dispatch ?? null,    caption: 'released batches',      icon: Truck },
  ], [c, tasks]);

  const stageCounts: Record<string, StageCount> = useMemo(() => ({
    '01': { value: null,                    label: 'POs expected this week' },
    '02': { value: c?.quarantine ?? null,   label: 'lots in quarantine' },
    '03': { value: null,                    label: '' },
    '04': { value: null,                    label: '' },
    '05': { value: c?.issueRequests ?? null, label: 'issue requests' },
    '06': { value: null,                    label: '' },
    '07': { value: null,                    label: '' },
    '08': { value: c?.dispatch ?? null,     label: 'ready to dispatch' },
  }), [c]);

  const notices: NoticeRow[] = [];
  const taskRows: TaskRow[] = tasks.map((t) => ({
    id: t.id, title: t.title, detail: t.detail, state: t.state, due: t.due, page: t.page,
  }));

  const ask = useCallback(async (req: AccessRequestInput) => {
    if (!p.companyId) return;
    setSending(true);
    const result = await raiseRequest({
      companyId: p.companyId, workRole: p.role, request: req,
    });
    setSending(false);
    if (!result.ok) {
      //  The refusal is shown, not swallowed. A dialog that closes on a
      //  failed save leaves somebody believing they have asked.
      setNotice(result.message);
      logger.error('[storekeeper] access request refused', {
        section: req.section, message: result.message,
      });
      return;
    }
    setAsking(null);
    setNotice(`Request sent. A compliance admin will review your ${SECTION_LABELS[req.section]} request.`);
    //  Re-read rather than assume: the pending chip on the flow card is
    //  that row coming back from the table the admin's inbox reads.
    await load();
  }, [p.companyId, p.role, load]);

  if (!p.companyId) {
    return <p style={{ fontSize: 15, color: '#5b6472' }}>
      This dashboard belongs to a workspace. Finish setting one up and it appears here.
    </p>;
  }

  //  LockedSection's own shape. The card already knows how to draw a
  //  not-requestable section from permissionRequests, so nothing here
  //  restates that rule.
  const locked = LOCKED_FOR_STOREKEEPER.map(({ section, why }) => ({
    section,
    wouldAllow: why,
    pending: pending.includes(section),
  }));

  return (
    //  SORA, WHICH IS WHAT THE DESIGN SYSTEM SPECIFIES FOR THESE
    //  SCREENS. The application shell sets --font-sans to Mulish, so
    //  these components inherited Mulish and rendered in a face the
    //  dashboard frames do not use. Bound to --nv-font-body rather
    //  than naming Sora, so it follows the token if the system moves,
    //  and scoped to this subtree rather than changed globally —
    //  every other screen is already correct and is not in scope.
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0,
      fontFamily: 'var(--nv-font-body, inherit)',
    }}>
      <DashboardHeader
        personName={p.personName}
        roleLabel={ROLE_LABELS[p.role]}
        siteName={p.siteName}
      />

      {notice && <p style={noticeStyle} role="status">{notice}</p>}

      {ready === false && (
        <SectionNotReady
          section="The materials tables"
          whatItWillShow={'Once they are deployed these counts read live from your lots, '
            + 'goods receipts and dispatches.'}
        />
      )}

      <DashTiles tiles={tiles} onOpen={p.onNavigate} />

      <MaterialBatchFlowCard
        role={p.role}
        counts={stageCounts}
        subtitle="One system, all roles. Stages you can’t open still show where your lots are."
        onOpen={p.onNavigate}
        onRequest={(s) => setAsking(s as AccessSection)}
        pendingSections={pending}
      />

      <div style={twoUp}>
        <TaskListCard
          title="My tasks"
          subtitle={`Routed to ${ROLE_LABELS[p.role]} · oldest first`}
          tasks={taskRows}
          loading={loading}
          onOpen={(t) => t.page && p.onNavigate?.(t.page)}
          emptyText={'Nothing is waiting on you. Goods receipts, put-aways and issue requests '
            + 'appear here as they are raised.'}
        />
        <LockedSectionsCard
          sections={locked}
          onRequest={(s) => setAsking(s as AccessSection)}
        />
      </div>

      <div style={twoUp}>
        <NotificationsCard
          subtitle="Only what the warehouse is responsible for"
          notices={notices}
          loading={loading}
          emptyText="No notifications yet."
        />
        <ControlsInForce
          title="Controls in force"
          subtitle={`What the ${ROLE_LABELS[p.role]} role can’t do`}
          items={STOREKEEPER_CONTROLS}
        />
      </div>

      {asking && (
        <RequestAccessDialog
          section={asking}
          role={p.role}
          roleLabel={ROLE_LABELS[p.role]}
          //  Narrowest first, as the design orders them. The second is
          //  the whole workspace, so "narrow it" always has something
          //  narrower than what was asked for.
          scopeOptions={['Lots I received', 'All lots at this site']}
          adminName="the Compliance admin"
          sending={sending}
          onCancel={() => setAsking(null)}
          onSend={(req) => void ask(req)}
        />
      )}
    </div>
  );
}

const twoUp: React.CSSProperties = {
  display: 'grid', gap: 16, minWidth: 0,
  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
};
const noticeStyle: React.CSSProperties = {
  margin: 0, background: '#eef3fb', border: '1px solid #cfe0f5', borderRadius: 10,
  padding: '11px 14px', fontSize: 14, lineHeight: '21px',
};
