/**
 * Continuous Control Monitoring Service — Tier 1 Item 2
 *
 * Turns the static Framework Library catalogue into a live health tracker.
 * Loads evidence, test results, and config per company, then computes
 * a ControlHealth status for every enabled framework control.
 */

import { logger } from './logger';

async function db() {
  const { supabase } = await import('./supabase');
  return supabase;
}

async function logAudit(params: {
  userId: string; companyId: string; action: string;
  entityType: string; entityId: string; metadata?: Record<string, unknown>;
}) {
  try {
    const { recordAuditEvent } = await import('./auditService');
    await recordAuditEvent(params);
  } catch { /* audit failure must never block the main operation */ }
}

/* ── Row types ─────────────────────────────────────────────────────────────── */

export interface EvidenceRow {
  id: string;
  company_id: string;
  control_id: string;
  title: string;
  description: string | null;
  evidence_type: string;
  file_name: string | null;
  file_url: string | null;
  expires_at: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface TestLogRow {
  id: string;
  company_id: string;
  control_id: string;
  status: 'pass' | 'fail' | 'partial' | 'not_applicable';
  notes: string | null;
  tested_by: string | null;
  next_test_due: string | null;
  tested_at: string;
  created_at: string;
}

export interface ControlConfigRow {
  id: string;
  company_id: string;
  control_id: string;
  is_applicable: boolean;
  test_interval_days: number;
  owner_id: string | null;
  notes: string | null;
  updated_at: string;
}

/* ── Health types ──────────────────────────────────────────────────────────── */

export type ControlStatus =
  | 'compliant'
  | 'due_soon'
  | 'overdue'
  | 'failing'
  | 'partial'
  | 'untested'
  | 'evidence_expiring'
  | 'not_applicable';

export interface ControlHealth {
  controlId: string;
  controlCode: string;
  title: string;
  description: string;
  frameworkId: string;
  frameworkCode: string;
  frameworkShortName: string;
  severity: 'Red' | 'Yellow' | 'Info';
  category: string | null;
  status: ControlStatus;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
  nextTestDue: string | null;
  daysOverdue: number | null;
  evidenceCount: number;
  expiringEvidenceCount: number;
  ownerId: string | null;
  testIntervalDays: number;
  openFlagCount: number;
  criticalFlagCount: number;
}

export interface FrameworkHealth {
  frameworkId: string;
  frameworkCode: string;
  frameworkShortName: string;
  frameworkName: string;
  jurisdiction: string;
  totalControls: number;
  compliant: number;
  dueSoon: number;
  overdue: number;
  failing: number;
  untested: number;
  notApplicable: number;
  evidenceExpiring: number;
  complianceScore: number;
  controls: ControlHealth[];
}

export interface CompanyHealthReport {
  companyId: string;
  generatedAt: string;
  totalControls: number;
  compliantControls: number;
  overdueControls: number;
  failingControls: number;
  untestedControls: number;
  evidenceExpiringCount: number;
  overallScore: number;
  frameworks: FrameworkHealth[];
}

/* ── Status computation ────────────────────────────────────────────────────── */

function computeStatus(
  latestTest: TestLogRow | null,
  evidence: EvidenceRow[],
  config: ControlConfigRow | null,
  severityHint: string,
  openFlags: { severity: string }[]
): { status: ControlStatus; daysOverdue: number | null; nextDue: string | null } {
  if (config && !config.is_applicable) {
    return { status: 'not_applicable', daysOverdue: null, nextDue: null };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const defaultInterval = severityHint === 'Red' ? 180 : 365;
  const intervalDays = config?.test_interval_days ?? defaultInterval;

  if (!latestTest) {
    // Open critical flag on untested control → mark failing so it surfaces
    if (openFlags.some(f => f.severity === 'critical')) {
      return { status: 'failing', daysOverdue: null, nextDue: null };
    }
    return { status: 'untested', daysOverdue: null, nextDue: null };
  }

  if (latestTest.status === 'fail') {
    return { status: 'failing', daysOverdue: null, nextDue: latestTest.next_test_due ?? null };
  }

  if (latestTest.status === 'partial') {
    return { status: 'partial', daysOverdue: null, nextDue: latestTest.next_test_due ?? null };
  }

  const testedAt = new Date(latestTest.tested_at);
  const nextDueDate = latestTest.next_test_due
    ? new Date(latestTest.next_test_due)
    : new Date(testedAt.getTime() + intervalDays * 86_400_000);

  const msUntilDue = nextDueDate.getTime() - today.getTime();
  const daysUntilDue = Math.floor(msUntilDue / 86_400_000);

  if (daysUntilDue < 0) {
    return {
      status: 'overdue',
      daysOverdue: Math.abs(daysUntilDue),
      nextDue: nextDueDate.toISOString().split('T')[0],
    };
  }

  if (daysUntilDue <= 30) {
    return { status: 'due_soon', daysOverdue: null, nextDue: nextDueDate.toISOString().split('T')[0] };
  }

  const expiringCount = evidence.filter(e => {
    if (!e.expires_at) return false;
    const expiry = new Date(e.expires_at);
    const daysToExpiry = Math.floor((expiry.getTime() - today.getTime()) / 86_400_000);
    return daysToExpiry >= 0 && daysToExpiry <= 30;
  }).length;

  if (expiringCount > 0) {
    return { status: 'evidence_expiring', daysOverdue: null, nextDue: nextDueDate.toISOString().split('T')[0] };
  }

  // Degrade an otherwise-compliant control if it has open regulatory flags
  if (openFlags.some(f => f.severity === 'critical')) {
    return { status: 'failing', daysOverdue: null, nextDue: nextDueDate.toISOString().split('T')[0] };
  }
  if (openFlags.some(f => f.severity === 'warning')) {
    return { status: 'partial', daysOverdue: null, nextDue: nextDueDate.toISOString().split('T')[0] };
  }

  return { status: 'compliant', daysOverdue: null, nextDue: nextDueDate.toISOString().split('T')[0] };
}

function computeScore(controls: ControlHealth[]): number {
  const applicable = controls.filter(c => c.status !== 'not_applicable');
  if (applicable.length === 0) return 0;
  const healthy = applicable.filter(c => c.status === 'compliant' || c.status === 'due_soon').length;
  return Math.round((healthy / applicable.length) * 100);
}

/* ── Main report ────────────────────────────────────────────────────────────── */

export async function getCompanyHealthReport(companyId: string): Promise<CompanyHealthReport> {
  const empty: CompanyHealthReport = {
    companyId,
    generatedAt: new Date().toISOString(),
    totalControls: 0,
    compliantControls: 0,
    overdueControls: 0,
    failingControls: 0,
    untestedControls: 0,
    evidenceExpiringCount: 0,
    overallScore: 0,
    frameworks: [],
  };

  try {
    const client = await db() as any;

    // 1. Get enabled framework IDs
    const { data: wf } = await client
      .from('workspace_frameworks')
      .select('framework_id')
      .eq('company_id', companyId);

    if (!wf || wf.length === 0) return empty;
    const enabledIds = wf.map((r: any) => r.framework_id) as string[];

    // 2. Get framework metadata
    const { data: frameworks } = await client
      .from('regulatory_frameworks')
      .select('id, code, short_name, name, jurisdiction')
      .in('id', enabledIds);

    if (!frameworks || frameworks.length === 0) return empty;

    // 3. Get all active controls for enabled frameworks
    const { data: controls } = await client
      .from('framework_controls')
      .select('id, framework_id, control_code, title, description, severity, category')
      .in('framework_id', enabledIds)
      .eq('is_active', true);

    if (!controls || controls.length === 0) return empty;
    const controlIds = controls.map((c: any) => c.id) as string[];

    // 4. Get latest test per control (fetch all, reduce in memory)
    const { data: allTests } = await client
      .from('framework_test_log')
      .select('*')
      .eq('company_id', companyId)
      .in('control_id', controlIds)
      .order('tested_at', { ascending: false });

    const latestTests = new Map<string, TestLogRow>();
    for (const t of (allTests ?? []) as TestLogRow[]) {
      if (!latestTests.has(t.control_id)) latestTests.set(t.control_id, t);
    }

    // 5. Get all evidence
    const { data: allEvidence } = await client
      .from('framework_evidence')
      .select('*')
      .eq('company_id', companyId)
      .in('control_id', controlIds);

    const evidenceByControl = new Map<string, EvidenceRow[]>();
    for (const e of (allEvidence ?? []) as EvidenceRow[]) {
      if (!evidenceByControl.has(e.control_id)) evidenceByControl.set(e.control_id, []);
      evidenceByControl.get(e.control_id)!.push(e);
    }

    // 6. Get all configs
    const { data: allConfigs } = await client
      .from('framework_control_config')
      .select('*')
      .eq('company_id', companyId)
      .in('control_id', controlIds);

    const configByControl = new Map<string, ControlConfigRow>();
    for (const c of (allConfigs ?? []) as ControlConfigRow[]) {
      configByControl.set(c.control_id, c);
    }

    // 6b. Get open regulatory update flags for these controls
    const { data: allFlags } = await client
      .from('regulatory_update_control_flags')
      .select('control_id, severity')
      .eq('company_id', companyId)
      .eq('status', 'flagged')
      .in('control_id', controlIds);

    const flagsByControl = new Map<string, { severity: string }[]>();
    for (const f of (allFlags ?? []) as { control_id: string; severity: string }[]) {
      if (!flagsByControl.has(f.control_id)) flagsByControl.set(f.control_id, []);
      flagsByControl.get(f.control_id)!.push({ severity: f.severity });
    }

    // 7. Build framework map
    const fwMap = new Map<string, any>();
    for (const fw of frameworks) fwMap.set(fw.id, fw);

    // 8. Compute health for each control
    const frameworkHealthMap = new Map<string, FrameworkHealth>();
    for (const fw of frameworks) {
      frameworkHealthMap.set(fw.id, {
        frameworkId: fw.id,
        frameworkCode: fw.code,
        frameworkShortName: fw.short_name,
        frameworkName: fw.name,
        jurisdiction: fw.jurisdiction,
        totalControls: 0,
        compliant: 0,
        dueSoon: 0,
        overdue: 0,
        failing: 0,
        untested: 0,
        notApplicable: 0,
        evidenceExpiring: 0,
        complianceScore: 0,
        controls: [],
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const ctrl of controls as any[]) {
      const fw = fwMap.get(ctrl.framework_id);
      if (!fw) continue;

      const latestTest = latestTests.get(ctrl.id) ?? null;
      const evidence = evidenceByControl.get(ctrl.id) ?? [];
      const config = configByControl.get(ctrl.id) ?? null;
      const openFlags = flagsByControl.get(ctrl.id) ?? [];

      const { status, daysOverdue, nextDue } = computeStatus(latestTest, evidence, config, ctrl.severity, openFlags);

      const defaultInterval = ctrl.severity === 'Red' ? 180 : 365;
      const expiringCount = evidence.filter(e => {
        if (!e.expires_at) return false;
        const expiry = new Date(e.expires_at);
        const days = Math.floor((expiry.getTime() - today.getTime()) / 86_400_000);
        return days >= 0 && days <= 30;
      }).length;

      const health: ControlHealth = {
        controlId: ctrl.id,
        controlCode: ctrl.control_code,
        title: ctrl.title,
        description: ctrl.description,
        frameworkId: ctrl.framework_id,
        frameworkCode: fw.code,
        frameworkShortName: fw.short_name,
        severity: ctrl.severity,
        category: ctrl.category,
        status,
        lastTestedAt: latestTest?.tested_at ?? null,
        lastTestStatus: latestTest?.status ?? null,
        nextTestDue: nextDue,
        daysOverdue,
        evidenceCount: evidence.length,
        expiringEvidenceCount: expiringCount,
        ownerId: config?.owner_id ?? null,
        testIntervalDays: config?.test_interval_days ?? defaultInterval,
        openFlagCount: openFlags.length,
        criticalFlagCount: openFlags.filter(f => f.severity === 'critical').length,
      };

      const fwHealth = frameworkHealthMap.get(ctrl.framework_id)!;
      fwHealth.controls.push(health);
      fwHealth.totalControls++;

      switch (status) {
        case 'compliant':        fwHealth.compliant++;      break;
        case 'due_soon':         fwHealth.dueSoon++;        break;
        case 'overdue':          fwHealth.overdue++;        break;
        case 'failing':
        case 'partial':          fwHealth.failing++;        break;
        case 'untested':         fwHealth.untested++;       break;
        case 'not_applicable':   fwHealth.notApplicable++;  break;
        case 'evidence_expiring': fwHealth.evidenceExpiring++; break;
      }
    }

    // 9. Compute scores and flatten
    const fwHealthList: FrameworkHealth[] = [];
    for (const fwHealth of frameworkHealthMap.values()) {
      fwHealth.complianceScore = computeScore(fwHealth.controls);
      // Sort: overdue+failing first, then due_soon, then untested, then compliant
      fwHealth.controls.sort((a, b) => {
        const order: Record<ControlStatus, number> = {
          failing: 0, overdue: 1, partial: 2, due_soon: 3,
          evidence_expiring: 4, untested: 5, compliant: 6, not_applicable: 7,
        };
        return order[a.status] - order[b.status];
      });
      fwHealthList.push(fwHealth);
    }
    fwHealthList.sort((a, b) => a.complianceScore - b.complianceScore);

    // 10. Aggregate totals
    const allControlHealth = fwHealthList.flatMap(f => f.controls);
    const totalControls = allControlHealth.length;
    const compliantControls = allControlHealth.filter(c => c.status === 'compliant' || c.status === 'due_soon').length;
    const applicable = allControlHealth.filter(c => c.status !== 'not_applicable');
    const overallScore = applicable.length > 0
      ? Math.round((compliantControls / applicable.length) * 100)
      : 0;

    return {
      companyId,
      generatedAt: new Date().toISOString(),
      totalControls,
      compliantControls,
      overdueControls: allControlHealth.filter(c => c.status === 'overdue').length,
      failingControls: allControlHealth.filter(c => c.status === 'failing' || c.status === 'partial').length,
      untestedControls: allControlHealth.filter(c => c.status === 'untested').length,
      evidenceExpiringCount: allControlHealth.reduce((s, c) => s + c.expiringEvidenceCount, 0),
      overallScore,
      frameworks: fwHealthList,
    };
  } catch (err) {
    logger.error('controlMonitoring: getCompanyHealthReport failed', err);
    return empty;
  }
}

/* ── Test log CRUD ─────────────────────────────────────────────────────────── */

export async function recordTest(
  companyId: string,
  controlId: string,
  status: 'pass' | 'fail' | 'partial' | 'not_applicable',
  notes: string,
  nextTestDue: string | null,
  testedBy: string
): Promise<TestLogRow | null> {
  try {
    const client = await db() as any;

    const { data, error } = await client
      .from('framework_test_log')
      .insert({ company_id: companyId, control_id: controlId, status, notes: notes || null, next_test_due: nextTestDue || null, tested_by: testedBy })
      .select('*')
      .single();
    if (error) { logger.error('recordTest', error); return null; }

    await logAudit({
      userId: testedBy, companyId,
      action: 'record_control_test',
      entityType: 'framework_control',
      entityId: controlId,
      metadata: { status, notes: notes || null, next_test_due: nextTestDue },
    });

    // Auto-create CAPA on fail or partial — skip if one is already open for this control
    if (status === 'fail' || status === 'partial') {
      try {
        const { createCapa, hasPendingCapaForControl } = await import('./capaService');
        const alreadyOpen = await hasPendingCapaForControl(companyId, controlId);
        if (!alreadyOpen) {
          // Fetch control title + code for a meaningful CAPA title
          const { data: ctrl } = await client
            .from('framework_controls')
            .select('control_code, title')
            .eq('id', controlId)
            .single();

          const code = ctrl?.control_code ?? controlId;
          const title = ctrl?.title ?? 'Unknown Control';
          const isFailure = status === 'fail';

          await createCapa(companyId, testedBy, {
            title: `${isFailure ? 'Control Failure' : 'Partial Control Failure'}: [${code}] ${title}`,
            description: `Auto-generated from test result. Control ${code} recorded as ${status.toUpperCase()} on ${new Date().toISOString().split('T')[0]}. ${notes ? `Test notes: ${notes}` : 'Immediate investigation required.'}`,
            source: 'compliance_failure',
            capa_type: 'corrective',
            priority: isFailure ? 'high' : 'medium',
            controlId,
            controlCode: code,
          });
        }
      } catch (capaErr) {
        logger.error('recordTest: auto-CAPA creation failed', capaErr);
      }
    }

    // Propagate test result to Risk Register
    await maybePropagateTestToRiskRegister(companyId, testedBy, controlId, status, client);

    return data;
  } catch (err) {
    logger.error('recordTest', err);
    return null;
  }
}

async function maybePropagateTestToRiskRegister(
  companyId: string,
  userId: string,
  controlId: string,
  status: 'pass' | 'fail' | 'partial' | 'not_applicable',
  client: any,
): Promise<void> {
  try {
    const { createRisk, updateRisk, addRiskLink } = await import('./governance/riskRegisterService');

    const { data: links } = await client
      .from('risk_links')
      .select('risk_id')
      .eq('company_id', companyId)
      .eq('link_type', 'control')
      .eq('linked_entity_id', controlId)
      .limit(1);
    const existingRiskId: string | null = links?.[0]?.risk_id ?? null;

    if (status === 'pass' || status === 'not_applicable') {
      // Resolve any open risk linked to this control
      if (existingRiskId) {
        await updateRisk(companyId, userId, existingRiskId, { status: 'monitored' });
      }
      return;
    }

    const { data: ctrl } = await client
      .from('framework_controls')
      .select('control_code, title')
      .eq('id', controlId)
      .maybeSingle();

    const code: string = ctrl?.control_code ?? controlId;
    const title: string = ctrl?.title ?? 'Unknown Control';
    const isFailure = status === 'fail';
    const riskLevel = isFailure ? 'high' : 'medium';

    if (existingRiskId) {
      await updateRisk(companyId, userId, existingRiskId, { risk_level: riskLevel, status: 'identified' });
    } else {
      const risk = await createRisk(companyId, userId, {
        title: `${isFailure ? 'Control Failure' : 'Partial Control Failure'}: [${code}] ${title}`,
        description: `Control [${code}] "${title}" recorded a ${status.toUpperCase()} test result on ${new Date().toISOString().split('T')[0]}. Remediation via CAPA has been initiated.`,
        risk_category: 'compliance',
        risk_level: riskLevel,
        status: 'identified',
      });
      if (risk) await addRiskLink(companyId, userId, risk.id, 'control', controlId);
    }
  } catch (err) {
    logger.warn('maybePropagateTestToRiskRegister: non-blocking', err);
  }
}

export async function getTestHistory(companyId: string, controlId: string): Promise<TestLogRow[]> {
  const { data, error } = await (await db() as any)
    .from('framework_test_log')
    .select('*')
    .eq('company_id', companyId)
    .eq('control_id', controlId)
    .order('tested_at', { ascending: false })
    .limit(20);
  if (error) { logger.error('getTestHistory', error); return []; }
  return data ?? [];
}

/* ── Evidence CRUD ─────────────────────────────────────────────────────────── */

export async function addEvidence(
  companyId: string,
  controlId: string,
  payload: {
    title: string;
    description?: string;
    evidence_type: string;
    file_name?: string;
    file_url?: string;
    expires_at?: string;
    uploaded_by: string;
  }
): Promise<EvidenceRow | null> {
  try {
    const { data, error } = await (await db() as any)
      .from('framework_evidence')
      .insert({ company_id: companyId, control_id: controlId, ...payload })
      .select('*')
      .single();
    if (error) { logger.error('addEvidence', error); return null; }
    await logAudit({
      userId: payload.uploaded_by, companyId,
      action: 'add_control_evidence',
      entityType: 'framework_control',
      entityId: controlId,
      metadata: { evidence_title: payload.title, evidence_type: payload.evidence_type, expires_at: payload.expires_at ?? null },
    });
    return data;
  } catch (err) {
    logger.error('addEvidence', err);
    return null;
  }
}

export async function removeEvidence(evidenceId: string): Promise<boolean> {
  const { error } = await (await db() as any)
    .from('framework_evidence')
    .delete()
    .eq('id', evidenceId);
  if (error) { logger.error('removeEvidence', error); return false; }
  return true;
}

export async function getEvidenceForControl(companyId: string, controlId: string): Promise<EvidenceRow[]> {
  const { data, error } = await (await db() as any)
    .from('framework_evidence')
    .select('*')
    .eq('company_id', companyId)
    .eq('control_id', controlId)
    .order('created_at', { ascending: false });
  if (error) { logger.error('getEvidenceForControl', error); return []; }
  return data ?? [];
}

/* ── Control config ────────────────────────────────────────────────────────── */

export async function setControlConfig(
  companyId: string,
  controlId: string,
  patch: Partial<Pick<ControlConfigRow, 'is_applicable' | 'test_interval_days' | 'owner_id' | 'notes'>>
): Promise<boolean> {
  const { error } = await (await db() as any)
    .from('framework_control_config')
    .upsert(
      { company_id: companyId, control_id: controlId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'company_id,control_id' }
    );
  if (error) { logger.error('setControlConfig', error); return false; }
  return true;
}
