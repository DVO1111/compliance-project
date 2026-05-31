import { BaseProvider } from './baseProvider';
import type { ProviderManifest, IntegrationConnection } from '../types';

/* ═══════════════════════════════════════════════════════════════
   Pharmacovigilance — Argus / Oracle Empirica / Veeva Safety
   ═══════════════════════════════════════════════════════════════
   - Auto-forward adverse events from marketing channels to PV system
   - Receive safety signal updates → flag affected promotional content
   - Structured AE data formatting (CIOMS / MedDRA)
   ═══════════════════════════════════════════════════════════════ */

export class PharmacovigilanceProvider extends BaseProvider {
    readonly manifest: ProviderManifest = {
        id: 'pharmacovigilance',
        iconUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=pv&backgroundColor=0B0F19',
        name: 'Pharmacovigilance (PV)',
        description: 'AE forwarding to Argus/Oracle/Veeva Safety — auto-forward adverse events from marketing channels, receive safety signal alerts for content flagging.',
        category: 'pharma',
    featured: false,
    users: 334,
    likes: 217,
        requiresOAuth: false,
        configSchema: [
            { key: 'pv_system', label: 'PV System', type: 'select', required: true, options: [{ label: 'Oracle Argus', value: 'argus' }, { label: 'Oracle Empirica', value: 'empirica' }, { label: 'Veeva Vault Safety', value: 'veeva_safety' }, { label: 'Other (API)', value: 'other' }] },
            { key: 'pv_url', label: 'PV System URL', type: 'url', required: true, placeholder: 'https://pv.yourcompany.com/api', helpText: 'API endpoint for the pharmacovigilance system' },
            { key: 'api_key', label: 'API Key / Token', type: 'text', required: true, placeholder: 'PV system API key' },
            { key: 'ae_auto_forward', label: 'Auto-forward adverse events', type: 'toggle', required: false, helpText: 'Automatically forward AEs detected in marketing channels to PV system' },
            { key: 'safety_signal_alerts', label: 'Receive safety signal alerts', type: 'toggle', required: false, helpText: 'Flag affected promotional content when safety signals are processed' },
            { key: 'include_social_media', label: 'Include social media AEs', type: 'toggle', required: false, helpText: 'Forward AEs detected via social media monitoring' },
            { key: 'include_patient_support', label: 'Include patient support AEs', type: 'toggle', required: false, helpText: 'Forward AEs from patient support programmes' },
            { key: 'coding_dictionary', label: 'Medical Coding', type: 'select', required: false, options: [{ label: 'MedDRA', value: 'meddra' }, { label: 'WHO-ART', value: 'who_art' }], helpText: 'Medical coding dictionary for AE terminology' },
        ],
    };

    async healthCheck(connection: IntegrationConnection): Promise<{ healthy: boolean; error?: string }> {
        const url = connection.config.pv_url as string;
        const key = connection.config.api_key as string;
        if (!url || !key) return { healthy: false, error: 'PV system URL and API key required' };
        try {
            const resp = await fetch(`${url}/health`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
            return resp.ok ? { healthy: true } : { healthy: false, error: `PV system returned ${resp.status}` };
        } catch (err: any) {
            return { healthy: false, error: err.message };
        }
    }

    async sendEvent(connection: IntegrationConnection, eventType: string, data: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
        const url = connection.config.pv_url as string;
        const key = connection.config.api_key as string;
        if (!url || !key) return { success: false, error: 'PV system not configured' };

        switch (eventType) {
            case 'ae.forward': {
                if (!connection.config.ae_auto_forward) return { success: true };
                try {
                    const aePayload = {
                        report_type: 'ICSR', source: data.source_channel, patient_initials: data.patient_initials || 'UNK',
                        event_description: data.description, product_name: data.product_name, reporter_type: data.reporter_type || 'consumer',
                        seriousness: data.seriousness || 'non_serious', date_of_onset: data.date_of_onset, date_reported: new Date().toISOString(),
                        meddra_pt: data.meddra_preferred_term || null, source_reference: data.source_url || data.source_id,
                    };
                    const resp = await fetch(`${url}/cases`, {
                        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify(aePayload),
                    });
                    return resp.ok ? { success: true } : { success: false, error: `PV ${resp.status}` };
                } catch (err: any) { return { success: false, error: err.message }; }
            }
            case 'ae.batch_forward': {
                try {
                    const events = data.events as Record<string, unknown>[];
                    const resp = await fetch(`${url}/cases/batch`, {
                        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ cases: events }),
                    });
                    return resp.ok ? { success: true } : { success: false, error: `PV batch ${resp.status}` };
                } catch (err: any) { return { success: false, error: err.message }; }
            }
            default: return { success: true };
        }
    }

    async handleWebhook(_connection: IntegrationConnection, payload: Record<string, unknown>): Promise<{ acknowledged: boolean; message?: string }> {
        const eventType = payload.event_type as string;
        if (eventType === 'safety_signal.detected' || eventType === 'safety_signal.updated') {
            return { acknowledged: true, message: `Safety signal for ${payload.product_name || 'unknown'} — flagging affected content` };
        }
        if (eventType === 'label_change.safety') {
            return { acknowledged: true, message: `Safety-driven label change — triggering content withdrawal review` };
        }
        return { acknowledged: true, message: 'PV event received' };
    }
}
