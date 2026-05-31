import { BaseProvider } from './baseProvider';
import type { ProviderManifest, IntegrationConnection } from '../types';

/* ═══════════════════════════════════════════════════════════════
   Generic Webhook Provider — Outbound webhook delivery
   ═══════════════════════════════════════════════════════════════
   Sends JSON payloads to any HTTPS endpoint (Zapier/Make/n8n/custom).

   - No OAuth required
   - Optional HMAC-SHA256 signing header
   - Designed to be safe: failures never throw to the caller
   ═══════════════════════════════════════════════════════════════ */

export class WebhookProvider extends BaseProvider {
    readonly manifest: ProviderManifest = {
        id: 'webhook',
        iconUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=webhook&backgroundColor=0B0F19',
        name: 'Generic Webhook',
        description:
            'Send compliance events to any webhook endpoint (Zapier, Make, n8n, internal services).',
        category: 'webhook',
    featured: false,
    users: 345,
    likes: 147,
        requiresOAuth: false,
        configSchema: [
            {
                key: 'webhook_url',
                label: 'Webhook URL',
                type: 'url',
                required: true,
                placeholder: 'https://hooks.zapier.com/hooks/catch/.../.../',
                helpText: 'The endpoint that will receive JSON events from your workspace.',
            },
            {
                key: 'webhook_secret',
                label: 'Signing Secret (optional)',
                type: 'text',
                required: false,
                placeholder: 'A shared secret for request signing',
                helpText:
                    'If provided, we include an HMAC-SHA256 signature in the x-criateur-signature header.',
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
            {
                key: 'notify_expiry',
                label: 'Notify on license expiry alerts',
                type: 'toggle',
                required: false,
            },
        ],
    };

    async healthCheck(connection: IntegrationConnection): Promise<{ healthy: boolean; error?: string }> {
        const url = (connection.config.webhook_url as string) || '';
        if (!url) return { healthy: false, error: 'No webhook URL configured' };

        try {
            // Most webhook endpoints accept any JSON and return 2xx.
            const timestamp = new Date().toISOString();
            const bodyStr = JSON.stringify({
                event_type: 'healthcheck.ping',
                occurred_at: timestamp,
                company_id: connection.company_id,
                connection_id: connection.id,
                message: '✅ ComplianceHub connection test — webhook integration is working!',
            });

            const headers: Record<string, string> = {
                'content-type': 'application/json',
                'x-company-id': connection.company_id,
                'x-company-timestamp': timestamp,
                // keep existing ecosystem headers
                'x-criateur-company-id': connection.company_id,
                'x-criateur-connection-id': connection.id,
                'x-criateur-event': 'healthcheck.ping',
                'x-criateur-timestamp': timestamp,
            };

            const secret = (connection.config.webhook_secret as string) || '';
            if (secret) {
                headers['x-company-signature'] = await hmacSha256Hex(
                    secret,
                    `${connection.company_id}.${timestamp}.${bodyStr}`,
                );
            }

            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: bodyStr,
            });
            if (res.ok) return { healthy: true };
            const text = await res.text();
            return { healthy: false, error: `Webhook returned ${res.status}: ${text?.slice(0, 300)}` };
        } catch (err: any) {
            return { healthy: false, error: err?.message ?? String(err) };
        }
    }

    async sendEvent(
        connection: IntegrationConnection,
        eventType: string,
        data: Record<string, unknown>,
    ): Promise<{ success: boolean; error?: string }> {
        const url = (connection.config.webhook_url as string) || '';
        if (!url) return { success: false, error: 'No webhook URL configured' };

        if (!this.isEventEnabled(connection, eventType)) {
            return { success: true }; // Skip silently
        }

        const payload = {
            event_type: eventType,
            occurred_at: new Date().toISOString(),
            connection_id: connection.id,
            company_id: connection.company_id,
            data,
        };

        const timestamp = new Date().toISOString();
        const bodyStr = JSON.stringify(payload);
        const secret = (connection.config.webhook_secret as string) || '';

        try {
            const headers: Record<string, string> = {
                'content-type': 'application/json',
                'x-criateur-event': eventType,
                'x-criateur-connection-id': connection.id,
                'x-criateur-company-id': connection.company_id,
                'x-criateur-timestamp': timestamp,
                'x-company-id': connection.company_id,
                'x-company-timestamp': timestamp,
            };

            if (secret) {
                headers['x-criateur-signature'] = await hmacSha256Hex(secret, `${timestamp}.${bodyStr}`);
                headers['x-company-signature'] = await hmacSha256Hex(
                    secret,
                    `${connection.company_id}.${timestamp}.${bodyStr}`,
                );
            }

            const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
            if (res.ok) return { success: true };
            const text = await res.text();
            return { success: false, error: `Webhook ${res.status}: ${text?.slice(0, 500)}` };
        } catch (err: any) {
            return { success: false, error: err?.message ?? String(err) };
        }
    }

    private isEventEnabled(conn: IntegrationConnection, eventType: string): boolean {
        const cfg = conn.config;
        if (eventType.startsWith('submission.')) return cfg.notify_submissions !== false;
        if (eventType.startsWith('approval.') || eventType.startsWith('rejection.')) return cfg.notify_approvals !== false;
        if (eventType.startsWith('expiry.') || eventType.startsWith('license.')) return cfg.notify_expiry !== false;
        return true;
    }
}

// ── Crypto helper (browser-safe) ─────────────────────────────

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
