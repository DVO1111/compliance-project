import { supabase } from '../supabase';

export interface AIDashboardSummary {
    totalAssets: number;
    totalUsage: number;
    flaggedEvents: number;
    openIncidents: number;
    pendingReviews: number;
    pendingPrompts: number;
}

export interface AIUsageTrend {
    date: string;
    total: number;
    flagged: number;
}

export interface AIProviderBreakdown {
    provider: string;
    model: string;
    invocations: number;
    avgLatency: number;
}

export interface AIStatusMetric {
    status: string;
    count: number;
}

export const aiDashboardService = {
    async getSummary(companyId: string, _filters: any): Promise<AIDashboardSummary> {
        const [assets, usage, flagged, incidents, reviews, prompts] = await Promise.all([
            supabase.from('ai_assets').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
            supabase.from('ai_usage_logs').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
            supabase.from('ai_usage_logs').select('id', { count: 'exact', head: true }).eq('company_id', companyId).filter('risk_flags', 'neq', '{}'),
            supabase.from('ai_incidents').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['open', 'investigating', 'escalated']),
            supabase.from('ai_output_reviews').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'pending'),
            supabase.from('ai_prompt_templates').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'in_review')
        ]);

        return {
            totalAssets: assets.count || 0,
            totalUsage: usage.count || 0,
            flaggedEvents: flagged.count || 0,
            openIncidents: incidents.count || 0,
            pendingReviews: reviews.count || 0,
            pendingPrompts: prompts.count || 0
        };
    },

    async getUsageTrends(companyId: string, _filters: any): Promise<AIUsageTrend[]> {
        // In a real high-volume scenario, this would be a grouped SQL query via RPC or a view.
        // For now, we aggregate in JS or assume a reasonable window.
        const { data } = await supabase
            .from('ai_usage_logs')
            .select('created_at, risk_flags')
            .eq('company_id', companyId)
            .order('created_at', { ascending: true }) as { data: any[] | null };

        if (!data) return [];

        const trends: Record<string, AIUsageTrend> = {};
        data.forEach((log: any) => {
            const date = log.created_at.split('T')[0];
            if (!trends[date]) {
                trends[date] = { date, total: 0, flagged: 0 };
            }
            trends[date].total++;
            if (Object.keys(log.risk_flags || {}).length > 0) {
                trends[date].flagged++;
            }
        });

        return Object.values(trends);
    },

    async getProviderBreakdown(companyId: string): Promise<AIProviderBreakdown[]> {
        const { data } = await supabase
            .from('ai_usage_logs')
            .select('provider_name, model_name, performance')
            .eq('company_id', companyId) as { data: any[] | null };

        if (!data) return [];

        const breakdown: Record<string, AIProviderBreakdown> = {};
        data.forEach((log: any) => {
            const key = `${log.provider_name}:${log.model_name}`;
            if (!breakdown[key]) {
                breakdown[key] = { 
                    provider: log.provider_name, 
                    model: log.model_name, 
                    invocations: 0, 
                    avgLatency: 0 
                };
            }
            breakdown[key].invocations++;
            const latency = (log.performance as any)?.latency_ms || 0;
            breakdown[key].avgLatency = (breakdown[key].avgLatency * (breakdown[key].invocations - 1) + latency) / breakdown[key].invocations;
        });

        return Object.values(breakdown);
    },

    async getIncidentMetrics(companyId: string): Promise<AIStatusMetric[]> {
        const { data } = await supabase
            .from('ai_incidents')
            .select('severity')
            .eq('company_id', companyId) as { data: any[] | null };

        if (!data) return [];

        const counts: Record<string, number> = {};
        data.forEach((i: any) => {
            counts[i.severity] = (counts[i.severity] || 0) + 1;
        });

        return Object.entries(counts).map(([status, count]) => ({ status, count }));
    },

    async getReviewMetrics(companyId: string): Promise<AIStatusMetric[]> {
        const { data } = await supabase
            .from('ai_output_reviews')
            .select('status')
            .eq('company_id', companyId) as { data: any[] | null };

        if (!data) return [];

        const counts: Record<string, number> = {};
        data.forEach((r: any) => {
            counts[r.status] = (counts[r.status] || 0) + 1;
        });

        return Object.entries(counts).map(([status, count]) => ({ status, count }));
    },

    async getPromptMetrics(companyId: string): Promise<AIStatusMetric[]> {
        const { data } = await supabase
            .from('ai_prompt_templates')
            .select('status')
            .eq('company_id', companyId) as { data: any[] | null };

        if (!data) return [];

        const counts: Record<string, number> = {};
        data.forEach((p: any) => {
            counts[p.status] = (counts[p.status] || 0) + 1;
        });

        return Object.entries(counts).map(([status, count]) => ({ status, count }));
    },

    async getAssetCoverage(companyId: string): Promise<{ covered: number; total: number }> {
        const [assets, controls] = await Promise.all([
            supabase.from('ai_assets').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
            supabase.from('ai_asset_controls').select('asset_id').eq('company_id', companyId)
        ]);

        const uniqueCoveredAssets = new Set((controls.data || []).map((c: any) => c.asset_id));

        return {
            covered: uniqueCoveredAssets.size,
            total: assets.count || 0
        };
    }
};
