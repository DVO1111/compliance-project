import { supabase } from './supabase';
import { logger } from './logger';

export type PageStatus = 'active' | 'paused' | 'archived';
export type AlertType = 'content_drift' | 'label_update' | 'expired_claim' | 'unauthorized_change' | 'regulatory_change';

export type MonitoredPage = {
  id: string; company_id: string; page_url: string; page_title: string;
  approved_content_hash: string | null; last_crawled_at: string | null;
  crawl_frequency: string; status: PageStatus; created_at: string;
  alerts?: PageAlert[];
};

export type PageAlert = {
  id: string; page_id: string; alert_type: AlertType; description: string;
  severity: string; resolved: boolean; resolved_at: string | null; detected_at: string;
};

export async function getMonitoredPages(companyId: string): Promise<MonitoredPage[]> {
  const { data, error } = await (supabase as any).from('monitored_pages').select('*, alerts:page_compliance_alerts(*)').eq('company_id', companyId).neq('status', 'archived').order('created_at', { ascending: false });
  if (error) { logger.error('getMonitoredPages:', error); return []; }
  return data ?? [];
}

export async function addMonitoredPage(companyId: string, p: { page_url: string; page_title: string; crawl_frequency?: string }): Promise<MonitoredPage | null> {
  const { data, error } = await (supabase as any).from('monitored_pages').insert({ company_id: companyId, page_url: p.page_url, page_title: p.page_title, crawl_frequency: p.crawl_frequency || 'daily', status: 'active' }).select().single();
  if (error) { logger.error('addMonitoredPage:', error); return null; }
  return data;
}

export async function createPageAlert(pageId: string, alert: { alert_type: AlertType; description: string; severity?: string }): Promise<boolean> {
  const { error } = await (supabase as any).from('page_compliance_alerts').insert({ page_id: pageId, alert_type: alert.alert_type, description: alert.description, severity: alert.severity || 'medium' });
  if (error) { logger.error('createPageAlert:', error); return false; }
  return true;
}

export async function resolvePageAlert(alertId: string): Promise<boolean> {
  const { error } = await (supabase as any).from('page_compliance_alerts').update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', alertId);
  if (error) { logger.error('resolvePageAlert:', error); return false; }
  return true;
}

export async function removeMonitoredPage(pageId: string): Promise<boolean> {
  const { error } = await (supabase as any).from('monitored_pages').update({ status: 'archived' }).eq('id', pageId);
  if (error) { logger.error('removeMonitoredPage:', error); return false; }
  return true;
}

export const ALERT_LABELS: Record<AlertType, string> = { content_drift: 'Content Drift', label_update: 'Label Update', expired_claim: 'Expired Claim', unauthorized_change: 'Unauthorized Change', regulatory_change: 'Regulatory Change' };
