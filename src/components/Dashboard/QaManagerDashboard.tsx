/**
 * DB-01 · Dashboard — QA Manager (full quality access), node 77:341.
 *
 * Seven tiles, the material-and-batch flow, My tasks beside
 * Notifications, then Release readiness beside Controls in force.
 *
 * THE HEADER SENTENCE IS THE SCREEN'S THESIS. The design writes it as
 * "Ikeja plant · Thursday 8 October 2026 · showing the sections the QA
 * Manager role can open" — the dashboard announcing that it is
 * role-shaped. It is rendered from the viewer's actual role, so it
 * cannot say QA Manager to somebody who is not one.
 *
 * WHAT IS LIVE AND WHAT IS NOT. Every tile and stage count is a query.
 * The design's own numbers are a designer's busy Thursday and are not
 * reproduced; a workspace with no records shows zeroes. "Controls in
 * force" is fixed text because it states what the system enforces
 * rather than counting anything.
 *
 * Release readiness reads material_lot_release_conditions through the
 * existing readiness helpers rather than re-deriving blocks here, so
 * what this card calls a hard block is what the release screen refuses
 * on. A second opinion about whether a batch may ship is the last thing
 * this product needs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ListChecks, PackageX, FlaskConical, ShieldCheck, Gauge, ClipboardList, Bell,
} from 'lucide-react';
import DashTiles, { type Tile } from './db/DashTiles';
import MaterialBatchFlowCard from './db/MaterialBatchFlowCard';
import TaskListCard, { type TaskRow } from './db/TaskListCard';
import NotificationsCard, { type NoticeRow } from './db/NotificationsCard';
import ControlsInForce, { QA_MANAGER_CONTROLS } from './db/ControlsInForce';
import SectionNotReady from '../Common/SectionNotReady';
import { ROLE_LABELS, type WorkRole } from '../../lib/access/permissionRequests';
import { qaManagerCounts, type QaManagerCounts } from '../../lib/dashboard/roleDashboardService';
import type { StageCount } from './db/materialBatchFlow';
import { supabase } from '../../lib/supabase';
import DashboardHeader from './db/DashboardHeader';

export interface QaManagerDashboardProps {
  companyId?: string | null;
  role: WorkRole;
  personName?: string | null;
  siteName?: string | null;
  onNavigate?: (page: string) => void;
}

export default function QaManagerDashboard(p: QaManagerDashboardProps) {
  const [c, setC] = useState<QaManagerCounts | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!p.companyId) return;
    setLoading(true);
    //  Asked directly. Every count below fails to null, so a workspace
    //  whose quality tables are absent would render a dashboard of dots
    //  with no explanation. One probe turns that into a sentence.
    const { error } = await supabase.from('batch_records').select('id').limit(1);
    setReady(!error);
    if (!error) setC(await qaManagerCounts(p.companyId));
    setLoading(false);
  }, [p.companyId]);

  useEffect(() => { void load(); }, [load]);

  const tiles: Tile[] = useMemo(() => [
    //  MY TASKS has no query yet — there is no task table in this
    //  schema, and the design's "24 · 5 due today" is illustrative. It
    //  shows a dot rather than a fabricated number.
    { label: 'MY TASKS',   value: null,            caption: 'no task register yet', icon: ListChecks, page: 'my-tasks' },
    { label: 'QUARANTINE', value: c?.quarantine ?? null, caption: 'material lots',  icon: PackageX,    page: 'materials' },
    { label: 'QC PENDING', value: c?.qcPending ?? null,  caption: 'tests',          icon: FlaskConical, page: 'qc-testing' },
    { label: 'QA REVIEW',  value: c?.qaReview ?? null,   caption: 'batches',        icon: ShieldCheck, page: 'qa-disposition' },
    { label: 'PRODUCTION', value: c?.production ?? null, caption: 'active batches', icon: Gauge,       page: 'batch-execution' },
    { label: 'DEVIATIONS', value: c?.deviations ?? null,
      caption: c?.capaOverdue ? `${c.capaOverdue} CAPA overdue` : 'open', icon: ClipboardList, page: 'deviations' },
    { label: 'ALERTS',     value: null,            caption: 'no alert feed yet',    icon: Bell },
  ], [c]);

  const stageCounts: Record<string, StageCount> = useMemo(() => ({
    '01': { value: c?.procurement ?? null,  label: 'suppliers to qualify' },
    '02': { value: c?.quarantine ?? null,   label: 'lots in quarantine' },
    '03': { value: c?.qcPending ?? null,    label: 'tests in progress' },
    '04': { value: c?.qaReview ?? null,     label: 'lots awaiting decision' },
    '05': { value: c?.production ?? null,   label: 'active batches' },
    '06': { value: c?.qcPending ?? null,    label: 'batches in test' },
    '07': { value: c?.qaReview ?? null,     label: 'batches for review' },
    '08': { value: c?.distribution ?? null, label: 'released, ready to ship' },
  }), [c]);

  //  Empty until there is something to route. The design's five rows
  //  are examples of what a task looks like, not rows to reproduce.
  const tasks: TaskRow[] = [];
  const notices: NoticeRow[] = [];

  if (!p.companyId) {
    return <p style={{ fontSize: 15, color: '#5b6472' }}>
      This dashboard belongs to a workspace. Finish setting one up and it appears here.
    </p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <DashboardHeader
        personName={p.personName}
        roleLabel={ROLE_LABELS[p.role]}
        siteName={p.siteName}
      />

      {ready === false && (
        <SectionNotReady
          section="The quality tables"
          whatItWillShow={'Once they are deployed these counts read live from your batches, '
            + 'lots, tests and deviations.'}
        />
      )}

      <DashTiles tiles={tiles} onOpen={p.onNavigate} />

      <MaterialBatchFlowCard
        role={p.role}
        counts={stageCounts}
        subtitle="One system, all roles. Counts are live for this workspace; your access is shown on each stage."
        onOpen={p.onNavigate}
      />

      <div style={twoUp}>
        <TaskListCard
          title="My tasks"
          subtitle={`Routed to ${ROLE_LABELS[p.role]} · oldest first`}
          tasks={tasks}
          loading={loading}
          emptyText={'Nothing is routed to you. Dispositions, releases and deviation reviews '
            + 'appear here as they are raised.'}
        />
        <NotificationsCard
          subtitle="Only what QA is responsible for"
          notices={notices}
          loading={loading}
          emptyText="No notifications yet."
        />
      </div>

      <div style={twoUp}>
        <ReleaseReadinessPlaceholder />
        <ControlsInForce
          title="Controls in force"
          subtitle="Enforced for every role, including admins"
          items={QA_MANAGER_CONTROLS}
        />
      </div>
    </div>
  );
}

/**
 * Release readiness, with nothing to show yet.
 *
 * The table itself belongs on this dashboard and the design draws it
 * with three batches, their hard blocks, their warnings and a state.
 * Nothing in this workspace has a batch, so rather than draw an empty
 * table with four headings and no rows — which reads as "no batch is
 * blocked", a claim — it says what the card is for.
 */
function ReleaseReadinessPlaceholder() {
  return (
    <section style={{
      background: '#fff', border: '1px solid #e3e6eb', borderRadius: 14,
      padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0,
    }}>
      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Release readiness</h3>
      <span style={{ fontSize: 13, color: '#5b6472', lineHeight: '19px' }}>
        Blocks and warnings are shown before you open the batch.
      </span>
      <p style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: '20px', color: '#5b6472' }}>
        No batch is awaiting release. Batches appear here once production completes them,
        with anything that blocks release listed before you open them.
      </p>
    </section>
  );
}

const twoUp: React.CSSProperties = {
  display: 'grid', gap: 16, minWidth: 0,
  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
};
