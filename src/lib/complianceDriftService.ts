/**
 * Compliance Drift Service
 *
 * Aggregates drift signals from across the platform — CAPAs, licences,
 * GMP gaps, SON audit failures, regulatory impact assessments — into a
 * single ranked feed. No new DB tables; reads what already exists.
 */

import { getCapas } from './capaService';
import { fetchLicenses, getLicenseStatus, getDaysUntilExpiry } from './licenseService';
import { getReadinessLog, INSPECTION_ITEMS } from './gmpInspectionService';
import { getSonAudits } from './sonComplianceService';
import { fetchImpactAssessments } from './horizonScanningService';

export type DriftCategory = 'capa' | 'licence' | 'gmp' | 'son_audit' | 'regulatory';
export type DriftSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ComplianceDriftSignal {
  id: string;
  category: DriftCategory;
  title: string;
  description: string;
  severity: DriftSeverity;
  daysOverdue: number;   // positive = overdue, negative = days remaining
  framework: string;
  navigateTo: string;    // PageId to navigate to for remediation
}

const SEVERITY_ORDER: Record<DriftSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function capaSeverity(daysOverdue: number, priority: string): DriftSeverity {
  if (priority === 'critical' || daysOverdue > 30) return 'critical';
  if (priority === 'high'     || daysOverdue > 14) return 'high';
  if (daysOverdue > 0)                              return 'medium';
  return 'low';
}

export async function getComplianceDriftSignals(companyId: string): Promise<ComplianceDriftSignal[]> {
  const signals: ComplianceDriftSignal[] = [];
  const now = new Date();

  const results = await Promise.allSettled([
    getCapas(companyId),
    fetchLicenses(companyId),
    getReadinessLog(companyId),
    getSonAudits(companyId),
    fetchImpactAssessments(companyId),
  ]);

  // ── 1. Overdue CAPAs ───────────────────────────────────────────────────────
  if (results[0].status === 'fulfilled') {
    for (const capa of results[0].value) {
      if (!capa.due_date || capa.status === 'closed') continue;
      const due = new Date(capa.due_date);
      if (due >= now) continue;
      const daysOverdue = Math.floor((now.getTime() - due.getTime()) / 86400000);
      signals.push({
        id: `capa-${capa.id}`,
        category: 'capa',
        title: `Overdue CAPA: ${capa.title}`,
        description: `${capa.priority.toUpperCase()} priority · ${capa.source.replace(/_/g, ' ')} · Status: ${capa.status.replace(/_/g, ' ')}`,
        severity: capaSeverity(daysOverdue, capa.priority),
        daysOverdue,
        framework: 'CAPA / Deviation',
        navigateTo: 'capa-management',
      });
    }
  }

  // ── 2. Expiring / expired licences ─────────────────────────────────────────
  if (results[1].status === 'fulfilled') {
    for (const lic of results[1].value) {
      const status = getLicenseStatus(lic.expiry_date);
      if (status === 'active') continue;
      const daysLeft = getDaysUntilExpiry(lic.expiry_date);
      const expired = status === 'expired';
      signals.push({
        id: `licence-${lic.id}`,
        category: 'licence',
        title: `${expired ? 'Expired' : 'Expiring'} Licence: ${lic.product_name}`,
        description: `${lic.nafdac_reg_number} · ${lic.issuing_authority} · Expiry: ${new Date(lic.expiry_date).toLocaleDateString()}`,
        severity: expired ? 'critical' : daysLeft < 30 ? 'high' : 'medium',
        daysOverdue: expired ? Math.abs(daysLeft) : -daysLeft,
        framework: 'NAFDAC Licensing',
        navigateTo: 'license-vault',
      });
    }
  }

  // ── 3. Critical GMP inspection gaps ────────────────────────────────────────
  if (results[2].status === 'fulfilled') {
    const logMap = new Map(results[2].value.map(e => [e.item_id, e.status]));
    for (const item of INSPECTION_ITEMS) {
      if (!item.isCritical) continue;
      const status = logMap.get(item.id) ?? 'gap';
      if (status !== 'gap') continue;
      signals.push({
        id: `gmp-${item.id}`,
        category: 'gmp',
        title: `GMP Critical Gap: ${item.title}`,
        description: `Area: ${item.area} · This item causes immediate NAFDAC inspection failure if unresolved`,
        severity: 'critical',
        daysOverdue: 0,
        framework: 'NAFDAC GMP',
        navigateTo: 'gmp-inspection',
      });
    }
  }

  // ── 4. SON audit failures / corrective actions outstanding ─────────────────
  if (results[3].status === 'fulfilled') {
    for (const audit of results[3].value) {
      if (audit.status !== 'failed' && audit.status !== 'pending_corrective_action') continue;
      const scheduledDate = new Date(audit.scheduled_date);
      const daysAgo = Math.floor((now.getTime() - scheduledDate.getTime()) / 86400000);
      signals.push({
        id: `son-${audit.id}`,
        category: 'son_audit',
        title: `SON Audit ${audit.status === 'failed' ? 'Failed' : 'Corrective Action Required'}`,
        description: `${audit.audit_type.charAt(0).toUpperCase() + audit.audit_type.slice(1)} audit on ${scheduledDate.toLocaleDateString()}${audit.findings ? ` · ${audit.findings}` : ''}`,
        severity: audit.status === 'failed' ? 'critical' : 'high',
        daysOverdue: daysAgo,
        framework: 'SON Conformity',
        navigateTo: 'son-compliance',
      });
    }
  }

  // ── 5. Unactioned regulatory impact assessments ────────────────────────────
  if (results[4].status === 'fulfilled') {
    for (const assessment of results[4].value) {
      if (assessment.status === 'applied' || assessment.status === 'dismissed') continue;
      const createdDate = new Date(assessment.createdAt);
      const daysOld = Math.floor((now.getTime() - createdDate.getTime()) / 86400000);
      if (daysOld < 1) continue;
      const change = assessment.suggestedChange ?? assessment.reason ?? '';
      signals.push({
        id: `reg-${assessment.id}`,
        category: 'regulatory',
        title: `Unactioned Regulatory Impact (${assessment.impactLevel.toUpperCase()})`,
        description: `${change.slice(0, 120)}${change.length > 120 ? '…' : ''}`,
        severity: assessment.impactLevel as DriftSeverity,
        daysOverdue: daysOld,
        framework: 'Regulatory Intelligence',
        navigateTo: 'horizon-scanning',
      });
    }
  }

  // Sort: severity first, then most overdue
  return signals.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return b.daysOverdue - a.daysOverdue;
  });
}

export function getDriftSummary(signals: ComplianceDriftSignal[]) {
  return {
    total:    signals.length,
    critical: signals.filter(s => s.severity === 'critical').length,
    high:     signals.filter(s => s.severity === 'high').length,
    byCategory: {
      capa:       signals.filter(s => s.category === 'capa').length,
      licence:    signals.filter(s => s.category === 'licence').length,
      gmp:        signals.filter(s => s.category === 'gmp').length,
      son_audit:  signals.filter(s => s.category === 'son_audit').length,
      regulatory: signals.filter(s => s.category === 'regulatory').length,
    },
  };
}
