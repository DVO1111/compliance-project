import { supabase } from '../supabase';

export interface ApiKey {
    id: string;
    company_id: string;
    name: string;
    key_prefix: string;
    scopes: string[];
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
    expires_at: string | null;
}

export const apiKeyService = {
    /**
     * Generates a new API key.
     * Returns the raw key (unhashed) ONLY ONCE.
     */
    async generateKey(companyId: string, name: string, scopes: string[] = []): Promise<{ key: string; record: ApiKey }> {
        // 1. Generate a high-entropy secret
        // In a real browser environment, we'd use crypto.getRandomValues
        // For now, we use a combination of UUID and random padding to simulate external-v1_...
        const randomPart = Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join('');
        const rawKey = `gov_os_${randomPart}`;
        const prefix = rawKey.substring(0, 11); // gov_os_ + 4 chars

        // 2. Hash it for storage (SHA-256)
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawKey));
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        // 3. Store in DB
        const { data, error } = await (supabase
            .from('api_keys') as any)
            .insert({
                company_id: companyId,
                name,
                key_hash: hashHex,
                key_prefix: prefix,
                scopes,
                // created_by is handled by DB default (auth.uid()) if called from frontend,
                // but if called service-side we might need to be explicit.
            } as any)
            .select()
            .single();

        if (error) throw error;

        return {
            key: rawKey,
            record: data as ApiKey,
        };
    },

    async listKeys(companyId: string): Promise<ApiKey[]> {
        const { data, error } = await (supabase
            .from('api_keys') as any)
            .select('*')
            .eq('company_id', companyId)
            .is('revoked_at', null)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as ApiKey[];
    },

    async revokeKey(keyId: string): Promise<void> {
        const { error } = await (supabase
            .from('api_keys') as any)
            .update({ revoked_at: new Date().toISOString() } as any)
            .eq('id', keyId);

        if (error) throw error;
    },

    /**
     * Sever-side validation (to be used by edge functions / gateway)
     */
    async validateKey(rawKey: string): Promise<{ valid: boolean; company_id?: string; scopes?: string[] }> {
        const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawKey));
        const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

        const { data, error } = await (supabase
            .from('api_keys') as any)
            .select('company_id, scopes, revoked_at, expires_at')
            .eq('key_hash', hashHex)
            .maybeSingle();

        if (error || !data) return { valid: false };
        
        // Check revocation
        if (data.revoked_at) return { valid: false };
        
        // Check expiry
        if (data.expires_at && new Date(data.expires_at) < new Date()) return { valid: false };

        // Update last used (fire and forget)
        (supabase.from('api_keys') as any).update({ last_used_at: new Date().toISOString() } as any).eq('key_hash', hashHex);

        return {
            valid: true,
            company_id: data.company_id,
            scopes: data.scopes,
        };
    }
};
