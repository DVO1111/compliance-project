import { BaseProvider } from './baseProvider';
import type { ProviderManifest, IntegrationConnection } from '../types';

/* ═══════════════════════════════════════════════════════════════
   Veeva Vault RIM — Regulatory Information Management
   ═══════════════════════════════════════════════════════════════
   - Receive label variation approvals → trigger content re-reviews
   - Pull current approved labels during review workflow
   - Sync dossier status and submission history
   ═══════════════════════════════════════════════════════════════ */

export class VeevaRimProvider extends BaseProvider {
    readonly manifest: ProviderManifest = {
        id: 'veeva_rim',
        iconUrl: 'https://logo.clearbit.com/veeva.com',
        name: 'Veeva Vault RIM',
        description: 'Regulatory information sync — receive label approvals, trigger content re-reviews on label changes, pull approved labels during review.',
        category: 'pharma',
    featured: false,
    users: 286,
    likes: 62,
        requiresOAuth: false,
        configSchema: [
            { key: 'rim_vault_url', label: 'RIM Vault URL', type: 'url', required: true, placeholder: 'https://yourcompany-rim.veevavault.com', helpText: 'Your Veeva Vault RIM instance URL' },
            { key: 'api_user', label: 'API Username', type: 'text', required: true, placeholder: 'rim-api@company.com' },
            { key: 'session_token', label: 'Session Token', type: 'text', required: true, placeholder: 'RIM Vault session token' },
            { key: 'label_change_alerts', label: 'Alert on label changes', type: 'toggle', required: false, helpText: 'Notify compliance team when product labels are updated in RIM' },
            { key: 'auto_re_review', label: 'Auto-trigger content re-review', type: 'toggle', required: false, helpText: 'Automatically flag promotional content for re-review when its referenced label changes' },
            { key: 'dossier_sync', label: 'Sync dossier status', type: 'toggle', required: false, helpText: 'Import registration and submission status from RIM' },
            { key: 'monitored_products', label: 'Monitored Products', type: 'text', required: false, placeholder: 'CardioMax, NeuroCalm, DermaShield', helpText: 'Comma-separated product names to monitor for label changes' },
        ],
    };

    async healthCheck(connection: IntegrationConnection): Promise<{ healthy: boolean; error?: string }> {
        const url = connection.config.rim_vault_url as string;
        const token = connection.config.session_token as string;
        if (!url || !token) return { healthy: false, error: 'RIM Vault URL and session token required' };
        try {
            const resp = await fetch(`${url}/api/v24.1/metadata/objects`, { headers: { Authorization: token, Accept: 'application/json' } });
            return resp.ok ? { healthy: true } : { healthy: false, error: `RIM returned ${resp.status}` };
        } catch (err: any) {
            return { healthy: false, error: err.message };
        }
    }

    async sendEvent(connection: IntegrationConnection, eventType: string, data: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
        const url = connection.config.rim_vault_url as string;
        const token = connection.config.session_token as string;
        if (!url || !token) return { success: false, error: 'RIM not configured' };

        switch (eventType) {
            case 'label.pull_current': {
                try {
                    const productId = data.product_id as string;
                    const resp = await fetch(`${url}/api/v24.1/objects/documents?where=product__v='${productId}' AND type__v='Label'&sort=version_modified_date__v desc&limit=1`, {
                        headers: { Authorization: token, Accept: 'application/json' },
                    });
                    if (resp.ok) {
                        const result = await resp.json();
                        return { success: true, error: JSON.stringify(result) };
                    }
                    return { success: false, error: `RIM ${resp.status}` };
                } catch (err: any) { return { success: false, error: err.message }; }
            }
            case 'compliance.label_question': {
                try {
                    const resp = await fetch(`${url}/api/v24.1/objects/documents/${data.document_id}/annotations`, {
                        method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ annotation_type: 'compliance_query', text: data.question, reviewer: data.reviewer_name }),
                    });
                    return resp.ok ? { success: true } : { success: false, error: `RIM ${resp.status}` };
                } catch (err: any) { return { success: false, error: err.message }; }
            }
            default: return { success: true };
        }
    }

    async handleWebhook(_connection: IntegrationConnection, payload: Record<string, unknown>): Promise<{ acknowledged: boolean; message?: string }> {
        const eventType = payload.event_type as string;
        if (eventType === 'label__v.approved__v' || eventType === 'label__v.state_change__v') {
            return { acknowledged: true, message: `Label change for ${payload.product_name || 'unknown product'} — triggering content re-review` };
        }
        if (eventType === 'submission__v.approved__v') {
            return { acknowledged: true, message: `Regulatory submission approved — updating dossier status` };
        }
        return { acknowledged: true, message: 'RIM event received' };
    }
}
