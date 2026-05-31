// src/lib/aiGovernance/aiUsageLogService.ts
// AI Usage Log Service — Phase 6 Sprint 2
// Manages operational audit trails for AI activity.

import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { generateSafeSummary, detectRiskFlags } from './aiSanitization';
import { aiReviewService } from './aiReviewService';
import { logger } from '../logger';

export interface AIUsageLog {
    id: string;
    company_id: string;
    ai_asset_id: string | null;
    user_id: string | null;
    provider_name: string;
    model_name: string;
    input_summary: string | null;
    output_summary: string | null;
    risk_flags: string[];
    performance: {
        latency_ms?: number;
        tokens_in?: number;
        tokens_out?: number;
        estimated_cost?: number;
        request_id?: string;
    };
    review_status: 'not_reviewed' | 'flagged' | 'approved' | 'rejected';
    source: string;
    created_at: string;
}

export interface UsageMetrics {
    totalInvocations: number;
    flaggedCount: number;
    avgLatency: number;
    estimatedTotalCost: number;
    topModel: string;
}

export const aiUsageLogService = {
    /**
     * Internal helper to create a log from raw gateway output.
     * Usually called from edge function or service layer.
     */
    async createUsageLog(params: {
        companyId: string;
        aiAssetId?: string;
        userId?: string;
        providerName: string;
        modelName: string;
        rawInput?: string;
        rawOutput?: string;
        performance: AIUsageLog['performance'];
        source?: string;
    }): Promise<string | null> {
        const inputSummary = params.rawInput ? generateSafeSummary(params.rawInput) : null;
        const outputSummary = params.rawOutput ? generateSafeSummary(params.rawOutput) : null;
        
        // MVP risk detection
        const inputFlags = params.rawInput ? detectRiskFlags(params.rawInput) : [];
        const outputFlags = params.rawOutput ? detectRiskFlags(params.rawOutput) : [];
        const riskFlags = Array.from(new Set([...inputFlags, ...outputFlags]));

        const { data, error } = await (supabase as any)
            .from('ai_usage_logs')
            .insert({
                company_id: params.companyId,
                ai_asset_id: params.aiAssetId,
                user_id: params.userId,
                provider_name: params.providerName,
                model_name: params.modelName,
                input_summary: inputSummary,
                output_summary: outputSummary,
                risk_flags: riskFlags,
                performance: params.performance,
                review_status: riskFlags.length > 0 ? 'flagged' : 'not_reviewed',
                source: params.source || 'llm_gateway'
            })
            .select('id')
            .single();

        if (error) {
            logger.error('[AIUsageLog] Error creating log:', error);
            return null;
        }

        if (riskFlags.length > 0) {
            // FIRE AND FORGET: Trigger HITL review loop
            aiReviewService.autoCreateReviewForUsageLog(params.companyId, data.id, riskFlags)
                .catch(err => logger.error('[AIUsageLog] Failed to auto-trigger review:', err));
        }

        return data.id;
    },

    async listUsageLogs(companyId: string, filters?: {
        aiAssetId?: string;
        userId?: string;
        reviewStatus?: string;
        hasRisks?: boolean;
        dateFrom?: string;
        limit?: number;
    }): Promise<AIUsageLog[]> {
        let query = (supabase as any)
            .from('ai_usage_logs')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (filters?.aiAssetId) query = query.eq('ai_asset_id', filters.aiAssetId);
        if (filters?.userId) query = query.eq('user_id', filters.userId);
        if (filters?.reviewStatus) query = query.eq('review_status', filters.reviewStatus);
        if (filters?.hasRisks) query = query.neq('risk_flags', '[]');
        if (filters?.dateFrom) query = query.gte('created_at', filters.dateFrom);
        if (filters?.limit) query = query.limit(filters.limit);

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    async updateReviewStatus(
        companyId: string,
        userId: string,
        logId: string,
        status: AIUsageLog['review_status'],
        notes?: string
    ): Promise<void> {
        const { error } = await (supabase as any)
            .from('ai_usage_logs')
            .update({ review_status: status })
            .eq('id', logId)
            .eq('company_id', companyId);

        if (error) throw error;

        await recordAuditEvent({
            userId,
            companyId,
            action: 'review_ai_usage_log',
            entityType: 'ai_usage_log',
            entityId: logId,
            metadata: { status, notes }
        });
    },

    async getUsageMetrics(companyId: string, timeframeDays = 30): Promise<UsageMetrics> {
        const dateFrom = new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000).toISOString();
        
        const { data: logs, error } = await (supabase as any)
            .from('ai_usage_logs')
            .select('performance, review_status, model_name, risk_flags')
            .eq('company_id', companyId)
            .gte('created_at', dateFrom);

        if (error) throw error;

        const total = logs.length;
        if (total === 0) {
            return { totalInvocations: 0, flaggedCount: 0, avgLatency: 0, estimatedTotalCost: 0, topModel: 'N/A' };
        }

        let totalLatency = 0;
        let totalCost = 0;
        let flagged = 0;
        const modelCounts: Record<string, number> = {};

        logs.forEach((log: any) => {
            totalLatency += log.performance?.latency_ms || 0;
            totalCost += log.performance?.estimated_cost || 0;
            if (log.review_status === 'flagged' || (log.risk_flags && log.risk_flags.length > 0)) flagged++;
            modelCounts[log.model_name] = (modelCounts[log.model_name] || 0) + 1;
        });

        const topModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

        return {
            totalInvocations: total,
            flaggedCount: flagged,
            avgLatency: Math.round(totalLatency / total),
            estimatedTotalCost: Number(totalCost.toFixed(4)),
            topModel
        };
    }
};
