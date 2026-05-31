// src/lib/aiGovernance/aiReviewService.ts
// AI Review & Approval Service — Phase 6 Sprint 4
// Manages HITL workflows and governed prompt templates.

import { supabase } from '../supabase';
import { recordAuditEvent } from '../auditService';
import { aiUsageLogService } from './aiUsageLogService';

export type AIPromptStatus = 'draft' | 'in_review' | 'approved' | 'rejected' | 'retired';
export type AIReviewStatus = 'pending' | 'approved' | 'rejected' | 'escalated';
export type AIReviewType = 'hitl' | 'policy_check' | 'quality_check' | 'safety_check';

export interface AIPromptTemplate {
    id: string;
    company_id: string;
    ai_asset_id: string | null;
    name: string;
    description: string | null;
    prompt_text: string;
    status: AIPromptStatus;
    version: number;
    owner_id: string | null;
    approved_by: string | null;
    approved_at: string | null;
    created_by: string | null;
    created_at: string;
}

export interface AIOutputReview {
    id: string;
    company_id: string;
    usage_log_id: string;
    ai_asset_id: string | null;
    review_type: AIReviewType;
    status: AIReviewStatus;
    reviewer_id: string | null;
    decision_notes: string | null;
    created_by: string | null;
    created_at: string;
    reviewed_at: string | null;
    // Joined data
    usage_log?: any;
    ai_asset?: any;
}

export const aiReviewService = {
    // ─── OUTPUT REVIEWS (HITL) ───────────────────────────────────────────

    async listOutputReviews(companyId: string, filters?: { status?: AIReviewStatus; type?: AIReviewType }): Promise<AIOutputReview[]> {
        let query = (supabase as any)
            .from('ai_output_reviews')
            .select('*, usage_log:ai_usage_logs(*), ai_asset:ai_assets(*)')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (filters?.status) query = query.eq('status', filters.status);
        if (filters?.type) query = query.eq('review_type', filters.type);

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    async createOutputReview(params: Partial<AIOutputReview>): Promise<string> {
        const { data, error } = await (supabase as any)
            .from('ai_output_reviews')
            .insert(params)
            .select('id')
            .single();

        if (error) throw error;

        await recordAuditEvent({
            userId: params.created_by || '',
            companyId: params.company_id || '',
            action: 'create_ai_output_review',
            entityType: 'ai_output_review',
            entityId: data.id,
            metadata: { type: params.review_type }
        });

        return data.id;
    },

    /**
     * Automatically triggers a HITL review if a usage log is high-risk.
     * Called by the ingestion layer.
     */
    async autoCreateReviewForUsageLog(companyId: string, logId: string, riskFlags: string[]): Promise<void> {
        if (!riskFlags || riskFlags.length === 0) return;

        await this.createOutputReview({
            company_id: companyId,
            usage_log_id: logId,
            review_type: 'hitl',
            status: 'pending',
            decision_notes: `System-generated review due to risk flags: ${riskFlags.join(', ')}`
        });
    },

    async resolveOutputReview(
        reviewId: string, 
        companyId: string, 
        userId: string, 
        decision: { status: AIReviewStatus; notes: string }
    ): Promise<void> {
        const { data: review, error: fetchError } = await (supabase as any)
            .from('ai_output_reviews')
            .select('usage_log_id')
            .eq('id', reviewId)
            .single();

        if (fetchError) throw fetchError;

        const { error } = await (supabase as any)
            .from('ai_output_reviews')
            .update({
                status: decision.status,
                reviewer_id: userId,
                decision_notes: decision.notes,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', reviewId)
            .eq('company_id', companyId);

        if (error) throw error;

        // Propagate decision to usage log
        const logStatus = decision.status === 'approved' ? 'approved' : 'rejected';
        await aiUsageLogService.updateReviewStatus(companyId, userId, review.usage_log_id, logStatus as any, decision.notes);

        await recordAuditEvent({
            userId,
            companyId,
            action: decision.status === 'approved' ? 'approve_ai_output_review' : 
                    decision.status === 'rejected' ? 'reject_ai_output_review' : 'escalate_ai_output_review',
            entityType: 'ai_output_review',
            entityId: reviewId,
            metadata: { notes: decision.notes }
        });
    },

    // ─── PROMPT TEMPLATES ───────────────────────────────────────────────

    async listPromptTemplates(companyId: string, filters?: { status?: AIPromptStatus }): Promise<AIPromptTemplate[]> {
        let query = (supabase as any)
            .from('ai_prompt_templates')
            .select('*')
            .eq('company_id', companyId)
            .order('name', { ascending: true });

        if (filters?.status) query = query.eq('status', filters.status);

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    async createPromptTemplate(params: Partial<AIPromptTemplate>): Promise<AIPromptTemplate> {
        const { data, error } = await (supabase as any)
            .from('ai_prompt_templates')
            .insert({ ...params, status: 'draft' })
            .select()
            .single();

        if (error) throw error;

        await recordAuditEvent({
            userId: params.created_by || '',
            companyId: params.company_id || '',
            action: 'create_ai_prompt_template',
            entityType: 'ai_prompt_template',
            entityId: data.id,
            metadata: { name: data.name }
        });

        return data;
    },

    async updatePromptTemplate(id: string, companyId: string, updates: Partial<AIPromptTemplate>): Promise<void> {
        const { error } = await (supabase as any)
            .from('ai_prompt_templates')
            .update(updates)
            .eq('id', id)
            .eq('company_id', companyId);

        if (error) throw error;
    },

    async submitForReview(id: string, companyId: string, userId: string): Promise<void> {
        await this.updatePromptTemplate(id, companyId, { status: 'in_review' });
        
        await recordAuditEvent({
            userId,
            companyId,
            action: 'submit_ai_prompt_template',
            entityType: 'ai_prompt_template',
            entityId: id
        });
    },

    async approvePromptTemplate(id: string, companyId: string, userId: string, notes?: string): Promise<void> {
        await this.updatePromptTemplate(id, companyId, { 
            status: 'approved',
            approved_by: userId,
            approved_at: new Date().toISOString()
        });

        await recordAuditEvent({
            userId,
            companyId,
            action: 'approve_ai_prompt_template',
            entityType: 'ai_prompt_template',
            entityId: id,
            metadata: { notes }
        });
    },

    async rejectPromptTemplate(id: string, companyId: string, userId: string, notes: string): Promise<void> {
        await this.updatePromptTemplate(id, companyId, { status: 'rejected' });

        await recordAuditEvent({
            userId,
            companyId,
            action: 'reject_ai_prompt_template',
            entityType: 'ai_prompt_template',
            entityId: id,
            metadata: { notes }
        });
    }
};
