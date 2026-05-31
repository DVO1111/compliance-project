import type { IntegrationConnection, ProviderManifest } from '../types';
import { BaseProvider } from './baseProvider';

/**
 * Microsoft 365 (SharePoint + OneDrive)
 *
 * MVP scope:
 * - OAuth connect (handled by Edge Function `microsoft-oauth`)
 * - Folder browsing (Edge Function `microsoft-browse`)
 *
 * We keep the provider light on the client side; server-side functions own the
 * token refresh + Graph calls.
 */
export class Microsoft365Provider extends BaseProvider {

  readonly manifest: ProviderManifest = {
    id: 'microsoft_365',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Microsoft_Office_logo_%282019%E2%80%93present%29.svg/512px-Microsoft_Office_logo_%282019%E2%80%93present%29.svg.png',
    name: 'Microsoft 365 (SharePoint + OneDrive)',
    description:
      'Connect SharePoint and OneDrive to attach files and route compliance workflows into Microsoft-first orgs.',
    category: 'storage',
    featured: false,
    users: 168,
    likes: 125,
    requiresOAuth: true,
    configSchema: [],
  };

  async healthCheck(_connection: IntegrationConnection) {
    // We can't call Graph from the client safely; health checks are handled
    // by the backend (Edge Functions) when the user loads drives/folders.
    return { healthy: true };
  }
}
