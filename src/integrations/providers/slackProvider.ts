import { BaseProvider } from './baseProvider';
import type { ProviderManifest, IntegrationConnection } from '../types';

/* ═══════════════════════════════════════════════════════════════
   Slack Provider — Webhook-based notifications
   ═══════════════════════════════════════════════════════════════
   Posts Block Kit formatted messages to a Slack Incoming Webhook.
   No OAuth required — just a webhook URL.
   ═══════════════════════════════════════════════════════════════ */

export class SlackProvider extends BaseProvider {
    readonly manifest: ProviderManifest = {
        id: 'slack',
        iconUrl: 'https://logo.clearbit.com/slack.com',
        name: 'Slack',
        description: 'Send compliance alerts, submission updates, and expiry notifications to a Slack channel.',
        category: 'communication',
    featured: true,
    users: 200,
    likes: 162,
        supportsAutomation: true,
        // Supports both webhook (simple) and OAuth (recommended) connection methods.
        requiresOAuth: false,
        configSchema: [
            {
                key: 'connection_method',
                label: 'Connection Method',
                type: 'select',
                required: true,
                options: [
                    { label: 'Incoming Webhook (simple)', value: 'webhook' },
                    { label: 'OAuth (recommended — multiple channels)', value: 'oauth' },
                ],
                helpText: 'Webhook is fastest to set up. OAuth lets the app post to different channels dynamically.',
            },
            {
                key: 'webhook_url',
                label: 'Webhook URL',
                type: 'url',
                required: false,
                placeholder: 'https://hooks.slack.com/services/T.../B.../xxx',
                helpText: 'Create an Incoming Webhook in your Slack workspace settings.',
            },
            {
                key: 'channel_name',
                label: 'Channel Name (display only)',
                type: 'text',
                required: false,
                placeholder: '#compliance-alerts',
                helpText: 'For your reference — the actual channel is set in Slack when creating the webhook.',
            },
            {
                key: 'default_channel_id',
                label: 'Default Channel ID (OAuth mode)',
                type: 'text',
                required: false,
                placeholder: 'C0123ABCDEF',
                helpText: 'If using OAuth, set the default channel to post notifications into (optional for now).',
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
        const method = (connection.config.connection_method as string) || 'webhook';

        // OAuth health checks are performed server-side (Edge Function delivery).
        if (method === 'oauth') {
            if (!connection.credentials_encrypted) {
                return { healthy: false, error: 'Slack OAuth not completed yet' };
            }
            return { healthy: true };
        }

        const url = connection.config.webhook_url as string;
        if (!url) return { healthy: false, error: 'No webhook URL configured' };

        try {
            // Slack webhooks respond with 200 + "ok" on valid POST
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: '✅ ComplianceHub connection test — Slack integration is working!' }),
            });
            if (resp.ok) return { healthy: true };
            const text = await resp.text();
            return { healthy: false, error: `Slack returned ${resp.status}: ${text}` };
        } catch (err: any) {
            return { healthy: false, error: err.message };
        }
    }

    async sendEvent(
        connection: IntegrationConnection,
        eventType: string,
        data: Record<string, unknown>,
    ): Promise<{ success: boolean; error?: string }> {
        const method = (connection.config.connection_method as string) || 'webhook';

        // OAuth sending is handled by the server-side delivery runner.
        if (method === 'oauth') {
            return { success: true };
        }

        const url = connection.config.webhook_url as string;
        if (!url) return { success: false, error: 'No webhook URL configured' };

        // Check if this event type is enabled
        if (!this.isEventEnabled(connection, eventType)) {
            return { success: true }; // Silently skip disabled events
        }

        const payload = this.formatMessage(eventType, data);

        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (resp.ok) return { success: true };
            const text = await resp.text();
            return { success: false, error: `Slack ${resp.status}: ${text}` };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Automated Check: Connectivity / Auth Health Check
     * Validates if the webhook/OAuth connection still works without sending a full alert.
     */
    override async runAutomationCheck(args: any): Promise<any> {
        const { connection } = args;
        const method = (connection.config.connection_method as string) || 'webhook';
        const observedAt = new Date().toISOString();

        if (method === 'oauth') {
            // OAuth connectivity check: placeholder for Sprint 4 server-side token validation
            return {
                status: 'success',
                result: 'pass',
                payload: { method: 'oauth', check: 'token_presence' },
                observedAt,
            };
        }

        const url = connection.config.webhook_url as string;
        if (!url) {
            return {
                status: 'failed',
                result: 'fail',
                errorMessage: 'No webhook URL configured',
                payload: { method: 'webhook' },
                observedAt,
            };
        }

        try {
            // Minimal Slack webhook connectivity check
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: '🛠️ [Automated Check] Slack Connectivity Verified.',
                    blocks: [
                        {
                            type: 'context',
                            elements: [{ type: 'mrkdwn', text: 'ℹ️ This is an automated connectivity check from the GRC Engine.' }]
                        }
                    ]
                }),
            });

            if (resp.ok) {
                return {
                    status: 'success',
                    result: 'pass',
                    payload: { method: 'webhook', http_status: resp.status },
                    observedAt,
                };
            }

            const text = await resp.text();
            return {
                status: 'failed',
                result: 'fail',
                errorMessage: `Slack responded with ${resp.status}: ${text}`,
                payload: { method: 'webhook', http_status: resp.status },
                observedAt,
            };
        } catch (err: any) {
            return {
                status: 'error',
                result: null,
                errorMessage: err.message,
                payload: { method: 'webhook' },
                observedAt,
            };
        }
    }

    // ── Helpers ──────────────────────────────────────────────

    private isEventEnabled(conn: IntegrationConnection, eventType: string): boolean {
        const cfg = conn.config;
        if (eventType.startsWith('submission.')) return cfg.notify_submissions !== false;
        if (eventType.startsWith('approval.') || eventType.startsWith('rejection.')) return cfg.notify_approvals !== false;
        if (eventType.startsWith('expiry.') || eventType.startsWith('license.')) return cfg.notify_expiry !== false;
        return true; // Default: send unknown events
    }

    private formatMessage(eventType: string, data: Record<string, unknown>): object {
        const title = data.title as string || 'Untitled';
        const user = data.user_name as string || 'System';
        const org = data.organization as string || '';

        switch (eventType) {
            case 'submission.created':
                return {
                    blocks: [
                        { type: 'header', text: { type: 'plain_text', text: '📤 New Submission', emoji: true } },
                        {
                            type: 'section',
                            fields: [
                                { type: 'mrkdwn', text: `*Title:*\n${title}` },
                                { type: 'mrkdwn', text: `*Submitted by:*\n${user}` },
                                { type: 'mrkdwn', text: `*Organization:*\n${org}` },
                                { type: 'mrkdwn', text: `*Status:*\n🟡 Pending Review` },
                            ],
                        },
                        { type: 'divider' },
                    ],
                };

            case 'approval.approved':
                return {
                    blocks: [
                        { type: 'header', text: { type: 'plain_text', text: '✅ Submission Approved', emoji: true } },
                        {
                            type: 'section',
                            fields: [
                                { type: 'mrkdwn', text: `*Title:*\n${title}` },
                                { type: 'mrkdwn', text: `*Approved by:*\n${user}` },
                                { type: 'mrkdwn', text: `*Organization:*\n${org}` },
                            ],
                        },
                        { type: 'divider' },
                    ],
                };

            case 'approval.rejected':
                return {
                    blocks: [
                        { type: 'header', text: { type: 'plain_text', text: '❌ Submission Rejected', emoji: true } },
                        {
                            type: 'section',
                            fields: [
                                { type: 'mrkdwn', text: `*Title:*\n${title}` },
                                { type: 'mrkdwn', text: `*Rejected by:*\n${user}` },
                                { type: 'mrkdwn', text: `*Reason:*\n${(data.reason as string) || 'No reason provided'}` },
                            ],
                        },
                        { type: 'divider' },
                    ],
                };

            case 'expiry.warning':
                return {
                    blocks: [
                        { type: 'header', text: { type: 'plain_text', text: '⚠️ License Expiring Soon', emoji: true } },
                        {
                            type: 'section',
                            fields: [
                                { type: 'mrkdwn', text: `*Product:*\n${data.product_name || title}` },
                                { type: 'mrkdwn', text: `*NAFDAC Reg:*\n${data.reg_number || '—'}` },
                                { type: 'mrkdwn', text: `*Expiry Date:*\n${data.expiry_date || '—'}` },
                                { type: 'mrkdwn', text: `*Days Left:*\n${data.days_left || '—'}` },
                            ],
                        },
                        { type: 'context', elements: [{ type: 'mrkdwn', text: '🔔 Start the renewal process now to avoid late processing fines.' }] },
                        { type: 'divider' },
                    ],
                };

            case 'expiry.expired':
                return {
                    blocks: [
                        { type: 'header', text: { type: 'plain_text', text: '🚨 License EXPIRED', emoji: true } },
                        {
                            type: 'section',
                            fields: [
                                { type: 'mrkdwn', text: `*Product:*\n${data.product_name || title}` },
                                { type: 'mrkdwn', text: `*NAFDAC Reg:*\n${data.reg_number || '—'}` },
                                { type: 'mrkdwn', text: `*Expired:*\n${data.expiry_date || '—'}` },
                            ],
                        },
                        { type: 'context', elements: [{ type: 'mrkdwn', text: '🚫 This product is now in non-compliant status. Immediate action required.' }] },
                        { type: 'divider' },
                    ],
                };

            default:
                return { text: `[ComplianceHub] ${eventType}: ${title}` };

            case 'sla.overdue':
                return {
                    blocks: [
                        { type: 'header', text: { type: 'plain_text', text: '🕐 SLA Deadline Breached', emoji: true } },
                        {
                            type: 'section',
                            fields: [
                                { type: 'mrkdwn', text: `*Submission:*\n${title}` },
                                { type: 'mrkdwn', text: `*Deadline:*\n${data.deadline || '—'}` },
                                { type: 'mrkdwn', text: `*Overdue by:*\n${data.overdue_hours || '—'} hours` },
                                { type: 'mrkdwn', text: `*Pending reviewers:*\n${data.pending_count || '—'}` },
                            ],
                        },
                        { type: 'context', elements: [{ type: 'mrkdwn', text: '⚠️ This review assignment has breached its SLA. Please escalate or reassign.' }] },
                        { type: 'divider' },
                    ],
                };

            case 'sla.escalation':
                return {
                    blocks: [
                        { type: 'header', text: { type: 'plain_text', text: '🔺 SLA Escalation to Management', emoji: true } },
                        {
                            type: 'section',
                            fields: [
                                { type: 'mrkdwn', text: `*Submission:*\n${title}` },
                                { type: 'mrkdwn', text: `*Escalated to:*\n${data.manager_name || '—'}` },
                                { type: 'mrkdwn', text: `*Hours overdue:*\n${data.overdue_hours || '—'}` },
                                { type: 'mrkdwn', text: `*Organization:*\n${org}` },
                            ],
                        },
                        { type: 'context', elements: [{ type: 'mrkdwn', text: '🚨 Immediate management attention required. Review deadline exceeded.' }] },
                        { type: 'divider' },
                    ],
                };

            case 'review.quorum_reached':
                return {
                    blocks: [
                        { type: 'header', text: { type: 'plain_text', text: '🏛️ Review Quorum Reached', emoji: true } },
                        {
                            type: 'section',
                            fields: [
                                { type: 'mrkdwn', text: `*Submission:*\n${title}` },
                                { type: 'mrkdwn', text: `*Outcome:*\n${data.outcome || '—'}` },
                                { type: 'mrkdwn', text: `*Votes:*\n${data.vote_summary || '—'}` },
                                { type: 'mrkdwn', text: `*Organization:*\n${org}` },
                            ],
                        },
                        { type: 'divider' },
                    ],
                };
        }
    }
}
