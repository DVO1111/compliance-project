import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';

// ─── Types ───────────────────────────────────────────────────

export type EntityType =
  | 'content_submission'
  | 'batch_record'
  | 'capa_record'
  | 'sop_document'
  | 'change_control';

export type EvidenceLink = {
  id: string;
  company_id: string;
  control_id: string;
  entity_type: EntityType | null;
  entity_id: uuid | null;
  status: string; // valid | expired | missing
  linked_by: string | null;
  valid_until: string | null;
  created_at: string;
};

type uuid = string;

export type EnrichedEvidence = EvidenceLink & {
  entity_label: string | null;
  entity_detail: string | null;
  computed_status: string; // valid | expired | missing
};

// ─── Resolve display label for any entity type ────────────────
async function resolveEntityLabel(
  entityType: EntityType | null,
  entityId: string | null,
  companyId: string
): Promise<{ label: string | null; detail: string | null }> {
  if (!entityType || !entityId) return { label: null, detail: null };

  try {
    if (entityType === 'content_submission') {
      const { data } = await supabase
        .from('content_submissions')
        .select('title, platform')
        .eq('id', entityId)
        .eq('company_id', companyId)
        .maybeSingle() as any;
      return { label: data?.title || null, detail: data?.platform || null };
    }

    if (entityType === 'capa_record') {
      const { data } = await (supabase as any)
        .from('capa_records')
        .select('capa_number, title')
        .eq('id', entityId)
        .eq('company_id', companyId)
        .maybeSingle();
      return { label: data ? `${data.capa_number}: ${data.title}` : null, detail: 'CAPA Record' };
    }

    if (entityType === 'batch_record') {
      const { data } = await (supabase as any)
        .from('batch_records')
        .select('batch_number, product_name')
        .eq('id', entityId)
        .eq('company_id', companyId)
        .maybeSingle();
      return { label: data ? `${data.batch_number} — ${data.product_name}` : null, detail: 'Batch Record' };
    }

    if (entityType === 'sop_document') {
      const { data } = await (supabase as any)
        .from('sop_documents')
        .select('sop_number, title')
        .eq('id', entityId)
        .eq('company_id', companyId)
        .maybeSingle();
      return { label: data ? `${data.sop_number}: ${data.title}` : null, detail: 'SOP Document' };
    }

    if (entityType === 'change_control') {
      const { data } = await (supabase as any)
        .from('change_controls')
        .select('change_number, title')
        .eq('id', entityId)
        .eq('company_id', companyId)
        .maybeSingle();
      return { label: data ? `${data.change_number}: ${data.title}` : null, detail: 'Change Control' };
    }
  } catch (err) {
    logger.error('Failed to resolve entity label:', err);
  }

  return { label: null, detail: entityType };
}

// ─── Get enriched evidence for a control ─────────────────────
export async function getEnrichedEvidence(
  controlId: string,
  companyId: string
): Promise<EnrichedEvidence[]> {
  const { data: links, error } = await (supabase as any)
    .from('grc_control_evidence')
    .select('*')
    .eq('control_id', controlId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Failed to get evidence links:', error);
    throw new Error(error.message || 'Failed to load evidence');
  }

  const now = Date.now();

  return Promise.all(
    ((links || []) as EvidenceLink[]).map(async (link) => {
      const { label, detail } = await resolveEntityLabel(
        link.entity_type,
        link.entity_id,
        companyId
      );

      const isMissing = !link.entity_id || link.status === 'missing' || (!label && !!link.entity_id);
      const isExpired =
        link.status === 'expired' ||
        (!!link.valid_until && new Date(link.valid_until).getTime() < now);

      return {
        ...link,
        entity_label: label,
        entity_detail: detail,
        computed_status: isMissing ? 'missing' : isExpired ? 'expired' : 'valid',
      };
    })
  );
}

// ─── Link evidence to a control ──────────────────────────────
export async function linkEvidence(
  controlId: string,
  entityType: EntityType,
  entityId: string,
  companyId: string,
  userId: string
): Promise<void> {
  const { data, error } = await (supabase as any)
    .from('grc_control_evidence')
    .insert({
      company_id:  companyId,
      control_id:  controlId,
      entity_type: entityType,
      entity_id:   entityId,
      status:      'valid',
      linked_by:   userId,
    })
    .select('id')
    .single();

  if (error) {
    logger.error('Failed to link evidence:', error);
    throw new Error(error.message || 'Failed to link evidence');
  }

  try {
    await recordAuditEvent({
      userId,
      companyId,
      action:     'link_evidence',
      entityType: 'grc_evidence_link',
      entityId:   data.id,
      metadata:   { control_id: controlId, entity_type: entityType, entity_id: entityId },
      captureEvidence: false,
    });
  } catch (auditErr) {
    logger.error('Audit log failed for link_evidence:', auditErr);
  }
}

// ─── Bulk link evidence (multiple entities at once) ───────────
export async function bulkLinkEvidence(
  controlId: string,
  entities: { entityType: EntityType; entityId: string }[],
  companyId: string,
  userId: string
): Promise<number> {
  if (entities.length === 0) return 0;

  const rows = entities.map(({ entityType, entityId }) => ({
    company_id:  companyId,
    control_id:  controlId,
    entity_type: entityType,
    entity_id:   entityId,
    status:      'valid',
    linked_by:   userId,
  }));

  const { data, error } = await (supabase as any)
    .from('grc_control_evidence')
    .insert(rows)
    .select('id');

  if (error) {
    logger.error('Failed to bulk link evidence:', error);
    throw new Error(error.message || 'Failed to link evidence');
  }

  const inserted = (data || []) as any[];
  for (const row of inserted) {
    try {
      await recordAuditEvent({
        userId,
        companyId,
        action:     'link_evidence',
        entityType: 'grc_evidence_link',
        entityId:   row.id,
        metadata:   { control_id: controlId, entity_count: entities.length },
        captureEvidence: false,
      });
    } catch (auditErr) {
      logger.error('Audit log failed for link_evidence:', auditErr);
    }
  }

  return inserted.length;
}

// ─── Unlink evidence ─────────────────────────────────────────
export async function unlinkEvidence(
  evidenceId: string,
  companyId: string,
  userId: string
): Promise<void> {
  const { data: linkInfo } = await (supabase as any)
    .from('grc_control_evidence')
    .select('control_id, entity_type, entity_id')
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
      action:     'unlink_evidence',
      entityType: 'grc_evidence_link',
      entityId:   evidenceId,
      metadata:   linkInfo || {},
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
      action:     'expire_evidence',
      entityType: 'grc_evidence_link',
      entityId:   evidenceId,
      metadata:   {},
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
      action:     'update_evidence_validity',
      entityType: 'grc_evidence_link',
      entityId:   evidenceId,
      metadata:   { valid_until: validUntil },
      captureEvidence: false,
    });
  } catch (auditErr) {
    logger.error('Audit for validity update failed:', auditErr);
  }
}

// ─── Get linked entity IDs for a control (exclusion list) ────
export async function getLinkedEntityIds(
  controlId: string,
  companyId: string,
  entityType?: EntityType
): Promise<string[]> {
  let query = (supabase as any)
    .from('grc_control_evidence')
    .select('entity_id')
    .eq('control_id', controlId)
    .eq('company_id', companyId);

  if (entityType) query = query.eq('entity_type', entityType);

  const { data } = await query;
  if (!data) return [];
  return (data as any[]).map((r) => r.entity_id).filter(Boolean);
}
