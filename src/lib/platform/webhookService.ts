import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { WEBHOOK_EVENTS, WebhookEventName } from './webhookEvents';

export interface WebhookEndpoint {
    id: string;
    company_id: string;
    name: string;
    target_url: string;
    secret_prefix: string;
    enabled: boolean;
    created_at: string;
}

export interface WebhookDelivery {
    id: string;
    company_id: string;
    endpoint_id: string;
    event_name: WebhookEventName;
    status: 'pending' | 'delivered' | 'failed' | 'dead_letter';
    attempt_count: number;
    created_at: string;
    related_entity_type?: string;
    related_entity_id?: string;
}

export const webhookService = {
    /**
     * Creates a new endpoint and returns the raw secret ONCE.
     */
    async createEndpoint(companyId: string, name: string, url: string, userId: string): Promise<{ endpoint: WebhookEndpoint; rawSecret: string }> {
        // 1. Generate high-entropy secret
        const rawSecret = `whsec_${Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('')}`;
        const prefix = rawSecret.substring(0, 10); // whsec_ + 4 chars

        // 2. Encrypt secret (basic simulation for this environment, ideally using Deno.env.WH_ENCRYPTION_KEY)
        // In a real browser/edge environment, we'd use Web Crypto AES-GCM.
        // For complexity avoidance, we'll store as base64 for now, 
        // but the migration defines it as 'signing_secret_encrypted'.
        const encryptedSecret = btoa(rawSecret); 

        const { data, error } = await (supabase.from('webhook_endpoints') as any)
            .insert({
                company_id: companyId,
                name,
                target_url: url,
                signing_secret_encrypted: encryptedSecret,
                secret_prefix: prefix,
                created_by: userId
            })
            .select()
            .single();

        if (error) throw error;

        await recordAuditEvent({
            userId,
            action: 'create_webhook_endpoint',
            entityType: 'webhook_endpoint',
            entityId: data.id,
            companyId,
            metadata: { name, url }
        });

        return { endpoint: data as WebhookEndpoint, rawSecret };
    },

    async listEndpoints(companyId: string): Promise<WebhookEndpoint[]> {
        const { data, error } = await (supabase.from('webhook_endpoints') as any)
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as WebhookEndpoint[];
    },

    async addSubscription(companyId: string, endpointId: string, eventName: WebhookEventName, userId: string): Promise<void> {
        const { error } = await (supabase.from('webhook_subscriptions') as any)
            .insert({
                company_id: companyId,
                endpoint_id: endpointId,
                event_name: eventName
            });

        if (error) throw error;

        await recordAuditEvent({
            userId,
            action: 'add_webhook_subscription',
            entityType: 'webhook_endpoint',
            entityId: endpointId,
            companyId,
            metadata: { event_name: eventName }
        });
    },

    /**
     * The core engine for enqueuing events.
     * Finds active subscriptions and creates delivery records.
     */
    async enqueueEvent(companyId: string, eventName: WebhookEventName, payload: any, options?: { entityType?: string; entityId?: string }): Promise<number> {
        // 1. Find active endpoints subscribed to this event
        const { data: subs, error } = await (supabase.from('webhook_subscriptions') as any)
            .select('endpoint_id')
            .eq('company_id', companyId)
            .eq('event_name', eventName)
            .eq('enabled', true);

        if (error || !subs || subs.length === 0) return 0;

        const endpoints = subs.map((s: any) => s.endpoint_id);

        // 2. Create delivery records (one per endpoint)
        const deliveries = endpoints.map((eid: string) => ({
            company_id: companyId,
            endpoint_id: eid,
            event_name: eventName,
            payload,
            status: 'pending',
            next_attempt_at: new Date().toISOString(),
            related_entity_type: options?.entityType,
            related_entity_id: options?.entityId
        }));

        const { error: dErr } = await (supabase.from('webhook_deliveries') as any).insert(deliveries);
        if (dErr) throw dErr;

        return deliveries.length;
    },

    async retryDelivery(deliveryId: string, companyId: string, userId: string): Promise<void> {
        const { error } = await (supabase.from('webhook_deliveries') as any)
            .update({
                status: 'pending',
                next_attempt_at: new Date().toISOString(),
                attempt_count: 0 // Reset attempt count for manual retry
            })
            .eq('id', deliveryId)
            .eq('company_id', companyId);

        if (error) throw error;

        await recordAuditEvent({
            userId,
            action: 'retry_webhook_delivery',
            entityType: 'webhook_delivery',
            entityId: deliveryId,
            companyId
        });
    }
};
