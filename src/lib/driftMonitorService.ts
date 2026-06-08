// src/lib/driftMonitorService.ts
// Service for omnichannel content drift detection

import { supabase } from './supabase';
import { logger } from './logger';
import { recordAuditEvent } from './auditService';

/* ── Types ───────────────────────────────────────────── */

export type ChannelType = 'website' | 'instagram' | 'linkedin' | 'x' | 'facebook' | 'email' | 'print' | 'landing_page';

export interface MonitoredChannel {
  id: string;
  company_id: string;
  channel_name: string;
  channel_type: ChannelType;
  url: string | null;
  approved_content_hash: string | null;
  approved_content_snapshot: string | null;
  last_checked_at: string | null;
  status: 'active' | 'paused' | 'archived';
  created_at: string;
}

export interface DriftAlert {
  id: string;
  company_id: string;
  channel_id: string;
  drift_type: string;
  approved_hash: string | null;
  current_hash: string | null;
  diff_summary: string | null;
  severity: string;
  resolved: boolean;
  resolved_at: string | null;
  detected_at: string;
  channel?: MonitoredChannel;
}

/* ── Hash helper ─────────────────────────────────────── */

function simpleHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/* ── Channel CRUD ────────────────────────────────────── */

export async function addChannel(
  companyId: string,
  name: string,
  type: ChannelType,
  url: string | null,
  approvedSnapshot: string | null,
  userId?: string,
): Promise<MonitoredChannel | null> {
  const approvedHash = approvedSnapshot ? simpleHash(approvedSnapshot) : null;

  const { data, error } = await (supabase as any)
    .from('monitored_channels')
    .insert({
      company_id: companyId,
      channel_name: name,
      channel_type: type,
      url,
      approved_content_hash: approvedHash,
      approved_content_snapshot: approvedSnapshot,
      status: 'active',
    })
    .select()
    .single();

  if (error) { logger.error('addChannel error:', error); return null; }

  try {
    await recordAuditEvent({
      companyId,
      userId: userId ?? 'system',
      action: `channel.added: ${name} (${type})`,
      entityType: 'monitored_channel',
      entityId: data.id,
      metadata: { name, type, url },
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }

  return data;
}

export async function getChannels(companyId: string): Promise<MonitoredChannel[]> {
  const { data, error } = await (supabase as any)
    .from('monitored_channels')
    .select('*')
    .eq('company_id', companyId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false });

  if (error) { logger.error('getChannels error:', error); return []; }
  return data ?? [];
}

export async function removeChannel(
  channelId: string,
  companyId: string,
  userId: string,
): Promise<void> {
  await (supabase as any)
    .from('monitored_channels')
    .update({ status: 'archived' })
    .eq('id', channelId);

  try {
    await recordAuditEvent({
      companyId,
      userId,
      action: 'channel.archived',
      entityType: 'monitored_channel',
      entityId: channelId,
      metadata: {},
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }
}

/* ── Drift Detection ─────────────────────────────────── */

export async function checkForDrift(
  companyId: string,
  channelId: string,
  currentContent: string,
  userId?: string,
): Promise<DriftAlert | null> {
  const { data: channel } = await (supabase as any)
    .from('monitored_channels')
    .select('*')
    .eq('id', channelId)
    .single();

  if (!channel) return null;

  const currentHash = simpleHash(currentContent);

  await (supabase as any)
    .from('monitored_channels')
    .update({ last_checked_at: new Date().toISOString() })
    .eq('id', channelId);

  if (!channel.approved_content_hash || currentHash === channel.approved_content_hash) {
    return null;
  }

  const diffSummary = `Content hash changed from ${channel.approved_content_hash} to ${currentHash}. The approved version may have been modified without authorization.`;

  const { data: alert, error } = await (supabase as any)
    .from('drift_alerts')
    .insert({
      company_id: companyId,
      channel_id: channelId,
      drift_type: 'content_change',
      approved_hash: channel.approved_content_hash,
      current_hash: currentHash,
      diff_summary: diffSummary,
      severity: 'high',
      resolved: false,
    })
    .select()
    .single();

  if (error) { logger.error('checkForDrift insert error:', error); return null; }

  try {
    await recordAuditEvent({
      companyId,
      userId: userId ?? 'system',
      action: `drift.detected: channel "${channel.channel_name}"`,
      entityType: 'drift_alert',
      entityId: alert.id,
      metadata: { channelId, channelName: channel.channel_name, approvedHash: channel.approved_content_hash, currentHash },
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }

  return alert;
}

export async function getAlerts(companyId: string, resolvedFilter?: boolean): Promise<DriftAlert[]> {
  let query = (supabase as any)
    .from('drift_alerts')
    .select('*, channel:monitored_channels(*)')
    .eq('company_id', companyId)
    .order('detected_at', { ascending: false })
    .limit(100);

  if (resolvedFilter !== undefined) {
    query = query.eq('resolved', resolvedFilter);
  }

  const { data, error } = await query;
  if (error) { logger.error('getAlerts error:', error); return []; }
  return data ?? [];
}

export async function resolveAlert(
  alertId: string,
  userId: string,
  companyId: string,
): Promise<void> {
  await (supabase as any)
    .from('drift_alerts')
    .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq('id', alertId);

  try {
    await recordAuditEvent({
      companyId,
      userId,
      action: 'drift.alert_resolved',
      entityType: 'drift_alert',
      entityId: alertId,
      metadata: {},
      captureEvidence: false,
    });
  } catch { /* audit never blocks */ }
}

export async function getDriftStats(companyId: string) {
  const { data } = await (supabase as any)
    .from('drift_alerts')
    .select('severity, resolved')
    .eq('company_id', companyId);

  const alerts = data ?? [];
  return {
    total: alerts.length,
    unresolved: alerts.filter((a: any) => !a.resolved).length,
    critical: alerts.filter((a: any) => a.severity === 'critical' && !a.resolved).length,
    high: alerts.filter((a: any) => a.severity === 'high' && !a.resolved).length,
  };
}
