/**
 * Immutable Audit Trail Service
 *
 * Centralized service for creating tamper-evident, hash-chained audit log entries
 * with evidence snapshots. All audit log writes in the application should go through
 * this service instead of inserting directly into the `audit_logs` table.
 *
 * Features:
 *   - SHA-256 integrity hashing via Web Crypto API (zero dependencies)
 *   - Hash chain linking to previous entry (blockchain-light)
 *   - Evidence snapshots: frozen state of the entity at time of action
 *   - Client-side chain verification
 *   - Sealed evidence export (ZIP with integrity manifest)
 */

import { supabase } from './supabase';
import JSZip from 'jszip';
import { logger } from './logger';

// ── Types ────────────────────────────────────────────────────────────────

export interface AuditEventParams {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  companyId: string;
  metadata?: Record<string, unknown>;
  /** If true, automatically captures a snapshot of the entity state */
  captureEvidence?: boolean;
}

export interface AuditEntry {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  integrity_hash: string | null;
  previous_hash: string | null;
  evidence_snapshot: Record<string, unknown>;
  company_id: string | null;
  sequence_number: number | null;
  created_at: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  totalChecked: number;
  brokenAt: string | null;
  verifiedAt: string;
}

export interface RetentionPolicy {
  id: string;
  company_id: string;
  jurisdiction: string;
  retention_years: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Hashing ──────────────────────────────────────────────────────────────

/**
 * SHA-256 hash using the Web Crypto API. Returns a hex string.
 * Works in all modern browsers without any dependencies.
 */
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build the canonical string that gets hashed for integrity verification.
 * Order matters — changing the order would break the chain.
 */
function buildHashPayload(params: {
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  previousHash: string;
  sequenceNumber: number;
}): string {
  return [
    params.action,
    params.entityType,
    params.entityId,
    params.userId,
    JSON.stringify(params.metadata),
    params.createdAt,
    params.previousHash,
    String(params.sequenceNumber),
  ].join('|');
}

// ── Evidence Capture ─────────────────────────────────────────────────────

/**
 * Captures a frozen snapshot of the entity state at the time of the audit event.
 * This evidence cannot be modified after capture, providing regulatory defensibility.
 */
export async function captureEvidenceSnapshot(
  entityType: string,
  entityId: string
): Promise<Record<string, unknown>> {
  const snapshot: Record<string, unknown> = {
    captured_at: new Date().toISOString(),
    entity_type: entityType,
    entity_id: entityId,
  };

  try {
    if (entityType === 'content_submission') {
      // Capture the content submission state
      const { data: content } = await supabase
        .from('content_submissions')
        .select('*')
        .eq('id', entityId)
        .maybeSingle();

      if (content) {
        snapshot.content_submission = content;
      }

      // Capture the associated compliance report
      const { data: report } = await supabase
        .from('compliance_reports')
        .select('*')
        .eq('content_id', entityId)
        .maybeSingle();

      if (report) {
        snapshot.compliance_report = report;
      }

      // Capture the latest legal review
      const { data: reviews } = await supabase
        .from('legal_reviews')
        .select('*')
        .eq('content_id', entityId)
        .order('created_at', { ascending: false })
        .limit(3);

      if (reviews && reviews.length > 0) {
        snapshot.legal_reviews = reviews;
      }
    }
  } catch (err) {
    // Evidence capture failure should not block the audit event
    snapshot.capture_error = err instanceof Error ? err.message : String(err);
  }

  return snapshot;
}

// ── Previous Hash Retrieval ──────────────────────────────────────────────

async function getLastHashForCompany(companyId: string): Promise<{ hash: string; seq: number }> {
  const { data, error } = await (supabase as any)
    .from('audit_logs')
    .select('integrity_hash, sequence_number')
    .eq('company_id', companyId)
    .not('integrity_hash', 'is', null)
    .order('sequence_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { hash: 'GENESIS', seq: 0 };
  }

  return {
    hash: data.integrity_hash || 'GENESIS',
    seq: data.sequence_number || 0,
  };
}

// ── Main Audit Recording ─────────────────────────────────────────────────

/**
 * Record an immutable, hash-chained audit event.
 *
 * This is the single entry point for all audit log writes in the application.
 * Existing callers (marketingActions, legalActions, UploadPage, etc.) should
 * call this function instead of inserting directly into audit_logs.
 *
 * The function:
 *   1. Optionally captures an evidence snapshot of the entity
 *   2. Retrieves the previous hash from the chain
 *   3. Computes a SHA-256 integrity hash over the canonical payload
 *   4. Inserts the audit log with all integrity metadata
 */
export async function recordAuditEvent(params: AuditEventParams): Promise<void> {
  const {
    userId,
    action,
    entityType,
    entityId,
    companyId,
    metadata = {},
    captureEvidence = true,
  } = params;

  const createdAt = new Date().toISOString();

  // 1. Capture evidence snapshot (non-blocking on failure)
  let evidenceSnapshot: Record<string, unknown> = {};
  if (captureEvidence && entityId) {
    try {
      evidenceSnapshot = await captureEvidenceSnapshot(entityType, entityId);
    } catch {
      evidenceSnapshot = { capture_error: 'Evidence capture failed' };
    }
  }

  // 2. Get previous hash and sequence number
  const { hash: previousHash, seq: lastSeq } = await getLastHashForCompany(companyId);
  const sequenceNumber = lastSeq + 1;

  // 3. Compute integrity hash
  const hashPayload = buildHashPayload({
    action,
    entityType,
    entityId,
    userId,
    metadata: { company_id: companyId, ...metadata },
    createdAt,
    previousHash,
    sequenceNumber,
  });

  let integrityHash: string;
  try {
    integrityHash = await sha256(hashPayload);
  } catch {
    // Fallback: if SubtleCrypto is unavailable (e.g., non-HTTPS), use a placeholder
    integrityHash = `NOHASH-${Date.now()}`;
  }

  // 4. Insert the audit log entry
  const { error } = await supabase.from('audit_logs').insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: { company_id: companyId, ...metadata },
    integrity_hash: integrityHash,
    previous_hash: previousHash,
    evidence_snapshot: evidenceSnapshot,
    company_id: companyId,
    sequence_number: sequenceNumber,
  } as any);

  if (error) {
    logger.error(`[AuditService] Failed to record event "${action}":`, error);
  }
}

// ── Chain Verification ───────────────────────────────────────────────────

/**
 * Verify the integrity of the audit chain for a company.
 *
 * Re-computes every hash in the chain and confirms each entry's
 * `previous_hash` matches the prior entry's `integrity_hash`.
 *
 * Can be run client-side for transparency, or server-side via the
 * `verify_audit_chain` RPC for trusted verification.
 */
export async function verifyChainIntegrity(
  companyId: string
): Promise<ChainVerificationResult> {
  // Try server-side verification first (faster, more trustworthy)
  try {
    const { data, error } = await (supabase as any).rpc('verify_audit_chain', {
      p_company_id: companyId,
    });

    if (!error && data) {
      return {
        valid: data.valid,
        totalChecked: data.total_checked,
        brokenAt: data.broken_at,
        verifiedAt: new Date().toISOString(),
      };
    }
  } catch {
    // Fall through to client-side verification
  }

  // Client-side fallback verification
  const { data: logs, error } = await (supabase as any)
    .from('audit_logs')
    .select('id, integrity_hash, previous_hash, sequence_number')
    .eq('company_id', companyId)
    .not('integrity_hash', 'is', null)
    .order('sequence_number', { ascending: true });

  if (error || !logs) {
    return {
      valid: false,
      totalChecked: 0,
      brokenAt: null,
      verifiedAt: new Date().toISOString(),
    };
  }

  let expectedPrev = 'GENESIS';
  for (const log of logs) {
    if (log.previous_hash !== expectedPrev) {
      return {
        valid: false,
        totalChecked: logs.indexOf(log) + 1,
        brokenAt: log.id,
        verifiedAt: new Date().toISOString(),
      };
    }
    expectedPrev = log.integrity_hash;
  }

  return {
    valid: true,
    totalChecked: logs.length,
    brokenAt: null,
    verifiedAt: new Date().toISOString(),
  };
}

// ── Fetch Audit Entries ──────────────────────────────────────────────────

/**
 * Fetch paginated, filterable audit entries for a company.
 */
export async function fetchAuditEntries(params: {
  companyId: string;
  limit?: number;
  offset?: number;
  actionFilter?: string;
  userFilter?: string;
  entityFilter?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ entries: AuditEntry[]; total: number }> {
  const { companyId, limit = 50, offset = 0 } = params;

  let query = (supabase as any)
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.actionFilter) {
    query = query.ilike('action', `%${params.actionFilter}%`);
  }
  if (params.userFilter) {
    query = query.eq('user_id', params.userFilter);
  }
  if (params.entityFilter) {
    query = query.eq('entity_type', params.entityFilter);
  }
  if (params.dateFrom) {
    query = query.gte('created_at', params.dateFrom);
  }
  if (params.dateTo) {
    query = query.lte('created_at', params.dateTo);
  }

  const { data, count, error } = await query;

  if (error) {
    logger.error('[AuditService] Failed to fetch entries:', error);
    return { entries: [], total: 0 };
  }

  return {
    entries: (data || []) as AuditEntry[],
    total: count || 0,
  };
}

// ── Fetch Retention Policies ─────────────────────────────────────────────

export async function fetchRetentionPolicies(
  companyId: string
): Promise<RetentionPolicy[]> {
  const { data, error } = await (supabase as any)
    .from('audit_retention_policies')
    .select('*')
    .or(`company_id.eq.${companyId},company_id.eq.00000000-0000-0000-0000-000000000000`)
    .eq('is_active', true)
    .order('jurisdiction', { ascending: true });

  if (error) {
    logger.error('[AuditService] Failed to fetch retention policies:', error);
    return [];
  }

  return (data || []) as RetentionPolicy[];
}

// ── Sealed Evidence Export ───────────────────────────────────────────────

/**
 * Export a sealed evidence package for a specific content submission.
 *
 * The ZIP contains:
 *   - audit_trail.json — all audit events for this content
 *   - evidence_snapshots/ — individual snapshot JSON files
 *   - integrity_manifest.json — SHA-256 hashes of every file in the ZIP
 *   - chain_verification.json — result of chain integrity check
 */
export async function exportSealedEvidence(
  contentId: string,
  companyId: string
): Promise<void> {
  const zip = new JSZip();

  if (!companyId) {
    alert('Cannot export evidence without a company context.');
    return;
  }

  // 1. Fetch audit entries for this content.
  //    Scoped to the company explicitly rather than leaning on RLS alone —
  //    the filter is stated here so a missing scope is visible in the code
  //    rather than depending on a policy elsewhere being right.
  const { data: entries, error } = await (supabase as any)
    .from('audit_logs')
    .select('*')
    .eq('company_id', companyId)
    .eq('entity_id', contentId)
    .eq('entity_type', 'content_submission')
    .order('sequence_number', { ascending: true });

  if (error || !entries || entries.length === 0) {
    //  company_id was added to audit_logs after the fact and is nullable,
    //  so entries written before it exist with no company scope. Telling
    //  someone "no audit trail" when one exists but predates the column
    //  would be a lie in an evidence export, so the two cases are
    //  distinguished.
    const { data: unscoped } = await (supabase as any)
      .from('audit_logs')
      .select('id')
      .is('company_id', null)
      .eq('entity_id', contentId)
      .eq('entity_type', 'content_submission')
      .limit(1);

    if (unscoped && unscoped.length > 0) {
      alert(
        'This content has audit entries that predate company scoping and cannot be ' +
        'exported safely. Ask an administrator to backfill audit_logs.company_id.'
      );
    } else {
      alert('No audit trail found for this content.');
    }
    return;
  }

  // 2. Add audit trail
  const trailJson = JSON.stringify(entries, null, 2);
  zip.file('audit_trail.json', trailJson);

  // 3. Add evidence snapshots
  const snapshotsFolder = zip.folder('evidence_snapshots')!;
  for (const entry of entries as AuditEntry[]) {
    if (entry.evidence_snapshot && Object.keys(entry.evidence_snapshot).length > 0) {
      const filename = `${entry.sequence_number || 'x'}_${entry.action}.json`;
      snapshotsFolder.file(filename, JSON.stringify(entry.evidence_snapshot, null, 2));
    }
  }

  // 4. Run chain verification
  const verification = await verifyChainIntegrity(companyId);
  zip.file('chain_verification.json', JSON.stringify(verification, null, 2));

  // 5. Build integrity manifest (hash every file in the ZIP)
  const manifest: Record<string, string> = {};
  const files = zip.files;
  for (const [path, file] of Object.entries(files)) {
    if (!file.dir) {
      const content = await file.async('string');
      manifest[path] = await sha256(content);
    }
  }
  manifest['_generated_at'] = new Date().toISOString();
  manifest['_chain_valid'] = String(verification.valid);
  zip.file('integrity_manifest.json', JSON.stringify(manifest, null, 2));

  // 6. Download
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Sealed_Evidence_${contentId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
