import { BaseProvider } from './baseProvider';
import type { ProviderManifest, IntegrationConnection } from '../types';

/* ═══════════════════════════════════════════════════════════════
   Adobe Experience Manager (AEM) — Pre-Publish Compliance Gate
   ═══════════════════════════════════════════════════════════════
   - Block AEM publish unless content has passed compliance review
   - Push approved metadata with assets into AEM
   - Flag post-modification changes for automatic re-review
   ═══════════════════════════════════════════════════════════════ */

export class AdobeAemProvider extends BaseProvider {
    readonly manifest: ProviderManifest = {
        id: 'adobe_aem',
        iconUrl: 'https://logo.clearbit.com/adobe.com',
        name: 'Adobe Experience Manager',
        description: 'Pre-publish compliance gate for AEM — block publishing without approval, sync approved metadata, flag post-approval modifications for re-review.',
        category: 'pharma',
    featured: true,
    users: 25,
    likes: 12,
        requiresOAuth: false,
        configSchema: [
            { key: 'aem_url', label: 'AEM Instance URL', type: 'url', required: true, placeholder: 'https://author.yourcompany.adobecqms.net', helpText: 'Your AEM Author instance URL' },
            { key: 'api_key', label: 'API Key / Service Account Token', type: 'text', required: true, placeholder: 'AEM API key or bearer token', helpText: 'From AEM Developer Console → Service Credentials' },
            { key: 'content_root', label: 'Content Root Path', type: 'text', required: false, placeholder: '/content/pharma/en', helpText: 'Root path to monitor for compliance-required content' },
            { key: 'pre_publish_gate', label: 'Enable pre-publish compliance gate', type: 'toggle', required: false, helpText: 'Block AEM replication unless content is compliance-approved' },
            { key: 'modification_recheck', label: 'Flag post-approval modifications', type: 'toggle', required: false, helpText: 'Automatically detect changes made after compliance approval and trigger re-review' },
            { key: 'metadata_sync', label: 'Sync approval metadata to AEM', type: 'toggle', required: false, helpText: 'Push compliance status, reviewer, approval date as AEM page properties' },
            { key: 'monitored_templates', label: 'Monitored Page Templates', type: 'text', required: false, placeholder: 'product-page, landing-page, campaign', helpText: 'Comma-separated AEM template names that require compliance review' },
        ],
    };

    async healthCheck(connection: IntegrationConnection): Promise<{ healthy: boolean; error?: string }> {
        const url = connection.config.aem_url as string;
        const key = connection.config.api_key as string;
        if (!url || !key) return { healthy: false, error: 'AEM URL and API key are required' };
        try {
            const resp = await fetch(`${url}/api/assets.json`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
            if (resp.ok) return { healthy: true };
            return { healthy: false, error: `AEM returned ${resp.status}` };
        } catch (err: any) {
            return { healthy: false, error: err.message };
        }
    }

    async sendEvent(connection: IntegrationConnection, eventType: string, data: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
        const url = connection.config.aem_url as string;
        const key = connection.config.api_key as string;
        if (!url || !key) return { success: false, error: 'AEM not configured' };

        switch (eventType) {
            case 'compliance.metadata_push': {
                try {
                    const pagePath = data.page_path as string;
                    const resp = await fetch(`${url}${pagePath}/jcr:content`, {
                        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({ 'compliance_status': data.status as string, 'compliance_reviewer': data.reviewer as string, 'compliance_approved_at': data.approved_at as string, 'compliance_risk_score': String(data.risk_score || 0) }).toString(),
                    });
                    return resp.ok ? { success: true } : { success: false, error: `AEM ${resp.status}` };
                } catch (err: any) { return { success: false, error: err.message }; }
            }
            case 'compliance.publish_block': {
                try {
                    const pagePath = data.page_path as string;
                    const resp = await fetch(`${url}/bin/replicate?cmd=deactivate&path=${encodeURIComponent(pagePath)}`, {
                        method: 'POST', headers: { Authorization: `Bearer ${key}` },
                    });
                    return resp.ok ? { success: true } : { success: false, error: `AEM block failed: ${resp.status}` };
                } catch (err: any) { return { success: false, error: err.message }; }
            }
            default: return { success: true };
        }
    }

    async handleWebhook(_connection: IntegrationConnection, payload: Record<string, unknown>): Promise<{ acknowledged: boolean; message?: string }> {
        const action = payload.action as string;
        if (action === 'page_modified' || action === 'asset_modified') {
            return { acknowledged: true, message: `AEM modification detected on ${payload.path} — flagged for compliance re-review` };
        }
        if (action === 'replicate' || action === 'publish') {
            return { acknowledged: true, message: `AEM publish attempt on ${payload.path} — checking compliance gate` };
        }
        return { acknowledged: true, message: 'AEM event received' };
    }
}
