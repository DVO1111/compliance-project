// src/lib/impactAnalysisService.ts
// Regulation change impact analysis: "What will break?" reports.
// When a new regulation is synced, scans existing content against the new
// regulation text via Gemini and produces a detailed impact report.

import { supabase } from './supabase';
import { generateJSON } from './geminiClient';
import { wrapAICall } from './aiResponseValidator';

// ── Types ────────────────────────────────────────────────────────────────

export interface AffectedItem {
    submission_id: string;
    title: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    reason: string;
}

export interface ImpactReport {
    id: string;
    regulation_id: string | null;
    regulation_title: string;
    affected_count: number;
    affected_items: AffectedItem[];
    summary_narrative: string;
    risk_distribution: Record<string, number>;
    status: string;
    created_at: string;
}

// ── Impact Analysis ──────────────────────────────────────────────────────

const IMPACT_PROMPT = (regulationText: string, contentList: string) => `
You are a regulatory compliance analyst.
A new or updated regulation has been published. Assess which of the following archived/active marketing content pieces would be non-compliant under this regulation.

--- NEW REGULATION ---
${regulationText.slice(0, 4000)}
--- END REGULATION ---

--- EXISTING CONTENT ---
${contentList.slice(0, 6000)}
--- END CONTENT ---

For each affected content piece, explain WHY it would be non-compliant.
Return JSON only:
{
  "affected": [
    {
      "index": <0-based index from the content list>,
      "severity": "<low|medium|high|critical>",
      "reason": "<specific explanation of non-compliance>"
    }
  ],
  "summary": "<2-4 sentence narrative summarizing the overall impact>"
}
`;

interface AIImpactResult {
    affected: Array<{ index: number; severity: string; reason: string }>;
    summary: string;
}

/**
 * Run impact analysis: given a new regulation, scan existing content
 * and generate a "What will break?" report.
 */
export async function runImpactAnalysis(
    regulationId: string,
    companyId: string,
    generatedBy?: string
): Promise<ImpactReport> {
    // 1. Load the regulation
    const { data: regulation } = await (supabase as any)
        .from('regulations')
        .select('id, title, content')
        .eq('id', regulationId)
        .maybeSingle();

    if (!regulation) throw new Error('Regulation not found');

    // 2. Load active + approved content for this company
    const { data: submissions } = await (supabase as any)
        .from('content_submissions')
        .select('id, title, content_text, status')
        .or('status.eq.approved,status.eq.pending,status.eq.flagged')
        .limit(50);

    const docs = submissions || [];

    if (docs.length === 0) {
        // No content to analyze — create empty report
        const { data: report } = await (supabase as any)
            .from('regulation_impact_reports')
            .insert({
                company_id: companyId,
                regulation_id: regulationId,
                regulation_title: regulation.title,
                affected_count: 0,
                affected_items: [],
                summary_narrative: 'No active content to analyze against this regulation.',
                risk_distribution: {},
                status: 'generated',
                generated_by: generatedBy || null,
            })
            .select()
            .single();

        return formatReport(report);
    }

    // 3. Build content list for Gemini
    const contentList = docs
        .map((d: any, i: number) => `[${i}] "${d.title}" — ${d.content_text?.slice(0, 300)}`)
        .join('\n\n');

    // 4. Run AI analysis
    const aiResult = await wrapAICall<AIImpactResult>(
        () => generateJSON(IMPACT_PROMPT(regulation.content || regulation.title, contentList)),
        { affected: 'array', summary: 'string' },
        { affected: [], summary: 'AI analysis failed. Manual review recommended.' },
        { action: 'impact_analysis', companyId, userId: generatedBy }
    );

    // 5. Map results to affected items
    const affectedItems: AffectedItem[] = (aiResult.affected || [])
        .filter(a => a.index >= 0 && a.index < docs.length)
        .map(a => ({
            submission_id: docs[a.index].id,
            title: docs[a.index].title,
            severity: (['low', 'medium', 'high', 'critical'].includes(a.severity)
                ? a.severity : 'medium') as AffectedItem['severity'],
            reason: a.reason || 'Potential non-compliance detected',
        }));

    // 6. Compute risk distribution
    const riskDist: Record<string, number> = {};
    for (const item of affectedItems) {
        riskDist[item.severity] = (riskDist[item.severity] || 0) + 1;
    }

    // 7. Persist report
    const { data: report } = await (supabase as any)
        .from('regulation_impact_reports')
        .insert({
            company_id: companyId,
            regulation_id: regulationId,
            regulation_title: regulation.title,
            affected_count: affectedItems.length,
            affected_items: affectedItems,
            summary_narrative: aiResult.summary || '',
            risk_distribution: riskDist,
            status: 'generated',
            generated_by: generatedBy || null,
        })
        .select()
        .single();

    return formatReport(report);
}

// ── Queries ──────────────────────────────────────────────────────────────

/**
 * List impact reports for a company, newest first.
 */
export async function listImpactReports(companyId: string, limit: number = 20): Promise<ImpactReport[]> {
    const { data } = await (supabase as any)
        .from('regulation_impact_reports')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(limit);

    return (data || []).map(formatReport);
}

/**
 * Get a single impact report by ID.
 */
export async function getImpactReport(reportId: string): Promise<ImpactReport | null> {
    const { data } = await (supabase as any)
        .from('regulation_impact_reports')
        .select('*')
        .eq('id', reportId)
        .maybeSingle();

    return data ? formatReport(data) : null;
}

/**
 * Dismiss an impact report.
 */
export async function dismissImpactReport(reportId: string): Promise<void> {
    await (supabase as any)
        .from('regulation_impact_reports')
        .update({ status: 'dismissed', updated_at: new Date().toISOString() })
        .eq('id', reportId);
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatReport(row: any): ImpactReport {
    return {
        id: row.id,
        regulation_id: row.regulation_id,
        regulation_title: row.regulation_title || '',
        affected_count: row.affected_count || 0,
        affected_items: row.affected_items || [],
        summary_narrative: row.summary_narrative || '',
        risk_distribution: row.risk_distribution || {},
        status: row.status || 'generated',
        created_at: row.created_at || '',
    };
}
