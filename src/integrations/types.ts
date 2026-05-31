/* ═══════════════════════════════════════════════════════════════
   Integration Infrastructure — Core Types
   ═══════════════════════════════════════════════════════════════
   These types define the contracts that all future integration
   providers (Slack, Teams, Google Drive, Trello, etc.) must follow.
   ═══════════════════════════════════════════════════════════════ */

// ── Provider identity ────────────────────────────────────────

/** Unique key for each integration provider. Add new providers here. */
export type ProviderId =
    | 'slack'
    | 'microsoft_teams'
    | 'notion'
    | 'hubspot'
    | 'google_drive'
    | 'microsoft_365'
    | 'trello'
    | 'jira'
    | 'zapier'
    | 'webhook'
    | 'email_relay'
    | 'veeva_promomats'
    | 'adobe_aem'
    | 'veeva_rim'
    | 'pharmacovigilance'
    | 'healthcare_lms'
    | 'monday'
    | 'asana'
    | 'custom';

/** Category of what the integration does */
export type IntegrationCategory =
    | 'communication'   // Slack, Teams, Email
    | 'storage'         // Google Drive, OneDrive
    | 'project_mgmt'    // Trello, Jira
    | 'automation'      // Zapier, n8n
    | 'webhook'         // Generic inbound/outbound webhooks
    | 'pharma'          // Veeva, AEM, PV, LMS
    | 'custom';

// ── Connection ────────────────────────────────────────────────

/** The status lifecycle of a connection */
export type ConnectionStatus =
    | 'pending'       // Created but not yet authenticated
    | 'active'        // Connected and working
    | 'error'         // Last sync/health check failed
    | 'disabled'      // Manually turned off by user
    | 'revoked';      // Token revoked or expired beyond refresh

/** Persisted connection record — maps 1:1 to `integration_connections` table */
export interface IntegrationConnection {
    id: string;
    company_id: string;
    provider_id: ProviderId;
    display_name: string;
    status: ConnectionStatus;
    /** Encrypted token blob — never exposed to the frontend in cleartext */
    credentials_encrypted: string | null;
    /** Provider-specific config (webhook URL, channel ID, folder ID, etc.) */
    config: Record<string, unknown>;
    /** ISO timestamp of last successful data sync */
    last_synced_at: string | null;
    /** ISO timestamp of last health check */
    last_health_check_at: string | null;
    /** Human-readable error from last failed operation */
    last_error: string | null;
    created_by: string;
    created_at: string;
    updated_at: string;
}

/** Payload for creating/updating a connection (no id/timestamps) */
export type ConnectionUpsert = Omit<
    IntegrationConnection,
    'id' | 'created_at' | 'updated_at' | 'last_synced_at' | 'last_health_check_at' | 'last_error'
>;

// ── Logs ──────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error';
export type LogAction =
    | 'connection.created'
    | 'connection.updated'
    | 'connection.deleted'
    | 'connection.health_check'
    | 'sync.started'
    | 'sync.completed'
    | 'sync.failed'
    | 'webhook.received'
    | 'webhook.dispatched'
    | 'job.started'
    | 'job.completed'
    | 'job.failed'
    | 'job.retried';

/** Persisted log entry — maps 1:1 to `integration_logs` table */
export interface IntegrationLog {
    id: string;
    company_id: string;
    connection_id: string | null;
    action: LogAction;
    level: LogLevel;
    message: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

// ── Provider contract ────────────────────────────────────────

/** Describes a provider for the integrations marketplace/settings UI */
export interface ProviderManifest {
    id: ProviderId;
    name: string;
    description: string;
    category: IntegrationCategory;
    iconUrl?: string;
    featured?: boolean;
    users?: number;
    likes?: number;
    /** Whether this provider supports automated GRC control checks */
    supportsAutomation?: boolean;
    /** Whether this provider requires OAuth (deferred — always false for now) */
    requiresOAuth: boolean;
    /** Config fields the user must fill in when connecting */
    configSchema: ConfigField[];
}

export interface ConfigField {
    key: string;
    label: string;
    type: 'text' | 'url' | 'select' | 'toggle';
    required: boolean;
    placeholder?: string;
    options?: { label: string; value: string }[];
    helpText?: string;
}

// ── Webhook ──────────────────────────────────────────────────

export type WebhookDirection = 'inbound' | 'outbound';

export interface WebhookEvent {
    id: string;
    direction: WebhookDirection;
    provider_id: ProviderId;
    connection_id: string;
    event_type: string;
    payload: Record<string, unknown>;
    received_at: string;
}

// ── Job Runner ───────────────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Job<TPayload = unknown> {
    id: string;
    name: string;
    connection_id: string;
    status: JobStatus;
    payload: TPayload;
    attempts: number;
    max_attempts: number;
    last_error: string | null;
    /** Exponential backoff interval in ms */
    retry_delay_ms: number;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
}

export interface JobResult<TResult = unknown> {
    success: boolean;
    result?: TResult;
    error?: string;
}
