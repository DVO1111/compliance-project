import { supabase } from '../supabase';
import { Database } from '../database.types';
import { recordAuditEvent } from '../auditService';

export type SnapshotStatus = 'compliant' | 'non_compliant' | 'partial' | 'unknown';
export type EvidenceStatus = 'ok' | 'missing' | 'expired' | 'none';

export interface GrcPostureMetrics {
  totalControls: number;
  compliantCount: number;
  nonCompliantCount: number;
  missingEvidenceCount: number;
  evidenceCoveragePercent: number;
}

export interface ControlPosture {
  id: string;
  reference_code: string | null;
  title: string;
  owner_id: string | null;
  owner_name: string | null;
  snapshot_status: SnapshotStatus | 'no_snapshot';
  evidence_status: EvidenceStatus;
  last_snapshot_date: string | null;
}

/**
 * What a row of recent evidence activity is called.
 *
 * Evidence used to be a content submission and the query joined its
 * title. Since the decoupling it can be any of five kinds of record,
 * and there is no single table to join — so the row names the KIND and
 * the short id rather than fetching five different titles for a panel
 * that shows ten rows. Evidence with nothing linked says so, which is
 * the state the database itself marks as missing.
 */
function evidenceLabel(entityType: string | null, entityId: string | null): string {
  if (!entityId) return 'Nothing linked';
  const kind = ENTITY_LABEL[entityType ?? ''] ?? 'Record';
  return `${kind} ${entityId.slice(0, 8)}`;
}

const ENTITY_LABEL: Record<string, string> = {
  content_submission: 'Submission',
  batch_record: 'Batch record',
  capa_record: 'CAPA',
  sop_document: 'SOP',
  change_control: 'Change control',
};

export interface RecentEvidenceActivity {
  id: string;
  //  Evidence stopped belonging to a content submission in
  //  20260603010000_decouple_grc_evidence.sql: submission_id was
  //  dropped for a generic entity_type + entity_id, so a control can
  //  cite a batch record, a CAPA or an SOP as readily as a submission.
  //  These two carry that, and `entity_label` is what the row shows.
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string;
  control_ref: string | null;
  control_title: string | null;
  linked_by: string | null;
  linked_by_name: string | null;
  linked_at: string;
  status: string;
}

export interface FrameworkPosture {
  metrics: GrcPostureMetrics;
  snapshotDistribution: { status: string; count: number; color: string }[];
  evidenceDistribution: { name: string; value: number }[];
  topRiskControls: ControlPosture[];
  recentActivity: RecentEvidenceActivity[];
}

export async function getFrameworkPosture(
  frameworkId: string,
  companyId: string
): Promise<FrameworkPosture> {
  const [controlsRes, snapshotsRes, evidenceRes, profilesRes, recentEvRes] = await Promise.all([
    // 1. All controls for the framework
    supabase
      .from('grc_controls')
      .select('id, reference_code, title, owner_id')
      .eq('framework_id', frameworkId)
      .eq('company_id', companyId),
    
    // 2. Latest snapshot per control (heuristic: all snapshots for these controls, we'll pick latest in-memory)
    // In a large DB, we'd use a more targeted RPC or window function, but for MVP client-side is controllable
    supabase
      .from('grc_control_snapshots')
      .select('control_id, status, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),

    // 3. Evidence links
    supabase
      .from('grc_control_evidence')
      .select('id, control_id, entity_id, status, valid_until')
      .eq('company_id', companyId),

    // 4. Profiles for names
    supabase
      .from('profiles')
      .select('id, full_name'),

    // 5. Recent evidence activity (joined with controls and submissions)
    supabase
      .from('grc_control_evidence')
      .select(`
        id,
        created_at,
        status,
        entity_type,
        entity_id,
        control_id,
        linked_by,
        grc_controls (reference_code, title)
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(10)
  ]);

  if (controlsRes.error) throw new Error(controlsRes.error.message);

  const controls = (controlsRes.data as any[]) || [];
  const controlIds = new Set(controls.map(c => c.id));

  // Build profile map
  const profileMap: Record<string, string> = {};
  (profilesRes.data || []).forEach(p => profileMap[p.id] = p.full_name || 'Unnamed');

  // Build snapshot map (pick latest per control)
  const snapshotMap: Record<string, { status: SnapshotStatus; date: string }> = {};
  (snapshotsRes.data || []).forEach(s => {
    if (controlIds.has(s.control_id) && !snapshotMap[s.control_id]) {
      snapshotMap[s.control_id] = { status: s.status as SnapshotStatus, date: s.created_at || '' };
    }
  });

  // Build evidence maps
  const now = new Date();
  const evidenceMap: Record<string, { valid: number; expired: number; missing: number }> = {};
  (evidenceRes.data || []).forEach(e => {
    if (!controlIds.has(e.control_id)) return;
    if (!evidenceMap[e.control_id]) evidenceMap[e.control_id] = { valid: 0, expired: 0, missing: 0 };
    
    const isExpired = e.status === 'expired' || (e.valid_until && new Date(e.valid_until) < now);
    //  The same test the database's own trigger makes
    //  (fn_grc_evidence_missing): evidence with nothing linked to it is
    //  missing. This read `!e.submission_id` until the column was
    //  dropped, after which it was true for every row — so every piece
    //  of evidence counted as missing and the valid and expired
    //  branches below were unreachable.
    const isMissing = !e.entity_id || e.status === 'missing';

    if (isMissing) evidenceMap[e.control_id].missing++;
    else if (isExpired) evidenceMap[e.control_id].expired++;
    else evidenceMap[e.control_id].valid++;
  });

  // Process Controls Posture
  const controlPostures: ControlPosture[] = controls.map(c => {
    const snap = snapshotMap[c.id];
    const ev = evidenceMap[c.id] || { valid: 0, expired: 0, missing: 0 };
    
    let evStatus: EvidenceStatus = 'none';
    if (ev.valid > 0) evStatus = 'ok';
    else if (ev.expired > 0) evStatus = 'expired';
    else if (ev.missing > 0) evStatus = 'missing';

    return {
      id: c.id,
      reference_code: c.reference_code,
      title: c.title,
      owner_id: c.owner_id,
      owner_name: c.owner_id ? profileMap[c.owner_id] : null,
      snapshot_status: snap ? snap.status : 'no_snapshot',
      evidence_status: evStatus,
      last_snapshot_date: snap ? snap.date : null,
    };
  });

  // Compute Metrics
  const total = controlPostures.length;
  const compliant = controlPostures.filter(c => c.snapshot_status === 'compliant').length;
  const nonCompliant = controlPostures.filter(c => c.snapshot_status === 'non_compliant').length;
  const missingEv = controlPostures.filter(c => c.evidence_status !== 'ok').length;
  const withValidEv = controlPostures.filter(c => c.evidence_status === 'ok').length;

  const metrics: GrcPostureMetrics = {
    totalControls: total,
    compliantCount: compliant,
    nonCompliantCount: nonCompliant,
    missingEvidenceCount: missingEv,
    evidenceCoveragePercent: total > 0 ? Math.round((withValidEv / total) * 100) : 0,
  };

  // Distributions
  const snapDist = [
    { status: 'Compliant', count: compliant, color: '#13CD3C' },
    { status: 'Non-Compliant', count: nonCompliant, color: '#FF3B3B' },
    { status: 'Partial', count: controlPostures.filter(c => c.snapshot_status === 'partial').length, color: '#FFB800' },
    { status: 'Unknown/No Snapshot', count: controlPostures.filter(c => c.snapshot_status === 'unknown' || c.snapshot_status === 'no_snapshot').length, color: '#9CA3AF' },
  ];

  const evDist = [
    { name: 'With Valid Evidence', value: withValidEv },
    { name: 'Without Valid Evidence', value: total - withValidEv },
  ];

  // Top Risk Controls (non-compliant first, then partial, then missing ev)
  const topRisk = [...controlPostures].sort((a, b) => {
    const score = (p: ControlPosture) => {
      if (p.snapshot_status === 'non_compliant') return 100;
      if (p.snapshot_status === 'partial') return 80;
      if (p.snapshot_status === 'unknown' || p.snapshot_status === 'no_snapshot') return 60;
      if (p.evidence_status !== 'ok') return 40;
      return 0;
    };
    return score(b) - score(a);
  }).slice(0, 10);

  // Recent Activity
  const recentActivity: RecentEvidenceActivity[] = (recentEvRes.data || []).map((e: any) => ({
    id: e.id,
    entity_type: e.entity_type,
    entity_id: e.entity_id,
    entity_label: evidenceLabel(e.entity_type, e.entity_id),
    control_ref: e.grc_controls?.reference_code || null,
    control_title: e.grc_controls?.title || 'Unknown Control',
    linked_by: e.linked_by,
    linked_by_name: e.linked_by ? profileMap[e.linked_by] : 'Unknown User',
    linked_at: e.created_at,
    status: e.status
  }));

  return {
    metrics,
    snapshotDistribution: snapDist,
    evidenceDistribution: evDist,
    topRiskControls: topRisk,
    recentActivity
  };
}

export async function exportPostureToCSV(frameworkId: string, companyId: string, frameworkName: string) {
  const posture = await getFrameworkPosture(frameworkId, companyId);
  
  const headers = ['Ref Code', 'Title', 'Owner', 'Snapshot Status', 'Evidence Status', 'Last Snapshot Date'];
  const rows = posture.topRiskControls.map(c => [
    c.reference_code || '',
    c.title,
    c.owner_name || 'Unassigned',
    c.snapshot_status,
    c.evidence_status,
    c.last_snapshot_date ? new Date(c.last_snapshot_date).toLocaleDateString() : 'Never'
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `GRC_Posture_${frameworkName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Audit export
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await recordAuditEvent({
      userId: user.id,
      companyId: companyId,
      action: 'export',
      entityType: 'grc_report',
      entityId: frameworkId,
      metadata: { framework_name: frameworkName, report_type: 'posture_csv' }
    });
  }
}
