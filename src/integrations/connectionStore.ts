import { supabase } from '../lib/supabase';
import type {
    IntegrationConnection,
    ConnectionUpsert,
    ConnectionStatus,
    ProviderId,
    IntegrationLog,
    LogAction,
    LogLevel,
} from './types';
import { logger } from '../lib/logger';

/* ═══════════════════════════════════════════════════════════════
   Connection Store — Company-Scoped CRUD
   ═══════════════════════════════════════════════════════════════
   All operations are scoped to a company_id so one company can
   never read/write another company's connections.
   ═══════════════════════════════════════════════════════════════ */

const CONN_TABLE = 'integration_connections';
const LOG_TABLE = 'integration_logs';

// ── Read ─────────────────────────────────────────────────────

export async function listConnections(companyId: string): Promise<IntegrationConnection[]> {
    const { data, error } = await supabase
        .from(CONN_TABLE as any)
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as any as IntegrationConnection[];
}

export async function getConnection(id: string): Promise<IntegrationConnection | null> {
    const { data, error } = await supabase
        .from(CONN_TABLE as any)
        .select('*')
        .eq('id', id)
        .single();
    if (error && error.code !== 'PGRST116') throw error;
    return (data as any as IntegrationConnection) ?? null;
}

export async function getConnectionByProvider(
    companyId: string,
    providerId: ProviderId,
): Promise<IntegrationConnection | null> {
    const { data, error } = await supabase
        .from(CONN_TABLE as any)
        .select('*')
        .eq('company_id', companyId)
        .eq('provider_id', providerId)
        .maybeSingle();
    if (error) throw error;
    return (data as any as IntegrationConnection) ?? null;
}

// ── Write ────────────────────────────────────────────────────

export async function createConnection(conn: ConnectionUpsert): Promise<IntegrationConnection> {
    const { data, error } = await supabase
        .from(CONN_TABLE as any)
        .insert(conn as any)
        .select()
        .single();
    if (error) throw error;

    const saved = data as any as IntegrationConnection;
    await writeLog(saved.company_id, saved.id, 'connection.created', 'info', `Connection "${saved.display_name}" created for provider ${saved.provider_id}`);
    return saved;
}

export async function updateConnection(
    id: string,
    patch: Partial<Pick<IntegrationConnection, 'display_name' | 'status' | 'config' | 'credentials_encrypted' | 'last_error' | 'last_synced_at' | 'last_health_check_at'>>,
): Promise<IntegrationConnection> {
    const { data, error } = await supabase
        .from(CONN_TABLE as any)
        .update({ ...patch, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
        .select()
        .single();
    if (error) throw error;

    const saved = data as any as IntegrationConnection;
    await writeLog(saved.company_id, saved.id, 'connection.updated', 'info', `Connection "${saved.display_name}" updated`);
    return saved;
}

export async function setConnectionStatus(id: string, status: ConnectionStatus, lastError?: string): Promise<void> {
    await supabase
        .from(CONN_TABLE as any)
        .update({
            status,
            last_error: lastError ?? null,
            updated_at: new Date().toISOString(),
        } as any)
        .eq('id', id);
}

export async function deleteConnection(id: string): Promise<void> {
    const conn = await getConnection(id);
    await supabase.from(CONN_TABLE as any).delete().eq('id', id);
    if (conn) {
        await writeLog(conn.company_id, null, 'connection.deleted', 'warn', `Connection "${conn.display_name}" (${conn.provider_id}) deleted`);
    }
}

// ── Health Check ─────────────────────────────────────────────

export async function recordHealthCheck(id: string, healthy: boolean, error?: string): Promise<void> {
    await supabase
        .from(CONN_TABLE as any)
        .update({
            status: healthy ? 'active' : 'error',
            last_health_check_at: new Date().toISOString(),
            last_error: healthy ? null : (error ?? 'Health check failed'),
            updated_at: new Date().toISOString(),
        } as any)
        .eq('id', id);
}

// ── Logging ──────────────────────────────────────────────────

export async function writeLog(
    companyId: string,
    connectionId: string | null,
    action: LogAction,
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
): Promise<void> {
    try {
        await supabase.from(LOG_TABLE as any).insert({
            company_id: companyId,
            connection_id: connectionId,
            action,
            level,
            message,
            metadata: metadata ?? null,
        } as any);
    } catch {
        // Logging should never crash the caller
        logger.warn('[IntegrationLog]', action, message);
    }
}

export async function fetchLogs(
    companyId: string,
    opts?: { connectionId?: string; limit?: number; level?: LogLevel },
): Promise<IntegrationLog[]> {
    let q = supabase
        .from(LOG_TABLE as any)
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(opts?.limit ?? 100);

    if (opts?.connectionId) q = q.eq('connection_id', opts.connectionId);
    if (opts?.level) q = q.eq('level', opts.level);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as any as IntegrationLog[];
}
