import { BaseProvider } from './baseProvider';
import type { ProviderManifest, IntegrationConnection } from '../types';

/* ═══════════════════════════════════════════════════════════════
   Jira Provider — Basic API Token (MVP)
   ═══════════════════════════════════════════════════════════════
   This MVP uses Jira Cloud API token + email (Basic Auth) to
   create issues and run health checks.

   Later upgrade: OAuth 2.0 (3LO) or Atlassian OAuth.
   ═══════════════════════════════════════════════════════════════ */

export class JiraProvider extends BaseProvider {
  readonly manifest: ProviderManifest = {
    id: 'jira',
    iconUrl: 'https://logo.clearbit.com/atlassian.com',
    name: 'Jira',
    description: 'Create Jira issues when content is submitted, rejected, or needs compliance changes.',
    category: 'project_mgmt',
    featured: false,
    users: 228,
    likes: 47,
    requiresOAuth: false,
    configSchema: [
      {
        key: 'base_url',
        label: 'Jira Base URL',
        type: 'url',
        required: true,
        placeholder: 'https://your-domain.atlassian.net',
      },
      {
        key: 'email',
        label: 'Jira Email',
        type: 'text',
        required: true,
        placeholder: 'you@company.com',
      },
      {
        key: 'api_token',
        label: 'Jira API Token',
        type: 'text',
        required: true,
        placeholder: 'API token (keep private)',
      },
      {
        key: 'project_key',
        label: 'Project Key',
        type: 'text',
        required: true,
        placeholder: 'COMP',
      },
      {
        key: 'issue_type',
        label: 'Issue Type',
        type: 'text',
        required: false,
        placeholder: 'Task',
      },
    ],
  };

  async healthCheck(connection: IntegrationConnection): Promise<{ healthy: boolean; error?: string }> {
    const baseUrl = (connection.config.base_url as string) || '';
    const email = (connection.config.email as string) || '';
    const token = (connection.config.api_token as string) || '';
    if (!baseUrl || !email || !token) return { healthy: false, error: 'Missing Jira credentials' };

    try {
      const auth = btoa(`${email}:${token}`);
      const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/api/3/myself`, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
      });

      if (resp.ok) return { healthy: true };
      const text = await resp.text();
      return { healthy: false, error: `Jira returned ${resp.status}: ${text}` };
    } catch (err: any) {
      return { healthy: false, error: err.message };
    }
  }
}
