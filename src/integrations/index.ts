/* ═══════════════════════════════════════════════════════════════
   Integration Infrastructure — Barrel Exports
   ═══════════════════════════════════════════════════════════════
   Single import point for the integrations module:

   import {
     type IntegrationConnection,
     listConnections,
     createConnection,
     handleInboundWebhook,
     enqueueJob,
     providerRegistry,
   } from '../integrations';
   ═══════════════════════════════════════════════════════════════ */

// ── Types ────────────────────────────────────────────────────
export type {
    ProviderId,
    IntegrationCategory,
    ConnectionStatus,
    IntegrationConnection,
    ConnectionUpsert,
    IntegrationLog,
    LogLevel,
    LogAction,
    ProviderManifest,
    ConfigField,
    WebhookDirection,
    WebhookEvent,
    JobStatus,
    Job,
    JobResult,
} from './types';

// ── Connection Store ─────────────────────────────────────────
export {
    listConnections,
    getConnection,
    getConnectionByProvider,
    createConnection,
    updateConnection,
    setConnectionStatus,
    deleteConnection,
    recordHealthCheck,
    writeLog,
    fetchLogs,
} from './connectionStore';

// ── Provider System ──────────────────────────────────────────
export { BaseProvider } from './providers/baseProvider';
export { providerRegistry } from './providers/providerRegistry';

// ── Services ─────────────────────────────────────────────────
export {
    handleInboundWebhook,
    dispatchOutboundEvent,
} from './services/webhookHandler';

export {
    registerExecutor,
    enqueueJob,
    runJob,
    cancelJob,
    getJobQueue,
    getJob,
    processQueue,
} from './services/jobRunner';

// ── Notification Service ─────────────────────────────────────
export {
    notify,
    notifyProvider,
    notifySubmissionCreated,
    notifyApproval,
    notifyRejection,
    notifyExpiryWarning,
    notifyExpired,
} from './services/notificationService';

// ── Providers ────────────────────────────────────────────────
export { SlackProvider } from './providers/slackProvider';
export { NotionProvider } from './providers/notionProvider';
export { HubSpotProvider } from './providers/hubspotProvider';

// Register all providers on first import
import './providers/init';
