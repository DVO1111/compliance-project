import { BaseProvider } from './baseProvider';
import type { ProviderManifest, IntegrationConnection } from '../types';

export class AsanaProvider extends BaseProvider {
  readonly manifest: ProviderManifest = {
    id: 'asana',
    iconUrl: 'https://logo.clearbit.com/asana.com',
    name: 'Asana',
    description: 'Create Asana tasks automatically for submissions, approvals, and regulatory alerts.',
    category: 'project_mgmt',
    featured: false,
    users: 26,
    likes: 13,
    requiresOAuth: false,
    configSchema: [
      {
        key: 'personal_access_token',
        label: 'Personal Access Token',
        type: 'text',
        required: true,
        placeholder: '0/123456789abcdef...',
        helpText: 'Create a PAT in Asana → Developer Console. Keep this private.',
      },
      {
        key: 'workspace_gid',
        label: 'Workspace GID',
        type: 'text',
        required: true,
        placeholder: '1234567890123456',
      },
      {
        key: 'project_gid',
        label: 'Project GID (optional)',
        type: 'text',
        required: false,
        placeholder: '1234567890123456',
        helpText: 'If set, tasks will be added to this project automatically.',
      },
      { key: 'create_on_submissions', label: 'Create tasks for new submissions', type: 'toggle', required: false },
      { key: 'create_on_approvals', label: 'Create tasks for approvals / rejections', type: 'toggle', required: false },
      { key: 'create_on_regulatory', label: 'Create tasks for regulatory updates', type: 'toggle', required: false },
    ],
  };

  async healthCheck(connection: IntegrationConnection): Promise<{ healthy: boolean; error?: string }> {
    // NOTE: In production, this should be performed server-side (Edge Function).
    // We keep a lightweight check here for the UI "Test" button.
    const token = (connection.config.personal_access_token as string) || '';
    if (!token) return { healthy: false, error: 'No Asana token configured' };

    try {
      const resp = await fetch('https://app.asana.com/api/1.0/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) return { healthy: true };
      return { healthy: false, error: `Asana returned ${resp.status}` };
    } catch (err: any) {
      return { healthy: false, error: err.message };
    }
  }

  async sendEvent(): Promise<{ success: boolean; error?: string }> {
    // Delivery is handled server-side via publish_outbox + deliver-webhook.
    return { success: true };
  }
}
