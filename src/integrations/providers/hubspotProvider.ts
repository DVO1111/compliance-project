import { BaseProvider } from './baseProvider';
import type { IntegrationConnection } from '../types';

type HubSpotConfig = {
  /** HubSpot Private App token */
  token?: string;
  /** Optional: assign created tasks to an owner */
  owner_id?: string;
  /** Optional title prefix */
  title_prefix?: string;
};

/**
 * HubSpot Provider (private-app token MVP)
 *
 * Sends compliance events to HubSpot as CRM Tasks.
 * For production, consider OAuth and storing token in credentials_encrypted.
 */
export class HubSpotProvider extends BaseProvider {
  manifest = {
    id: 'hubspot' as const,
    iconUrl: 'https://logo.clearbit.com/hubspot.com',
    name: 'HubSpot',
    description: 'Create HubSpot CRM tasks for compliance events (approvals, rejections, expiries, regulatory updates).',
    category: 'automation' as const,
    requiresOAuth: false,
    configSchema: [
      {
        key: 'token',
        label: 'HubSpot private app token',
        type: 'text' as const,
        required: true,
        placeholder: 'pat-…',
        helpText: 'In HubSpot: Settings → Integrations → Private Apps → Create app → copy the token (scopes for CRM tasks recommended).',
      },
      {
        key: 'owner_id',
        label: 'Owner ID (optional)',
        type: 'text' as const,
        required: false,
        placeholder: '123456789',
        helpText: 'Optional: assign tasks to a HubSpot owner. Leave blank to create unassigned tasks.',
      },
      {
        key: 'title_prefix',
        label: 'Task title prefix (optional)',
        type: 'text' as const,
        required: false,
        placeholder: 'Compliance',
      },
      {
        key: 'notify_submissions',
        label: 'Enable submissions alerts',
        type: 'toggle' as const,
        required: false,
      },
      {
        key: 'notify_approvals',
        label: 'Enable approvals/rejections alerts',
        type: 'toggle' as const,
        required: false,
      },
      {
        key: 'notify_expiry',
        label: 'Enable expiry alerts',
        type: 'toggle' as const,
        required: false,
      },
    ],
  };

  async healthCheck(connection: IntegrationConnection) {
    const cfg = connection.config as HubSpotConfig;
    if (!cfg.token) return { healthy: false, error: 'Missing HubSpot token' };

    try {
      const res = await fetch('https://api.hubapi.com/account-info/v3/details', {
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        return { healthy: false, error: `HubSpot auth failed (${res.status}): ${t.slice(0, 180)}` };
      }
      return { healthy: true };
    } catch (e: any) {
      return { healthy: false, error: e?.message ?? String(e) };
    }
  }

  async sendEvent(connection: IntegrationConnection, eventType: string, data: Record<string, unknown>) {
    const cfg = connection.config as HubSpotConfig;
    if (!cfg.token) return { success: false, error: 'Missing HubSpot token' };

    const allow = this._isEventEnabled(cfg as any, eventType);
    if (!allow) return { success: true };

    const titlePrefix = (cfg.title_prefix || 'Compliance').trim();
    const subject = `${titlePrefix}: ${eventType}`;
    const now = Date.now();

    // HubSpot CRM Task object properties (hs_task_* fields)
    const body = {
      properties: {
        hs_task_subject: subject,
        hs_task_body: safeMultiline(renderBody(eventType, data)),
        hs_timestamp: String(now),
        ...(cfg.owner_id ? { hubspot_owner_id: cfg.owner_id } : {}),
      },
    };

    try {
      const res = await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        return { success: false, error: `HubSpot create task failed (${res.status}): ${t.slice(0, 250)}` };
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e) };
    }
  }

  private _isEventEnabled(cfg: Record<string, any>, eventType: string): boolean {
    const submissions = cfg.notify_submissions !== false;
    const approvals = cfg.notify_approvals !== false;
    const expiry = cfg.notify_expiry !== false;
    if (eventType.startsWith('submission.')) return submissions;
    if (eventType.startsWith('approval.')) return approvals;
    if (eventType.startsWith('expiry.')) return expiry;
    return true;
  }
}

function renderBody(eventType: string, data: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`Event: ${eventType}`);
  lines.push(`Time: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('Payload:');
  lines.push(JSON.stringify(data, null, 2));
  return lines.join('\n');
}

function safeMultiline(s: string): string {
  return s.slice(0, 5000);
}
