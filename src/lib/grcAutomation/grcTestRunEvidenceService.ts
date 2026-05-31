import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';

export async function linkRunToEvidence(
  params: {
    company_id: string;
    test_run_id: string;
    control_evidence_id: string;
  },
  userId: string
): Promise<void> {
  const { error } = await (supabase as any)
    .from('grc_test_run_evidence')
    .insert(params);

  if (error) {
    logger.error('Failed to link test run to evidence:', error);
    throw new Error(error.message || 'Failed to link evidence');
  }

  await recordAuditEvent({
    userId,
    companyId: params.company_id,
    action: 'link_test_run_evidence',
    entityType: 'grc_test_run',
    entityId: params.test_run_id,
    metadata: { control_evidence_id: params.control_evidence_id },
    captureEvidence: false
  });
}
