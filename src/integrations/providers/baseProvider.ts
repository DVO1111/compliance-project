import type { ProviderManifest, IntegrationConnection, ConfigField } from '../types';

/* ═══════════════════════════════════════════════════════════════
   Base Provider — Abstract contract
   ═══════════════════════════════════════════════════════════════
   Every integration provider (Slack, Teams, etc.) will extend
   this class and implement the abstract methods.

   This is the foundation layer only — actual provider
   implementations will come later.
   ═══════════════════════════════════════════════════════════════ */

export abstract class BaseProvider {
    abstract readonly manifest: ProviderManifest;

    /** Return the provider's unique ID */
    get id() {
        return this.manifest.id;
    }

    /** Return the config fields the user must fill in */
    get configSchema(): ConfigField[] {
        return this.manifest.configSchema;
    }

    /**
     * Validate user-supplied config before saving the connection.
     * Override in subclasses for provider-specific validation.
     */
    validateConfig(config: Record<string, unknown>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        for (const field of this.configSchema) {
            if (field.required && !config[field.key]) {
                errors.push(`${field.label} is required`);
            }
        }
        return { valid: errors.length === 0, errors };
    }

    /**
     * Test whether the connection is healthy.
     * Override in subclasses to ping the provider's API.
     * Returns true if the connection is working.
     */
    async healthCheck(_connection: IntegrationConnection): Promise<{ healthy: boolean; error?: string }> {
        // Default: assume healthy (providers override this)
        return { healthy: true };
    }

    /**
     * Handle an inbound webhook event from this provider.
     * Override in subclasses to process provider-specific payloads.
     */
    async handleWebhook(
        _connection: IntegrationConnection,
        _payload: Record<string, unknown>,
    ): Promise<{ acknowledged: boolean; message?: string }> {
        return { acknowledged: true, message: 'No handler implemented' };
    }

    /**
     * Send an outbound notification/event to this provider.
     * Override in subclasses to send messages, create cards, etc.
     */
    async sendEvent(
        _connection: IntegrationConnection,
        _eventType: string,
        _data: Record<string, unknown>,
    ): Promise<{ success: boolean; error?: string }> {
        return { success: false, error: 'sendEvent not implemented for this provider' };
    }

    /**
     * Run an automated GRC control check.
     * Override in subclasses to implement provider-specific automation logic.
     */
    async runAutomationCheck(_args: AutomationCheckArgs): Promise<AutomationCheckResult> {
        return {
            status: 'error',
            result: null,
            payload: {},
            errorMessage: 'Automation check not implemented for this provider',
            observedAt: new Date().toISOString(),
        };
    }
}

export interface AutomationCheckArgs {
    connection: IntegrationConnection;
    checkType: string;
    configuration: Record<string, unknown>;
    companyId: string;
}

export interface AutomationCheckResult {
    status: 'success' | 'failed' | 'error';
    result: 'pass' | 'fail' | 'warning' | null;
    payload: Record<string, unknown>;
    errorMessage?: string;
    observedAt: string; // ISO timestamp
}
