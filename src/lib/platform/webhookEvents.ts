/**
 * Platform Webhook Event Catalog
 */
export const WEBHOOK_EVENTS = {
  POLICY_PUBLISHED: 'policy.published',
  AUDIT_REQUEST_CREATED: 'audit.request.created',
  AUDIT_EXPORT_COMPLETED: 'audit.export.completed',
  AI_INCIDENT_ESCALATED: 'ai.incident.escalated',
  CORRELATION_EVENT_TRIGGERED: 'correlation.event.triggered',
  VENDOR_RISK_CHANGED: 'vendor.risk.changed',
} as const;

export type WebhookEventName = typeof WEBHOOK_EVENTS[keyof typeof WEBHOOK_EVENTS];

export interface WebhookEventDefinition {
  name: WebhookEventName;
  label: string;
  description: string;
}

export const WEBHOOK_EVENT_DEFINITIONS: WebhookEventDefinition[] = [
  {
    name: WEBHOOK_EVENTS.POLICY_PUBLISHED,
    label: 'Policy Published',
    description: 'Triggered when a policy version is formally published.',
  },
  {
    name: WEBHOOK_EVENTS.AUDIT_REQUEST_CREATED,
    label: 'Audit Request Created',
    description: 'Triggered when a new evidence request is created.',
  },
  {
    name: WEBHOOK_EVENTS.AUDIT_EXPORT_COMPLETED,
    label: 'Audit Export Completed',
    description: 'Triggered when a compliance report/package is ready for download.',
  },
  {
    name: WEBHOOK_EVENTS.AI_INCIDENT_ESCALATED,
    label: 'AI Incident Escalated',
    description: 'Triggered when an AI policy breach or failure is flagged for review.',
  },
  {
    name: WEBHOOK_EVENTS.CORRELATION_EVENT_TRIGGERED,
    label: 'Correlation Event Triggered',
    description: 'Triggered when the correlation engine detects a cross-domain risk event.',
  },
  {
    name: WEBHOOK_EVENTS.VENDOR_RISK_CHANGED,
    label: 'Vendor Risk Changed',
    description: 'Triggered when a vendor risk profile is updated.',
  },
];
