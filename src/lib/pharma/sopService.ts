/**
 * SOP / Document Control — now backed by the Lifecycle Engine (D03).
 *
 * `sop_documents.status` is a DERIVED read model: the database keeps it in
 * step with entity_current_state and rejects direct writes.
 *
 * `sop_versions` is deliberately NOT a lifecycle entity — the engine
 * models the document family. Version `effective`/`superseded` are paired
 * by `publish_sop_version()` inside one transaction, which is where the
 * "one effective version per document" rule now lives.
 */

import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';
import { transition as lifecycleTransition, getAvailableActions } from '../lifecycleService';
import type { LifecycleAction } from '../lifecycleService';

export type SopStatus = 'draft' | 'in_review' | 'approved' | 'effective' | 'superseded' | 'obsolete';
export type SopVersionStatus = 'draft' | 'in_review' | 'approved' | 'effective' | 'superseded';
export type SopCategory = 'manufacturing' | 'quality' | 'safety' | 'regulatory' | 'hr' | 'other';

export interface SopDocument {
  id: string;
  company_id: string;
  sop_number: string;
  title: string;
  department: string;
  category: SopCategory;
  current_version: string;
  status: SopStatus;
  effective_date: string | null;
  review_due_date: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SopVersion {
  id: string;
  sop_id: string;
  version_number: string;
  content_text: string | null;
  file_name: string | null;
  file_url: string | null;
  change_summary: string | null;
  status: SopVersionStatus;
  approved_by: string | null;
  approved_at: string | null;
  effective_date: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SopAcknowledgement {
  id: string;
  sop_version_id: string;
  user_id: string;
  acknowledged_at: string;
}

export async function listSopDocuments(companyId: string, category?: SopCategory): Promise<SopDocument[]> {
  let query = (supabase as any)
    .from('sop_documents')
    .select('*')
    .eq('company_id', companyId)
    .order('sop_number', { ascending: true });

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) { logger.error('listSopDocuments:', error); return []; }
  return data ?? [];
}

export async function getSopDocument(id: string, companyId: string): Promise<SopDocument | null> {
  const { data, error } = await (supabase as any)
    .from('sop_documents')
    .select('*')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) { logger.error('getSopDocument:', error); return null; }
  return data;
}

export async function createSopDocument(
  companyId: string,
  userId: string,
  sop: Pick<SopDocument, 'title' | 'department' | 'category'> & { review_due_date?: string }
): Promise<SopDocument> {
  const year = new Date().getFullYear();
  const deptCode = sop.department.substring(0, 3).toUpperCase();
  const { count } = await (supabase as any)
    .from('sop_documents')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId);
  const seq = String((count ?? 0) + 1).padStart(3, '0');
  const sopNumber = `SOP-${deptCode}-${seq}`;

  const { data, error } = await (supabase as any)
    .from('sop_documents')
    .insert({
      company_id: companyId,
      sop_number: sopNumber,
      title: sop.title,
      department: sop.department,
      category: sop.category,
      current_version: '1.0',
      // status omitted: the lifecycle init trigger derives it
      owner_id: userId,
      review_due_date: sop.review_due_date ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  // Create initial draft version
  await (supabase as any).from('sop_versions').insert({
    sop_id: data.id,
    version_number: '1.0',
    status: 'draft',
    created_by: userId,
  });

  await recordAuditEvent({
    userId,
    companyId,
    action: 'create_sop',
    entityType: 'sop_document',
    entityId: data.id,
    metadata: { sop_number: sopNumber, title: sop.title },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for create_sop:', e));

  return data;
}

export async function listSopVersions(sopId: string): Promise<SopVersion[]> {
  const { data, error } = await (supabase as any)
    .from('sop_versions')
    .select('*')
    .eq('sop_id', sopId)
    .order('created_at', { ascending: false });
  if (error) { logger.error('listSopVersions:', error); return []; }
  return data ?? [];
}

/**
 * Publish a version of an SOP.
 *
 * This used to be three independent PostgREST calls — supersede the old
 * version, make the new one effective, promote the parent — with nothing
 * shared between them. A failure part-way left the document with no
 * effective version, or with a stale current_version. The whole operation
 * now happens inside `publish_sop_version()`, so it is one transaction:
 * all of it commits or none of it does.
 *
 * The parent document's state moves through the lifecycle engine inside
 * that function; `sop_documents.status` is derived and cannot be written
 * from here. `approved_by` is taken from the session by the database, not
 * from the argument below, so a publish is attributed to whoever actually
 * performed it.
 */
export async function publishSopVersion(
  versionId: string,
  sopId: string,
  companyId: string,
  userId: string
): Promise<void> {
  const { data, error } = await (supabase as any).rpc('publish_sop_version', {
    p_version_id: versionId,
    p_sop_id: sopId,
    p_company_id: companyId,
  });

  if (error) throw error;

  await recordAuditEvent({
    // the publisher the DATABASE resolved, not the caller's argument
    userId: data?.actor_id ?? '',
    companyId,
    action: 'publish_sop_version',
    entityType: 'sop_document',
    entityId: sopId,
    metadata: {
      version_id: versionId,
      version_number: data?.version_number,
      superseded_count: data?.superseded_count,
      parent_transitioned: data?.parent_transitioned,
    },
    captureEvidence: false,
  }).catch(e => logger.error('Audit failed for publish_sop_version:', e));
}

/** Move an SOP document through its lifecycle (outside the publish path). */
export async function transitionSopDocument(
  sopId: string,
  companyId: string,
  newStatus: SopStatus,
): Promise<void> {
  const result = await lifecycleTransition({
    entityType: 'sop_document',
    entityId: sopId,
    actionKey: `set_${newStatus}`,
    companyId,
    metadata: { requested_status: newStatus },
  });
  if (!result.ok) throw new Error(result.message);
}

/** Actions the engine will currently allow on this SOP, for the UI. */
export async function getSopActions(sopId: string, companyId: string): Promise<LifecycleAction[]> {
  return getAvailableActions('sop_document', sopId, companyId);
}

export async function acknowledgeSopVersion(versionId: string, userId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from('sop_acknowledgements')
    .insert({ sop_version_id: versionId, user_id: userId });
  if (error && error.code !== '23505') throw error;
}

export async function getMyAcknowledgements(userId: string): Promise<string[]> {
  const { data } = await (supabase as any)
    .from('sop_acknowledgements')
    .select('sop_version_id')
    .eq('user_id', userId);
  return (data ?? []).map((r: any) => r.sop_version_id);
}

export const SOP_STATUS_LABELS: Record<SopStatus, string> = {
  draft: 'Draft',
  in_review: 'In Review',
  approved: 'Approved',
  effective: 'Effective',
  superseded: 'Superseded',
  obsolete: 'Obsolete',
};

export const SOP_STATUS_COLORS: Record<SopStatus, string> = {
  draft: 'text-gray-600 bg-gray-50 border-gray-200',
  in_review: 'text-amber-600 bg-amber-50 border-amber-200',
  approved: 'text-blue-600 bg-blue-50 border-blue-200',
  effective: 'text-green-600 bg-green-50 border-green-200',
  superseded: 'text-purple-600 bg-purple-50 border-purple-200',
  obsolete: 'text-red-600 bg-red-50 border-red-200',
};

export const SOP_CATEGORIES: { id: SopCategory; label: string }[] = [
  { id: 'manufacturing', label: 'Manufacturing' },
  { id: 'quality', label: 'Quality' },
  { id: 'safety', label: 'Safety' },
  { id: 'regulatory', label: 'Regulatory' },
  { id: 'hr', label: 'HR' },
  { id: 'other', label: 'Other' },
];
