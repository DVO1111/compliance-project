import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';

export type IngestionSourceType = 'api' | 'webhook' | 'import' | 'integration';
export type IngestionStatus = 'received' | 'processed' | 'failed';

export interface IngestionPayload {
  title: string;
  description: string | null;
  source_name: string;
  source_type: IngestionSourceType;
  evidence_type: string;
  content_text?: string;
  file_url?: string;
  related_control_id?: string;
  related_audit_request_id?: string;
  metadata?: Record<string, any>;
  external_reference?: string;
  occurred_at?: string;
}

export interface IngestionRecord {
  id: string;
  company_id: string;
  source_name: string;
  source_type: IngestionSourceType;
  status: IngestionStatus;
  submission_id: string | null;
  related_control_id: string | null;
  related_audit_request_id: string | null;
  requested_by: string | null;
  metadata: Record<string, any>;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export const externalEvidenceService = {
  /**
   * Main ingestion entry point.
   * Creates content_submission, tracks ingestion provenance, and links to controls/audits.
   */
  async ingestEvidence(companyId: string, payload: IngestionPayload, requestedByUserId: string): Promise<{ ingestionId: string; submissionId: string }> {
    // 1. Create Ingestion Record (Status: received)
    const { data: ingestion, error: ingError } = await (supabase.from('external_evidence_ingestions') as any)
      .insert({
        company_id: companyId,
        source_name: payload.source_name,
        source_type: payload.source_type,
        status: 'received',
        related_control_id: payload.related_control_id || null,
        related_audit_request_id: payload.related_audit_request_id || null,
        requested_by: requestedByUserId,
        metadata: {
          ...payload.metadata,
          external_reference: payload.external_reference,
          occurred_at: payload.occurred_at,
          evidence_type: payload.evidence_type,
          file_url: payload.file_url
        }
      })
      .select()
      .single();

    if (ingError) throw ingError;

    try {
      // 2. Create Content Submission (Archive Record)
      // platform = 'external_evidence', content_topic = 'compliance_evidence'
      // We use the requestedByUserId as the user_id for the submission
      const { data: submission, error: subError } = await (supabase.from('content_submissions') as any)
        .insert({
          user_id: requestedByUserId,
          company_id: companyId,
          title: payload.title,
          content_text: payload.content_text || payload.description || `Evidence from ${payload.source_name}`,
          file_name: payload.file_url ? payload.file_url.split('/').pop() || 'external_file' : 'external_evidence.txt',
          file_type: '.txt', // Default for metadata-only/text
          platform: 'external_evidence',
          content_topic: 'compliance_evidence',
          target_audience: 'healthcare_professionals', // required by schema check
          status: 'approved', // Auto-approve ingested metadata-only evidence for MVP
          metadata: {
            ingestion_id: ingestion.id,
            source_name: payload.source_name,
            source_type: payload.source_type,
            external_reference: payload.external_reference
          }
        })
        .select()
        .single();

      if (subError) throw subError;

      // 3. Link to GRC Control if requested
      if (payload.related_control_id) {
        await (supabase.from('grc_control_evidence') as any).insert({
          company_id: companyId,
          control_id: payload.related_control_id,
          submission_id: submission.id,
          status: 'valid',
          linked_by: requestedByUserId
        });
        
        await recordAuditEvent({
          userId: requestedByUserId,
          companyId,
          action: 'link_external_evidence_control',
          entityType: 'grc_control_evidence',
          entityId: payload.related_control_id,
          metadata: { submission_id: submission.id, ingestion_id: ingestion.id }
        });
      }

      // 4. Link to Audit Request if requested
      if (payload.related_audit_request_id) {
        await (supabase.from('audit_request_evidence') as any).insert({
          company_id: companyId,
          audit_request_id: payload.related_audit_request_id,
          submission_id: submission.id,
          linked_by: requestedByUserId
        });

        await recordAuditEvent({
          userId: requestedByUserId,
          companyId,
          action: 'link_external_evidence_audit_request',
          entityType: 'audit_request_evidence',
          entityId: payload.related_audit_request_id,
          metadata: { submission_id: submission.id, ingestion_id: ingestion.id }
        });
      }

      // 5. Success: Update Ingestion Record
      await (supabase.from('external_evidence_ingestions') as any)
        .update({
          status: 'processed',
          submission_id: submission.id,
          processed_at: new Date().toISOString()
        })
        .eq('id', ingestion.id);

      await recordAuditEvent({
        userId: requestedByUserId,
        companyId,
        action: 'ingest_external_evidence',
        entityType: 'external_evidence_ingestion',
        entityId: ingestion.id,
        metadata: { submission_id: submission.id, source: payload.source_name }
      });

      return { ingestionId: ingestion.id, submissionId: submission.id };

    } catch (procError: any) {
      // 6. Failure: Update Ingestion Record with error
      await (supabase.from('external_evidence_ingestions') as any)
        .update({
          status: 'failed',
          error_message: procError.message || String(procError)
        })
        .eq('id', ingestion.id);

      throw procError;
    }
  },

  async listIngestions(companyId: string, filters?: { status?: IngestionStatus }): Promise<IngestionRecord[]> {
    let query = (supabase.from('external_evidence_ingestions') as any)
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as IngestionRecord[];
  }
};
