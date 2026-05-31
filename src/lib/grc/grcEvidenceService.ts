import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';

// ─── Types ───────────────────────────────────────────────────
export type EvidenceLink = {
  id: string;
  company_id: string;
  control_id: string;
  submission_id: string | null;
  status: string; // valid | expired | missing
  linked_by: string | null;
  valid_until: string | null;
  created_at: string;
};

export type EnrichedEvidence = EvidenceLink & {
  submission_title: string | null;
  submission_platform: string | null;
  submission_status: string | null;
  computed_status: string; // valid | expired | missing (accounts for valid_until)
};

// ─── Get enriched evidence for a control ─────────────────────
export async function getEnrichedEvidence(
  controlId: string,
  companyId: string
): Promise<EnrichedEvidence[]> {
  // Two parallel queries: evidence links + content_submissions
  const [linksRes, subsRes] = await Promise.all([
    (supabase as any)
      .from('grc_control_evidence')
      .select('*')
      .eq('control_id', controlId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('content_submissions')
      .select('id,title,platform,status')
      .eq('company_id', companyId),
  ]);

  if (linksRes.error) {
    logger.error('Failed to get evidence links:', linksRes.error);
    throw new Error(linksRes.error.message || 'Failed to load evidence');
  }

  const links = (linksRes.data || []) as EvidenceLink[];

  // Build submission map
  const subMap: Record<string, { title: string; platform: string; status: string }> = {};
  if (subsRes.data) {
    for (const s of subsRes.data as any[]) {
      subMap[s.id] = { title: s.title, platform: s.platform, status: s.status };
    }
  }

  const now = Date.now();

  return links.map((link) => {
    const sub = link.submission_id ? subMap[link.submission_id] : null;
    const isMissing = !link.submission_id || link.status === 'missing' || (link.submission_id && !sub);
    const isExpired = link.status === 'expired' || (link.valid_until && new Date(link.valid_until).getTime() < now);

    return {
      ...link,
      submission_title: sub?.title || null,
      submission_platform: sub?.platform || null,
      submission_status: sub?.status || null,
      computed_status: isMissing ? 'missing' : isExpired ? 'expired' : 'valid',
    };
  });
}

// ─── Bulk link evidence ──────────────────────────────────────
export async function bulkLinkEvidence(
  controlId: string,
  submissionIds: string[],
  companyId: string,
  userId: string
): Promise<number> {
  if (submissionIds.length === 0) return 0;

  const rows = submissionIds.map((sid) => ({
    company_id: companyId,
    control_id: controlId,
    submission_id: sid,
    status: 'valid',
    linked_by: userId,
  }));

  const { data, error } = await (supabase as any)
    .from('grc_control_evidence')
    .insert(rows)
    .select('id');

  if (error) {
    logger.error('Failed to bulk link evidence:', error);
    throw new Error(error.message || 'Failed to link evidence');
  }

  // Audit each link
  const inserted = (data || []) as any[];
  for (const row of inserted) {
    try {
      await recordAuditEvent({
        userId,
        companyId,
        action: 'link_evidence',
        entityType: 'grc_evidence_link',
        entityId: row.id,
        metadata: { control_id: controlId, submission_count: submissionIds.length },
        captureEvidence: false,
      });
    } catch (auditErr) {
      logger.error('Audit log failed for link_evidence:', auditErr);
    }
  }

  return inserted.length;
}

// ─── Unlink evidence (hard delete + audit) ───────────────────
export async function unlinkEvidence(
  evidenceId: string,
  companyId: string,
  userId: string
): Promise<void> {
  const { data: linkInfo } = await (supabase as any)
    .from('grc_control_evidence')
    .select('control_id,submission_id')
    .eq('id', evidenceId)
    .eq('company_id', companyId)
    .single();

  const { error } = await (supabase as any)
    .from('grc_control_evidence')
    .delete()
    .eq('id', evidenceId)
    .eq('company_id', companyId);

  if (error) {
    logger.error('Failed to unlink evidence:', error);
    throw new Error(error.message || 'Failed to unlink evidence');
  }

  try {
    await recordAuditEvent({
      userId,
      companyId,
      action: 'unlink_evidence',
      entityType: 'grc_evidence_link',
      entityId: evidenceId,
      metadata: linkInfo || {},
      captureEvidence: false,
    });
  } catch (auditErr) {
    logger.error('Audit log failed for unlink_evidence:', auditErr);
  }
}

// ─── Expire evidence ─────────────────────────────────────────
export async function expireEvidence(
  evidenceId: string,
  companyId: string,
  userId: string
): Promise<void> {
  const { error } = await (supabase as any)
    .from('grc_control_evidence')
    .update({ status: 'expired' })
    .eq('id', evidenceId)
    .eq('company_id', companyId);

  if (error) {
    logger.error('Failed to expire evidence:', error);
    throw new Error(error.message || 'Failed to expire evidence');
  }

  try {
    await recordAuditEvent({
      userId,
      companyId,
      action: 'expire_evidence',
      entityType: 'grc_evidence_link',
      entityId: evidenceId,
      metadata: {},
      captureEvidence: false,
    });
  } catch (auditErr) {
    logger.error('Audit for expire failed:', auditErr);
  }
}

// ─── Set valid_until ─────────────────────────────────────────
export async function setValidUntil(
  evidenceId: string,
  validUntil: string | null,
  companyId: string,
  userId: string
): Promise<void> {
  const { error } = await (supabase as any)
    .from('grc_control_evidence')
    .update({ valid_until: validUntil })
    .eq('id', evidenceId)
    .eq('company_id', companyId);

  if (error) {
    logger.error('Failed to set valid_until:', error);
    throw new Error(error.message || 'Failed to set validity date');
  }

  try {
    await recordAuditEvent({
      userId,
      companyId,
      action: 'update_evidence_validity',
      entityType: 'grc_evidence_link',
      entityId: evidenceId,
      metadata: { valid_until: validUntil },
      captureEvidence: false,
    });
  } catch (auditErr) {
    logger.error('Audit for validity update failed:', auditErr);
  }
}

// ─── Get already-linked submission IDs (for exclusion) ───────
export async function getLinkedSubmissionIds(
  controlId: string,
  companyId: string
): Promise<string[]> {
  const { data } = await (supabase as any)
    .from('grc_control_evidence')
    .select('submission_id')
    .eq('control_id', controlId)
    .eq('company_id', companyId);

  if (!data) return [];
  return (data as any[]).map((r) => r.submission_id).filter(Boolean);
}
