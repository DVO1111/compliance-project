import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlertTriggerType =
  | 'capa_overdue'
  | 'licence_expiring'
  | 'obligation_overdue'
  | 'control_non_compliant'
  | 'deviation_raised';

export interface AlertRule {
  id: string;
  company_id: string;
  trigger_type: AlertTriggerType;
  threshold_days: number;
  escalation_days: number;
  notify_owner: boolean;
  notify_admins: boolean;
  notify_email: boolean;
  notify_in_app: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertLogEntry {
  id: string;
  company_id: string;
  rule_id: string | null;
  entity_type: string;
  entity_id: string | null;
  alert_type: AlertTriggerType;
  message: string;
  fired_at: string;
  fired_date: string;
  resolved_at: string | null;
  metadata: Record<string, unknown>;
}

export interface AlertDigestSummary {
  trigger_type: AlertTriggerType;
  label: string;
  count_today: number;
  count_7d: number;
  count_30d: number;
}

// Default rule templates shown when a company has no saved rule yet
export const DEFAULT_RULE_TEMPLATES: Omit<AlertRule, 'id' | 'company_id' | 'created_by' | 'created_at' | 'updated_at'>[] = [
  { trigger_type: 'capa_overdue',          threshold_days: 0,  escalation_days: 3,  notify_owner: true, notify_admins: true, notify_email: true, notify_in_app: true, is_active: true },
  { trigger_type: 'licence_expiring',      threshold_days: 30, escalation_days: 7,  notify_owner: true, notify_admins: true, notify_email: true, notify_in_app: true, is_active: true },
  { trigger_type: 'obligation_overdue',    threshold_days: 0,  escalation_days: 2,  notify_owner: true, notify_admins: true, notify_email: true, notify_in_app: true, is_active: true },
  { trigger_type: 'control_non_compliant', threshold_days: 0,  escalation_days: 5,  notify_owner: true, notify_admins: true, notify_email: false, notify_in_app: true, is_active: true },
  { trigger_type: 'deviation_raised',      threshold_days: 0,  escalation_days: 1,  notify_owner: true, notify_admins: true, notify_email: true, notify_in_app: true, is_active: false },
];

export const TRIGGER_LABELS: Record<AlertTriggerType, string> = {
  capa_overdue:          'CAPA Overdue',
  licence_expiring:      'Licence Expiring',
  obligation_overdue:    'Obligation Overdue',
  control_non_compliant: 'Control Non-Compliant',
  deviation_raised:      'Deviation Raised',
};

export const TRIGGER_DESCRIPTIONS: Record<AlertTriggerType, string> = {
  capa_overdue:          'Fires when a CAPA record passes its due date without being closed.',
  licence_expiring:      'Fires when a licence will expire within the threshold window.',
  obligation_overdue:    'Fires when a regulatory obligation passes its completion deadline.',
  control_non_compliant: 'Fires when a GRC control snapshot is marked non-compliant.',
  deviation_raised:      'Fires when a new deviation is raised in the last 24 hours.',
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function getAlertRules(companyId: string): Promise<AlertRule[]> {
  const { data, error } = await (supabase as any)
    .from('compliance_alert_rules')
    .select('*')
    .eq('company_id', companyId)
    .order('trigger_type');

  if (error) {
    console.error('[complianceAlertingService] getAlertRules:', error.message);
    return [];
  }
  return (data ?? []) as unknown as AlertRule[];
}

export async function upsertAlertRule(
  companyId: string,
  userId: string,
  rule: Omit<AlertRule, 'id' | 'company_id' | 'created_by' | 'created_at' | 'updated_at'>
): Promise<AlertRule | null> {
  const { data, error } = await (supabase as any)
    .from('compliance_alert_rules')
    .upsert(
      { ...rule, company_id: companyId, created_by: userId },
      { onConflict: 'company_id,trigger_type' }
    )
    .select()
    .single();

  if (error) {
    console.error('[complianceAlertingService] upsertAlertRule:', error.message);
    return null;
  }
  return data as AlertRule;
}

export async function deleteAlertRule(companyId: string, ruleId: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('compliance_alert_rules')
    .delete()
    .eq('id', ruleId)
    .eq('company_id', companyId);

  if (error) {
    console.error('[complianceAlertingService] deleteAlertRule:', error.message);
    return false;
  }
  return true;
}

// ── Alert log ─────────────────────────────────────────────────────────────────

export async function getAlertHistory(companyId: string, limit = 100): Promise<AlertLogEntry[]> {
  const { data, error } = await (supabase as any)
    .from('compliance_alert_log')
    .select('*')
    .eq('company_id', companyId)
    .order('fired_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[complianceAlertingService] getAlertHistory:', error.message);
    return [];
  }
  return (data ?? []) as AlertLogEntry[];
}

export async function resolveAlert(companyId: string, alertId: string): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('compliance_alert_log')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', alertId)
    .eq('company_id', companyId);

  if (error) {
    console.error('[complianceAlertingService] resolveAlert:', error.message);
    return false;
  }
  return true;
}

// ── Digest ────────────────────────────────────────────────────────────────────

export async function getAlertDigest(companyId: string): Promise<AlertDigestSummary[]> {
  const now = new Date();
  const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30);
  const today = now.toISOString().slice(0, 10);

  const { data } = await (supabase as any)
    .from('compliance_alert_log')
    .select('alert_type, fired_at, fired_date')
    .eq('company_id', companyId)
    .gte('fired_at', d30.toISOString());

  const entries = (data ?? []) as { alert_type: string; fired_at: string; fired_date: string }[];

  const allTypes: AlertTriggerType[] = [
    'capa_overdue', 'licence_expiring', 'obligation_overdue', 'control_non_compliant', 'deviation_raised',
  ];

  return allTypes.map((t) => {
    const matching = entries.filter((e) => e.alert_type === t);
    return {
      trigger_type: t,
      label: TRIGGER_LABELS[t],
      count_today: matching.filter((e) => e.fired_date === today).length,
      count_7d:    matching.filter((e) => new Date(e.fired_at) >= d7).length,
      count_30d:   matching.length,
    };
  });
}

// ── Manual scan trigger ───────────────────────────────────────────────────────

export async function triggerComplianceScan(companyId: string): Promise<{ fired: number; errors: string[] }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token || !SUPABASE_URL) {
    return { fired: 0, errors: ['Not authenticated'] };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/compliance-alert-scanner`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ company_id: companyId }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { fired: 0, errors: [`Scanner returned ${res.status}: ${text}`] };
    }

    const json = await res.json();
    return { fired: json.fired ?? 0, errors: json.errors ?? [] };
  } catch (err: any) {
    return { fired: 0, errors: [err.message ?? 'Unknown error'] };
  }
}
