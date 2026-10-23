/**
 * The dashboard for a role the Figma file does not draw one for.
 *
 * ── WHAT THIS IS, AND WHY IT IS NOT A GUESS ──
 *
 * The file contains two dashboards: DB-01 for the QA Manager and DB-02
 * for the Storekeeper. PM-03 tabulates EIGHT roles. The remaining six —
 * Procurement, QC Analyst, QA Officer, Production supervisor,
 * Compliance admin and Management — have no frame anywhere in the
 * file, on desktop or mobile.
 *
 * Leaving them on the first-run dashboard is the defect this repair
 * exists to undo: it is the "every role lands on the same screen"
 * problem with an extra step. Handing them DB-01 is worse, because it
 * offers a QC Analyst the release readiness table and the QA task
 * queue, neither of which is theirs.
 *
 * So this screen is DERIVED, and the derivation is stated rather than
 * implied:
 *
 *   1. The STRUCTURE is DB-01's and DB-02's, which are the same:
 *      greeting, tiles, the material-and-batch flow, tasks beside a
 *      second card, controls at the bottom. Both frames agree on it,
 *      so it is the file's dashboard shape rather than one role's.
 *
 *   2. The TILES are the sections this role may act in, taken from
 *      PM-03. DB-01 and DB-02 both tile what their role does —
 *      QC PENDING and QA REVIEW for the QA Manager, PUT-AWAY and
 *      READY TO ISSUE for the Storekeeper — so "tile what you act on"
 *      is read off the two worked examples rather than invented.
 *
 *   3. The SECOND CARD is DB-02's locked-sections list whenever the
 *      role has sections closed to it, and DB-01's absence of one when
 *      it does not. Again: both frames, same rule.
 *
 *   4. Nothing is shown that PM-03 does not grant.
 *
 * WHERE THE DERIVATION IS WEAKEST, said plainly on the screen: this
 * dashboard does not know what the role's own first task of the day
 * is. DB-01 leads with dispositions and releases because that is a QA
 * Manager's morning; DB-02 leads with put-aways. For a Procurement
 * lead or a QC Analyst nobody has written that down, so the tiles are
 * ordered by the process rather than by urgency, and a banner says the
 * screen is derived so nobody mistakes it for a specified one.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PackageX, FlaskConical, ShieldCheck, Gauge, ClipboardList,
  PackageCheck, Truck, FileCheck2, Network,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import DashTiles, { type Tile } from './db/DashTiles';
import MaterialBatchFlowCard from './db/MaterialBatchFlowCard';
import TaskListCard from './db/TaskListCard';
import ControlsInForce, { QA_MANAGER_CONTROLS } from './db/ControlsInForce';
import DashboardHeader from './db/DashboardHeader';
import LockedSectionsCard from '../Access/LockedSectionsCard';
import RequestAccessDialog from '../Access/RequestAccessDialog';
import SectionNotReady from '../Common/SectionNotReady';
import {
  ROLE_LABELS, SECTION_LABELS, LEVEL_MEANING,
  type WorkRole, type AccessSection, type AccessRequestInput,
} from '../../lib/access/permissionRequests';
import { raiseRequest } from '../../lib/access/accessRequestService';
import {
  sectionAccess, canAct, PM_SECTIONS, type PmSection,
} from '../../lib/access/roleAccess';
import {
  qaManagerCounts, storekeeperCounts, myPendingSections, derivedTasks,
  type Count, type DerivedTask,
} from '../../lib/dashboard/roleDashboardService';
import type { StageCount } from './db/materialBatchFlow';
import { supabase } from '../../lib/supabase';
import { logger } from '../../lib/logger';

/** A tile per PM-03 section, with the page it opens and its glyph. */
const SECTION_TILE: Record<PmSection, { label: string; icon: LucideIcon; page?: string }> = {
  suppliers:      { label: 'SUPPLIERS',      icon: PackageCheck, page: 'supplier-qualification' },
  goods_receipt:  { label: 'GOODS RECEIPT',  icon: Truck,        page: 'goods-receipt' },
  material_lots:  { label: 'MATERIAL LOTS',  icon: PackageX,     page: 'materials' },
  qc_testing:     { label: 'QC TESTING',     icon: FlaskConical, page: 'qc-testing' },
  qa_disposition: { label: 'QA DISPOSITION', icon: ShieldCheck,  page: 'qa-disposition' },
  batch_records:  { label: 'BATCH RECORDS',  icon: Gauge,        page: 'batch-execution' },
  batch_release:  { label: 'BATCH RELEASE',  icon: FlaskConical, page: 'batch-release' },
  deviation_capa: { label: 'DEVIATION / CAPA', icon: ClipboardList, page: 'deviations' },
  coa_register:   { label: 'CoA REGISTER',   icon: FileCheck2,   page: 'coa' },
  traceability:   { label: 'TRACEABILITY',   icon: Network,      page: 'traceability' },
  distribution:   { label: 'DISTRIBUTION',   icon: Truck },
};

export interface DerivedRoleDashboardProps {
  companyId?: string | null;
  userId?: string | null;
  role: WorkRole;
  personName?: string | null;
  siteName?: string | null;
  onNavigate?: (page: string) => void;
}

export default function DerivedRoleDashboard(p: DerivedRoleDashboardProps) {
  const [counts, setCounts] = useState<Record<string, Count>>({});
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
      //  The same two count sets the drawn dashboards use. Nothing new
      //  is invented for these roles; they read the same numbers from
      //  the same tables, filtered by what they may see.
      const [qa, sk] = await Promise.all([
        qaManagerCounts(p.companyId), storekeeperCounts(p.companyId),
      ]);
      setCounts({
        suppliers: qa.procurement,
        goods_receipt: sk.putAway,
        material_lots: qa.quarantine,
        qc_testing: qa.qcPending,
        qa_disposition: qa.qaReview,
        batch_records: qa.production,
        batch_release: qa.qaReview,
        deviation_capa: qa.deviations,
        coa_register: null,
        traceability: null,
        distribution: qa.distribution,
      });
    }
    setTasks(await derivedTasks(p.companyId, (sec) => canAct(p.role, sec as PmSection)));
    if (p.userId) setPending(await myPendingSections(p.userId));
    setLoading(false);
  }, [p.companyId, p.userId, p.role]);

  useEffect(() => { void load(); }, [load]);

  //  Tiled in process order: what the role ACTS on first, then what it
  //  only watches. Six tiles at most, which is DB-02's count — more
  //  than seven stops being a summary.
  const tiles: Tile[] = useMemo(() => {
    const acts = PM_SECTIONS.filter((s) => sectionAccess(p.role, s) === 'act');
    const views = PM_SECTIONS.filter((s) => sectionAccess(p.role, s) === 'view');
    const chosen = [...acts, ...views].slice(0, 6);
    return chosen.map((s) => ({
      label: SECTION_TILE[s].label,
      value: counts[s] ?? null,
      caption: sectionAccess(p.role, s) === 'act' ? 'you can act here' : 'view only',
      icon: SECTION_TILE[s].icon,
      page: SECTION_TILE[s].page,
    }));
  }, [p.role, counts]);

  const stageCounts: Record<string, StageCount> = useMemo(() => ({
    '01': { value: counts.suppliers ?? null,      label: 'suppliers to qualify' },
    '02': { value: counts.material_lots ?? null,  label: 'lots in quarantine' },
    '03': { value: counts.qc_testing ?? null,     label: 'tests in progress' },
    '04': { value: counts.qa_disposition ?? null, label: 'lots awaiting decision' },
    '05': { value: counts.batch_records ?? null,  label: 'active batches' },
    '06': { value: counts.qc_testing ?? null,     label: 'batches in test' },
    '07': { value: counts.batch_release ?? null,  label: 'batches for review' },
    '08': { value: counts.distribution ?? null,   label: 'released, ready to ship' },
  }), [counts]);

  const locked = useMemo(() => PM_SECTIONS
    .filter((s) => sectionAccess(p.role, s) === 'none')
    .map((s) => ({
      section: s as unknown as AccessSection,
      wouldAllow: LEVEL_MEANING[s as unknown as AccessSection]?.view
        ?? `Open ${SECTION_LABELS[s as unknown as AccessSection]}`,
      pending: pending.includes(s),
    })), [p.role, pending]);

  const ask = useCallback(async (req: AccessRequestInput) => {
    if (!p.companyId) return;
    setSending(true);
    const result = await raiseRequest({
      companyId: p.companyId, workRole: p.role, request: req,
    });
    setSending(false);
    if (!result.ok) {
      setNotice(result.message);
      logger.error('[derived dashboard] access request refused', {
        section: req.section, message: result.message,
      });
      return;
    }
    setAsking(null);
    setNotice(`Request sent. A compliance admin will review your ${SECTION_LABELS[req.section]} request.`);
    await load();
  }, [p.companyId, p.role, load]);

  if (!p.companyId) {
    return <p style={{ fontSize: 15, color: '#5b6472' }}>
      This dashboard belongs to a workspace. Finish setting one up and it appears here.
    </p>;
  }

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

      {/*  SAID ON THE SCREEN, NOT ONLY IN A COMMENT. Somebody looking at
           this should know it was derived from the permissions matrix
           rather than drawn, so they can say what is wrong with it. */}
      <p style={derivedNote} role="note">
        This dashboard is built from what the {ROLE_LABELS[p.role]} role can open, because
        the design file draws one only for the QA Manager and the Storekeeper. The sections
        and access below are exact; the choice of what to lead with is not yet specified.
      </p>

      {ready === false && (
        <SectionNotReady
          section="The quality tables"
          whatItWillShow="Once they are deployed these counts read live from your workspace."
        />
      )}

      <DashTiles tiles={tiles} onOpen={p.onNavigate} />

      <MaterialBatchFlowCard
        role={p.role}
        counts={stageCounts}
        subtitle="One system, all roles. Stages you can’t open still show where the work is."
        onOpen={p.onNavigate}
        onRequest={(s) => setAsking(s as AccessSection)}
        pendingSections={pending}
      />

      <div style={twoUp}>
        <TaskListCard
          title="My tasks"
          subtitle={`Routed to ${ROLE_LABELS[p.role]} · oldest first`}
          tasks={tasks.map((t) => ({
            id: t.id, title: t.title, detail: t.detail,
            state: t.state, due: t.due, page: t.page,
          }))}
          loading={loading}
          onOpen={(t) => t.page && p.onNavigate?.(t.page)}
          emptyText={'Nothing is waiting on you. Work appears here as it is raised against '
            + 'the sections you can act in.'}
        />
        {locked.length > 0 ? (
          <LockedSectionsCard
            sections={locked}
            onRequest={(s) => setAsking(s as AccessSection)}
          />
        ) : (
          <ControlsInForce
            title="Controls in force"
            subtitle="Enforced for every role, including admins"
            items={QA_MANAGER_CONTROLS}
          />
        )}
      </div>

      {locked.length > 0 && (
        <ControlsInForce
          title="Controls in force"
          subtitle="Enforced for every role, including admins"
          items={QA_MANAGER_CONTROLS}
        />
      )}

      {asking && (
        <RequestAccessDialog
          section={asking}
          role={p.role}
          roleLabel={ROLE_LABELS[p.role]}
          scopeOptions={['Records I work on', 'All records at this site']}
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
const derivedNote: React.CSSProperties = {
  margin: 0, background: '#f7f8fa', border: '1px solid #e3e6eb', borderRadius: 10,
  padding: '10px 14px', fontSize: 13, lineHeight: '19px', color: '#5b6472',
};
