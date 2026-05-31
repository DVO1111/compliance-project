import { BaseProvider } from './baseProvider';
import type { ProviderManifest, IntegrationConnection } from '../types';

export class GoogleDriveProvider extends BaseProvider {
  readonly manifest: ProviderManifest = {
    id: 'google_drive',
    iconUrl: 'https://logo.clearbit.com/google.com',
    name: 'Google Drive',
    description: 'Connect Google Drive to browse folders and attach files to submissions.',
    category: 'storage',
    featured: false,
    users: 280,
    likes: 6,
    requiresOAuth: true,
    configSchema: [
      {
        key: 'auth_mode',
        label: 'Connection Mode',
        type: 'select',
        required: true,
        options: [{ label: 'OAuth (recommended)', value: 'oauth' }],
      },
      {
        key: 'root_folder_id',
        label: 'Root Folder ID (optional)',
        type: 'text',
        required: false,
        placeholder: '1AbCDeFgHiJkLmNoPqR...',
        helpText: 'If set, the Drive picker will start from this folder.',
      },
    ],
  };

  async healthCheck(connection: IntegrationConnection): Promise<{ healthy: boolean; error?: string }> {
    if ((connection.config.auth_mode as string) !== 'oauth') {
      return { healthy: false, error: 'Google Drive requires OAuth' };
    }
    return { healthy: true };
  }

  async sendEvent(): Promise<{ success: boolean; error?: string }> {
    // Storage provider: no notification dispatch
    return { success: true };
  }
}
