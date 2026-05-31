import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';

export interface ServiceAccount {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  status: 'active' | 'disabled';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EcosystemOverview {
  activeApiKeys: number;
  activeWebhooks: number;
  failedWebhooks24h: number;
  ingestionsReceived7d: number;
  failedIngestions7d: number;
  serviceAccounts: number;
}

export const ecosystemAdminService = {
  /**
   * Get unified health and volume stats for the ecosystem hub
   */
  async getOverview(companyId: string): Promise<EcosystemOverview> {
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      { count: apiKeys },
      { count: webhooks },
      { count: failedWebhooks },
      { count: ingestions },
      { count: failedIngestions },
      { count: accounts }
    ] = await Promise.all([
      (supabase.from('api_keys') as any).select('*', { count: 'exact', head: true }).eq('company_id', companyId).is('revoked_at', null),
      (supabase.from('webhook_endpoints') as any).select('*', { count: 'exact', head: true }).eq('company_id', companyId),
      (supabase.from('webhook_deliveries') as any).select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'failed').gt('created_at', yesterday.toISOString()),
      (supabase.from('external_evidence_ingestions') as any).select('*', { count: 'exact', head: true }).eq('company_id', companyId).gt('created_at', sevenDaysAgo.toISOString()),
      (supabase.from('external_evidence_ingestions') as any).select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'failed').gt('created_at', sevenDaysAgo.toISOString()),
      (supabase.from('service_accounts') as any).select('*', { count: 'exact', head: true }).eq('company_id', companyId)
    ]);

    return {
      activeApiKeys: apiKeys || 0,
      activeWebhooks: webhooks || 0,
      failedWebhooks24h: failedWebhooks || 0,
      ingestionsReceived7d: ingestions || 0,
      failedIngestions7d: failedIngestions || 0,
      serviceAccounts: accounts || 0
    };
  },

  /**
   * List service accounts for a company
   */
  async listServiceAccounts(companyId: string): Promise<ServiceAccount[]> {
    const { data, error } = await (supabase.from('service_accounts') as any)
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Create a new service account
   */
  async createServiceAccount(companyId: string, name: string, description: string | null, userId: string): Promise<ServiceAccount> {
    const { data, error } = await (supabase.from('service_accounts') as any)
      .insert({
        company_id: companyId,
        name,
        description,
        created_by: userId
      })
      .select()
      .single();

    if (error) throw error;

    await recordAuditEvent({
      companyId,
      userId,
      action: 'create_service_account',
      entityType: 'service_account',
      entityId: (data as any).id,
      metadata: { name }
    });

    return data as any;
  },

  /**
   * Disable or Re-enable a service account
   */
  async updateServiceAccountStatus(companyId: string, accountId: string, status: 'active' | 'disabled', userId: string): Promise<void> {
    const { error } = await (supabase.from('service_accounts') as any)
      .update({ status })
      .eq('id', accountId)
      .eq('company_id', companyId);

    if (error) throw error;

    await recordAuditEvent({
      companyId,
      userId,
      action: status === 'disabled' ? 'disable_service_account' : 'enable_service_account',
      entityType: 'service_account',
      entityId: accountId
    });
  },

  /**
   * Helper to trigger a test webhook delivery
   */
  async sendTestWebhook(companyId: string, endpointId: string, eventName: string, userId: string): Promise<string> {
    const { data, error } = await (supabase.from('webhook_deliveries') as any)
      .insert({
        company_id: companyId,
        endpoint_id: endpointId,
        event_name: eventName,
        payload: {
          id: `test_${Math.random().toString(36).substr(2, 9)}`,
          event: eventName,
          is_test: true,
          created_at: new Date().toISOString()
        },
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;

    await recordAuditEvent({
      companyId,
      userId,
      action: 'send_test_webhook',
      entityType: 'webhook_endpoint',
      entityId: endpointId,
      metadata: { eventName, deliveryId: (data as any).id }
    });

    return (data as any).id;
  },

  /**
   * Fetch recent API request logs
   */
  async getApiActivity(companyId: string, limit = 50): Promise<any[]> {
    const { data, error } = await (supabase.from('api_request_logs') as any)
      .select(`
        *,
        api_key:api_keys(name),
        service_account:service_accounts(name)
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  },

  /**
   * Calculate detailed webhook health diagnostics
   */
  async getWebhookHealth(companyId: string): Promise<any> {
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);

    const { data: deliveries, error } = await (supabase.from('webhook_deliveries') as any)
      .select('status, response_status, event_name, endpoint_id')
      .eq('company_id', companyId)
      .gt('created_at', yesterday.toISOString());

    if (error) throw error;

    const total = deliveries?.length || 0;
    const delivered = deliveries?.filter((d: any) => d.status === 'delivered').length || 0;
    const successRate = total > 0 ? (delivered / total) * 100 : 100;

    // Failure patterns
    const failures = deliveries?.filter((d: any) => d.status === 'failed' || d.status === 'dead_letter');
    const commonErrors: Record<string, number> = {};
    failures?.forEach((f: any) => {
      const key = f.response_status ? `HTTP ${f.response_status}` : 'Connection Timeout';
      commonErrors[key] = (commonErrors[key] || 0) + 1;
    });

    return {
      successRate,
      total24h: total,
      failed24h: failures?.length || 0,
      commonErrors: Object.entries(commonErrors)
        .map(([msg, count]) => ({ msg, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
    };
  }
};
