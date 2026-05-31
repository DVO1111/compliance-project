import { BaseProvider } from './baseProvider';
import type { ProviderManifest, IntegrationConnection } from '../types';

export class MondayProvider extends BaseProvider {
  readonly manifest: ProviderManifest = {
    id: 'monday',
    iconUrl: 'https://logo.clearbit.com/monday.com',
    name: 'monday.com',
    description: 'Create monday.com items automatically for submissions, approvals, and regulatory alerts.',
    category: 'project_mgmt',
    featured: false,
    users: 88,
    likes: 62,
    requiresOAuth: false,
    configSchema: [
      {
        key: 'api_token',
        label: 'API Token',
        type: 'text',
        required: true,
        placeholder: 'monday_v2_...',
        helpText: 'Generate a personal API token in monday.com. Keep this private.',
      },
      { key: 'board_id', label: 'Board ID', type: 'text', required: true, placeholder: '123456789' },
      { key: 'group_id', label: 'Group ID (optional)', type: 'text', required: false, placeholder: 'topics' },
      { key: 'create_on_submissions', label: 'Create items for new submissions', type: 'toggle', required: false },
      { key: 'create_on_approvals', label: 'Create items for approvals / rejections', type: 'toggle', required: false },
      { key: 'create_on_regulatory', label: 'Create items for regulatory updates', type: 'toggle', required: false },
    ],
  };

  async healthCheck(connection: IntegrationConnection): Promise<{ healthy: boolean; error?: string }> {
    // NOTE: In production, this should be performed server-side (Edge Function).
    const token = (connection.config.api_token as string) || '';
    if (!token) return { healthy: false, error: 'No monday.com token configured' };

    try {
      const resp = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ me { id } }' }),
      });
      if (resp.ok) return { healthy: true };
      return { healthy: false, error: `monday.com returned ${resp.status}` };
    } catch (err: any) {
      return { healthy: false, error: err.message };
    }
  }

  async sendEvent(): Promise<{ success: boolean; error?: string }> {
    // Delivery is handled server-side via publish_outbox + deliver-webhook.
    return { success: true };
  }
}
