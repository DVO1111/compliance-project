import { BaseProvider } from './baseProvider';
import type { ProviderManifest, IntegrationConnection } from '../types';

/* ═══════════════════════════════════════════════════════════════
   Healthcare LMS — HealthStream / Veeva Training
   ═══════════════════════════════════════════════════════════════
   - Sync training completion and certification status
   - Gate compliance system access on current training status
   - Competency assessment integration for audit trail
   ═══════════════════════════════════════════════════════════════ */

export class HealthcareLmsProvider extends BaseProvider {
    readonly manifest: ProviderManifest = {
        id: 'healthcare_lms',
        iconUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=lms&backgroundColor=0B0F19',
        name: 'Healthcare LMS',
        description: 'Training-gated access — sync certifications from HealthStream/Veeva Training, revoke permissions for expired training, feed competency data into audit trail.',
        category: 'pharma',
    featured: false,
    users: 352,
    likes: 37,
        requiresOAuth: false,
        configSchema: [
            { key: 'lms_provider', label: 'LMS Platform', type: 'select', required: true, options: [{ label: 'HealthStream', value: 'healthstream' }, { label: 'Veeva Training', value: 'veeva_training' }, { label: 'Cornerstone OnDemand', value: 'cornerstone' }, { label: 'Other (API)', value: 'other' }] },
            { key: 'lms_url', label: 'LMS API URL', type: 'url', required: true, placeholder: 'https://lms.yourcompany.com/api', helpText: 'LMS REST API endpoint' },
            { key: 'api_key', label: 'API Key / Token', type: 'text', required: true, placeholder: 'LMS API key' },
            { key: 'cert_sync', label: 'Sync certification status', type: 'toggle', required: false, helpText: 'Import training completion and certification records' },
            { key: 'permission_gating', label: 'Training-gated permissions', type: 'toggle', required: false, helpText: 'Automatically restrict compliance system access for users with expired or missing training' },
            { key: 'competency_audit', label: 'Include in audit trail', type: 'toggle', required: false, helpText: 'Record competency status alongside compliance actions for regulatory audit' },
            { key: 'sync_frequency', label: 'Sync Frequency', type: 'select', required: false, options: [{ label: 'Real-time', value: 'realtime' }, { label: 'Every hour', value: '1h' }, { label: 'Every 6 hours', value: '6h' }, { label: 'Daily', value: 'daily' }] },
            { key: 'required_courses', label: 'Required Compliance Courses', type: 'text', required: false, placeholder: 'GxP Compliance, Adverse Event Reporting, Off-Label Prevention', helpText: 'Comma-separated course names required for compliance system access' },
        ],
    };

    async healthCheck(connection: IntegrationConnection): Promise<{ healthy: boolean; error?: string }> {
        const url = connection.config.lms_url as string;
        const key = connection.config.api_key as string;
        if (!url || !key) return { healthy: false, error: 'LMS URL and API key required' };
        try {
            const resp = await fetch(`${url}/v1/health`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
            return resp.ok ? { healthy: true } : { healthy: false, error: `LMS returned ${resp.status}` };
        } catch (err: any) {
            return { healthy: false, error: err.message };
        }
    }

    async sendEvent(connection: IntegrationConnection, eventType: string, data: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
        const url = connection.config.lms_url as string;
        const key = connection.config.api_key as string;
        if (!url || !key) return { success: false, error: 'LMS not configured' };

        switch (eventType) {
            case 'training.check_user': {
                try {
                    const userId = data.user_email || data.user_id;
                    const resp = await fetch(`${url}/v1/users/${userId}/certifications`, {
                        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
                    });
                    if (resp.ok) {
                        const certs = await resp.json();
                        return { success: true, error: JSON.stringify(certs) };
                    }
                    return { success: false, error: `LMS ${resp.status}` };
                } catch (err: any) { return { success: false, error: err.message }; }
            }
            case 'training.bulk_check': {
                try {
                    const resp = await fetch(`${url}/v1/certifications/bulk`, {
                        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_ids: data.user_ids, course_ids: data.course_ids }),
                    });
                    if (resp.ok) {
                        const result = await resp.json();
                        return { success: true, error: JSON.stringify(result) };
                    }
                    return { success: false, error: `LMS bulk ${resp.status}` };
                } catch (err: any) { return { success: false, error: err.message }; }
            }
            default: return { success: true };
        }
    }

    async handleWebhook(_connection: IntegrationConnection, payload: Record<string, unknown>): Promise<{ acknowledged: boolean; message?: string }> {
        const eventType = payload.event_type as string;
        if (eventType === 'certification.completed') {
            return { acknowledged: true, message: `Training completed by ${payload.user_name || payload.user_email} — updating access permissions` };
        }
        if (eventType === 'certification.expired') {
            return { acknowledged: true, message: `Certification expired for ${payload.user_name || payload.user_email} — reviewing access restrictions` };
        }
        if (eventType === 'competency.updated') {
            return { acknowledged: true, message: `Competency assessment updated — recording in audit trail` };
        }
        return { acknowledged: true, message: 'LMS event received' };
    }
}
