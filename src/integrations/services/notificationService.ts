import { getConnectionByProvider, writeLog, recordHealthCheck } from '../connectionStore';
import { providerRegistry } from '../providers/providerRegistry';
import type { ProviderId } from '../types';
// Ensure providers are registered
import '../providers/init';

/* ═══════════════════════════════════════════════════════════════
   Notification Service — Async event dispatcher
   ═══════════════════════════════════════════════════════════════
   Fire-and-forget: dispatches notifications to all active
   integration providers without blocking the caller.

   Usage:
   ```ts
   import { notify } from '../integrations/services/notificationService';
   notify(companyId, 'submission.created', { title, user_name, organization });
   ```

   The `notify()` function returns immediately and processes
   the notification asynchronously. Failures are logged to
   integration_logs — never thrown to the caller.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Fire-and-forget notification to all active providers.
 * Never throws — failures are logged silently.
 */
export function notify(
    companyId: string,
    eventType: string,
    data: Record<string, unknown>,
): void {
    // Run async — don't await
    _dispatchAll(companyId, eventType, data).catch(() => { });
}

/**
 * Notification dispatcher — sends to a specific provider.
 * Returns result for callers who need to know the outcome.
 */
export async function notifyProvider(
    companyId: string,
    providerId: ProviderId,
    eventType: string,
    data: Record<string, unknown>,
): Promise<{ sent: boolean; error?: string }> {
    try {
        const connection = await getConnectionByProvider(companyId, providerId);
        if (!connection || connection.status !== 'active') {
            return { sent: false, error: 'No active connection' };
        }

        const provider = providerRegistry.get(providerId);
        if (!provider) {
            return { sent: false, error: 'Provider not registered' };
        }

        const result = await provider.sendEvent(connection, eventType, data);

        await writeLog(
            companyId,
            connection.id,
            result.success ? 'sync.completed' : 'sync.failed',
            result.success ? 'info' : 'error',
            `${providerId}/${eventType}: ${result.success ? 'sent' : result.error}`,
            { eventType, ...data },
        );

        return { sent: result.success, error: result.error };
    } catch (err: any) {
        await writeLog(companyId, null, 'sync.failed', 'error',
            `Notification to ${providerId} failed: ${err.message}`, { eventType });
        return { sent: false, error: err.message };
    }
}

// ── Convenience methods for specific events ──────────────────

export function notifySubmissionCreated(companyId: string, data: {
    title: string;
    user_name: string;
    organization: string;
}): void {
    notify(companyId, 'submission.created', data);
}

export function notifyApproval(companyId: string, data: {
    title: string;
    user_name: string;
    organization: string;
}): void {
    notify(companyId, 'approval.approved', data);
}

export function notifyRejection(companyId: string, data: {
    title: string;
    user_name: string;
    organization: string;
    reason?: string;
}): void {
    notify(companyId, 'approval.rejected', data);
}

export function notifyExpiryWarning(companyId: string, data: {
    product_name: string;
    reg_number: string;
    expiry_date: string;
    days_left: number;
}): void {
    notify(companyId, 'expiry.warning', data);
}

export function notifyExpired(companyId: string, data: {
    product_name: string;
    reg_number: string;
    expiry_date: string;
}): void {
    notify(companyId, 'expiry.expired', data);
}

// ── Internal ─────────────────────────────────────────────────

async function _dispatchAll(
    companyId: string,
    eventType: string,
    data: Record<string, unknown>,
): Promise<void> {
    const providers = providerRegistry.getAll();

    for (const provider of providers) {
        try {
            const connection = await getConnectionByProvider(companyId, provider.id);
            if (!connection || connection.status !== 'active') continue;

            const result = await provider.sendEvent(connection, eventType, data);

            // Update health status based on result
            if (!result.success) {
                await recordHealthCheck(connection.id, false, result.error);
            }

            await writeLog(
                companyId,
                connection.id,
                result.success ? 'sync.completed' : 'sync.failed',
                result.success ? 'info' : 'error',
                `[${provider.id}] ${eventType}: ${result.success ? 'delivered' : result.error}`,
                { eventType, provider_id: provider.id },
            );
        } catch (err: any) {
            await writeLog(companyId, null, 'sync.failed', 'error',
                `[${provider.id}] ${eventType}: ${err.message}`, { eventType });
        }
    }
}
