import { supabase } from '../supabase';

export type PolicyCategory = 'Information Security' | 'Privacy' | 'Human Resources' | 'Operations' | 'Compliance' | 'Legal';
export type PolicyStatus = 'draft' | 'under_review' | 'pending_approval' | 'approved' | 'published' | 'archived' | 'retired';

export interface Policy {
    id: string;
    company_id: string;
    category: PolicyCategory;
    title: string;
    description: string | null;
    owner_id: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    status?: string; // Virtual field for UI
}

export interface PolicyVersion {
    id: string;
    policy_id: string;
    submission_id?: string | null;
    content_text?: string | null;
    file_name?: string | null;
    file_url?: string | null;
    version_label: string;
    version_number?: string; // Virtual/Mapped
    status: PolicyStatus;
    requires_ack: boolean;
    due_days: number;
    effective_date: string | null;
    expiry_date: string | null;
    published_at: string | null;
    published_by: string | null;
    reviewer_id: string | null;
    approver_id: string | null;
    submitted_for_review_at: string | null;
    reviewed_at: string | null;
    approved_at: string | null;
    rejected_at: string | null;
    review_notes: string | null;
    created_by: string | null;
    created_at: string;
    // joined
    reviewer?: { full_name: string } | null;
    approver?: { full_name: string } | null;
}

export interface PolicyAcknowledgement {
    id: string;
    policy_id: string;
    version_id: string;
    user_id: string;
    acknowledged_at: string;
    ip_address: string;
    user_agent: string;
}

export const policyService = {
    async listPolicies(companyId?: string): Promise<Policy[]> {
        let query = (supabase.from('policies') as any)
            .select('*');
        
        if (companyId) {
            query = query.eq('company_id', companyId);
        }

        const { data, error } = await query.order('title', { ascending: true });

        if (error) throw error;
        return (data || []).map((p: any) => ({
            ...p,
            status: p.is_active ? 'active' : 'archived'
        }));
    },

    async createPolicy(companyId: string, userId: string, data: Partial<Policy>): Promise<Policy> {
        const { data: policy, error } = await (supabase.from('policies') as any)
            .insert({ ...data, company_id: companyId, owner_id: userId })
            .select()
            .single();

        if (error) throw error;
        return policy;
    },

    async listPolicyVersions(policyId: string): Promise<PolicyVersion[]> {
        const { data, error } = await (supabase.from('policy_versions') as any)
            .select('*')
            .eq('policy_id', policyId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []).map((v: any) => ({
            ...v,
            version_number: v.version_label
        }));
    },

    async createVersion(
        companyId: string,
        userId: string,
        policyId: string,
        submissionIdOrContent: string | { contentText?: string; fileName?: string; fileUrl?: string },
        versionLabel: string
    ): Promise<PolicyVersion> {
        const isLegacy = typeof submissionIdOrContent === 'string';
        const insert: any = {
            policy_id: policyId,
            version_label: versionLabel,
            created_by: userId,
            status: 'draft',
        };
        if (isLegacy) {
            insert.submission_id = submissionIdOrContent;
        } else {
            insert.content_text = submissionIdOrContent.contentText ?? null;
            insert.file_name = submissionIdOrContent.fileName ?? null;
            insert.file_url = submissionIdOrContent.fileUrl ?? null;
        }

        const { data, error } = await (supabase.from('policy_versions') as any)
            .insert(insert)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async publishPolicyVersion(companyId: string, userId: string, versionId: string): Promise<void> {
        const { data: ver } = await (supabase.from('policy_versions') as any).select('policy_id').eq('id', versionId).single();
        if (!ver) throw new Error('Version not found');

        await (supabase.from('policy_versions') as any)
            .update({ status: 'archived' })
            .eq('policy_id', ver.policy_id)
            .eq('status', 'published');

        const { error } = await (supabase.from('policy_versions') as any)
            .update({ 
                status: 'published',
                published_at: new Date().toISOString(),
                published_by: userId
            })
            .eq('id', versionId);

        if (error) throw error;

        // Enqueue Webhook Event
        const { webhookService } = await import('../platform/webhookService');
        const { WEBHOOK_EVENTS } = await import('../platform/webhookEvents');
        await webhookService.enqueueEvent(companyId, WEBHOOK_EVENTS.POLICY_PUBLISHED, {
            policy_id: ver.policy_id,
            version_id: versionId,
            published_by: userId
        }, { entityType: 'policy_version', entityId: versionId });

        await (supabase.from('audit_logs') as any).insert({
            action: 'publish_policy',
            entity_type: 'policy_version',
            entity_id: versionId,
            metadata: { policy_id: ver.policy_id }
        });
    },

    async acknowledgePolicy(versionId: string, policyId: string, userId: string): Promise<void> {
        const { error } = await (supabase.from('policy_acknowledgements') as any)
            .insert({
                policy_id: policyId,
                version_id: versionId,
                user_id: userId
            });

        if (error) {
            if (error.code === '23505') return;
            throw error;
        }

        await (supabase.from('audit_logs') as any).insert({
            user_id: userId,
            action: 'acknowledge_policy',
            entity_type: 'policy_version',
            entity_id: versionId,
            metadata: { policy_id: policyId }
        });
    },

    async listPolicyAcknowledgements(policyId: string): Promise<any[]> {
        const { data, error } = await (supabase.from('policy_acknowledgements') as any)
            .select('*, profiles(full_name, email)')
            .eq('policy_id', policyId);

        if (error) throw error;
        return data || [];
    },

    /**
     * listMyRequiredPolicies fetches policies the user needs to sign.
     */
    async listMyRequiredPolicies(userId: string): Promise<any[]> {
        // Find all published versions that require ack
        const { data: versions, error: vError } = await (supabase.from('policy_versions') as any)
            .select('*, policies(title, category)')
            .eq('status', 'published')
            .eq('requires_ack', true);

        if (vError) throw vError;

        // Find user's existing acks
        const { data: acks, error: aError } = await (supabase.from('policy_acknowledgements') as any)
            .select('version_id')
            .eq('user_id', userId);

        if (aError) throw aError;

        const signedIds = new Set((acks || []).map((a: any) => a.version_id));

        // Filter and return un-signed
        return (versions || []).filter((v: any) => !signedIds.has(v.id)).map((v: any) => ({
            ...v,
            dueDate: v.published_at ? new Date(new Date(v.published_at).getTime() + (v.due_days || 14) * 24 * 60 * 60 * 1000) : null
        }));
    },

    /**
     * listMyAcknowledgementHistory fetches policies the user has already signed.
     */
    async listMyAcknowledgementHistory(userId: string): Promise<any[]> {
        const { data, error } = await (supabase.from('policy_acknowledgements') as any)
            .select('*, policy_versions(*, policies(title, category))')
            .eq('user_id', userId)
            .order('acknowledged_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    /**
     * getAcknowledgementCompliance calculates stats for a policy.
     */
    async getAcknowledgementCompliance(policyId: string, companyId: string): Promise<any> {
        const { data: latestVer } = await (supabase.from('policy_versions') as any)
            .select('id')
            .eq('policy_id', policyId)
            .eq('status', 'published')
            .single();

        if (!latestVer) return null;

        const { data: acks } = await (supabase.from('policy_acknowledgements') as any)
            .select('user_id')
            .eq('version_id', latestVer.id);

        const { count: totalEmployees } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', companyId);

        const ackedCount = acks?.length || 0;
        
        return {
            total: totalEmployees || 0,
            acknowledged: ackedCount,
            pending: (totalEmployees || 0) - ackedCount,
            rate: totalEmployees ? (ackedCount / totalEmployees) * 100 : 0
        };
    },

    /**
     * sendManualReminder triggers a notification.
     */
    async sendManualReminder(versionId: string, userId: string): Promise<void> {
        const { data: ver } = await (supabase.from('policy_versions') as any)
            .select('*, policies(title)')
            .eq('id', versionId)
            .single();

        if (!ver) throw new Error('Version not found');

        const { error } = await (supabase.from('notifications') as any).insert({
            recipient_id: userId,
            type: 'policy_reminder',
            message: `Reminder: Please acknowledge the latest version of "${ver.policies.title}".`,
            content_id: versionId,
            created_at: new Date().toISOString()
        });

        if (error) throw error;
    },

    // ─── Approval Workflow ───────────────────────────────────────────────────

    async submitForReview(versionId: string, reviewerId: string | null, submittedBy: string): Promise<void> {
        const { error } = await (supabase.from('policy_versions') as any)
            .update({
                status: 'under_review',
                reviewer_id: reviewerId,
                submitted_for_review_at: new Date().toISOString()
            })
            .eq('id', versionId)
            .eq('status', 'draft');

        if (error) throw error;

        await (supabase.from('audit_logs') as any).insert({
            user_id: submittedBy,
            action: 'submit_policy_for_review',
            entity_type: 'policy_version',
            entity_id: versionId
        });
    },

    async approveVersion(versionId: string, approverId: string, notes?: string): Promise<void> {
        const { data: ver } = await (supabase.from('policy_versions') as any)
            .select('policy_id')
            .eq('id', versionId)
            .single();
        if (!ver) throw new Error('Version not found');

        const { error } = await (supabase.from('policy_versions') as any)
            .update({
                status: 'approved',
                approver_id: approverId,
                approved_at: new Date().toISOString(),
                review_notes: notes ?? null,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', versionId);

        if (error) throw error;

        // Advance to pending_approval → approved automatically mirrors reviewer → approver flow.
        // Update policy last_reviewed_at + compute next review due.
        await (supabase.from('policies') as any)
            .update({ last_reviewed_at: new Date().toISOString() })
            .eq('id', ver.policy_id);

        await (supabase.from('audit_logs') as any).insert({
            user_id: approverId,
            action: 'approve_policy_version',
            entity_type: 'policy_version',
            entity_id: versionId,
            metadata: { notes }
        });
    },

    async rejectVersion(versionId: string, reviewerId: string, notes: string): Promise<void> {
        const { error } = await (supabase.from('policy_versions') as any)
            .update({
                status: 'draft',
                review_notes: notes,
                reviewed_at: new Date().toISOString(),
                rejected_at: new Date().toISOString()
            })
            .eq('id', versionId);

        if (error) throw error;

        await (supabase.from('audit_logs') as any).insert({
            user_id: reviewerId,
            action: 'reject_policy_version',
            entity_type: 'policy_version',
            entity_id: versionId,
            metadata: { notes }
        });
    },

    async retirePolicy(policyId: string, userId: string): Promise<void> {
        // Archive all published versions first
        await (supabase.from('policy_versions') as any)
            .update({ status: 'retired' })
            .eq('policy_id', policyId)
            .in('status', ['published', 'approved']);

        const { error } = await (supabase.from('policies') as any)
            .update({ is_active: false })
            .eq('id', policyId);

        if (error) throw error;

        await (supabase.from('audit_logs') as any).insert({
            user_id: userId,
            action: 'retire_policy',
            entity_type: 'policy',
            entity_id: policyId
        });
    },

    async scheduleReviewCycle(policyId: string, reviewCycleMonths: number): Promise<void> {
        const nextDue = new Date();
        nextDue.setMonth(nextDue.getMonth() + reviewCycleMonths);

        const { error } = await (supabase.from('policies') as any)
            .update({
                review_cycle_months: reviewCycleMonths,
                next_review_due: nextDue.toISOString().split('T')[0]
            })
            .eq('id', policyId);

        if (error) throw error;
    }
};
