import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuditType =
  | 'gmp' | 'iso' | 'fda' | 'nafdac' | 'son' | 'who' | 'ecju' | 'internal' | 'custom';

export type PrepStatus = 'draft' | 'assembling' | 'ready' | 'exported';

export type InspectionType = 'scheduled' | 'unannounced';

export type ItemType =
  | 'batch_record' | 'capa' | 'control' | 'certificate'
  | 'sop' | 'policy' | 'obligation' | 'risk' | 'change_control';

export interface EvidenceCounts {
  batch_records?:   { total: number; released: number; rejected: number; pending: number };
  capas?:           { total: number; open: number; closed: number; overdue: number };
  controls?:        { total: number; compliant: number; non_compliant: number; partial: number };
  certificates?:    { total: number; active: number; expiring_soon: number; expired: number };
  sops?:            { total: number; effective: number; in_review: number };
  policies?:        { total: number; published: number; approved: number };
  obligations?:     { total: number; completed: number; pending: number; overdue: number };
  risks?:           { total: number; open: number; mitigated: number; high: number };
  change_controls?: { total: number; approved: number; pending: number; regulatory: number };
}

export interface AuditPrepSession {
  id: string;
  company_id: string;
  name: string;
  audit_type: AuditType;
  inspection_type: InspectionType;
  scheduled_date: string | null;
  inspector_name: string | null;
  inspector_org: string | null;
  scope_notes: string | null;
  status: PrepStatus;
  assembled_at: string | null;
  ai_summary: string | null;
  evidence_counts: EvidenceCounts;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditPrepItem {
  id: string;
  session_id: string;
  company_id: string;
  item_type: ItemType;
  source_table: string;
  source_id: string | null;
  title: string;
  description: string | null;
  status: string | null;
  item_date: string | null;
  relevance_tag: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditPrepSessionWithItems extends AuditPrepSession {
  items: AuditPrepItem[];
}

export const AUDIT_TYPE_LABELS: Record<AuditType, string> = {
  gmp:      'GMP Inspection',
  iso:      'ISO Audit',
  fda:      'FDA Inspection',
  nafdac:   'NAFDAC Inspection',
  son:      'SON Audit',
  who:      'WHO Prequalification',
  ecju:     'ECJU Assessment',
  internal: 'Internal Audit',
  custom:   'Custom',
};

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  batch_record:   'Batch Records',
  capa:           'CAPAs',
  control:        'Control Tests',
  certificate:    'Licences & Certificates',
  sop:            'SOPs',
  policy:         'Policies',
  obligation:     'Regulatory Obligations',
  risk:           'Risk Register',
  change_control: 'Change Controls',
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function getAuditPrepSessions(companyId: string): Promise<AuditPrepSession[]> {
  const { data, error } = await (supabase as any)
    .from('audit_prep_sessions')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[auditPrepService] getAuditPrepSessions:', error.message);
    return [];
  }
  return (data ?? []) as AuditPrepSession[];
}

export async function createAuditPrepSession(
  companyId: string,
  userId: string,
  input: {
    name: string;
    audit_type: AuditType;
    inspection_type?: InspectionType;
    scheduled_date?: string;
    inspector_name?: string;
    inspector_org?: string;
    scope_notes?: string;
  }
): Promise<AuditPrepSession | null> {
  const { data, error } = await (supabase as any)
    .from('audit_prep_sessions')
    .insert({ ...input, company_id: companyId, created_by: userId })
    .select()
    .single();

  if (error) {
    console.error('[auditPrepService] createAuditPrepSession:', error.message);
    return null;
  }
  return data as AuditPrepSession;
}

export async function getAuditPrepSession(
  sessionId: string,
  companyId: string
): Promise<AuditPrepSessionWithItems | null> {
  const [{ data: session, error: sErr }, { data: items, error: iErr }] = await Promise.all([
    (supabase as any)
      .from('audit_prep_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('company_id', companyId)
      .single(),
    (supabase as any)
      .from('audit_prep_items')
      .select('*')
      .eq('session_id', sessionId)
      .eq('company_id', companyId)
      .order('item_type')
      .order('item_date', { ascending: false }),
  ]);

  if (sErr || !session) {
    console.error('[auditPrepService] getAuditPrepSession:', sErr?.message);
    return null;
  }

  return {
    ...(session as AuditPrepSession),
    items: (items ?? []) as AuditPrepItem[],
  };
}

export async function deleteAuditPrepSession(companyId: string, sessionId: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('audit_prep_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('company_id', companyId);

  if (error) {
    console.error('[auditPrepService] deleteAuditPrepSession:', error.message);
    return false;
  }
  return true;
}

// ── Assembly trigger ──────────────────────────────────────────────────────────

export async function triggerAuditAssembly(
  companyId: string,
  sessionId: string
): Promise<{ ok: boolean; error?: string }> {
  const {
    data: { session: authSession },
  } = await supabase.auth.getSession();

  if (!authSession?.access_token || !SUPABASE_URL) {
    return { ok: false, error: 'Not authenticated' };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/audit-prep-assembler`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authSession.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session_id: sessionId, company_id: companyId }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Assembler error ${res.status}: ${text}` };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message ?? 'Unknown error' };
  }
}

// ── Polling helper — re-fetch session until status leaves 'assembling' ────────

export async function pollUntilReady(
  sessionId: string,
  companyId: string,
  onUpdate: (s: AuditPrepSession) => void,
  intervalMs = 3000,
  maxAttempts = 40
): Promise<void> {
  let attempts = 0;
  return new Promise((resolve) => {
    const tick = async () => {
      attempts++;
      const { data } = await (supabase as any)
        .from('audit_prep_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('company_id', companyId)
        .single();

      if (data) onUpdate(data as AuditPrepSession);

      if (!data || data.status !== 'assembling' || attempts >= maxAttempts) {
        resolve();
      } else {
        setTimeout(tick, intervalMs);
      }
    };
    setTimeout(tick, intervalMs);
  });
}

// ── Unannounced Mode — fast priority-document surfacing ───────────────────────
// Bypasses the full AI assembler. Directly queries the handful of documents an
// inspector asks for first, so they can be produced in seconds.

export interface PriorityDoc {
  category: string;
  title: string;
  subtitle?: string;
  status?: string | null;
  date?: string | null;
}

export async function getUnannouncedPriorityDocs(companyId: string): Promise<PriorityDoc[]> {
  const docs: PriorityDoc[] = [];

  const [batchRes, coaRes, licenceRes] = await Promise.all([
    // Most recently released batch (fall back to latest batch).
    (supabase as any)
      .from('batch_records')
      .select('batch_number, product_name, status, released_at, created_at')
      .eq('company_id', companyId)
      .order('released_at', { ascending: false, nullsFirst: false })
      .limit(1),
    // Latest CoA (prefer QA-approved ordering by created_at desc).
    (supabase as any)
      .from('certificate_of_analysis')
      .select('coa_number, product_name, batch_number, status, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1),
    // Active licences (e.g. NAFDAC) — soonest to expire first.
    (supabase as any)
      .from('regulatory_licences')
      .select('*')
      .eq('company_id', companyId)
      .order('expiry_date', { ascending: true })
      .limit(3),
  ]);

  const batch = batchRes?.data?.[0];
  if (batch) {
    docs.push({
      category: 'Current Batch Record',
      title: `${batch.batch_number} — ${batch.product_name}`,
      status: batch.status,
      date: batch.released_at ?? batch.created_at ?? null,
    });
  }

  const coa = coaRes?.data?.[0];
  if (coa) {
    docs.push({
      category: 'Latest Certificate of Analysis',
      title: `${coa.coa_number} — ${coa.product_name}`,
      subtitle: coa.batch_number ? `Batch ${coa.batch_number}` : undefined,
      status: coa.status,
      date: coa.created_at ?? null,
    });
  }

  const licences = (licenceRes?.data ?? []) as any[];
  for (const lic of licences) {
    const title = lic.licence_name ?? lic.name ?? lic.title ?? lic.licence_number ?? 'Regulatory Licence';
    const issuer = lic.issuing_body ?? lic.regulator ?? lic.authority ?? null;
    docs.push({
      category: issuer ? `${issuer} Licence` : 'Regulatory Licence',
      title: String(title),
      subtitle: lic.licence_number ? `No. ${lic.licence_number}` : undefined,
      status: lic.status ?? null,
      date: lic.expiry_date ?? lic.expires_at ?? null,
    });
  }

  return docs;
}

// ── NAFDAC inspection readiness — count app-held evidence per checklist type ──
import type { ReadinessEvidence } from './pharma/nafdacInspectionChecklist';

export type ReadinessCounts = Partial<Record<Exclude<ReadinessEvidence, 'external'>, number>>;

export async function checkNafdacReadiness(companyId: string): Promise<ReadinessCounts> {
  const headCount = (table: string, companyCol = 'company_id') =>
    (supabase as any)
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(companyCol, companyId);

  const [batches, coa, rm, sops, licences, changes] = await Promise.allSettled([
    headCount('batch_records'),
    headCount('certificate_of_analysis'),
    headCount('raw_material_receipts'),
    headCount('sop_documents'),
    headCount('regulatory_licences'),
    headCount('change_controls'),
  ]);

  const val = (r: PromiseSettledResult<any>): number =>
    r.status === 'fulfilled' ? ((r.value as any).count ?? 0) : 0;

  return {
    batch_records: val(batches),
    coa: val(coa),
    raw_materials: val(rm),
    sops: val(sops),
    licences: val(licences),
    change_control: val(changes),
  };
}

// ── Export helper — build a printable text summary ────────────────────────────

export function buildExportText(session: AuditPrepSessionWithItems): string {
  const lines: string[] = [
    `AUDIT EVIDENCE PACKAGE`,
    `${'='.repeat(60)}`,
    `Audit:       ${session.name}`,
    `Type:        ${AUDIT_TYPE_LABELS[session.audit_type]}`,
    `Scheduled:   ${session.scheduled_date ?? 'TBD'}`,
    `Inspector:   ${session.inspector_name ?? '—'} (${session.inspector_org ?? '—'})`,
    `Prepared:    ${session.assembled_at ? new Date(session.assembled_at).toLocaleString() : '—'}`,
    ``,
    `AI READINESS ASSESSMENT`,
    `${'─'.repeat(60)}`,
    session.ai_summary ?? '(No AI summary generated)',
    ``,
    `EVIDENCE SUMMARY`,
    `${'─'.repeat(60)}`,
  ];

  const counts = session.evidence_counts as Record<string, Record<string, number>>;
  for (const [key, val] of Object.entries(counts)) {
    lines.push(`${key.replace(/_/g, ' ').toUpperCase()}: ${JSON.stringify(val)}`);
  }

  lines.push('', `EVIDENCE ITEMS (${session.items.length} total)`, `${'─'.repeat(60)}`);

  const byType: Record<string, AuditPrepItem[]> = {};
  for (const item of session.items) {
    if (!byType[item.item_type]) byType[item.item_type] = [];
    byType[item.item_type].push(item);
  }

  for (const [type, items] of Object.entries(byType)) {
    lines.push(``, `── ${ITEM_TYPE_LABELS[type as ItemType] ?? type} (${items.length})`);
    for (const item of items) {
      lines.push(`   • [${item.status ?? '—'}] ${item.title} ${item.item_date ? `(${item.item_date})` : ''}`);
    }
  }

  return lines.join('\n');
}
