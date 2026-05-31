import { BaseProvider } from './baseProvider';
import type { IntegrationConnection } from '../types';

type NotionConfig = {
  /** Notion internal integration token ("secret_...") */
  token?: string;
  /** Target database where we create pages */
  database_id?: string;
  /** Optional: prefix for page titles */
  title_prefix?: string;
};

/**
 * Notion Provider (token-based MVP)
 *
 * Note: For production, prefer OAuth + storing token in credentials_encrypted.
 */
export class NotionProvider extends BaseProvider {
  manifest = {
    id: 'notion' as const,
    iconUrl: 'https://logo.clearbit.com/notion.so',
    name: 'Notion',
    description: 'Create a Notion page for key compliance events (approvals, rejections, regulatory updates).',
    category: 'storage' as const,
    requiresOAuth: false,
    configSchema: [
      {
        key: 'token',
        label: 'Notion integration token',
        type: 'text' as const,
        required: true,
        placeholder: 'secret_…',
        helpText: 'Create an internal integration in Notion, then copy the token. Make sure the integration has access to your database.',
      },
      {
        key: 'database_id',
        label: 'Database ID',
        type: 'text' as const,
        required: true,
        placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        helpText: 'Open the database in Notion → Copy link → extract the database ID from the URL.',
      },
      {
        key: 'title_prefix',
        label: 'Title prefix (optional)',
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
    const cfg = connection.config as NotionConfig;
    if (!cfg.token) return { healthy: false, error: 'Missing Notion token' };

    try {
      const res = await fetch('https://api.notion.com/v1/users/me', {
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Notion-Version': '2022-06-28',
        },
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        return { healthy: false, error: `Notion auth failed (${res.status}): ${t.slice(0, 180)}` };
      }
      return { healthy: true };
    } catch (e: any) {
      return { healthy: false, error: e?.message ?? String(e) };
    }
  }

  async sendEvent(connection: IntegrationConnection, eventType: string, data: Record<string, unknown>) {
    const cfg = connection.config as NotionConfig;

    if (!cfg.token) return { success: false, error: 'Missing Notion token' };
    if (!cfg.database_id) return { success: false, error: 'Missing Notion database_id' };

    // Honor toggles (default ON if not present)
    const allow = this._isEventEnabled(cfg as any, eventType);
    if (!allow) return { success: true };

    const titlePrefix = (cfg.title_prefix || 'Compliance').trim();
    const ts = new Date().toISOString();

    const title = `${titlePrefix}: ${eventType}`;

    const payload = {
      parent: { database_id: cfg.database_id },
      properties: {
        Name: {
          title: [{ type: 'text', text: { content: title } }],
        },
        Event: {
          rich_text: [{ type: 'text', text: { content: eventType } }],
        },
        Timestamp: {
          date: { start: ts },
        },
        Data: {
          rich_text: [{ type: 'text', text: { content: safeOneLine(JSON.stringify(data)) } }],
        },
      },
    };

    try {
      const res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        return { success: false, error: `Notion create page failed (${res.status}): ${t.slice(0, 250)}` };
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message ?? String(e) };
    }
  }

  private _isEventEnabled(cfg: Record<string, any>, eventType: string): boolean {
    // Defaults to enabled unless explicitly set to false
    const submissions = cfg.notify_submissions !== false;
    const approvals = cfg.notify_approvals !== false;
    const expiry = cfg.notify_expiry !== false;

    if (eventType.startsWith('submission.')) return submissions;
    if (eventType.startsWith('approval.')) return approvals;
    if (eventType.startsWith('expiry.')) return expiry;
    return true;
  }
}

function safeOneLine(s: string): string {
  return s.replace(/[\r\n\t]+/g, ' ').slice(0, 1800);
}
