import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';

export type DataClass = 
  | 'audit_logs'
  | 'audit_exports'
  | 'policy_acknowledgements'
  | 'governance_job_runs'
  | 'content_submissions'
  | 'grc_test_runs'
  | 'correlation_events'
  | 'audit_requests';

export interface RetentionPolicy {
  id: string;
  company_id: string;
  data_class: DataClass;
  retention_days: number;
  archive_after_days: number | null;
  auto_delete: boolean;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const retentionService = {
  async listRetentionPolicies(companyId: string): Promise<RetentionPolicy[]> {
    const { data, error } = await (supabase as any)
      .from('retention_policies')
      .select('*')
      .eq('company_id', companyId)
      .order('data_class', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async createRetentionPolicy(
    companyId: string,
    userId: string,
    policy: Omit<RetentionPolicy, 'id' | 'company_id' | 'created_by' | 'created_at' | 'updated_at'>
  ): Promise<RetentionPolicy> {
    const { data, error } = await (supabase as any)
      .from('retention_policies')
      .insert({
        ...policy,
        company_id: companyId,
        created_by: userId
      })
      .select()
      .single();

    if (error) throw error;

    await recordAuditEvent({
      userId,
      companyId,
      action: 'create_retention_policy',
      entityType: 'retention_policy',
      entityId: data.id,
      metadata: { data_class: data.data_class, retention_days: data.retention_days }
    });

    return data;
  },

  async updateRetentionPolicy(
    companyId: string,
    userId: string,
    policyId: string,
    updates: Partial<Omit<RetentionPolicy, 'id' | 'company_id' | 'created_by' | 'created_at' | 'updated_at'>>
  ): Promise<RetentionPolicy> {
    const { data, error } = await (supabase as any)
      .from('retention_policies')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', policyId)
      .eq('company_id', companyId)
      .select()
      .single();

    if (error) throw error;

    await recordAuditEvent({
      userId,
      companyId,
      action: 'update_retention_policy',
      entityType: 'retention_policy',
      entityId: policyId,
      metadata: { updates }
    });

    return data;
  },

  async deleteRetentionPolicy(
    companyId: string,
    userId: string,
    policyId: string
  ): Promise<void> {
    const { data: policy } = await (supabase as any)
      .from('retention_policies')
      .select('data_class')
      .eq('id', policyId)
      .single();

    const { error } = await (supabase as any)
      .from('retention_policies')
      .delete()
      .eq('id', policyId)
      .eq('company_id', companyId);

    if (error) throw error;

    await recordAuditEvent({
      userId,
      companyId,
      action: 'delete_retention_policy',
      entityType: 'retention_policy',
      entityId: policyId,
      metadata: { data_class: policy?.data_class }
    });
  }
};
