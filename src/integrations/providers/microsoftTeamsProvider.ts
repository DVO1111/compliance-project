import { BaseProvider } from './baseProvider';
import type { ProviderManifest, IntegrationConnection } from '../types';

/* ═══════════════════════════════════════════════════════════════
   Microsoft Teams Provider — Incoming Webhook
   ═══════════════════════════════════════════════════════════════
   Uses an Incoming Webhook URL to post notifications.

   Note: Teams Incoming Webhooks support Adaptive Cards.
   We send a simple Adaptive Card for health checks.
   ═══════════════════════════════════════════════════════════════ */

export class MicrosoftTeamsProvider extends BaseProvider {
  readonly manifest: ProviderManifest = {
    id: 'microsoft_teams',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Microsoft_Office_Teams_%282018%E2%80%93present%29.svg/1200px-Microsoft_Office_Teams_%282018%E2%80%93present%29.svg.png',
    name: 'Microsoft Teams',
    description: 'Send compliance alerts and review updates to a Teams channel via Incoming Webhook.',
    category: 'communication',
    featured: false,
    users: 442,
    likes: 283,
    requiresOAuth: false,
    configSchema: [
      {
        key: 'webhook_url',
        label: 'Webhook URL',
        type: 'url',
        required: true,
        placeholder: 'https://.../IncomingWebhook/...',
        helpText: 'In Teams, add the “Incoming Webhook” app/connector to a channel and copy the URL.',
      },
      {
        key: 'channel_name',
        label: 'Channel Name (display only)',
        type: 'text',
        required: false,
        placeholder: 'Legal Alerts',
      },
      {
        key: 'notify_submissions',
        label: 'Notify on new submissions',
        type: 'toggle',
        required: false,
      },
      {
        key: 'notify_approvals',
        label: 'Notify on approvals / rejections',
        type: 'toggle',
        required: false,
      },
    ],
  };

  async healthCheck(connection: IntegrationConnection): Promise<{ healthy: boolean; error?: string }> {
    const url = connection.config.webhook_url as string;
    if (!url) return { healthy: false, error: 'No webhook URL configured' };

    try {
      const payload = {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.5',
              body: [
                {
                  type: 'TextBlock',
                  text: '✅ ComplianceHub connection test — Teams integration is working!',
                  weight: 'Bolder',
                  wrap: true,
                },
              ],
            },
          },
        ],
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (resp.ok) return { healthy: true };
      const text = await resp.text();
      return { healthy: false, error: `Teams returned ${resp.status}: ${text}` };
    } catch (err: any) {
      return { healthy: false, error: err.message };
    }
  }
}
