import { supabase } from './supabase';
import { recordAuditEvent } from './auditService';
import { logger } from './logger';

interface SecureDeleteResult {
  success: boolean;
  error?: string;
}

/**
 * Ensures the password is valid, soft-deletes the content, logs to audit trail, and notifies higher-ups.
 */
export async function secureDeleteContent(
  contentId: string,
  passwordInput: string,
  companyId: string,
  userId: string
): Promise<SecureDeleteResult> {
  try {
    // 1. Verify user password securely via RPC
    const { data: isValid, error: verifyError } = await (supabase as any).rpc('verify_user_password', {
      password: passwordInput,
    } as any);

    if (verifyError || !isValid) {
      return { success: false, error: 'Incorrect password. Deletion aborted.' };
    }

    // 2. Fetch content details for audit & notification
    const { data: contentRow, error: fetchErr } = await supabase
      .from('content_submissions')
      .select('title')
      .eq('id', contentId)
      .eq('company_id', companyId)
      .single();

    if (fetchErr || !contentRow) {
      return { success: false, error: 'Document not found or access denied.' };
    }

    const { data: userProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single();

    const userName = userProfile?.full_name || 'A user';
    
    // 2.5 Check for Legal Hold
    const { legalHoldService } = await import('./governance/legalHoldService');
    const isOnHold = await legalHoldService.isEntityOnActiveHold('content_submission', contentId);
    if (isOnHold) {
       return { success: false, error: 'Cannot delete: Document is currently under an active legal hold.' };
    }

    // 3. Mark as soft-deleted
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('content_submissions')
      .update({
        is_deleted: true,
        deleted_at: now,
        deleted_by: userId,
      })
      .eq('id', contentId)
      .eq('company_id', companyId);

    if (updateErr) {
      logger.error('Update error on soft delete:', updateErr);
      return { success: false, error: 'Failed to delete the document.' };
    }

    // 4. Immutable Audit Trail
    await recordAuditEvent({
      userId,
      companyId,
      action: 'secure_delete_content',
      entityType: 'content_submission',
      entityId: contentId,
      metadata: { deleted_at: now },
    });

    // 5. Notify Executives, IT, and Compliance Officers
    // First, find all eligible profiles
    const { data: eligibleProfiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, role, custom_role_id')
      .eq('company_id', companyId);

    if (!profErr && eligibleProfiles) {
      const { data: customRoles } = await supabase
        .from('custom_roles')
        .select('id, name')
        .eq('company_id', companyId);

      const customRoleMap = new Map((customRoles || []).map(r => [r.id, r.name.toLowerCase()]));

      const targetUserIds = eligibleProfiles.filter(p => {
        if (p.role === 'admin' || p.role === 'compliance_officer') return true;
        if (p.custom_role_id) {
          const rName = customRoleMap.get(p.custom_role_id) || '';
          if (rName.includes('it ') || rName.includes('tech') || rName.includes('legal') || rName.includes('executive')) {
            return true;
          }
        }
        return false;
      }).map(p => p.id);

      // Insert notifications for each target user (excluding self if they happen to be in the list)
      const notificationsToInsert = targetUserIds
        .filter(id => id !== userId) // might still notify self if required, but usually not
        .map(recipientId => ({
          recipient_id: recipientId,
          type: 'alert',
          content_id: contentId,
          message: `🚨 SECURITY ALERT: Content "${contentRow.title}" was permanently deleted by ${userName}. It has been moved to the Secret Vault.`,
        }));

      if (notificationsToInsert.length > 0) {
        await supabase.from('notifications').insert(notificationsToInsert);
      }
    }

    return { success: true };
  } catch (err: any) {
    logger.error('Secure delete error:', err);
    return { success: false, error: err.message || 'An unexpected error occurred.' };
  }
}
