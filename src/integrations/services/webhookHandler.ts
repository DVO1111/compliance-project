import type { WebhookEvent, ProviderId } from '../types';
import { getConnectionByProvider, writeLog } from '../connectionStore';
import { providerRegistry } from '../providers/providerRegistry';

/* ═══════════════════════════════════════════════════════════════
   Webhook Handler — Inbound webhook router
   ═══════════════════════════════════════════════════════════════
   Routes incoming webhook payloads to the correct provider handler.
   This is the single entry point for all inbound webhooks.

   In production, this would be called from an edge function or
   API route. For now, it's a callable function that can be
   invoked from anywhere.
   ═══════════════════════════════════════════════════════════════ */

export interface WebhookResult {
    acknowledged: boolean;
    message?: string;
    event?: WebhookEvent;
}

/**
 * Process an inbound webhook.
 *
 * @param companyId - The company the webhook is for
 * @param providerId - Which provider sent the webhook
 * @param eventType - Provider-specific event name (e.g., "message", "file.uploaded")
 * @param payload - Raw webhook payload
 */
export async function handleInboundWebhook(
    companyId: string,
    providerId: ProviderId,
    eventType: string,
    payload: Record<string, unknown>,
): Promise<WebhookResult> {
    // 1. Find the active connection for this provider + company
    const connection = await getConnectionByProvider(companyId, providerId);
    if (!connection) {
        await writeLog(companyId, null, 'webhook.received', 'warn',
            `Received webhook for ${providerId} but no active connection found`, { eventType });
        return { acknowledged: false, message: 'No active connection for this provider' };
    }

    if (connection.status !== 'active') {
        await writeLog(companyId, connection.id, 'webhook.received', 'warn',
            `Webhook received but connection status is "${connection.status}"`, { eventType });
        return { acknowledged: false, message: `Connection is ${connection.status}` };
    }

    // 2. Create the event record
    const event: WebhookEvent = {
        id: crypto.randomUUID(),
        direction: 'inbound',
        provider_id: providerId,
        connection_id: connection.id,
        event_type: eventType,
        payload,
        received_at: new Date().toISOString(),
    };

    // 3. Route to the provider handler
    const provider = providerRegistry.get(providerId);
    if (!provider) {
        await writeLog(companyId, connection.id, 'webhook.received', 'error',
            `No provider handler registered for "${providerId}"`, { eventType });
        return { acknowledged: false, message: 'Provider handler not found' };
    }

    try {
        const result = await provider.handleWebhook(connection, payload);
        await writeLog(companyId, connection.id, 'webhook.received', 'info',
            `Webhook processed: ${eventType}`, { eventType, acknowledged: result.acknowledged });
        return { ...result, event };
    } catch (err: any) {
        await writeLog(companyId, connection.id, 'webhook.received', 'error',
            `Webhook handler failed: ${err.message}`, { eventType, error: err.message });
        return { acknowledged: false, message: err.message };
    }
}

/**
 * Dispatch an outbound event to a provider.
 *
 * @example
 * ```ts
 * await dispatchOutboundEvent('company-123', 'slack', 'compliance.flagged', {
 *   documentTitle: 'Q1 Ad Campaign',
 *   flagCount: 3,
 * });
 * ```
 */
export async function dispatchOutboundEvent(
    companyId: string,
    providerId: ProviderId,
    eventType: string,
    data: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
    const connection = await getConnectionByProvider(companyId, providerId);
    if (!connection || connection.status !== 'active') {
        return { success: false, error: 'No active connection' };
    }

    const provider = providerRegistry.get(providerId);
    if (!provider) {
        return { success: false, error: 'Provider not registered' };
    }

    try {
        const result = await provider.sendEvent(connection, eventType, data);
        await writeLog(companyId, connection.id, 'webhook.dispatched',
            result.success ? 'info' : 'error',
            `Outbound ${eventType}: ${result.success ? 'sent' : result.error}`,
            { eventType, data });
        return result;
    } catch (err: any) {
        await writeLog(companyId, connection.id, 'webhook.dispatched', 'error',
            `Outbound dispatch failed: ${err.message}`, { eventType, error: err.message });
        return { success: false, error: err.message };
    }
}
