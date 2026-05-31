// src/lib/aiGovernance/aiIncidentService.ts
// AI Incident Management Service
// Detects, records, escalates, and resolves AI-specific failures and policy breaches.

import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { logger } from '../logger';

export type AIIncidentType = 
  | 'hallucination'
  | 'bias'
  | 'privacy_leak'
  | 'forbidden_output'
  | 'unsafe_recommendation'
  | 'policy_violation'
  | 'model_misuse'
  | 'other';

export type AIIncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AIIncidentStatus = 'open' | 'investigating' | 'escalated' | 'resolved' | 'dismissed';
export type AIIncidentSource = 'manual' | 'usage_review' | 'system_rule' | 'llm_analysis';

export interface AIIncidentMetrics {
  openIncidents: number;
  escalatedIncidents: number;
  criticalIncidents: number;
  avgResolutionTimeHours: number;
}

export interface AIIncident {
  id: string;
  company_id: string;
  ai_asset_id: string | null;
  usage_log_id: string | null;
  incident_type: AIIncidentType;
  severity: AIIncidentSeverity;
  status: AIIncidentStatus;
  linked_risk_id: string | null;
  linked_policy_id: string | null;
  title: string;
  description: string | null;
  reported_by: string | null;
  assigned_to: string | null;
  source: AIIncidentSource;
  metadata: any;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  // Joins
  ai_asset?: { name: string; provider: string };
  usage_log?: { provider_name: string; model_name: string; risk_flags: string[] };
  reporter?: { full_name: string };
  assignee?: { full_name: string };
  risk?: { title: string; risk_level: string };
}

export const aiIncidentService = {
  /** List incidents for a company with filters */
  async listIncidents(companyId: string, filters?: {
    type?: AIIncidentType;
    severity?: AIIncidentSeverity;
    status?: AIIncidentStatus;
    assetId?: string;
  }): Promise<AIIncident[]> {
    let query = (supabase as any)
      .from('ai_incidents')
      .select(`
        *,
        ai_asset:ai_assets(name, provider),
        usage_log:ai_usage_logs(provider_name, model_name, risk_flags),
        reporter:profiles!reported_by(full_name),
        assignee:profiles!assigned_to(full_name),
        risk:risks(title, risk_level)
      `)
      .eq('company_id', companyId);

    if (filters?.type) query = query.eq('incident_type', filters.type);
    if (filters?.severity) query = query.eq('severity', filters.severity);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.assetId) query = query.eq('ai_asset_id', filters.assetId);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      logger.error('[aiIncidentService] listIncidents error:', error);
      return [];
    }
    return data || [];
  },

  /** Get a single incident by ID */
  async getIncident(id: string): Promise<AIIncident | null> {
    const { data, error } = await (supabase as any)
      .from('ai_incidents')
      .select(`
        *,
        ai_asset:ai_assets(*),
        usage_log:ai_usage_logs(*),
        reporter:profiles!reported_by(full_name),
        assignee:profiles!assigned_to(full_name),
        risk:risks(title, status, risk_level)
      `)
      .eq('id', id)
      .single();

    if (error) return null;
    return data;
  },

  /** Create a new incident */
  async createIncident(userId: string, companyId: string, data: Partial<AIIncident>): Promise<AIIncident | null> {
    const isEscalated = 
      data.severity === 'high' || 
      data.severity === 'critical' || 
      data.incident_type === 'privacy_leak';

    const { data: incident, error } = await (supabase as any)
      .from('ai_incidents')
      .insert({
        company_id: companyId,
        reported_by: userId,
        status: isEscalated ? 'escalated' : (data.status || 'open'),
        ...data
      })
      .select()
      .single();

    if (error) {
      logger.error('[aiIncidentService] createIncident error:', error);
      return null;
    }

    // 1. Audit Log
    await recordAuditEvent({
      userId,
      companyId,
      action: 'create_ai_incident',
      entityType: 'ai_incident',
      entityId: incident.id,
      metadata: { title: incident.title, type: incident.incident_type, severity: incident.severity }
    });

    // 2. Escalation / Notification
    if (isEscalated || incident.status === 'escalated') {
      await this.handleEscalation(incident, userId);
    }

    return incident;
  },

  /** Update incident status or metadata */
  async updateIncident(id: string, companyId: string, updates: Partial<AIIncident>): Promise<boolean> {
    const { error } = await (supabase as any)
      .from('ai_incidents')
      .update({
        ...updates,
        resolved_at: updates.status === 'resolved' ? new Date().toISOString() : undefined
      })
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) return false;

    await recordAuditEvent({
      userId: updates.reported_by || companyId, // Fallback if userId not available for system updates
      companyId,
      action: 'update_ai_incident',
      entityType: 'ai_incident',
      entityId: id,
      metadata: updates
    });

    return true;
  },

  /** Internal helper for escalation side-effects */
  async handleEscalation(incident: AIIncident, _triggeredBy: string) {
    // 1. Create Notification for Compliance Admins
    const { data: admins } = await (supabase as any)
      .from('profiles')
      .select('id')
      .eq('company_id', incident.company_id)
      .in('role', ['admin', 'compliance']);

    if (admins) {
      const notifications = admins.map((admin: any) => ({
        recipient_id: admin.id,
        type: 'ai_incident_escalated',
        content_id: incident.id,
        message: `🚨 Critical AI Incident Escalated: ${incident.title} (${incident.severity.toUpperCase()})`
      }));
      await (supabase as any).from('notifications').insert(notifications);
    }

    // 2. Webhook Escalation
    const { webhookService } = await import('../platform/webhookService');
    const { WEBHOOK_EVENTS } = await import('../platform/webhookEvents');
    await webhookService.enqueueEvent(incident.company_id, WEBHOOK_EVENTS.AI_INCIDENT_ESCALATED, {
      incident_id: incident.id,
      title: incident.title,
      severity: incident.severity,
      type: incident.incident_type
    }, { entityType: 'ai_incident', entityId: incident.id });

    // 3. Governance Timeline is implicitly updated via Audit Logs or we can add a explicit correlation event
    // For this MVP, we rely on the Audit Log being pulled into Timeline if configured, 
    // or we can manually insert a timeline-specific record if a dedicated table exists.
    // Given the previous research, Timeline aggregates from audit_logs.
  },

  /** Link incident to an existing risk */
  async linkToRisk(userId: string, company_id: string, incidentId: string, riskId: string): Promise<boolean> {
    const updated = await this.updateIncident(incidentId, company_id, { linked_risk_id: riskId });
    if (updated) {
      await recordAuditEvent({
        userId,
        companyId: company_id,
        action: 'link_ai_incident_risk',
        entityType: 'ai_incident',
        entityId: incidentId,
        metadata: { risk_id: riskId }
      });
    }
    return updated;
  },

  /** Get basic metrics for AI incidents */
  async getMetrics(companyId: string): Promise<AIIncidentMetrics> {
    const { data: incidents } = await (supabase as any)
      .from('ai_incidents')
      .select('status, severity, created_at, resolved_at')
      .eq('company_id', companyId);

    if (!incidents) return { openIncidents: 0, escalatedIncidents: 0, criticalIncidents: 0, avgResolutionTimeHours: 0 };

    const open = incidents.filter((i: any) => i.status === 'open' || i.status === 'investigating').length;
    const escalated = incidents.filter((i: any) => i.status === 'escalated').length;
    const critical = incidents.filter((i: any) => i.severity === 'critical').length;
    
    const resolved = incidents.filter((i: any) => i.resolved_at);
    const totalHours = resolved.reduce((acc: number, curr: any) => {
      const diff = new Date(curr.resolved_at).getTime() - new Date(curr.created_at).getTime();
      return acc + (diff / (1000 * 60 * 60));
    }, 0);

    return {
      openIncidents: open,
      escalatedIncidents: escalated,
      criticalIncidents: critical,
      avgResolutionTimeHours: resolved.length > 0 ? Math.round(totalHours / resolved.length) : 0
    };
  }
};
