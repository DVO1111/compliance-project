// src/lib/expiryService.ts
// Approval expiry configuration + auto-expire checking
import { supabase } from './supabase';
import { recordAuditEvent } from './auditService';

/* ── Types ─────────────────────────────────────────────── */

export interface ExpiryConfig {
  id: string;
  company_id: string;
  expiry_days: number;
  auto_expire: boolean;
  updated_by: string | null;
  updated_at: string;
}

/* ── Get / Upsert config ───────────────────────────────── */

export async function getExpiryConfig(companyId: string): Promise<ExpiryConfig | null> {
  const { data, error } = await supabase
    .from('approval_expiry_config')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) return null;
  return data as ExpiryConfig | null;
}

export async function updateExpiryConfig(opts: {
  companyId: string;
  expiryDays: number;
  autoExpire: boolean;
  updatedBy: string;
}): Promise<ExpiryConfig> {
  const { data, error } = await supabase
    .from('approval_expiry_config')
    .upsert(
      {
        company_id: opts.companyId,
        expiry_days: opts.expiryDays,
        auto_expire: opts.autoExpire,
        updated_by: opts.updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id' }
    )
    .select('*')
    .single();

  if (error) throw error;
  return data as ExpiryConfig;
}

/* ── Set expiry on a submission ────────────────────────── */

export async function setApprovalExpiry(
  submissionId: string,
  companyId: string,
  userId: string
): Promise<void> {
  const config = await getExpiryConfig(companyId);
  if (!config || !config.auto_expire) return;

  const expiresAt = new Date(
    Date.now() + config.expiry_days * 24 * 3600 * 1000
  ).toISOString();

  await supabase
    .from('content_submissions')
    .update({ approval_expires_at: expiresAt })
    .eq('id', submissionId);

  await recordAuditEvent({
    userId,
    action: 'approval_expiry_set',
    entityType: 'content_submission',
    entityId: submissionId,
    companyId,
    metadata: { expires_at: expiresAt, expiry_days: config.expiry_days },
  });
}

/* ── Check & expire overdue approvals ──────────────────── */

export async function checkExpiredApprovals(
  companyId: string,
  systemUserId: string
): Promise<number> {
  const now = new Date().toISOString();

  // Find signed_off submissions where expiry has passed
  const { data: expired, error } = await supabase
    .from('content_submissions')
    .select('id')
    .eq('company_id', companyId)
    .eq('signoff_status', 'signed_off')
    .lt('approval_expires_at', now)
    .not('approval_expires_at', 'is', null);

  if (error || !expired || expired.length === 0) return 0;

  const ids = expired.map((e: any) => e.id);

  // Mark them as review_expired
  await supabase
    .from('content_submissions')
    .update({
      signoff_status: 'review_expired',
      is_locked: false,
    })
    .in('id', ids);

  // Audit each
  for (const id of ids) {
    await recordAuditEvent({
      userId: systemUserId,
      action: 'approval_expired',
      entityType: 'content_submission',
      entityId: id,
      companyId,
      metadata: { reason: 'Auto-expired per company policy' },
    });
  }

  return ids.length;
}
